import { popupPlacement } from "../modules/interaction3d/popup-placement.js?v=20260916013557";
import {
  cameraPopupLayout,
  cameraPreviewRatio
} from "../modules/interaction3d/camera-popup-layout.js";
import {
  coverComponentIsDream,
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix,
  formatLineChartValue,
  formatPresenceDuration,
  iconButtonEffectLightVisualAwaiting,
  iconButtonEffectLightVisualState,
  mountCameraMedia,
  prewarmCameraMedia,
  presenceHistoryBuckets,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp,
  renderAirConditionerAirflowLayer,
  renderIconButtonEffectLayer,
  renderLineChartDetails,
  renderRegisteredComponent,
  setBuiltinAssetVersions,
  staticAssetImageSource,
  vacuumMapImageSource
} from "./registry.js?v=20260916013557";
import { randomUuid } from "../utils/random-id.js?v=20260916013557";
import { popupLayoutMetrics } from "../popup-layout.js?v=20260916013557";
import {
  bathHeaterModeUsesAirflow,
  climateControlStructureKey,
  climateDeviceLabel,
  climateEffectMode,
  climateIsPoweredOn,
  climateIsRunning,
  climateModeIcon,
  climateModeLabel,
  climateOperationModeValues,
  climateOptionPresentation,
  climatePowerCommand,
  climatePresentationMode,
  climateSwingModeLabel,
  normalizeClimateCapabilities,
  reconcileClimateTargetTemperature,
  resolveClimateDeviceType,
  waterHeaterStatusLabel
} from "./climate.js?v=20260916013557";
import {
  applyXiaomiDeviceProfile,
  resolveXiaomiDeviceProfile
} from "./device-profiles.js?v=20260916013557";
import {
  relatedEntityLabel,
  relatedEntityNeedsConfirmation,
  relatedEntityOptions,
  relatedEntitySelectService,
  relatedPopupContext,
  selectedRelatedEntities,
  selectedRelatedEntityIds
} from "../related-entities.js?v=20260916013557";
import {
  entityPowerIsOn,
  entityPowerTarget,
  entityToggleCommand,
  optimisticToggleState
} from "./entity-power.js?v=20260916013557";
import {
  ICON_VISIBILITY_VIRTUAL_KIND,
  isVirtualEntityId,
  parseVirtualEntityId
} from "../virtual-entities.js?v=20260916013557";
import { componentActionIsSupported } from "../action-rules.js?v=20260916013557";
import {
  airflowCanvasOffsetBounds,
  airflowLayerGeometry,
  groupedComponentLocalDelta,
  rotateMultiSelectionTransforms
} from "./transform-geometry.js?v=20260916013557";
import {
  componentHostZIndex,
  effectCropRectangle,
  effectCroppedLayerGeometry,
  effectFadeDuration,
  effectLayerDimensions,
  effectReferenceImageTransform,
  effectSourceDimensions,
  normalizeIconButtonEffectComponent
} from "./effect-geometry.js?v=20260916013557";
import {
  LIGHT_DETAIL_PRESET_DEFINITIONS,
  LIGHT_PRESET_MAXIMUM_HOLD_MS,
  LIGHT_PRESET_MINIMUM_HOLD_MS,
  LIGHT_PRESET_STABLE_CONFIRMATION_MS,
  UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT,
  UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN,
  hsToRgbColor,
  lightColorPickerHsFromPoint,
  lightColorPickerPointFromHs,
  lightColorServiceData,
  lightPresetBrightnessServiceData,
  lightPresetPendingDecision,
  lightRealtimeCapabilities,
  lightSupportsColor,
  lightVisualValueForCapability,
  relativeLightColorTemperature,
  rgbToHsColor
} from "./light-runtime.js?v=20260916013557";
import { entityMetadataIsAvailable } from "./entity-metadata.js?v=20260916013557";
import {
  relatedVacuumBatteryEntity,
  vacuumActionService,
  vacuumBatteryPercent,
  vacuumSupportedActions
} from "./vacuum-runtime.js?v=20260916013557";
import {
  airerDevicePosition,
  airerPositionCalibration,
  airerPresentationPosition,
  airerPresentationPositionForState,
  airerReportedPosition,
  airerVisualDrop,
  coverComponentIsAirer,
  coverMotorIsReversedForComponent,
  coverPendingDisplayPosition,
  coverPositionReachedTarget,
  coverPresentationState,
  coverToggleServiceForComponent,
  dreamCurtainBladeLabel,
  dreamCurtainIsRetracted,
  dreamCurtainStatusFromRetraction,
  dreamCurtainStatusText,
  dreamCurtainToggleService,
  learnAirerPositionCalibration,
  physicalCoverState,
  relatedAirerCurrentPositionSensor,
  relatedAirerLightEntity,
  relatedAirerMotorActionEntities,
  relatedAirerMotorSpeedSensor,
  relatedAirerPositionNumberEntity,
  relatedCoverMotorReverseEntity,
  relatedDeviceDomainEntity,
  relatedDeviceEntity,
  relatedWaterHeaterEntities,
  runtimeCoverStateIsActive,
  runtimeEntityStateIsActive,
  waterHeaterRelatedEntityLabel
} from "./cover-runtime.js?v=20260916013557";
import {
  playFixedDeviceDropEntrance,
  playMediaSpeakerEntrance,
  playStableRuntimeDialogEntrance,
  runtimeDialogUsesStableMotion
} from "./runtime-dialog-motion.js?v=20260916013557";
import {
  HISTORY_FETCH_TIMEOUT_MS,
  HistoryRefreshCoordinator,
  RuntimeEffectImageLoader,
  RuntimeStaticImageCache,
  RuntimeVacuumMapImagePreloader,
  cacheHistorySeries,
  historyRequestStillRelevant,
  historySeriesCacheKey
} from "./runtime-caches.js?v=20260916013557";
import {
  collectComponents,
  collectEntityIds,
  lineChartRuntimeStateNeedsHydration,
  syncedLineChartProperties
} from "./runtime-document.js?v=20260916013557";
export { setBuiltinAssetVersions as setBuiltinAssetVersions };
export {
  airflowCanvasOffsetBounds as airflowCanvasOffsetBounds,
  airflowLayerGeometry as airflowLayerGeometry,
  groupedComponentLocalDelta as groupedComponentLocalDelta,
  rotateMultiSelectionTransforms as rotateMultiSelectionTransforms
};
export {
  componentHostZIndex as componentHostZIndex,
  effectCroppedLayerGeometry as effectCroppedLayerGeometry,
  effectLayerDimensions as effectLayerDimensions,
  effectReferenceImageTransform as effectReferenceImageTransform,
  normalizeIconButtonEffectComponent as normalizeIconButtonEffectComponent
};
export {
  LIGHT_DETAIL_PRESET_DEFINITIONS as LIGHT_DETAIL_PRESET_DEFINITIONS,
  LIGHT_PRESET_MAXIMUM_HOLD_MS as LIGHT_PRESET_MAXIMUM_HOLD_MS,
  LIGHT_PRESET_MINIMUM_HOLD_MS as LIGHT_PRESET_MINIMUM_HOLD_MS,
  LIGHT_PRESET_STABLE_CONFIRMATION_MS as LIGHT_PRESET_STABLE_CONFIRMATION_MS,
  UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT as UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT,
  UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN as UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN,
  hsToRgbColor as hsToRgbColor,
  lightColorPickerHsFromPoint as lightColorPickerHsFromPoint,
  lightColorPickerPointFromHs as lightColorPickerPointFromHs,
  lightColorServiceData as lightColorServiceData,
  lightPresetBrightnessServiceData as lightPresetBrightnessServiceData,
  lightPresetPendingDecision as lightPresetPendingDecision,
  lightRealtimeCapabilities as lightRealtimeCapabilities,
  lightSupportsColor as lightSupportsColor,
  lightVisualValueForCapability as lightVisualValueForCapability,
  relativeLightColorTemperature as relativeLightColorTemperature,
  rgbToHsColor as rgbToHsColor
};
export {
  relatedVacuumBatteryEntity as relatedVacuumBatteryEntity,
  vacuumActionService as vacuumActionService,
  vacuumBatteryPercent as vacuumBatteryPercent,
  vacuumSupportedActions as vacuumSupportedActions
};
export {
  airerDevicePosition as airerDevicePosition,
  airerPositionCalibration as airerPositionCalibration,
  airerPresentationPosition as airerPresentationPosition,
  airerPresentationPositionForState as airerPresentationPositionForState,
  airerReportedPosition as airerReportedPosition,
  airerVisualDrop as airerVisualDrop,
  coverComponentIsAirer as coverComponentIsAirer,
  coverMotorIsReversedForComponent as coverMotorIsReversedForComponent,
  coverPendingDisplayPosition as coverPendingDisplayPosition,
  coverPositionReachedTarget as coverPositionReachedTarget,
  coverToggleServiceForComponent as coverToggleServiceForComponent,
  dreamCurtainBladeLabel as dreamCurtainBladeLabel,
  dreamCurtainIsRetracted as dreamCurtainIsRetracted,
  dreamCurtainStatusText as dreamCurtainStatusText,
  dreamCurtainToggleService as dreamCurtainToggleService,
  learnAirerPositionCalibration as learnAirerPositionCalibration,
  relatedAirerCurrentPositionSensor as relatedAirerCurrentPositionSensor,
  relatedAirerLightEntity as relatedAirerLightEntity,
  relatedAirerMotorActionEntities as relatedAirerMotorActionEntities,
  relatedAirerMotorSpeedSensor as relatedAirerMotorSpeedSensor,
  relatedAirerPositionNumberEntity as relatedAirerPositionNumberEntity,
  relatedWaterHeaterEntities as relatedWaterHeaterEntities,
  waterHeaterRelatedEntityLabel as waterHeaterRelatedEntityLabel
};
export { runtimeDialogUsesStableMotion as runtimeDialogUsesStableMotion };
export {
  HistoryRefreshCoordinator as HistoryRefreshCoordinator,
  RuntimeEffectImageLoader as RuntimeEffectImageLoader,
  RuntimeStaticImageCache as RuntimeStaticImageCache,
  RuntimeVacuumMapImagePreloader as RuntimeVacuumMapImagePreloader,
  historyRequestStillRelevant as historyRequestStillRelevant
};
export {
  lineChartRuntimeStateNeedsHydration as lineChartRuntimeStateNeedsHydration,
  syncedLineChartProperties as syncedLineChartProperties
};
const RUNTIME_SUBSCRIPTION_ENTITY_LIMIT = 1000;
const DEFAULT_DIALOG_TARGET_OCCUPANCY = 0.76;
const COMPACT_DIALOG_TARGET_OCCUPANCY = 0.7;
const MAX_DIALOG_PREFERRED_SCALE = 1.6;
const FILL_DIALOG_SCALE_LIMIT = 2;
const TIGHT_FILL_DIALOG_SCALE_LIMIT = 2.12;
export function runtimeDialogLayout({
  layerWidth: layerWidthPx,
  layerHeight: layerHeightPx,
  layoutWidth: layoutWidthPx,
  layoutHeight: layoutHeightPx,
  fillAvailable: fillAvailable = false,
  tightFill: tightFill = false,
  targetOccupancy: targetOccupancyRatio = DEFAULT_DIALOG_TARGET_OCCUPANCY
}) {
  const boundedLayerWidthPx = Math.max(1, Number(layerWidthPx) || 1);
  const boundedLayerHeightPx = Math.max(1, Number(layerHeightPx) || 1);
  const boundedLayoutWidthPx = Math.max(1, Number(layoutWidthPx) || 1);
  const boundedLayoutHeightPx = Math.max(1, Number(layoutHeightPx) || 1);
  const dialogSafeInsetPx = tightFill
    ? Math.min(40, Math.max(24, Math.min(boundedLayerWidthPx, boundedLayerHeightPx) * 0.03))
    : fillAvailable
      ? Math.min(80, Math.max(32, Math.min(boundedLayerWidthPx, boundedLayerHeightPx) * 0.075))
      : Math.min(64, Math.max(24, Math.min(boundedLayerWidthPx, boundedLayerHeightPx) * 0.05));
  const availableWidthPx = Math.max(1, boundedLayerWidthPx - dialogSafeInsetPx * 2);
  const availableHeightPx = Math.max(1, boundedLayerHeightPx - dialogSafeInsetPx * 2);
  const fitScale = Math.min(
    availableWidthPx / boundedLayoutWidthPx,
    availableHeightPx / boundedLayoutHeightPx
  );
  const occupancyRatio = Math.max(
    0.2,
    Math.min(1, Number(targetOccupancyRatio) || DEFAULT_DIALOG_TARGET_OCCUPANCY)
  );
  const occupancyScale = Math.min(
    (boundedLayerWidthPx * occupancyRatio) / boundedLayoutWidthPx,
    (boundedLayerHeightPx * occupancyRatio) / boundedLayoutHeightPx
  );
  const preferredScale = Math.min(MAX_DIALOG_PREFERRED_SCALE, occupancyScale);
  const resolvedScale = Math.min(
    fillAvailable
      ? tightFill
        ? TIGHT_FILL_DIALOG_SCALE_LIMIT
        : FILL_DIALOG_SCALE_LIMIT
      : preferredScale,
    fitScale
  );
  return {
    availableWidth: availableWidthPx,
    availableHeight: availableHeightPx,
    fitScale: fitScale,
    preferredScale: preferredScale,
    safeInset: dialogSafeInsetPx,
    scale: Math.max(0.08, resolvedScale)
  };
}
export function runtimeDialogViewport({
  layerLeft: layerLeftPx = 0,
  layerTop: layerTopPx = 0,
  layerWidth: viewportLayerWidthPx,
  layerHeight: viewportLayerHeightPx,
  dashboardLeft: dashboardLeftPx,
  dashboardTop: dashboardTopPx,
  dashboardWidth: dashboardWidthPx,
  dashboardHeight: dashboardHeightPx
}) {
  const viewportLeftPx = Number(layerLeftPx) || 0;
  const viewportTopPx = Number(layerTopPx) || 0;
  const viewportWidthPx = Math.max(1, Number(viewportLayerWidthPx) || 1);
  const viewportHeightPx = Math.max(1, Number(viewportLayerHeightPx) || 1);
  const viewportRightPx = viewportLeftPx + viewportWidthPx;
  const viewportBottomPx = viewportTopPx + viewportHeightPx;
  const resolvedDashboardLeftPx = Number.isFinite(Number(dashboardLeftPx))
    ? Number(dashboardLeftPx)
    : viewportLeftPx;
  const resolvedDashboardTopPx = Number.isFinite(Number(dashboardTopPx))
    ? Number(dashboardTopPx)
    : viewportTopPx;
  const resolvedDashboardWidthPx = Math.max(1, Number(dashboardWidthPx) || viewportWidthPx);
  const resolvedDashboardHeightPx = Math.max(1, Number(dashboardHeightPx) || viewportHeightPx);
  const overlapLeftPx = Math.max(viewportLeftPx, resolvedDashboardLeftPx);
  const overlapTopPx = Math.max(viewportTopPx, resolvedDashboardTopPx);
  const overlapRightPx = Math.min(
    viewportRightPx,
    resolvedDashboardLeftPx + resolvedDashboardWidthPx
  );
  const overlapBottomPx = Math.min(
    viewportBottomPx,
    resolvedDashboardTopPx + resolvedDashboardHeightPx
  );
  const visibleWidthPx = Math.max(1, overlapRightPx - overlapLeftPx);
  const visibleHeightPx = Math.max(1, overlapBottomPx - overlapTopPx);
  return {
    width: visibleWidthPx,
    height: visibleHeightPx,
    centerX: overlapLeftPx - viewportLeftPx + visibleWidthPx / 2,
    centerY: overlapTopPx - viewportTopPx + visibleHeightPx / 2
  };
}
function assignComponentIds(component) {
  component.id = "component-" + randomUuid();
  for (const childComponent of component.children || []) {
    assignComponentIds(childComponent);
  }
  return component;
}
function isModifierKeyPressed(keyboardEvent) {
  const platformName = navigator.userAgentData?.platform || navigator.platform || "";
  const isAppleDevice = /mac|iphone|ipad|ipod/i.test(platformName);
  return keyboardEvent.altKey || keyboardEvent.ctrlKey || (isAppleDevice && keyboardEvent.metaKey);
}
function isSupportedComponentAction(targetComponent, actionConfig) {
  return componentActionIsSupported(targetComponent, actionConfig);
}
export function componentDialogTitle(titleComponent, fallbackTitle) {
  const componentProperties = titleComponent?.properties || {};
  return String(componentProperties.label || "").trim() || fallbackTitle;
}
export function popupModuleDialogTitle(popupComponent, popupEntityState, fallbackTitleText = "") {
  return (
    String(popupComponent?.title || "").trim() ||
    String(fallbackTitleText || "").trim() ||
    String(popupEntityState?.attributes?.friendly_name || "").trim() ||
    String(popupComponent?.entityId || "").trim()
  );
}
function appendAirerVisual(hostElement) {
  const ownerDocument = hostElement.ownerDocument;
  const airerElement = ownerDocument.createElement("span");
  airerElement.className = "hb-airer-visual";
  const glowElement = ownerDocument.createElement("i");
  glowElement.className = "hb-airer-visual-glow";
  const bodyElement = ownerDocument.createElement("span");
  bodyElement.className = "hb-airer-visual-body";
  const lampElement = ownerDocument.createElement("i");
  lampElement.className = "hb-airer-visual-lamp";
  bodyElement.append(lampElement);
  const liftsElement = ownerDocument.createElement("span");
  liftsElement.className = "hb-airer-visual-lifts";
  liftsElement.append(ownerDocument.createElement("i"), ownerDocument.createElement("i"));
  const rackElement = ownerDocument.createElement("span");
  rackElement.className = "hb-airer-visual-rack";
  for (let liftIndex = 0; liftIndex < 4; liftIndex += 1) {
    rackElement.append(ownerDocument.createElement("i"));
  }
  airerElement.append(glowElement, bodyElement, liftsElement, rackElement);
  hostElement.append(airerElement);
}
function airerPositionLabel(positionState) {
  return (
    {
      open: "已升起",
      closed: "已下降",
      opening: "正在升起",
      closing: "正在下降"
    }[positionState] || ""
  );
}
function createSwitchVisual({
  label: labelText = "开关",
  interactive: interactive = true,
  onToggle: onToggle = null,
  compact: compact = false,
  momentary: momentary = false
} = {}) {
  const switchElement = document.createElement("button");
  switchElement.type = "button";
  switchElement.className = "hb-switch-visual";
  switchElement.classList.toggle("is-momentary", momentary);
  switchElement.inert = !interactive;
  switchElement.setAttribute("aria-disabled", String(!interactive));
  const auraElement = document.createElement("i");
  auraElement.className = "hb-switch-visual-aura";
  const plateElement = document.createElement("span");
  plateElement.className = "hb-switch-visual-plate";
  const indicatorElement = document.createElement("i");
  indicatorElement.className = "hb-switch-visual-indicator";
  const rockerElement = document.createElement("span");
  rockerElement.className = "hb-switch-visual-rocker";
  const offMarkElement = document.createElement("i");
  offMarkElement.className = "hb-switch-visual-mark off";
  offMarkElement.textContent = "○";
  const onMarkElement = document.createElement("i");
  onMarkElement.className = "hb-switch-visual-mark on";
  onMarkElement.textContent = "┃";
  rockerElement.append(offMarkElement, onMarkElement);
  plateElement.append(indicatorElement, rockerElement);
  switchElement.append(auraElement, plateElement);
  const copyElement = compact ? document.createElement("span") : null;
  const copyLabelElement = compact ? document.createElement("strong") : null;
  const copyStateElement = compact ? document.createElement("output") : null;
  if (compact) {
    copyElement.className = "hb-switch-visual-copy";
    copyLabelElement.className = "hb-switch-visual-copy-label";
    copyStateElement.className = "hb-switch-visual-copy-state";
    copyLabelElement.textContent = labelText;
    copyElement.append(copyLabelElement, copyStateElement);
    switchElement.append(copyElement);
    switchElement.classList.add("is-compact");
  }
  const syncVisual = (
    isSwitchActive,
    { unavailable: unavailable = false, pending: pending = false, success: success = false } = {}
  ) => {
    const resolvedActive = (momentary ? pending : !!isSwitchActive) && !unavailable;
    switchElement.classList.toggle("is-on", resolvedActive);
    switchElement.classList.toggle("is-unavailable", unavailable);
    switchElement.classList.toggle("is-pending", pending);
    switchElement.classList.toggle("is-success", success);
    switchElement.setAttribute("aria-pressed", String(resolvedActive));
    switchElement.setAttribute("aria-busy", String(pending));
    switchElement.setAttribute(
      "aria-label",
      unavailable
        ? labelText + "当前不可用"
        : momentary
          ? "" + labelText + (success ? "执行成功" : pending ? "正在执行" : "，点击执行")
          : "" + labelText + (resolvedActive ? "已开启，点击关闭" : "已关闭，点击开启")
    );
    if (copyStateElement) {
      copyStateElement.textContent = unavailable
        ? "当前不可用"
        : momentary
          ? success
            ? "执行成功"
            : pending
              ? "执行中"
              : "点击执行"
          : resolvedActive
            ? "运行中"
            : "已关闭";
    }
  };
  switchElement.addEventListener("click", () => {
    if (
      interactive &&
      !switchElement.classList.contains("is-pending") &&
      !switchElement.classList.contains("is-unavailable")
    ) {
      onToggle?.();
    }
  });
  return {
    visual: switchElement,
    sync: syncVisual
  };
}
function mixHexColors(startColor, endColor, blendRatio = 0) {
  const normalizeHexColor = colorValue => {
    const trimmedColor = String(colorValue || "").trim();
    const expandedColor = /^#[0-9a-f]{3}$/i.test(trimmedColor)
      ? "#" +
        trimmedColor
          .slice(1)
          .split("")
          .map(hexDigit => "" + hexDigit + hexDigit)
          .join("")
      : trimmedColor;
    if (/^#[0-9a-f]{6}$/i.test(expandedColor)) {
      return expandedColor;
    } else {
      return null;
    }
  };
  const normalizedStartColor = normalizeHexColor(startColor);
  const normalizedEndColor = normalizeHexColor(endColor);
  if (!normalizedStartColor || !normalizedEndColor) {
    return startColor;
  }
  const clampedBlendRatio = Math.max(0, Math.min(1, Number(blendRatio) || 0));
  const parseColorChannel = (hexString, channelOffset) =>
    Number.parseInt(hexString.slice(channelOffset, channelOffset + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map(channelIndex =>
        Math.round(
          parseColorChannel(normalizedStartColor, channelIndex) +
            (parseColorChannel(normalizedEndColor, channelIndex) -
              parseColorChannel(normalizedStartColor, channelIndex)) *
              clampedBlendRatio
        )
      )
      .map(channelValue => channelValue.toString(16).padStart(2, "0"))
      .join("")
  );
}
export class PanelRenderer {
  constructor(rootContainer, rendererOptions = {}) {
    this.container = rootContainer;
    this.options = {
      ...rendererOptions,
      onError: errorObject => {
        window.HABridgeLog?.error(errorObject, {
          phase: "runtime-operation"
        });
        rendererOptions.onError?.(errorObject);
      }
    };
    this.boundRuntimeButtonSound = clickEvent => {
      if (this.options.editable) {
        return;
      }
      const pressedButton =
        typeof Element !== "undefined" && clickEvent.target instanceof Element
          ? clickEvent.target.closest('button, [role="button"]')
          : null;
      if (!!pressedButton && !!this.container.contains(pressedButton)) {
        this.options.onRuntimeButtonPress?.(pressedButton);
      }
    };
    this.container.addEventListener("click", this.boundRuntimeButtonSound, true);
    this.renderNamespace = "renderer-" + randomUuid().replace(/[^a-z0-9]/gi, "");
    this.document = null;
    this.page = null;
    this.states =
      rendererOptions.runtimeStateCache instanceof Map
        ? rendererOptions.runtimeStateCache
        : new Map();
    this.virtualEntityStates =
      rendererOptions.virtualEntityStateCache instanceof Map
        ? rendererOptions.virtualEntityStateCache
        : new Map();
    this.entityMetadata = new Map();
    this.deviceMetadata = new Map();
    this.entityCatalogReady = false;
    this.entityTranslations = {};
    this.historySeries = new Map();
    this.historySeriesCache =
      rendererOptions.historySeriesCache instanceof Map
        ? rendererOptions.historySeriesCache
        : new Map();
    this.historyFetches = new Set();
    this.historyRefreshCoordinator = new HistoryRefreshCoordinator();
    this.historyRetryTimer = 0;
    this.historyRetryAttempt = 0;
    this.historyDocumentGeneration = 0;
    this.historyPopupGeneration = 0;
    this.historyChartRefreshers = new Set();
    this.runtimeStateHandlers = new Map();
    this.runtimeRenderEntityIds = new Set();
    this.runtimeRenderTimer = 0;
    this.runtimeStaticImageCache = new RuntimeStaticImageCache({
      maxConcurrent: 2,
      maxDecoded: 32,
      idleDelay: 120
    });
    this.runtimeEffectImageLoader = new RuntimeEffectImageLoader({
      maxConcurrent: 4,
      idleDelay: 160
    });
    this.runtimeVacuumMapImagePreloader = new RuntimeVacuumMapImagePreloader({
      maxConcurrent: 1
    });
    this.vacuumMapEntityIds = new Set();
    this.cleanups = [];
    this.componentCleanups = new Map();
    this.cameraCleanups = new Map();
    this.runtimeEntityComponentIndex = new Map();
    this.componentParentIds = new Map();
    this.componentHosts = new Map();
    this.componentRecords = new Map();
    this.componentAirflowLayers = new Map();
    this.componentEffectLayers = new Map();
    this.componentSelectionOverlays = new Map();
    this.componentSelectionLayers = new Map();
    this.componentPreviewStates = new Map();
    this.themeVariableNames = new Set();
    this.detailsStateSync = null;
    this.activePopupId = null;
    this.replacingDocument = false;
    this.pendingEntityDetails = null;
    this.runtimeDialogScaleContext = null;
    this.selectedComponentId = null;
    this.selectedComponentIds = new Set();
    this.activeGroupId = null;
    this.socket = null;
    this.runtimeSubscription = null;
    this.socketGeneration = 0;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.runtimeHydrationRetryTimer = null;
    this.runtimeHydrationRetryAttempt = 0;
    this.lastRuntimeResumeAt = 0;
    this.runtimeEntityLimitSignature = "";
    this.removedRuntimeEntityIds = new Set();
    this.pendingOptimisticStates = new Map();
    this.confirmedLightVisualStates = new Map();
    this.destroyed = false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(rootContainer);
    this.boundResize = () => this.resize();
    this.boundReconnect = () => {
      if (!this.destroyed && (!this.socket || this.socket.readyState >= WebSocket.CLOSING)) {
        this.connectRuntime();
      }
    };
    this.boundVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const resumeTimeMs = Date.now();
        if (this.document && resumeTimeMs - this.lastRuntimeResumeAt >= 1500) {
          this.lastRuntimeResumeAt = resumeTimeMs;
          this.connectRuntime({
            force: true
          });
        }
        this.refreshHistorySeries();
      }
    };
    this.historyPollTimer = window.setInterval(() => this.refreshHistorySeries(), 30000);
    window.visualViewport?.addEventListener("resize", this.boundResize);
    window.addEventListener("orientationchange", this.boundResize);
    window.addEventListener("online", this.boundReconnect);
    document.addEventListener("visibilitychange", this.boundVisibilityChange);
  }
  setDocument(documentData, pagePath = null) {
    this.destroyed = false;
    const retainedInteraction3dHosts = this.options.editable
      ? new Map(
          [...this.componentHosts].filter(
            ([hostComponentId, hostComponentElement]) =>
              (this.componentRecords.get(hostComponentId)?.type === "floorplan-auto-diagram" &&
                hostComponentElement.querySelector(".hb-floorplan-auto-diagram-preview")) ||
              (this.document?.projectId === documentData.projectId &&
                this.componentRecords.get(hostComponentId)?.type === "interaction3d" &&
                hostComponentElement.parentElement === this.canvas)
          )
        )
      : null;
    const previousReplacingDocument = this.replacingDocument;
    this.replacingDocument = true;
    try {
      window.clearTimeout(this.historyRetryTimer);
      this.historyRetryTimer = 0;
      this.historyRetryAttempt = 0;
      window.clearTimeout(this.runtimeHydrationRetryTimer);
      this.runtimeHydrationRetryTimer = null;
      this.runtimeHydrationRetryAttempt = 0;
      this.closeRuntimeDialog();
      if (this.runtimeStaticImageCache.stopped) {
        this.runtimeStaticImageCache.reset();
      }
      if (this.runtimeEffectImageLoader.stopped) {
        this.runtimeEffectImageLoader.reset();
      }
      if (this.runtimeVacuumMapImagePreloader.stopped) {
        this.runtimeVacuumMapImagePreloader.reset();
      }
      this.activePopupId = null;
      this.historySeries.clear();
      this.historyFetches.clear();
      this.historyDocumentGeneration += 1;
      this.historyPopupGeneration += 1;
      this.removedRuntimeEntityIds.clear();
      this.document = this.options.editable ? structuredClone(documentData) : documentData;
      this.vacuumMapEntityIds = new Set(
        collectComponents(
          [
            ...(this.document.sharedComponents || []),
            ...this.document.pages.flatMap(pageEntry => pageEntry.components || [])
          ],
          vacuumMapComponent => vacuumMapComponent.type === "vacuum-map"
        )
          .map(vacuumMapRecord => String(vacuumMapRecord.bindings?.entity?.entityId || ""))
          .filter(entityIdString => entityIdString.startsWith("image."))
      );
      const matchedPage = this.document.pages.find(explicitPage => explicitPage.path === pagePath);
      const defaultPageRecord = this.document.pages.find(
        fallbackPage => fallbackPage.path === this.document.defaultPagePath
      );
      this.page = matchedPage || defaultPageRecord || this.document.pages[0];
      this.render(retainedInteraction3dHosts);
      this.preloadStaticImages();
      if (!this.options.editable) {
        const prewarmEntityIds = collectComponents(
          [
            ...(this.document.sharedComponents || []),
            ...this.document.pages.flatMap(documentPage => documentPage.components || [])
          ],
          cameraComponent =>
            cameraComponent.type === "camera" &&
            cameraComponent.properties?.mediaVisible !== false &&
            cameraComponent.properties?.displayMode !== "snapshot"
        )
          .map(cameraEntityId => String(cameraEntityId.bindings?.entity?.entityId || ""))
          .filter(Boolean);
        prewarmCameraMedia(prewarmEntityIds);
      }
      this.connectRuntime();
      this.refreshHistorySeries();
    } finally {
      this.replacingDocument = previousReplacingDocument;
    }
  }
  refreshBuiltinAssets(assetVersionEntries = []) {
    const assetVersionResult = setBuiltinAssetVersions(assetVersionEntries);
    if (assetVersionResult && this.document) {
      this.renderComponents(true);
      this.preloadStaticImages();
    }
    return assetVersionResult;
  }
  preloadStaticImages() {
    if (!this.document || !this.page) {
      return;
    }
    const collectAssetImageSources = components =>
      collectComponents(
        components,
        imageComponent => imageComponent.type === "image" && imageComponent.properties?.assetId
      )
        .map(assetComponent => staticAssetImageSource(assetComponent.properties.assetId))
        .filter(Boolean);
    const sharedComponentById = new Map(
      (this.document.sharedComponents || []).map(sharedComponent => [
        sharedComponent.id,
        sharedComponent
      ])
    );
    const pageSharedComponents = (this.page.sharedComponentIds || [])
      .map(sharedComponentId => sharedComponentById.get(sharedComponentId))
      .filter(Boolean);
    const currentPageSources = collectAssetImageSources([
      ...(this.page.components || []),
      ...pageSharedComponents
    ]);
    const allDocumentSources = collectAssetImageSources([
      ...(this.document.sharedComponents || []),
      ...this.document.pages.flatMap(runtimePage => runtimePage.components || [])
    ]);
    this.runtimeStaticImageCache.setSources(allDocumentSources, currentPageSources);
  }
  setEntityCatalog(entityRecords = [], translationTable = {}, deviceRecords = []) {
    this.entityMetadata = new Map(
      (entityRecords || [])
        .map(entityRecord => [String(entityRecord.entityId || ""), entityRecord])
        .filter(([entityIdKey]) => entityIdKey)
    );
    this.deviceMetadata = new Map(
      (deviceRecords || [])
        .map(deviceRecord => [String(deviceRecord.deviceId || ""), deviceRecord])
        .filter(([deviceIdKey]) => deviceIdKey)
    );
    this.entityTranslations =
      translationTable && typeof translationTable == "object" ? translationTable : {};
    this.entityCatalogReady = true;
    this.tryOpenPendingEntityDetails();
    if (this.document) {
      this.detailsStateSync?.refreshEntityCatalog?.();
      this.renderComponents(true);
      this.connectRuntime();
    }
  }
  deviceProfile(entityIdInput) {
    return resolveXiaomiDeviceProfile(
      entityIdInput,
      this.entityMetadata,
      this.deviceMetadata,
      this.states
    );
  }
  runtimeEntityId(rawEntityId) {
    return String(rawEntityId || "");
  }
  iconVisibilityPageKey() {
    return String(this.page?.path || this.page?.id || "current-page");
  }
  iconVisibilityState() {
    return this.virtualEntityStates.get(this.iconVisibilityPageKey()) !== false;
  }
  toggleVirtualEntity(virtualEntityId) {
    const parsedVirtualEntity = parseVirtualEntityId(virtualEntityId);
    if (!parsedVirtualEntity || parsedVirtualEntity.kind !== ICON_VISIBILITY_VIRTUAL_KIND) {
      throw new Error("虚拟实体不存在。");
    }
    if (
      ![...this.componentRecords.values()].some(
        recordEntry => recordEntry.type === "icon-button-effect"
      )
    ) {
      throw new Error("当前页面没有图标按钮（效果）。");
    }
    const iconVisibilityPageId = this.iconVisibilityPageKey();
    const nextIconVisibility = !this.iconVisibilityState();
    this.virtualEntityStates.set(iconVisibilityPageId, nextIconVisibility);
    this.states.set(virtualEntityId, {
      entityId: virtualEntityId,
      state: nextIconVisibility ? "on" : "off",
      attributes: {}
    });
    this.renderComponents(true);
  }
  waterHeaterDetailsReady(waterHeaterEntityId) {
    if (!this.entityCatalogReady) {
      return false;
    }
    const waterHeaterState = this.states.get(waterHeaterEntityId);
    const waterHeaterAttributes =
      (waterHeaterState?.newState || waterHeaterState)?.attributes || {};
    const currentTemperature = Number(waterHeaterAttributes.temperature);
    const minTemperature = Number(waterHeaterAttributes.min_temp);
    const maxTemperature = Number(waterHeaterAttributes.max_temp);
    return (
      Number.isFinite(currentTemperature) &&
      Number.isFinite(minTemperature) &&
      Number.isFinite(maxTemperature) &&
      maxTemperature > minTemperature
    );
  }
  deferEntityDetailsUntilReady(deferredComponent, previewOptions, deferReason = "water-heater") {
    window.clearTimeout(this.pendingEntityDetails?.timer);
    window.clearTimeout(this.pendingEntityDetails?.retryTimer);
    const pendingDetails = {
      component: structuredClone(deferredComponent),
      preview: previewOptions,
      reason: deferReason,
      retryTimer: null,
      timer: null
    };
    const isCatalogDeferred = deferReason === "catalog" || deferReason === "electric-bed-catalog";
    if (isCatalogDeferred) {
      const retryPendingDetails = () => {
        if (this.pendingEntityDetails !== pendingDetails) {
          return;
        }
        const deferredEntityId = this.runtimeEntityId(
          pendingDetails.component?.bindings?.entity?.entityId
        );
        if (
          !this.entityCatalogReady ||
          (deferReason === "electric-bed-catalog" &&
            this.deviceProfile(deferredEntityId)?.deviceType !== "electric-bed")
        ) {
          pendingDetails.retryTimer = window.setTimeout(retryPendingDetails, 260);
          return;
        }
        window.clearTimeout(pendingDetails.timer);
        this.pendingEntityDetails = null;
        this.showEntityDetails(pendingDetails.component, {
          preview: pendingDetails.preview
        });
      };
      pendingDetails.retryTimer = window.setTimeout(retryPendingDetails, 260);
    }
    pendingDetails.timer = window.setTimeout(
      () => {
        if (this.pendingEntityDetails === pendingDetails) {
          this.pendingEntityDetails = null;
          if (
            isCatalogDeferred &&
            this.detailsDialog?.classList.contains("electric-bed-loading-details")
          ) {
            this.detailsDialog.close();
          }
          if (isCatalogDeferred) {
            this.options.onError?.(new Error("设备信息正在加载，请稍后重试。"));
          } else {
            this.options.onError?.(new Error("热水器状态正在加载，请稍后重试。"));
          }
        }
      },
      isCatalogDeferred ? 10000 : 3000
    );
    this.pendingEntityDetails = pendingDetails;
  }
  tryOpenPendingEntityDetails() {
    const activePendingDetails = this.pendingEntityDetails;
    if (!activePendingDetails) {
      return false;
    }
    const pendingEntityId = this.runtimeEntityId(
      activePendingDetails.component?.bindings?.entity?.entityId
    );
    if (
      !this.entityCatalogReady ||
      (activePendingDetails.reason === "water-heater" &&
        !this.waterHeaterDetailsReady(pendingEntityId)) ||
      (activePendingDetails.reason === "electric-bed-catalog" &&
        this.deviceProfile(pendingEntityId)?.deviceType !== "electric-bed")
    ) {
      return false;
    } else {
      window.clearTimeout(activePendingDetails.timer);
      this.pendingEntityDetails = null;
      this.showEntityDetails(activePendingDetails.component, {
        preview: activePendingDetails.preview
      });
      return true;
    }
  }
  profiledComponent(
    profiledComponentInput,
    profileEntityId = profiledComponentInput?.bindings?.entity?.entityId || ""
  ) {
    return applyXiaomiDeviceProfile(
      profiledComponentInput,
      this.deviceProfile(this.runtimeEntityId(profileEntityId)) ||
        this.deviceProfile(profileEntityId)
    );
  }
  powerEntityId(
    powerComponent,
    requestedEntityId = powerComponent?.bindings?.entity?.entityId || ""
  ) {
    const normalizedEntityId = this.runtimeEntityId(requestedEntityId);
    const entityProfile =
      this.deviceProfile(normalizedEntityId) || this.deviceProfile(requestedEntityId);
    const resolvedPowerTarget = entityPowerTarget(
      normalizedEntityId,
      powerComponent,
      entityProfile
    );
    if (resolvedPowerTarget !== normalizedEntityId) {
      return this.runtimeEntityId(resolvedPowerTarget);
    }
    const relatedContext = relatedPopupContext(
      powerComponent,
      this.entityMetadata,
      this.deviceMetadata,
      this.states
    );
    if (
      powerComponent?.type !== "air-conditioner" &&
      relatedContext?.deviceType === "bath-heater"
    ) {
      const siblingLight = relatedContext.siblings?.find(
        relatedEntity =>
          relatedEntity.domain === "light" && entityMetadataIsAvailable(relatedEntity)
      );
      if (siblingLight?.entityId) {
        return this.runtimeEntityId(siblingLight.entityId);
      }
    }
    return normalizedEntityId;
  }
  runtimePowerComponent(
    runtimeComponent,
    componentEntityId = runtimeComponent?.bindings?.entity?.entityId || ""
  ) {
    const profiledRuntimeComponent = this.profiledComponent(runtimeComponent, componentEntityId);
    const runtimeEntityKey = this.runtimeEntityId(componentEntityId);
    const powerEntityIdValue = this.powerEntityId(profiledRuntimeComponent, componentEntityId);
    if (
      !powerEntityIdValue ||
      (powerEntityIdValue === runtimeEntityKey && runtimeEntityKey === componentEntityId)
    ) {
      return profiledRuntimeComponent;
    } else {
      return {
        ...profiledRuntimeComponent,
        bindings: {
          ...(profiledRuntimeComponent.bindings || {}),
          entity: {
            entityId: powerEntityIdValue
          }
        },
        properties: {
          ...(profiledRuntimeComponent.properties || {}),
          runtimePowerEntityId: powerEntityIdValue
        }
      };
    }
  }
  navigate(targetPagePath) {
    const targetPage = this.document?.pages.find(
      candidatePage => candidatePage.path === targetPagePath
    );
    if (targetPage) {
      this.page = targetPage;
      window.clearTimeout(this.runtimeHydrationRetryTimer);
      this.runtimeHydrationRetryTimer = null;
      this.runtimeHydrationRetryAttempt = 0;
      this.preloadStaticImages();
      this.renderComponents();
      this.connectRuntime();
      this.refreshHistorySeries();
      this.options.onPageChange?.(targetPage);
    }
  }
  setSelectedComponent(selectionComponentId) {
    this.setSelectedComponents(
      selectionComponentId ? [selectionComponentId] : [],
      selectionComponentId
    );
  }
  setSelectedComponents(componentIds, primaryComponentId = null) {
    this.selectedComponentIds = new Set(
      (componentIds || []).filter(recordComponentId => this.componentRecords.has(recordComponentId))
    );
    this.selectedComponentId = this.selectedComponentIds.has(primaryComponentId)
      ? primaryComponentId
      : this.selectedComponentIds.values().next().value || null;
    this.syncSelection();
  }
  setActiveGroup(groupId = null) {
    this.activeGroupId =
      groupId && this.componentRecords.get(groupId)?.type === "group" ? groupId : null;
    this.syncActiveGroup();
  }
  syncActiveGroup() {
    if (this.canvas) {
      this.canvas.classList.toggle("hb-editing-group", !!this.activeGroupId);
      for (const [hostedComponentId, hostComponentHost] of this.componentHosts) {
        hostComponentHost.classList.toggle(
          "hb-active-edit-group",
          hostedComponentId === this.activeGroupId &&
            hostComponentHost.parentElement === this.canvas
        );
      }
    }
  }
  setComponentSelectionLayer(layerComponentId, layerKind = "button") {
    if (layerComponentId) {
      if (layerKind === "airflow") {
        this.componentSelectionLayers.set(layerComponentId, "airflow");
      } else if (layerKind === "effect") {
        this.componentSelectionLayers.set(layerComponentId, "effect");
      } else if (layerKind === "perspective") {
        this.componentSelectionLayers.set(layerComponentId, "perspective");
      } else {
        this.componentSelectionLayers.delete(layerComponentId);
      }
      this.syncSelection();
    }
  }
  setComponentPreviewState(previewComponentId, previewState = "auto") {
    if (previewState === "on" || previewState === "off") {
      this.componentPreviewStates.set(previewComponentId, previewState);
    } else {
      this.componentPreviewStates.delete(previewComponentId);
    }
    this.previewComponentProperties(previewComponentId);
  }
  previewComponentTransform(transformComponentId, transformPatch = {}) {
    const transformRecord = this.componentRecords.get(transformComponentId);
    const transformHostElement = this.componentHosts.get(transformComponentId);
    if (!!transformRecord && !!transformHostElement) {
      transformRecord.position = {
        ...(transformRecord.position || {})
      };
      transformRecord.style = {
        ...(transformRecord.style || {})
      };
      if (Number.isFinite(transformPatch.x)) {
        transformRecord.position.x = transformPatch.x;
        transformHostElement.style.left = transformPatch.x + "px";
      }
      if (Number.isFinite(transformPatch.y)) {
        transformRecord.position.y = transformPatch.y;
        transformHostElement.style.top = transformPatch.y + "px";
      }
      if (Number.isFinite(transformPatch.width)) {
        transformRecord.position.width = transformPatch.width;
        transformHostElement.style.width = transformPatch.width + "px";
      }
      if (Number.isFinite(transformPatch.height)) {
        transformRecord.position.height = transformPatch.height;
        transformHostElement.style.height = transformPatch.height + "px";
      }
      if (Number.isFinite(transformPatch.rotation)) {
        transformRecord.position.rotation = transformPatch.rotation;
      }
      if (Number.isFinite(transformPatch.scale)) {
        transformRecord.style.scale = transformPatch.scale;
      }
      if (Number.isFinite(transformPatch.rotation) || Number.isFinite(transformPatch.scale)) {
        transformHostElement.style.transform =
          "rotate(" +
          Number(transformRecord.position.rotation || 0) +
          "deg) scale(" +
          Number(transformRecord.style.scale || 1) +
          ")";
      }
      this.syncComponentSelectionOverlay(transformComponentId);
      this.updateTransformHandleScale(transformHostElement, transformRecord);
    }
  }
  previewComponentProperties(propertyComponentId, propertyPatch = {}) {
    const propertyRecord = this.componentRecords.get(propertyComponentId);
    const propertyHostElement = this.componentHosts.get(propertyComponentId);
    if (!propertyRecord || !propertyHostElement) {
      return;
    }
    propertyRecord.properties = {
      ...(propertyRecord.properties || {}),
      ...propertyPatch
    };
    if (
      propertyRecord.type === "camera" &&
      Object.hasOwn(propertyPatch, "label") &&
      this.detailsDialog?.dataset?.componentId === propertyComponentId
    ) {
      const previewHeadingElement = this.detailsDialog.querySelector(
        ".hb-camera-preview-heading strong"
      );
      if (previewHeadingElement) {
        previewHeadingElement.textContent = componentDialogTitle(propertyRecord, "摄像头实时预览");
      }
    }
    if (Number.isFinite(propertyPatch.opacity)) {
      const imageComponentElement = propertyHostElement.querySelector(".hb-image-component");
      if (imageComponentElement) {
        imageComponentElement.style.opacity = String(
          Math.max(0, Math.min(1, propertyPatch.opacity))
        );
      }
      const vacuumMapComponentElement = propertyHostElement.querySelector(
        ".hb-vacuum-map-component"
      );
      if (vacuumMapComponentElement) {
        vacuumMapComponentElement.style.opacity = String(
          Math.max(0, Math.min(1, propertyPatch.opacity))
        );
      }
    }
    if (propertyRecord.type === "light-statistics") {
      this.refreshRuntimeComponent(propertyComponentId);
      return;
    }
    const refreshableComponentTypes = [
      "time",
      "date",
      "weather",
      "panel-frame",
      "icon-button-effect",
      "title-button",
      "icon-button",
      "device-button",
      "presence-sensor",
      "air-conditioner",
      "camera",
      "vacuum-map",
      "floorplan-auto-diagram",
      "line-chart"
    ];
    if (this.options.editable && refreshableComponentTypes.includes(propertyRecord.type)) {
      this.refreshEditorComponent(propertyComponentId);
      return;
    }
    if (
      [
        "time",
        "date",
        "weather",
        "line-chart",
        "panel-frame",
        "icon-button-effect",
        "title-button",
        "icon-button",
        "device-button",
        "presence-sensor",
        "air-conditioner",
        "camera",
        "vacuum-map"
      ].includes(propertyRecord.type)
    ) {
      this.renderComponents();
      return;
    }
    if (propertyRecord.type === "navigation-button") {
      const existingContentElement = [...propertyHostElement.children].find(
        childElement => !childElement.classList.contains("hb-selection-bounds")
      );
      const componentRenderContext = {
        document: this.document,
        page: this.page,
        states: this.states,
        history: this.historySeries,
        entityMetadata: this.entityMetadata,
        deviceMetadata: this.deviceMetadata,
        entityTranslations: this.entityTranslations,
        renderNamespace: this.renderNamespace,
        editable: !!this.options.editable,
        liveMedia: this.options.liveMedia !== false,
        previewState: this.componentPreviewStates.get(propertyComponentId) || "auto",
        isIconVisible: iconEntityId => this.iconVisibilityState(iconEntityId),
        navigate: navigatePath => this.navigate(navigatePath),
        cleanup: disposeCallback => this.cleanups.push(disposeCallback)
      };
      const renderedContentElement = renderRegisteredComponent(
        this.profiledComponent(propertyRecord),
        componentRenderContext
      );
      const componentScale = Number(this.document.canvas.componentScale || 1);
      if (componentScale !== 1) {
        renderedContentElement.style.width = 100 / componentScale + "%";
        renderedContentElement.style.height = 100 / componentScale + "%";
        renderedContentElement.style.transform = "scale(" + componentScale + ")";
        renderedContentElement.style.transformOrigin = "top left";
      }
      if (existingContentElement) {
        existingContentElement.replaceWith(renderedContentElement);
      } else {
        propertyHostElement.prepend(renderedContentElement);
      }
    }
  }
  syncSelection() {
    this.canvas
      ?.querySelectorAll(".hb-multi-selection-bounds")
      .forEach(boundsElement => boundsElement.remove());
    this.canvas
      ?.querySelectorAll(".hb-component-selection-overlay")
      .forEach(removedOverlayElement => removedOverlayElement.remove());
    this.componentSelectionOverlays.clear();
    for (const airflowLayerElement of this.componentAirflowLayers.values()) {
      airflowLayerElement
        .querySelectorAll(":scope > .hb-selection-bounds")
        .forEach(airflowBoundsElement => airflowBoundsElement.remove());
    }
    for (const [hostedSelectionComponentId, selectionHostElement] of this.componentHosts) {
      const isSelected =
        this.options.editable && this.selectedComponentIds.has(hostedSelectionComponentId);
      const selectionRecord = this.componentRecords.get(hostedSelectionComponentId);
      const isPendingDiagram =
        selectionRecord?.type === "floorplan-auto-diagram" &&
        selectionRecord.properties?.generated !== true;
      selectionHostElement.hidden = isPendingDiagram
        ? !isSelected
        : selectionRecord?.style?.visible === false;
      selectionHostElement.classList.toggle("selected", isSelected);
      selectionHostElement.classList.toggle(
        "selection-primary",
        isSelected && hostedSelectionComponentId === this.selectedComponentId
      );
      selectionHostElement.classList.toggle(
        "hb-light-statistics-selection-host",
        isSelected &&
          this.selectedComponentIds.size === 1 &&
          selectionRecord?.type === "light-statistics"
      );
      selectionHostElement
        .querySelectorAll(":scope > .hb-selection-bounds, :scope > .hb-transform-handle")
        .forEach(staleHandleElement => staleHandleElement.remove());
      if (!isSelected) {
        continue;
      }
      const showAirflowHandles =
        this.selectedComponentIds.size === 1 &&
        hostedSelectionComponentId === this.selectedComponentId &&
        selectionRecord?.type === "air-conditioner" &&
        this.componentSelectionLayers.get(hostedSelectionComponentId) === "airflow";
      const showEffectHandles =
        this.selectedComponentIds.size === 1 &&
        hostedSelectionComponentId === this.selectedComponentId &&
        selectionRecord?.type === "icon-button-effect" &&
        this.componentSelectionLayers.get(hostedSelectionComponentId) === "effect";
      const showPerspectiveHandles =
        this.selectedComponentIds.size === 1 &&
        hostedSelectionComponentId === this.selectedComponentId &&
        selectionRecord?.type === "presence-sensor" &&
        selectionRecord?.properties?.sensorKind === "door-window" &&
        this.componentSelectionLayers.get(hostedSelectionComponentId) === "perspective";
      if (showAirflowHandles) {
        this.appendAirflowTransformHandles(
          this.componentAirflowLayers.get(hostedSelectionComponentId),
          selectionRecord
        );
      } else if (
        showEffectHandles &&
        this.componentEffectLayers.get(hostedSelectionComponentId) &&
        !this.componentEffectLayers.get(hostedSelectionComponentId).hidden
      ) {
        this.appendEffectSelectionBounds(
          this.componentEffectLayers.get(hostedSelectionComponentId),
          selectionRecord
        );
      } else if (showPerspectiveHandles) {
        const perspectiveOverlayElement =
          this.createComponentSelectionOverlay(selectionHostElement, selectionRecord) ||
          selectionHostElement;
        this.appendDoorWindowPerspectiveHandles(
          selectionHostElement,
          selectionRecord,
          perspectiveOverlayElement
        );
      } else {
        const isSingleSelection = this.selectedComponentIds.size === 1;
        const primaryOverlayElement = isSingleSelection
          ? this.createComponentSelectionOverlay(selectionHostElement, selectionRecord)
          : selectionHostElement;
        this.appendTransformHandles(
          selectionHostElement,
          selectionRecord,
          isSingleSelection,
          primaryOverlayElement || selectionHostElement
        );
      }
    }
    if (this.selectedComponentIds.size > 1) {
      this.appendMultiSelectionBounds();
    }
  }
  selectedScaleRecords() {
    const selectedRecords = [...this.selectedComponentIds].map(selectedComponentId => ({
      component: this.componentRecords.get(selectedComponentId),
      host: this.componentHosts.get(selectedComponentId)
    }));
    const selectionParentElement = selectedRecords[0]?.host?.parentElement || null;
    if (
      selectedRecords.length < 2 ||
      selectedRecords.some(
        selectedRecord =>
          !selectedRecord.component ||
          !selectedRecord.host ||
          selectedRecord.host.parentElement !== selectionParentElement ||
          selectedRecord.component.properties?.layoutMode === "fill"
      )
    ) {
      return [];
    } else {
      return selectedRecords;
    }
  }
  componentParentTransform(chainComponentId) {
    let parentComponentId = this.componentParentIds?.get(chainComponentId) || null;
    let accumulatedRotation = 0;
    let accumulatedScale = 1;
    const visitedParentIds = new Set();
    while (parentComponentId && !visitedParentIds.has(parentComponentId)) {
      visitedParentIds.add(parentComponentId);
      const parentRecord = this.componentRecords.get(parentComponentId);
      if (!parentRecord) {
        break;
      }
      accumulatedRotation += Number(parentRecord.position?.rotation || 0);
      accumulatedScale *= Math.max(0.01, Math.min(5, Number(parentRecord.style?.scale || 1)));
      parentComponentId = this.componentParentIds?.get(parentComponentId) || null;
    }
    return {
      rotation: accumulatedRotation,
      scale: accumulatedScale
    };
  }
  componentTransformChain(transformChainComponentId) {
    const transformChain = [];
    let currentComponentId = transformChainComponentId;
    const visitedChainIds = new Set();
    while (currentComponentId && !visitedChainIds.has(currentComponentId)) {
      visitedChainIds.add(currentComponentId);
      const chainRecord = this.componentRecords.get(currentComponentId);
      if (!chainRecord) {
        break;
      }
      transformChain.push(chainRecord);
      currentComponentId = this.componentParentIds?.get(currentComponentId) || null;
    }
    return transformChain;
  }
  componentWorldTransform(worldTransformComponentId) {
    return this.componentTransformChain(worldTransformComponentId).reduce(
      (accumulatedTransform, chainEntry) => ({
        rotation: accumulatedTransform.rotation + Number(chainEntry.position?.rotation || 0),
        scale:
          accumulatedTransform.scale *
          Math.max(0.01, Math.min(5, Number(chainEntry.style?.scale || 1)))
      }),
      {
        rotation: 0,
        scale: 1
      }
    );
  }
  worldPointToComponentLocal(localPointComponentId, worldX, worldY) {
    let localPoint = {
      x: Number(worldX || 0),
      y: Number(worldY || 0)
    };
    const reversedChain = this.componentTransformChain(localPointComponentId).reverse();
    for (const chainComponent of reversedChain) {
      const componentPosition = chainComponent.position || {};
      const componentWidthPx = Number(componentPosition.width || 100);
      const componentHeightPx = Number(componentPosition.height || 100);
      const componentScaleValue = Math.max(
        0.01,
        Math.min(5, Number(chainComponent.style?.scale || 1))
      );
      const rotationRad = (Number(componentPosition.rotation || 0) * Math.PI) / 180;
      const rotationCosine = Math.cos(rotationRad);
      const rotationSine = Math.sin(rotationRad);
      const positionCenterX = Number(componentPosition.x || 0) + componentWidthPx / 2;
      const positionCenterY = Number(componentPosition.y || 0) + componentHeightPx / 2;
      const localOffsetX = (localPoint.x - positionCenterX) / componentScaleValue;
      const localOffsetY = (localPoint.y - positionCenterY) / componentScaleValue;
      localPoint = {
        x: componentWidthPx / 2 + localOffsetX * rotationCosine + localOffsetY * rotationSine,
        y: componentHeightPx / 2 - localOffsetX * rotationSine + localOffsetY * rotationCosine
      };
    }
    return localPoint;
  }
  componentLocalPointToWorld(worldPointComponentId, localX, localY) {
    let worldPoint = {
      x: Number(localX || 0),
      y: Number(localY || 0)
    };
    for (const transformChainRecord of this.componentTransformChain(worldPointComponentId)) {
      const recordPosition = transformChainRecord.position || {};
      const recordWidthPx = Number(recordPosition.width || 100);
      const recordHeightPx = Number(recordPosition.height || 100);
      const recordScale = Math.max(
        0.01,
        Math.min(5, Number(transformChainRecord.style?.scale || 1))
      );
      const recordRotationRad = (Number(recordPosition.rotation || 0) * Math.PI) / 180;
      const scaledOffsetX = (worldPoint.x - recordWidthPx / 2) * recordScale;
      const scaledOffsetY = (worldPoint.y - recordHeightPx / 2) * recordScale;
      worldPoint = {
        x:
          Number(recordPosition.x || 0) +
          recordWidthPx / 2 +
          scaledOffsetX * Math.cos(recordRotationRad) -
          scaledOffsetY * Math.sin(recordRotationRad),
        y:
          Number(recordPosition.y || 0) +
          recordHeightPx / 2 +
          scaledOffsetX * Math.sin(recordRotationRad) +
          scaledOffsetY * Math.cos(recordRotationRad)
      };
    }
    return worldPoint;
  }
  componentVisualBounds(boundsComponent, boundsHostElement = null) {
    const boundsPosition = boundsComponent.position || {};
    const boundsWidthPx = Math.max(0.01, Number(boundsPosition.width || 100));
    const boundsHeightPx = Math.max(0.01, Number(boundsPosition.height || 100));
    let effectiveWidthPx = boundsWidthPx;
    let effectiveHeightPx = boundsHeightPx;
    let localOffsetLeftPx = 0;
    let localOffsetTopPx = 0;
    if (boundsComponent.type === "light-statistics" && boundsHostElement) {
      const selectionBoundsElement = boundsHostElement.querySelector(
        ":scope > .hb-selection-bounds"
      );
      const selectionBoundsRect = selectionBoundsElement
        ? [
            Number.parseFloat(selectionBoundsElement.style.left),
            Number.parseFloat(selectionBoundsElement.style.top),
            Number.parseFloat(selectionBoundsElement.style.width),
            Number.parseFloat(selectionBoundsElement.style.height)
          ]
        : [];
      if (
        selectionBoundsRect.every(Number.isFinite) &&
        selectionBoundsRect[2] > 0 &&
        selectionBoundsRect[3] > 0
      ) {
        [localOffsetLeftPx, localOffsetTopPx, effectiveWidthPx, effectiveHeightPx] =
          selectionBoundsRect;
      }
    }
    const boundsScale = Math.max(0.01, Math.min(5, Number(boundsComponent.style?.scale || 1)));
    const boundsRotationRad = (Number(boundsPosition.rotation || 0) * Math.PI) / 180;
    const scaledWidthPx = effectiveWidthPx * boundsScale;
    const scaledHeightPx = effectiveHeightPx * boundsScale;
    const halfExtentX =
      (Math.abs(Math.cos(boundsRotationRad)) * scaledWidthPx +
        Math.abs(Math.sin(boundsRotationRad)) * scaledHeightPx) /
      2;
    const halfExtentY =
      (Math.abs(Math.sin(boundsRotationRad)) * scaledWidthPx +
        Math.abs(Math.cos(boundsRotationRad)) * scaledHeightPx) /
      2;
    const pivotCenterX = Number(boundsPosition.x || 0) + boundsWidthPx / 2;
    const pivotCenterY = Number(boundsPosition.y || 0) + boundsHeightPx / 2;
    const boundsCenterX = Number(boundsPosition.x || 0) + localOffsetLeftPx + effectiveWidthPx / 2;
    const boundsCenterY = Number(boundsPosition.y || 0) + localOffsetTopPx + effectiveHeightPx / 2;
    const centerDeltaX = (boundsCenterX - pivotCenterX) * boundsScale;
    const centerDeltaY = (boundsCenterY - pivotCenterY) * boundsScale;
    const rotatedCenterX =
      pivotCenterX +
      centerDeltaX * Math.cos(boundsRotationRad) -
      centerDeltaY * Math.sin(boundsRotationRad);
    const rotatedCenterY =
      pivotCenterY +
      centerDeltaX * Math.sin(boundsRotationRad) +
      centerDeltaY * Math.cos(boundsRotationRad);
    return {
      left: rotatedCenterX - halfExtentX,
      top: rotatedCenterY - halfExtentY,
      right: rotatedCenterX + halfExtentX,
      bottom: rotatedCenterY + halfExtentY
    };
  }
  scaleRecordsBounds(scaleRecords) {
    const recordBoundsList = scaleRecords.map(scaleRecord =>
      this.componentVisualBounds(scaleRecord.component, scaleRecord.host)
    );
    return {
      left: Math.min(...recordBoundsList.map(boundsLeft => boundsLeft.left)),
      top: Math.min(...recordBoundsList.map(boundsTop => boundsTop.top)),
      right: Math.max(...recordBoundsList.map(boundsRight => boundsRight.right)),
      bottom: Math.max(...recordBoundsList.map(boundsBottom => boundsBottom.bottom))
    };
  }
  refreshMultiSelectionBounds() {
    const multiSelectionBoundsElement = this.canvas?.querySelector(".hb-multi-selection-bounds");
    if (
      !multiSelectionBoundsElement ||
      !this.selectedComponentIds ||
      this.selectedComponentIds.size < 2
    ) {
      return;
    }
    const multiSelectionRecords = this.selectedScaleRecords();
    if (!multiSelectionRecords.length) {
      multiSelectionBoundsElement.remove();
      return;
    }
    const multiSelectionRect = this.scaleRecordsBounds(multiSelectionRecords);
    Object.assign(multiSelectionBoundsElement.style, {
      left: multiSelectionRect.left + "px",
      top: multiSelectionRect.top + "px",
      width: Math.max(1, multiSelectionRect.right - multiSelectionRect.left) + "px",
      height: Math.max(1, multiSelectionRect.bottom - multiSelectionRect.top) + "px"
    });
    this.updateMultiSelectionHandleScale(multiSelectionBoundsElement);
  }
  updateMultiSelectionHandleScale(multiBoundsElement) {
    if (!multiBoundsElement) {
      return;
    }
    const canvasScale = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1);
    const ownerComponentId = multiBoundsElement.parentElement?.dataset?.componentId || null;
    const ownerWorldScale = ownerComponentId
      ? this.componentWorldTransform(ownerComponentId).scale
      : 1;
    const uiScaleFactor = 1 / Math.max(0.001, canvasScale * ownerWorldScale);
    multiBoundsElement.style.setProperty("--hb-ui-scale", String(uiScaleFactor));
    multiBoundsElement.style.setProperty("--hb-handle-outset", uiScaleFactor * 30 + "px");
    const boundsClientRect = multiBoundsElement.getBoundingClientRect();
    multiBoundsElement.classList.toggle(
      "handles-outside",
      boundsClientRect.width < 132 || boundsClientRect.height < 112
    );
  }
  appendMultiSelectionBounds() {
    const multiSelectionRecordList = this.selectedScaleRecords();
    if (!multiSelectionRecordList.length) {
      return;
    }
    const combinedBoundsRect = this.scaleRecordsBounds(multiSelectionRecordList);
    const multiSelectionElement = document.createElement("div");
    multiSelectionElement.className = "hb-selection-bounds hb-multi-selection-bounds";
    Object.assign(multiSelectionElement.style, {
      left: combinedBoundsRect.left + "px",
      top: combinedBoundsRect.top + "px",
      width: Math.max(1, combinedBoundsRect.right - combinedBoundsRect.left) + "px",
      height: Math.max(1, combinedBoundsRect.bottom - combinedBoundsRect.top) + "px"
    });
    for (const cornerPosition of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const cornerMarkerElement = document.createElement("i");
      cornerMarkerElement.className = "hb-corner-marker hb-corner-" + cornerPosition;
      cornerMarkerElement.setAttribute("aria-hidden", "true");
      multiSelectionElement.append(cornerMarkerElement);
    }
    const resizeHandleElement = document.createElement("button");
    resizeHandleElement.type = "button";
    resizeHandleElement.className = "hb-transform-handle hb-resize-handle";
    resizeHandleElement.title = "拖动整体缩放";
    resizeHandleElement.addEventListener("pointerdown", resizePointerEvent =>
      this.startComponentsScale(
        resizePointerEvent,
        multiSelectionRecordList,
        combinedBoundsRect,
        multiSelectionElement
      )
    );
    const rotateHandleElement = document.createElement("button");
    rotateHandleElement.type = "button";
    rotateHandleElement.className = "hb-transform-handle hb-rotate-handle";
    rotateHandleElement.title = "拖动整体旋转";
    rotateHandleElement.addEventListener("pointerdown", rotateHandlePointerEvent =>
      this.startComponentsRotate(
        rotateHandlePointerEvent,
        multiSelectionRecordList,
        combinedBoundsRect,
        multiSelectionElement
      )
    );
    multiSelectionElement.append(resizeHandleElement, rotateHandleElement);
    (multiSelectionRecordList[0]?.host?.parentElement || this.canvas).append(multiSelectionElement);
    this.updateMultiSelectionHandleScale(multiSelectionElement);
  }
  previewComponentsTransform(transformList, leadComponentId = this.selectedComponentId) {
    for (const componentTransformItem of transformList || []) {
      const transformComponentRecord = this.componentRecords.get(
        componentTransformItem.componentId
      );
      const transformComponentHost = this.componentHosts.get(componentTransformItem.componentId);
      if (!!transformComponentRecord && !!transformComponentHost) {
        transformComponentRecord.position = {
          ...(transformComponentRecord.position || {}),
          ...(Number.isFinite(componentTransformItem.x)
            ? {
                x: componentTransformItem.x
              }
            : {}),
          ...(Number.isFinite(componentTransformItem.y)
            ? {
                y: componentTransformItem.y
              }
            : {})
        };
        if (Number.isFinite(componentTransformItem.scale)) {
          transformComponentRecord.style = {
            ...(transformComponentRecord.style || {}),
            scale: componentTransformItem.scale
          };
        }
        if (Number.isFinite(componentTransformItem.rotation)) {
          transformComponentRecord.position.rotation = componentTransformItem.rotation;
        }
        if (Number.isFinite(componentTransformItem.x)) {
          transformComponentHost.style.left = componentTransformItem.x + "px";
        }
        if (Number.isFinite(componentTransformItem.y)) {
          transformComponentHost.style.top = componentTransformItem.y + "px";
        }
        if (
          Number.isFinite(componentTransformItem.scale) ||
          Number.isFinite(componentTransformItem.rotation)
        ) {
          transformComponentHost.style.transform =
            "rotate(" +
            Number(transformComponentRecord.position?.rotation || 0) +
            "deg) scale(" +
            Number(transformComponentRecord.style?.scale || 1) +
            ")";
        }
      }
    }
    this.syncSelection();
    this.options.onComponentsTransformPreview?.(transformList, leadComponentId);
  }
  startComponentsScale(scalePointerEvent, recordList, boundsRect, activeBoundsElement) {
    scalePointerEvent.preventDefault();
    scalePointerEvent.stopPropagation();
    const multiBoundsClientRect = activeBoundsElement.getBoundingClientRect();
    const boundingCenterX = multiBoundsClientRect.left + multiBoundsClientRect.width / 2;
    const boundingCenterY = multiBoundsClientRect.top + multiBoundsClientRect.height / 2;
    const initialPointerDistance = Math.max(
      1,
      Math.hypot(
        scalePointerEvent.clientX - boundingCenterX,
        scalePointerEvent.clientY - boundingCenterY
      )
    );
    const selectionCenterX = (boundsRect.left + boundsRect.right) / 2;
    const selectionCenterY = (boundsRect.top + boundsRect.bottom) / 2;
    const scalableRecords = recordList.map(scaleEntry => {
      const entryPosition = scaleEntry.component.position || {};
      const entryWidthPx = Number(entryPosition.width || 100);
      const entryHeightPx = Number(entryPosition.height || 100);
      return {
        ...scaleEntry,
        width: entryWidthPx,
        height: entryHeightPx,
        centerX: Number(entryPosition.x || 0) + entryWidthPx / 2,
        centerY: Number(entryPosition.y || 0) + entryHeightPx / 2,
        scale: Math.max(0.01, Math.min(5, Number(scaleEntry.component.style?.scale || 1)))
      };
    });
    const minScaleFactor = Math.max(
      ...scalableRecords.map(minScaleEntry => 0.01 / minScaleEntry.scale)
    );
    const maxScaleFactor = Math.min(
      ...scalableRecords.map(maxScaleEntry => 5 / maxScaleEntry.scale)
    );
    let scaleFactor = 1;
    let previewTransforms = [];
    let isFinished = false;
    const activePointerId = scalePointerEvent.pointerId;
    scalePointerEvent.currentTarget.setPointerCapture(activePointerId);
    const onScalePointerMove = scaleMoveEvent => {
      if (scaleMoveEvent.pointerId !== activePointerId) {
        return;
      }
      const currentDistance = Math.hypot(
        scaleMoveEvent.clientX - boundingCenterX,
        scaleMoveEvent.clientY - boundingCenterY
      );
      scaleFactor = Math.max(
        minScaleFactor,
        Math.min(maxScaleFactor, currentDistance / initialPointerDistance)
      );
      previewTransforms = scalableRecords.map(scaleTargetEntry => {
        const scaledCenterX =
          selectionCenterX + (scaleTargetEntry.centerX - selectionCenterX) * scaleFactor;
        const scaledCenterY =
          selectionCenterY + (scaleTargetEntry.centerY - selectionCenterY) * scaleFactor;
        const nextEntryScale = scaleTargetEntry.scale * scaleFactor;
        const nextLeftPx = scaledCenterX - scaleTargetEntry.width / 2;
        const nextTopPx = scaledCenterY - scaleTargetEntry.height / 2;
        scaleTargetEntry.component.position = {
          ...(scaleTargetEntry.component.position || {}),
          x: nextLeftPx,
          y: nextTopPx
        };
        scaleTargetEntry.component.style = {
          ...(scaleTargetEntry.component.style || {}),
          scale: nextEntryScale
        };
        scaleTargetEntry.host.style.left = nextLeftPx + "px";
        scaleTargetEntry.host.style.top = nextTopPx + "px";
        scaleTargetEntry.host.style.transform =
          "rotate(" +
          Number(scaleTargetEntry.component.position?.rotation || 0) +
          "deg) scale(" +
          nextEntryScale +
          ")";
        return {
          componentId: scaleTargetEntry.component.id,
          x: nextLeftPx,
          y: nextTopPx,
          scale: nextEntryScale
        };
      });
      Object.assign(activeBoundsElement.style, {
        left: selectionCenterX + (boundsRect.left - selectionCenterX) * scaleFactor + "px",
        top: selectionCenterY + (boundsRect.top - selectionCenterY) * scaleFactor + "px",
        width: Math.max(1, (boundsRect.right - boundsRect.left) * scaleFactor) + "px",
        height: Math.max(1, (boundsRect.bottom - boundsRect.top) * scaleFactor) + "px"
      });
      this.updateMultiSelectionHandleScale(activeBoundsElement);
      this.options.onComponentsTransformPreview?.(previewTransforms, this.selectedComponentId);
    };
    const onScalePointerEnd = (endEvent = null) => {
      if (!isFinished && (endEvent?.pointerId == null || endEvent.pointerId === activePointerId)) {
        isFinished = true;
        window.removeEventListener("pointermove", onScalePointerMove, true);
        window.removeEventListener("pointerup", onScalePointerEnd, true);
        window.removeEventListener("pointercancel", onScalePointerEnd, true);
        window.removeEventListener("blur", onScalePointerEnd);
        if (scaleFactor !== 1 && previewTransforms.length) {
          this.options.onComponentsTransform?.(previewTransforms, this.selectedComponentId);
        }
      }
    };
    window.addEventListener("pointermove", onScalePointerMove, true);
    window.addEventListener("pointerup", onScalePointerEnd, true);
    window.addEventListener("pointercancel", onScalePointerEnd, true);
    window.addEventListener("blur", onScalePointerEnd);
  }
  startComponentsRotate(
    rotationPointerEvent,
    rotationRecordList,
    rotateBoundsRect,
    rotateBoundsElement
  ) {
    rotationPointerEvent.preventDefault();
    rotationPointerEvent.stopPropagation();
    const rotateBoundsClientRect = rotateBoundsElement.getBoundingClientRect();
    const rotateCenterX = rotateBoundsClientRect.left + rotateBoundsClientRect.width / 2;
    const rotateCenterY = rotateBoundsClientRect.top + rotateBoundsClientRect.height / 2;
    const rotatePivotX = (rotateBoundsRect.left + rotateBoundsRect.right) / 2;
    const rotatePivotY = (rotateBoundsRect.top + rotateBoundsRect.bottom) / 2;
    const rotatableRecords = rotationRecordList.map(rotateEntry => {
      const rotateEntryPosition = rotateEntry.component.position || {};
      const rotateEntryWidthPx = Number(rotateEntryPosition.width || 100);
      const rotateEntryHeightPx = Number(rotateEntryPosition.height || 100);
      return {
        ...rotateEntry,
        componentId: rotateEntry.component.id,
        width: rotateEntryWidthPx,
        height: rotateEntryHeightPx,
        centerX: Number(rotateEntryPosition.x || 0) + rotateEntryWidthPx / 2,
        centerY: Number(rotateEntryPosition.y || 0) + rotateEntryHeightPx / 2,
        rotation: Number(rotateEntryPosition.rotation || 0)
      };
    });
    let lastPointerAngle = Math.atan2(
      rotationPointerEvent.clientY - rotateCenterY,
      rotationPointerEvent.clientX - rotateCenterX
    );
    let accumulatedRotationDeg = 0;
    let rotatedTransforms = [];
    let isRotateFinished = false;
    const rotatePointerId = rotationPointerEvent.pointerId;
    rotationPointerEvent.currentTarget.setPointerCapture(rotatePointerId);
    const onRotatePointerMove = rotateMoveEvent => {
      if (rotateMoveEvent.pointerId !== rotatePointerId) {
        return;
      }
      const currentPointerAngle = Math.atan2(
        rotateMoveEvent.clientY - rotateCenterY,
        rotateMoveEvent.clientX - rotateCenterX
      );
      let angleDelta = currentPointerAngle - lastPointerAngle;
      if (angleDelta > Math.PI) {
        angleDelta -= Math.PI * 2;
      } else if (angleDelta < -Math.PI) {
        angleDelta += Math.PI * 2;
      }
      accumulatedRotationDeg += (angleDelta * 180) / Math.PI;
      lastPointerAngle = currentPointerAngle;
      rotatedTransforms = rotateMultiSelectionTransforms(
        rotatableRecords,
        rotatePivotX,
        rotatePivotY,
        accumulatedRotationDeg
      );
      for (const rotatedTransform of rotatedTransforms) {
        const matchedRotateEntry = rotatableRecords.find(
          entryTransform => entryTransform.componentId === rotatedTransform.componentId
        );
        if (matchedRotateEntry) {
          matchedRotateEntry.component.position = {
            ...(matchedRotateEntry.component.position || {}),
            x: rotatedTransform.x,
            y: rotatedTransform.y,
            rotation: rotatedTransform.rotation
          };
          matchedRotateEntry.host.style.left = rotatedTransform.x + "px";
          matchedRotateEntry.host.style.top = rotatedTransform.y + "px";
          matchedRotateEntry.host.style.transform =
            "rotate(" +
            rotatedTransform.rotation +
            "deg) scale(" +
            Number(matchedRotateEntry.component.style?.scale || 1) +
            ")";
        }
      }
      rotateBoundsElement.style.transform = "rotate(" + accumulatedRotationDeg + "deg)";
      rotateBoundsElement.style.transformOrigin = "center center";
      this.options.onComponentsTransformPreview?.(rotatedTransforms, this.selectedComponentId);
    };
    const onRotatePointerEnd = (rotateEndEvent = null) => {
      if (
        !isRotateFinished &&
        (rotateEndEvent?.pointerId == null || rotateEndEvent.pointerId === rotatePointerId)
      ) {
        isRotateFinished = true;
        window.removeEventListener("pointermove", onRotatePointerMove, true);
        window.removeEventListener("pointerup", onRotatePointerEnd, true);
        window.removeEventListener("pointercancel", onRotatePointerEnd, true);
        window.removeEventListener("blur", onRotatePointerEnd);
        if (accumulatedRotationDeg !== 0 && rotatedTransforms.length) {
          this.options.onComponentsTransform?.(rotatedTransforms, this.selectedComponentId);
        }
      }
    };
    window.addEventListener("pointermove", onRotatePointerMove, true);
    window.addEventListener("pointerup", onRotatePointerEnd, true);
    window.addEventListener("pointercancel", onRotatePointerEnd, true);
    window.addEventListener("blur", onRotatePointerEnd);
  }
  cleanupComponents(removeAllCleanups = false, keptComponentIds = new Set()) {
    if (
      this.retainedInteraction3d &&
      !keptComponentIds.has(this.retainedInteraction3d.component.id)
    ) {
      this.releaseRetainedInteraction3d();
    }
    for (const cleanupCallback of this.cleanups.splice(0)) {
      cleanupCallback();
    }
    for (const cleanupComponentId of [...this.componentCleanups.keys()]) {
      if (!keptComponentIds.has(cleanupComponentId)) {
        this.cleanupRenderedComponent(cleanupComponentId);
      }
    }
    if (!removeAllCleanups) {
      for (const cameraCleanupCallbacks of this.cameraCleanups.values()) {
        for (const cameraCleanupCallback of cameraCleanupCallbacks.splice(0)) {
          cameraCleanupCallback();
        }
      }
      this.cameraCleanups.clear();
    }
  }
  registerComponentCleanup(registeredComponentId, registeredCleanup) {
    if (!!registeredComponentId && typeof registeredCleanup == "function") {
      if (!this.componentCleanups.has(registeredComponentId)) {
        this.componentCleanups.set(registeredComponentId, []);
      }
      this.componentCleanups.get(registeredComponentId).push(registeredCleanup);
    }
  }
  releaseRetainedInteraction3d() {
    const retainedInteraction3d = this.retainedInteraction3d;
    if (retainedInteraction3d) {
      this.retainedInteraction3d = null;
      clearTimeout(retainedInteraction3d.timer);
      this.cleanupRenderedComponent(retainedInteraction3d.component.id);
      retainedInteraction3d.host.remove();
    }
  }
  cleanupRenderedComponent(renderedComponentId) {
    const componentCleanupCallbacks = this.componentCleanups.get(renderedComponentId) || [];
    this.componentCleanups.delete(renderedComponentId);
    for (const componentCleanupCallback of componentCleanupCallbacks.splice(0)) {
      componentCleanupCallback();
    }
  }
  render(retainedHostMap = null) {
    const canReuseHosts =
      !!retainedHostMap?.size &&
      !!this.canvas?.isConnected &&
      !!this.viewport?.isConnected &&
      !![...retainedHostMap.values()].some(
        candidateRetainedHost => candidateRetainedHost.parentElement === this.canvas
      );
    if (!canReuseHosts) {
      this.cleanupComponents();
      this.container.replaceChildren();
    }
    this.container.dataset.uiTheme = this.document?.theme?.name || "";
    for (const staleThemeVariable of this.themeVariableNames) {
      this.container.style.removeProperty(staleThemeVariable);
    }
    this.themeVariableNames.clear();
    for (const [themeVariableKey, themeVariableValue] of Object.entries(
      this.document?.theme?.variables || {}
    )) {
      const cssVariableName = String(themeVariableKey).startsWith("--")
        ? String(themeVariableKey)
        : "--" + themeVariableKey;
      if (/^--[a-zA-Z0-9_-]+$/.test(cssVariableName)) {
        this.container.style.setProperty(cssVariableName, String(themeVariableValue));
        this.themeVariableNames.add(cssVariableName);
      }
    }
    if (!canReuseHosts) {
      const viewportElement = document.createElement("div");
      viewportElement.className =
        "hb-renderer-viewport" + (this.options.editable ? "" : " hb-runtime-no-select");
      const canvasElement = document.createElement("div");
      canvasElement.className = "hb-renderer-canvas";
      viewportElement.append(canvasElement);
      this.container.append(viewportElement);
      this.viewport = viewportElement;
      this.canvas = canvasElement;
    }
    this.viewport.className =
      "hb-renderer-viewport" + (this.options.editable ? "" : " hb-runtime-no-select");
    this.canvas.style.width = this.document.canvas.width + "px";
    this.canvas.style.height = this.document.canvas.height + "px";
    this.canvas.style.background =
      this.document.canvas.background?.type === "color"
        ? this.document.canvas.background.color || "#0b1116"
        : "";
    this.renderComponents(canReuseHosts, retainedHostMap);
    this.resize();
  }
  renderComponents(retainHosts = false, carriedOverHosts = null) {
    if (!this.canvas || !this.page) {
      return;
    }
    const sharedComponentsById = new Map(
      (this.document.sharedComponents || []).map(sharedComponentEntry => [
        sharedComponentEntry.id,
        sharedComponentEntry
      ])
    );
    const pageSharedComponentRecords = (this.page.sharedComponentIds || [])
      .map(pageSharedComponentId => sharedComponentsById.get(pageSharedComponentId))
      .filter(Boolean);
    const pageComponentIds = new Set(
      collectComponents(
        [...(this.page.components || []), ...pageSharedComponentRecords],
        () => true
      ).map(pageComponent => pageComponent.id)
    );
    this.states.set("virtual.icon_visibility.current", {
      entityId: "virtual.icon_visibility.current",
      state: this.iconVisibilityState() ? "on" : "off",
      attributes: {}
    });
    const hostByComponentId = new Map([
      ...(retainHosts
        ? [...this.componentHosts].filter(([retainedHostComponentId]) =>
            ["camera", "vacuum-map", "floorplan-auto-diagram"].includes(
              this.componentRecords.get(retainedHostComponentId)?.type
            )
          )
        : []),
      ...(carriedOverHosts && typeof carriedOverHosts[Symbol.iterator] == "function"
        ? carriedOverHosts
        : [])
    ]);
    const pageComponentRecordsById = new Map(
      collectComponents(
        [...(this.page.components || []), ...pageSharedComponentRecords],
        () => true
      ).map(pageComponentRecord => [pageComponentRecord.id, pageComponentRecord])
    );
    const pageInteraction3dRecords = [...pageComponentRecordsById.values()].filter(
      interaction3dRecord => interaction3dRecord.type === "interaction3d"
    );
    const canRetainInteraction3d =
      !this.options?.editable && !this.replacingDocument && Array.isArray(this.document.pages);
    const documentInteraction3dByComponentId = canRetainInteraction3d
      ? new Map(
          collectComponents(
            [
              ...(this.document.sharedComponents || []),
              ...this.document.pages.flatMap(
                scannedDocumentPage => scannedDocumentPage.components || []
              )
            ],
            documentComponent => documentComponent.type === "interaction3d"
          ).map(documentComponentRecord => [documentComponentRecord.id, documentComponentRecord])
        )
      : new Map();
    const interaction3dMatchesRetained = (retainedComponentRecord, candidateComponentRecord) =>
      candidateComponentRecord?.type === "interaction3d" &&
      retainedComponentRecord.properties?.sceneId ===
        candidateComponentRecord.properties?.sceneId &&
      retainedComponentRecord.properties?.lightingMode ===
        candidateComponentRecord.properties?.lightingMode;
    let retainedInteraction3dEntry = this.retainedInteraction3d;
    if (
      retainedInteraction3dEntry &&
      (!canRetainInteraction3d ||
        retainedInteraction3dEntry.host.parentElement !== this.canvas ||
        !interaction3dMatchesRetained(
          retainedInteraction3dEntry.component,
          documentInteraction3dByComponentId.get(retainedInteraction3dEntry.component.id)
        ) ||
        pageInteraction3dRecords.some(
          pageInteraction3dEntry =>
            pageInteraction3dEntry.id !== retainedInteraction3dEntry.component.id
        ))
    ) {
      this.releaseRetainedInteraction3d();
      retainedInteraction3dEntry = null;
    }
    if (canRetainInteraction3d && !retainedInteraction3dEntry && !pageInteraction3dRecords.length) {
      for (const [hostEntryComponentId, hostEntryElement] of this.componentHosts) {
        const hostEntryRecord = this.componentRecords.get(hostEntryComponentId);
        if (
          hostEntryRecord?.type === "interaction3d" &&
          hostEntryElement.parentElement === this.canvas &&
          !!interaction3dMatchesRetained(
            hostEntryRecord,
            documentInteraction3dByComponentId.get(hostEntryComponentId)
          )
        ) {
          retainedInteraction3dEntry = {
            component: structuredClone(hostEntryRecord),
            host: hostEntryElement,
            timer: null
          };
          this.retainedInteraction3d = retainedInteraction3dEntry;
          hostEntryElement.hidden = true;
          hostEntryElement
            .querySelector(".hb-interaction3d-host")
            ?.setInteraction3dPageVisible?.(false);
          retainedInteraction3dEntry.timer = setTimeout(() => {
            if (this.retainedInteraction3d === retainedInteraction3dEntry) {
              this.releaseRetainedInteraction3d();
            }
          }, 120000);
          break;
        }
      }
    }
    if (retainedInteraction3dEntry) {
      hostByComponentId.set(
        retainedInteraction3dEntry.component.id,
        retainedInteraction3dEntry.host
      );
    }
    for (const [indexedComponentId, indexedHostElement] of this.componentHosts) {
      if (
        (retainHosts || canRetainInteraction3d) &&
        this.componentRecords.get(indexedComponentId)?.type === "interaction3d" &&
        indexedHostElement.parentElement === this.canvas &&
        pageComponentIds.has(indexedComponentId)
      ) {
        hostByComponentId.set(indexedComponentId, indexedHostElement);
      }
    }
    const retainedInteraction3dIds = new Set();
    for (const [hostMapComponentId] of hostByComponentId) {
      if (retainedInteraction3dEntry?.component.id === hostMapComponentId) {
        retainedInteraction3dIds.add(hostMapComponentId);
        continue;
      }
      if (this.componentRecords.get(hostMapComponentId)?.type === "interaction3d") {
        if (pageComponentRecordsById.get(hostMapComponentId)?.type === "interaction3d") {
          retainedInteraction3dIds.add(hostMapComponentId);
        } else {
          hostByComponentId.delete(hostMapComponentId);
        }
      }
    }
    const effectLayerByComponentId = new Map(
      [...this.canvas.querySelectorAll(".hb-icon-button-effect-layer[data-effect-for]")].map(
        effectLayerElement => [effectLayerElement.dataset.effectFor, effectLayerElement]
      )
    );
    this.cleanupComponents(retainHosts, retainedInteraction3dIds);
    const activeHostElements = new Set(
      [...hostByComponentId.values()].filter(
        candidateHostElement =>
          candidateHostElement.parentElement === this.canvas &&
          (pageComponentIds.has(candidateHostElement.dataset.componentId) ||
            candidateHostElement === retainedInteraction3dEntry?.host) &&
          (candidateHostElement.querySelector(".hb-floorplan-auto-diagram-preview") ||
            retainedInteraction3dIds.has(candidateHostElement.dataset.componentId))
      )
    );
    if (activeHostElements.size) {
      for (const canvasChildElement of [...this.canvas.children]) {
        if (!activeHostElements.has(canvasChildElement)) {
          canvasChildElement.remove();
        }
      }
    } else {
      this.canvas.replaceChildren();
    }
    this.componentHosts.clear();
    this.componentRecords.clear();
    this.componentAirflowLayers.clear();
    this.componentEffectLayers.clear();
    this.componentSelectionOverlays.clear();
    this.runtimeEntityComponentIndex.clear();
    this.componentParentIds.clear();
    for (const pageComponentData of this.page.components || []) {
      this.renderComponent(
        pageComponentData,
        this.canvas,
        0,
        hostByComponentId,
        effectLayerByComponentId
      );
    }
    for (const sharedComponentData of pageSharedComponentRecords) {
      this.renderComponent(
        sharedComponentData,
        this.canvas,
        100000,
        hostByComponentId,
        effectLayerByComponentId
      );
    }
    if (
      retainedInteraction3dEntry &&
      pageComponentRecordsById.has(retainedInteraction3dEntry.component.id)
    ) {
      clearTimeout(retainedInteraction3dEntry.timer);
      this.retainedInteraction3d = null;
      retainedInteraction3dEntry.host
        .querySelector(".hb-interaction3d-host")
        ?.setInteraction3dPageVisible?.(true);
    }
    this.syncActiveGroup();
    this.syncSelection();
    this.runtimeEffectImageLoader.pruneDisconnected();
  }
  registerRuntimeStateHandler(handlerEntityId, stateHandler, handlerScopeComponentId = null) {
    const runtimeStateHandlerKey = String(handlerEntityId || "");
    if (!runtimeStateHandlerKey || typeof stateHandler != "function") {
      return;
    }
    if (!this.runtimeStateHandlers.has(runtimeStateHandlerKey)) {
      this.runtimeStateHandlers.set(runtimeStateHandlerKey, new Set());
    }
    this.runtimeStateHandlers.get(runtimeStateHandlerKey).add(stateHandler);
    const removeRuntimeStateHandler = () => {
      const entityStateHandlers = this.runtimeStateHandlers.get(runtimeStateHandlerKey);
      entityStateHandlers?.delete(stateHandler);
      if (entityStateHandlers?.size === 0) {
        this.runtimeStateHandlers.delete(runtimeStateHandlerKey);
      }
    };
    if (handlerScopeComponentId) {
      this.registerComponentCleanup(handlerScopeComponentId, removeRuntimeStateHandler);
    } else {
      this.cleanups.push(removeRuntimeStateHandler);
    }
  }
  registerHistoryChartRefresher(refresherCallback, refresherComponentId = null) {
    if (typeof refresherCallback != "function") {
      return;
    }
    this.historyChartRefreshers.add(refresherCallback);
    const removeHistoryChartRefresher = () => this.historyChartRefreshers.delete(refresherCallback);
    if (refresherComponentId) {
      this.registerComponentCleanup(refresherComponentId, removeHistoryChartRefresher);
    } else {
      this.cleanups.push(removeHistoryChartRefresher);
    }
  }
  applyRuntimeStateHandlers(handlerEntityIdInput, entityStateUpdate) {
    for (const registeredStateHandler of this.runtimeStateHandlers.get(
      String(handlerEntityIdInput || "")
    ) || []) {
      registeredStateHandler(entityStateUpdate);
    }
  }
  runtimeEntityIdsForComponent(indexedRuntimeComponent) {
    const runtimeEntityIdSet = collectEntityIds([
      {
        ...indexedRuntimeComponent,
        children: []
      }
    ]);
    const componentBindingEntityId = indexedRuntimeComponent?.bindings?.entity?.entityId || "";
    if (componentBindingEntityId) {
      runtimeEntityIdSet.add(componentBindingEntityId);
      const componentPowerEntityId = this.powerEntityId(
        indexedRuntimeComponent,
        componentBindingEntityId
      );
      if (componentPowerEntityId) {
        runtimeEntityIdSet.add(componentPowerEntityId);
      }
      const componentDeviceProfile = this.deviceProfile(componentBindingEntityId);
      for (const roleEntityId of Object.values(componentDeviceProfile?.roles || {})) {
        if (roleEntityId) {
          runtimeEntityIdSet.add(roleEntityId);
        }
      }
    }
    return [...runtimeEntityIdSet]
      .map(entityIdValue => String(entityIdValue || ""))
      .filter(Boolean);
  }
  indexRuntimeComponent(indexedComponent) {
    for (const indexedRuntimeEntityId of this.runtimeEntityIdsForComponent(indexedComponent)) {
      if (!this.runtimeEntityComponentIndex.has(indexedRuntimeEntityId)) {
        this.runtimeEntityComponentIndex.set(indexedRuntimeEntityId, new Set());
      }
      this.runtimeEntityComponentIndex.get(indexedRuntimeEntityId).add(indexedComponent.id);
    }
  }
  unindexRuntimeComponent(unindexedComponentId) {
    for (const [indexedEntityId, indexedComponentIds] of this.runtimeEntityComponentIndex) {
      indexedComponentIds.delete(unindexedComponentId);
      if (!indexedComponentIds.size) {
        this.runtimeEntityComponentIndex.delete(indexedEntityId);
      }
    }
  }
  runtimeComponentContent(componentHostElement) {
    return (
      [...(componentHostElement?.children || [])].find(
        componentChildElement =>
          !componentChildElement.classList.contains("hb-component") &&
          !componentChildElement.classList.contains("hb-runtime-action-hitbox") &&
          !componentChildElement.classList.contains("hb-selection-bounds") &&
          !componentChildElement.classList.contains("hb-transform-handle")
      ) || null
    );
  }
  refreshRuntimeComponent(runtimeComponentId) {
    const refreshedComponent = this.componentRecords.get(runtimeComponentId);
    const runtimeHostElement = this.componentHosts.get(runtimeComponentId);
    if (!refreshedComponent || !runtimeHostElement || !runtimeHostElement.isConnected) {
      return;
    }
    if (refreshedComponent.type === "interaction3d") {
      runtimeHostElement
        .querySelector(".hb-interaction3d-host")
        ?.updateInteraction3d?.(refreshedComponent, this.document);
      return;
    }
    this.cleanupRenderedComponent(runtimeComponentId);
    const runtimeRenderContext = {
      document: this.document,
      page: this.page,
      states: this.states,
      history: this.historySeries,
      entityMetadata: this.entityMetadata,
      deviceMetadata: this.deviceMetadata,
      entityTranslations: this.entityTranslations,
      renderNamespace: this.renderNamespace,
      editable: !!this.options.editable,
      liveMedia: this.options.liveMedia !== false,
      previewState: this.componentPreviewStates.get(runtimeComponentId) || "auto",
      isIconVisible: visibilityCheckEntityId => this.iconVisibilityState(visibilityCheckEntityId),
      navigate: requestedPagePath => this.navigate(requestedPagePath),
      callEntityService: (...serviceArgs) => this.callEntityService(...serviceArgs),
      openCameraPreview: (previewSourceComponent, cameraPreviewOptions, previewTargetElement) =>
        this.openInteraction3dCameraPreview(
          previewSourceComponent,
          cameraPreviewOptions,
          previewTargetElement
        ),
      openVacuumDetails: (vacuumComponent, vacuumDetailsOptions, vacuumTargetElement) =>
        this.openInteraction3dVacuumDetails(
          vacuumComponent,
          vacuumDetailsOptions,
          vacuumTargetElement
        ),
      runVacuumRoom: vacuumRoom =>
        this.dispatchAction(
          {
            id: refreshedComponent.id + ":room:" + vacuumRoom.id,
            type: "device-button",
            properties: {
              label: vacuumRoom.label
            },
            bindings: {
              entity: {
                entityId: vacuumRoom.entityId
              }
            }
          },
          {
            type: "toggle",
            data: {}
          }
        ),
      onError: reportedError => this.options.onError?.(reportedError),
      registerRuntimeStateHandler: (stateHandlerEntityId, stateChangeHandler) =>
        this.registerRuntimeStateHandler(
          stateHandlerEntityId,
          stateChangeHandler,
          runtimeComponentId
        ),
      invalidate: () => this.refreshRuntimeComponent(runtimeComponentId),
      cleanup: registeredCleanupCallback =>
        this.registerComponentCleanup(runtimeComponentId, registeredCleanupCallback)
    };
    const refreshedContentElement = renderRegisteredComponent(
      this.runtimePowerComponent(refreshedComponent),
      runtimeRenderContext
    );
    const hostComponentScale = Number(this.document.canvas.componentScale || 1);
    if (hostComponentScale !== 1) {
      refreshedContentElement.style.width = 100 / hostComponentScale + "%";
      refreshedContentElement.style.height = 100 / hostComponentScale + "%";
      refreshedContentElement.style.transform = "scale(" + hostComponentScale + ")";
      refreshedContentElement.style.transformOrigin = "top left";
    }
    const previousContentElement = this.runtimeComponentContent(runtimeHostElement);
    if (previousContentElement) {
      previousContentElement.replaceWith(refreshedContentElement);
    } else {
      runtimeHostElement.prepend(refreshedContentElement);
    }
    if (
      refreshedComponent.type === "title-button" ||
      refreshedComponent.type === "light-statistics"
    ) {
      const hitboxElement = runtimeHostElement.querySelector(":scope > .hb-runtime-action-hitbox");
      if (hitboxElement) {
        const selectionBoundsVisible =
          refreshedComponent.type === "light-statistics"
            ? this.updateLightStatisticsSelectionBounds(
                runtimeHostElement,
                refreshedComponent,
                hitboxElement
              )
            : this.updateTitleButtonSelectionBounds(
                runtimeHostElement,
                refreshedComponent,
                hitboxElement
              );
        hitboxElement.hidden = !selectionBoundsVisible;
      }
    }
    if (refreshedComponent.type === "light-statistics") {
      const statisticsBoundsElement =
        this.componentSelectionOverlays
          .get(runtimeComponentId)
          ?.querySelector(":scope > .hb-selection-bounds") ||
        runtimeHostElement.querySelector(":scope > .hb-selection-bounds");
      if (statisticsBoundsElement) {
        if (
          !this.updateLightStatisticsSelectionBounds(
            runtimeHostElement,
            refreshedComponent,
            statisticsBoundsElement
          )
        ) {
          Object.assign(statisticsBoundsElement.style, {
            left: "0",
            top: "0",
            width: "100%",
            height: "100%"
          });
        }
        this.updateTransformHandleScale(
          runtimeHostElement,
          refreshedComponent,
          statisticsBoundsElement
        );
      }
      this.refreshMultiSelectionBounds();
    }
  }
  refreshEditorComponent(editorComponentId) {
    if (!this.options.editable) {
      return false;
    }
    const editorComponent = this.componentRecords.get(editorComponentId);
    const editorHostElement = this.componentHosts.get(editorComponentId);
    if (!editorComponent || !editorHostElement?.isConnected) {
      return false;
    }
    const editorHostParent = editorHostElement.parentElement;
    if (!editorHostParent) {
      return false;
    }
    const hostZIndex =
      editorHostParent === this.canvas &&
      (this.page.sharedComponentIds || []).includes(editorComponent.id)
        ? 100000
        : 0;
    if (editorComponent.type === "interaction3d" || editorComponent.type === "group") {
      this.renderComponent(
        editorComponent,
        editorHostParent,
        hostZIndex,
        new Map([[editorComponent.id, editorHostElement]])
      );
      this.syncSelection();
      return true;
    }
    if (editorComponent.type === "floorplan-auto-diagram") {
      const shouldShowDiagramPreview =
        editorComponent.properties?.previewReady === true &&
        (editorComponent.properties?.generated !== true ||
          editorComponent.properties?.previewing === true);
      const diagramPreviewElement = editorHostElement.querySelector(
        ".hb-floorplan-auto-diagram-preview"
      );
      if (!!diagramPreviewElement === shouldShowDiagramPreview) {
        const editorPosition = editorComponent.position || {};
        const isFillLayout =
          editorHostParent === this.canvas && editorComponent.properties?.layoutMode === "fill";
        const layoutPosition = isFillLayout
          ? {
              ...editorPosition,
              x: 0,
              y: 0,
              width: Number(this.document.canvas?.width || 2778),
              height: Number(this.document.canvas?.height || 1940),
              rotation: 0
            }
          : editorPosition;
        const editorScale = Math.max(0.01, Math.min(5, Number(editorComponent.style?.scale || 1)));
        const diagramZIndex = hostZIndex + Number(layoutPosition.zIndex || 1);
        const resolvedZIndex = componentHostZIndex(
          editorComponent,
          diagramZIndex,
          editorHostParent === this.canvas
        );
        Object.assign(editorHostElement.style, {
          left: (layoutPosition.x || 0) + "px",
          top: (layoutPosition.y || 0) + "px",
          width: (layoutPosition.width || 100) + "px",
          height: (layoutPosition.height || 100) + "px",
          zIndex: String(resolvedZIndex),
          transform:
            "rotate(" +
            (layoutPosition.rotation || 0) +
            "deg) scale(" +
            (isFillLayout ? 1 : editorScale) +
            ")"
        });
        editorHostElement.style.setProperty("--hb-component-z", String(resolvedZIndex));
        editorHostElement.classList.toggle("layout-fill", isFillLayout);
        const diagramHintElement = editorHostElement.querySelector(
          ".hb-floorplan-auto-diagram-preview-hint"
        );
        const isViewMode = editorComponent.properties?.interactionMode === "view";
        diagramPreviewElement?.classList.toggle("is-view-mode", isViewMode);
        diagramPreviewElement?.classList.toggle("is-position-mode", !isViewMode);
        if (diagramHintElement) {
          diagramHintElement.textContent = isViewMode
            ? "拖动旋转 · 右键平移 · 滚轮缩放"
            : "拖动控件调整位置，右下角调整大小";
        }
        this.syncSelection();
        this.updateTransformHandleScale(editorHostElement, editorComponent);
        return true;
      }
    }
    const hostNextSibling = editorHostElement.nextSibling;
    this.cleanupRenderedComponent(editorComponentId);
    for (const removedCameraCleanup of this.cameraCleanups.get(editorComponentId)?.splice(0) ||
      []) {
      removedCameraCleanup();
    }
    this.cameraCleanups.delete(editorComponentId);
    this.componentEffectLayers.get(editorComponentId)?.remove();
    this.componentEffectLayers.delete(editorComponentId);
    this.componentAirflowLayers.get(editorComponentId)?.remove();
    this.componentAirflowLayers.delete(editorComponentId);
    editorHostElement.remove();
    this.renderComponent(editorComponent, editorHostParent, hostZIndex);
    const refreshedHostElement = this.componentHosts.get(editorComponentId);
    if (refreshedHostElement && hostNextSibling?.parentElement === editorHostParent) {
      editorHostParent.insertBefore(refreshedHostElement, hostNextSibling);
    }
    this.syncSelection();
    return true;
  }
  refreshRuntimeComponents(entityIds) {
    const affectedComponentIds = new Set();
    for (const changedEntityId of entityIds || []) {
      for (const matchedComponentId of this.runtimeEntityComponentIndex.get(
        String(changedEntityId || "")
      ) || []) {
        affectedComponentIds.add(matchedComponentId);
      }
    }
    if (!affectedComponentIds.size) {
      return;
    }
    const optimisticToggleTypes = new Set([
      "icon-button-effect",
      "icon-button",
      "device-button",
      "navigation-button",
      "air-conditioner"
    ]);
    const optimisticComponentIds = new Set(
      [...affectedComponentIds].filter(affectedComponentId =>
        optimisticToggleTypes.has(this.componentRecords.get(affectedComponentId)?.type)
      )
    );
    if (optimisticComponentIds.size) {
      this.updateOptimisticToggleVisuals("", optimisticComponentIds);
    }
    for (const refreshedAffectedComponentId of affectedComponentIds) {
      const affectedComponentRecord = this.componentRecords.get(refreshedAffectedComponentId);
      if (
        !!affectedComponentRecord &&
        !optimisticToggleTypes.has(affectedComponentRecord.type) &&
        !["line-chart", "camera", "vacuum-map"].includes(affectedComponentRecord.type)
      ) {
        this.refreshRuntimeComponent(refreshedAffectedComponentId);
      }
    }
  }
  applyEditorComponentUpdates(updatedDocument, currentPagePath, componentUpdates = []) {
    if (!this.options.editable || !this.document || !Array.isArray(componentUpdates)) {
      return false;
    }
    const validUpdates = componentUpdates
      .map(componentUpdate => ({
        componentId: String(componentUpdate?.componentId || ""),
        component: componentUpdate?.component
      }))
      .filter(validUpdate => validUpdate.componentId && validUpdate.component);
    if (
      validUpdates.length !== componentUpdates.length ||
      validUpdates.some(({ componentId: updatedComponentId, component: updatedComponent }) => {
        const existingComponentRecord = this.componentRecords.get(updatedComponentId);
        return (
          !existingComponentRecord ||
          !this.componentHosts.get(updatedComponentId)?.isConnected ||
          existingComponentRecord.type !== updatedComponent.type
        );
      })
    ) {
      return false;
    }
    const previousEntityIds = new Set();
    for (const { componentId: updateComponentId } of validUpdates) {
      const updateComponentRecord = this.componentRecords.get(updateComponentId);
      for (const updateEntityId of this.runtimeEntityIdsForComponent(updateComponentRecord)) {
        previousEntityIds.add(updateEntityId);
      }
    }
    this.document = updatedDocument;
    this.page =
      this.document.pages?.find(matchingPage => matchingPage.path === currentPagePath) ||
      this.document.pages?.find(
        defaultPage => defaultPage.path === this.document.defaultPagePath
      ) ||
      this.document.pages?.[0] ||
      null;
    for (const { componentId: patchComponentId, component: patchComponentData } of validUpdates) {
      const patchComponentRecord = this.componentRecords.get(patchComponentId);
      this.unindexRuntimeComponent(patchComponentId);
      const { children: updatedChildren, ...updatedComponentBody } = patchComponentData;
      for (const existingPropertyKey of Object.keys(patchComponentRecord)) {
        delete patchComponentRecord[existingPropertyKey];
      }
      Object.assign(patchComponentRecord, structuredClone(updatedComponentBody));
      if (updatedChildren) {
        patchComponentRecord.children = updatedChildren.map(childComponentRecord =>
          this.componentRecords.get(childComponentRecord.id)
        );
      }
      this.indexRuntimeComponent(patchComponentRecord);
    }
    const refreshComponentIds = new Set(
      validUpdates.map(({ componentId: refreshUpdateComponentId }) => refreshUpdateComponentId)
    );
    for (const { componentId: refreshTargetComponentId } of validUpdates) {
      const refreshTargetComponentRecord = this.componentRecords.get(refreshTargetComponentId);
      if (refreshTargetComponentRecord.type === "group") {
        for (const nestedComponent of collectComponents(
          refreshTargetComponentRecord.children || [],
          nestedComponentEntry =>
            ["icon-button-effect", "interaction3d", "floorplan-auto-diagram"].includes(
              nestedComponentEntry.type
            )
        )) {
          refreshComponentIds.add(nestedComponent.id);
        }
      }
    }
    for (const refreshComponentId of refreshComponentIds) {
      this.refreshEditorComponent(refreshComponentId);
    }
    this.syncSelection();
    const nextEntityIds = new Set();
    for (const { componentId: pendingUpdateComponentId } of validUpdates) {
      for (const pendingUpdateEntityId of this.runtimeEntityIdsForComponent(
        this.componentRecords.get(pendingUpdateComponentId)
      )) {
        nextEntityIds.add(pendingUpdateEntityId);
      }
    }
    if (
      previousEntityIds.size !== nextEntityIds.size ||
      [...previousEntityIds].some(previousEntityId => !nextEntityIds.has(previousEntityId))
    ) {
      this.connectRuntime();
    }
    return true;
  }
  scheduleRuntimeRender(scheduledEntityId, renderDelayMs = 120) {
    if (!this.destroyed && !!this.document && !!scheduledEntityId) {
      this.runtimeRenderEntityIds.add(String(scheduledEntityId));
      window.clearTimeout(this.runtimeRenderTimer);
      this.runtimeRenderTimer = window.setTimeout(
        () => {
          this.runtimeRenderTimer = 0;
          const pendingEntityIds = [...this.runtimeRenderEntityIds];
          this.runtimeRenderEntityIds.clear();
          if (!this.destroyed) {
            this.refreshRuntimeComponents(pendingEntityIds);
          }
        },
        Math.max(0, Number(renderDelayMs) || 0)
      );
    }
  }
  setEffectLayerActive(layerHostElement, isActive, fadeDurationSeconds = 0) {
    if (!layerHostElement) {
      return;
    }
    if (isActive) {
      this.runtimeEffectImageLoader.promote(
        layerHostElement.querySelector(":scope > img[data-effect-source]")
      );
    }
    const isActiveChanging = layerHostElement.classList.contains("active") !== isActive;
    window.clearTimeout(layerHostElement.hbTransitionTimer);
    layerHostElement.classList.remove("is-transitioning");
    if (isActiveChanging && fadeDurationSeconds > 0) {
      layerHostElement.classList.add("is-transitioning");
      layerHostElement.offsetWidth;
    }
    layerHostElement.classList.toggle("active", isActive);
    if (isActiveChanging && fadeDurationSeconds > 0) {
      layerHostElement.hbTransitionTimer = window.setTimeout(
        () => {
          layerHostElement.classList.remove("is-transitioning");
          layerHostElement.hbTransitionTimer = null;
        },
        fadeDurationSeconds * 1000 + 80
      );
    }
  }
  syncEffectLayerLightVisual(effectComponent, layerElement) {
    if (!layerElement || effectComponent?.type !== "icon-button-effect") {
      return;
    }
    const effectProperties = effectComponent.properties || {};
    const effectEntityId = String(effectComponent?.bindings?.entity?.entityId || "");
    layerElement.classList.toggle(
      "awaiting-light-visual",
      iconButtonEffectLightVisualAwaiting(effectComponent, {
        editable: this.options.editable,
        states: this.states,
        pendingOptimisticState: this.pendingOptimisticStates.get(effectEntityId)
      })
    );
    const lightVisualState = iconButtonEffectLightVisualState(effectComponent, {
      states: this.states
    });
    const effectOpacityValue = Number(effectProperties.effectOpacity ?? 1);
    const clampedOpacityRatio = Number.isFinite(effectOpacityValue)
      ? Math.max(0, Math.min(1, effectOpacityValue))
      : 1;
    layerElement.style.setProperty(
      "--hb-effect-image-opacity",
      String(clampedOpacityRatio * lightVisualState.opacity)
    );
    const effectImageElement = layerElement.querySelector(":scope > img");
    if (effectImageElement) {
      effectImageElement.style.filter = lightVisualState.filter;
    }
  }
  cachedLightVisualState(lightEntityIdInput) {
    const lightEntityId = String(lightEntityIdInput || "");
    if (!lightEntityId.startsWith("light.")) {
      return null;
    }
    const cachedLightVisual = this.confirmedLightVisualStates.get(lightEntityId);
    if (cachedLightVisual) {
      return cachedLightVisual;
    }
    try {
      const storedVisualState = JSON.parse(
        window.localStorage?.getItem("homeos:light-visual:" + lightEntityId) || "null"
      );
      if (
        !storedVisualState?.attributes ||
        Date.now() - Number(storedVisualState.at || 0) > 2592000000
      ) {
        return null;
      }
      const cachedVisualEntry = {
        entityId: lightEntityId,
        state: "on",
        attributes: storedVisualState.attributes
      };
      this.confirmedLightVisualStates.set(lightEntityId, cachedVisualEntry);
      return cachedVisualEntry;
    } catch {
      return null;
    }
  }
  rememberLightVisualState(visualEntityIdInput, visualStateUpdate) {
    const visualEntityId = String(visualEntityIdInput || "");
    const newEntityState = visualStateUpdate?.newState || visualStateUpdate;
    if (!visualEntityId.startsWith("light.") || !newEntityState?.attributes) {
      return;
    }
    const stateAttributes = newEntityState.attributes;
    const attributeHasNumericValue = attributeName =>
      stateAttributes[attributeName] !== null &&
      stateAttributes[attributeName] !== undefined &&
      stateAttributes[attributeName] !== "" &&
      Number.isFinite(Number(stateAttributes[attributeName]));
    if (
      !attributeHasNumericValue("brightness") &&
      !attributeHasNumericValue("color_temp_kelvin") &&
      !attributeHasNumericValue("color_temp")
    ) {
      return;
    }
    const cachedAttributes = {
      ...(this.cachedLightVisualState(visualEntityId)?.attributes || {})
    };
    for (const attributeKey of [
      "brightness",
      "color_temp_kelvin",
      "color_temp",
      "color_mode",
      "supported_color_modes"
    ]) {
      if (
        stateAttributes[attributeKey] !== null &&
        stateAttributes[attributeKey] !== undefined &&
        stateAttributes[attributeKey] !== ""
      ) {
        cachedAttributes[attributeKey] = Array.isArray(stateAttributes[attributeKey])
          ? [...stateAttributes[attributeKey]]
          : stateAttributes[attributeKey];
      }
    }
    const persistedVisualEntry = {
      entityId: visualEntityId,
      state: "on",
      attributes: cachedAttributes
    };
    this.confirmedLightVisualStates.set(visualEntityId, persistedVisualEntry);
    try {
      window.localStorage?.setItem(
        "homeos:light-visual:" + visualEntityId,
        JSON.stringify({
          at: Date.now(),
          attributes: cachedAttributes
        })
      );
    } catch {}
  }
  optimisticStateIsConfirmed(optimisticEntityIdInput, optimisticStateUpdate) {
    const pendingOptimistic = this.pendingOptimisticStates.get(
      String(optimisticEntityIdInput || "")
    );
    if (!pendingOptimistic) {
      return true;
    }
    if (Date.now() >= pendingOptimistic.expiresAt) {
      this.pendingOptimisticStates.delete(String(optimisticEntityIdInput || ""));
      return true;
    }
    const affectedEffectComponent = [...this.componentRecords.values()].find(
      componentRecordEntry => {
        const componentBoundEntityId = componentRecordEntry.bindings?.entity?.entityId;
        return (
          componentBoundEntityId &&
          this.powerEntityId(componentRecordEntry, componentBoundEntityId) ===
            String(optimisticEntityIdInput)
        );
      }
    );
    if (
      entityPowerIsOn(
        String(optimisticEntityIdInput || ""),
        optimisticStateUpdate?.newState || optimisticStateUpdate,
        affectedEffectComponent || {}
      ) === pendingOptimistic.desiredActive
    ) {
      if (
        pendingOptimistic.desiredActive === true &&
        affectedEffectComponent?.type === "icon-button-effect" &&
        iconButtonEffectLightVisualAwaiting(affectedEffectComponent, {
          states: new Map([
            [
              String(optimisticEntityIdInput || ""),
              optimisticStateUpdate?.newState || optimisticStateUpdate
            ]
          ])
        })
      ) {
        return false;
      } else {
        this.rememberLightVisualState?.(optimisticEntityIdInput, optimisticStateUpdate);
        this.pendingOptimisticStates.delete(String(optimisticEntityIdInput || ""));
        return true;
      }
    } else {
      return false;
    }
  }
  updateOptimisticToggleVisuals(entityIdFilter, componentIdFilter = null) {
    for (const [componentId, componentRecord] of this.componentRecords) {
      const componentBoundEntity = componentRecord.bindings?.entity?.entityId;
      const resolvedPowerEntityId = componentBoundEntity
        ? this.powerEntityId(componentRecord, componentBoundEntity)
        : "";
      if (
        !componentBoundEntity ||
        (componentIdFilter
          ? !componentIdFilter.has(componentId)
          : resolvedPowerEntityId !== entityIdFilter) ||
        ![
          "icon-button-effect",
          "icon-button",
          "device-button",
          "navigation-button",
          "air-conditioner"
        ].includes(componentRecord.type)
      ) {
        continue;
      }
      const entityState = this.states.get(resolvedPowerEntityId);
      const isCoverEntity = String(resolvedPowerEntityId || "").startsWith("cover.");
      const isDreamCurtain =
        isCoverEntity &&
        coverComponentIsDream(
          componentRecord,
          resolvedPowerEntityId,
          entityState,
          this.entityMetadata
        );
      const poweredComponent = this.runtimePowerComponent(componentRecord, componentBoundEntity);
      const isActiveState = isCoverEntity
        ? isDreamCurtain
          ? runtimeEntityStateIsActive(entityState)
          : runtimeCoverStateIsActive(entityState)
        : entityPowerIsOn(resolvedPowerEntityId, entityState, poweredComponent);
      const componentPreviewState = this.componentPreviewStates.get(componentId) || "auto";
      const nextActiveState =
        componentPreviewState === "on"
          ? true
          : componentPreviewState === "off"
            ? false
            : isCoverEntity &&
                coverMotorIsReversedForComponent(
                  componentRecord,
                  this.entityMetadata,
                  this.states,
                  resolvedPowerEntityId
                )
              ? !isActiveState
              : isActiveState;
      const toggleHostElement = this.componentHosts.get(componentId);
      this.cleanupRenderedComponent(componentId);
      if (toggleHostElement && componentRecord.type === "icon-button-effect") {
        const existingEffectLayerElement = toggleHostElement.querySelector(
          ":scope > .hb-icon-button-effect"
        );
        const effectRenderContext = {
          document: this.document,
          page: this.page,
          states: this.states,
          history: this.historySeries,
          entityMetadata: this.entityMetadata,
          deviceMetadata: this.deviceMetadata,
          entityTranslations: this.entityTranslations,
          renderNamespace: this.renderNamespace,
          editable: !!this.options.editable,
          liveMedia: this.options.liveMedia !== false,
          previewState: this.componentPreviewStates.get(componentId) || "auto",
          isIconVisible: effectIconEntityId => this.iconVisibilityState(effectIconEntityId),
          navigate: effectPagePath => this.navigate(effectPagePath),
          invalidate: () => this.updateOptimisticToggleVisuals("", new Set([componentId])),
          cleanup: effectCleanupCallback =>
            this.registerComponentCleanup(componentId, effectCleanupCallback)
        };
        const renderedEffectElement = renderRegisteredComponent(
          poweredComponent,
          effectRenderContext
        );
        const effectComponentScale = Number(this.document.canvas.componentScale || 1);
        if (effectComponentScale !== 1) {
          renderedEffectElement.style.width = 100 / effectComponentScale + "%";
          renderedEffectElement.style.height = 100 / effectComponentScale + "%";
          renderedEffectElement.style.transform = "scale(" + effectComponentScale + ")";
          renderedEffectElement.style.transformOrigin = "top left";
        }
        if (existingEffectLayerElement) {
          existingEffectLayerElement.replaceWith(renderedEffectElement);
        } else {
          toggleHostElement.prepend(renderedEffectElement);
        }
      }
      if (
        toggleHostElement &&
        ["icon-button", "device-button", "navigation-button"].includes(componentRecord.type)
      ) {
        const existingButtonElement =
          componentRecord.type === "navigation-button"
            ? toggleHostElement.querySelector(":scope > .hb-navigation-button")
            : toggleHostElement.querySelector(":scope > .hb-icon-button");
        const buttonRenderContext = {
          document: this.document,
          page: this.page,
          states: this.states,
          history: this.historySeries,
          entityMetadata: this.entityMetadata,
          deviceMetadata: this.deviceMetadata,
          entityTranslations: this.entityTranslations,
          renderNamespace: this.renderNamespace,
          editable: !!this.options.editable,
          liveMedia: this.options.liveMedia !== false,
          previewState: this.componentPreviewStates.get(componentId) || "auto",
          isIconVisible: buttonIconEntityId => this.iconVisibilityState(buttonIconEntityId),
          navigate: buttonPagePath => this.navigate(buttonPagePath),
          invalidate: () => this.updateOptimisticToggleVisuals("", new Set([componentId])),
          cleanup: buttonCleanupCallback =>
            this.registerComponentCleanup(componentId, buttonCleanupCallback)
        };
        const renderedButtonElement = renderRegisteredComponent(
          poweredComponent,
          buttonRenderContext
        );
        const buttonComponentScale = Number(this.document.canvas.componentScale || 1);
        if (buttonComponentScale !== 1) {
          renderedButtonElement.style.width = 100 / buttonComponentScale + "%";
          renderedButtonElement.style.height = 100 / buttonComponentScale + "%";
          renderedButtonElement.style.transform = "scale(" + buttonComponentScale + ")";
          renderedButtonElement.style.transformOrigin = "top left";
        }
        if (existingButtonElement) {
          existingButtonElement.replaceWith(renderedButtonElement);
        } else {
          toggleHostElement.prepend(renderedButtonElement);
        }
        if (componentRecord.type === "device-button") {
          const actionHitboxElement = toggleHostElement.querySelector(
            ":scope > .hb-runtime-action-hitbox"
          );
          if (actionHitboxElement) {
            actionHitboxElement.hidden = !this.updateDeviceButtonSelectionBounds(
              toggleHostElement,
              componentRecord,
              actionHitboxElement
            );
          }
        }
      }
      if (toggleHostElement && componentRecord.type === "air-conditioner") {
        const climateRenderContext = {
          document: this.document,
          page: this.page,
          states: this.states,
          history: this.historySeries,
          entityMetadata: this.entityMetadata,
          deviceMetadata: this.deviceMetadata,
          entityTranslations: this.entityTranslations,
          renderNamespace: this.renderNamespace,
          editable: !!this.options.editable,
          liveMedia: this.options.liveMedia !== false,
          previewState: this.componentPreviewStates.get(componentId) || "auto",
          isIconVisible: climateIconEntityId => this.iconVisibilityState(climateIconEntityId),
          navigate: climatePagePath => this.navigate(climatePagePath),
          invalidate: () => this.updateOptimisticToggleVisuals("", new Set([componentId])),
          cleanup: climateCleanupCallback =>
            this.registerComponentCleanup(componentId, climateCleanupCallback)
        };
        const existingClimateElement = toggleHostElement.querySelector(
          ":scope > .hb-air-conditioner"
        );
        const renderedClimateElement = renderRegisteredComponent(
          poweredComponent,
          climateRenderContext
        );
        const climateComponentScale = Number(this.document.canvas.componentScale || 1);
        if (climateComponentScale !== 1) {
          renderedClimateElement.style.width = 100 / climateComponentScale + "%";
          renderedClimateElement.style.height = 100 / climateComponentScale + "%";
          renderedClimateElement.style.transform = "scale(" + climateComponentScale + ")";
          renderedClimateElement.style.transformOrigin = "top left";
        }
        if (existingClimateElement) {
          existingClimateElement.replaceWith(renderedClimateElement);
        } else {
          toggleHostElement.prepend(renderedClimateElement);
        }
        this.componentAirflowLayers.get(componentId)?.remove();
        this.componentAirflowLayers.delete(componentId);
        const createdAirflowLayer = renderAirConditionerAirflowLayer(
          poweredComponent,
          climateRenderContext
        );
        if (createdAirflowLayer) {
          const isGrouped = toggleHostElement.parentElement !== this.canvas;
          const airflowGeometry = airflowLayerGeometry(componentRecord, {
            grouped: isGrouped
          });
          const airflowZIndex = Number(
            toggleHostElement.style.getPropertyValue("--hb-component-z") ||
              componentRecord.position?.zIndex ||
              1
          );
          createdAirflowLayer.dataset.airflowFor = componentId;
          createdAirflowLayer.hidden = componentRecord.style?.visible === false;
          Object.assign(createdAirflowLayer.style, {
            left: airflowGeometry.left + "px",
            top: airflowGeometry.top + "px",
            width: airflowGeometry.width + "px",
            height: airflowGeometry.height + "px",
            zIndex: String(airflowZIndex),
            transform:
              "rotate(" + airflowGeometry.rotation + "deg) scale(" + airflowGeometry.scale + ")"
          });
          if (isGrouped) {
            toggleHostElement.append(createdAirflowLayer);
          } else {
            this.canvas.insertBefore(createdAirflowLayer, toggleHostElement);
          }
          this.componentAirflowLayers.set(componentId, createdAirflowLayer);
          if (
            this.options.editable &&
            this.selectedComponentIds.size === 1 &&
            this.selectedComponentId === componentId &&
            this.componentSelectionLayers.get(componentId) === "airflow"
          ) {
            this.syncSelection();
          }
        }
      }
      if (componentRecord.type !== "icon-button-effect") {
        continue;
      }
      const cachedEffectLayerElement = this.componentEffectLayers.get(componentId);
      this.syncEffectLayerLightVisual(componentRecord, cachedEffectLayerElement);
      this.setEffectLayerActive(
        cachedEffectLayerElement,
        nextActiveState,
        effectFadeDuration(componentRecord)
      );
    }
  }
  refreshVacuumMapEntity(vacuumEntityIdInput) {
    if (
      this.options.liveMedia === false ||
      !String(vacuumEntityIdInput || "").startsWith("image.")
    ) {
      return;
    }
    const vacuumEntityState = this.states.get(vacuumEntityIdInput);
    const mapImageSrc = vacuumMapImageSource(vacuumEntityIdInput, vacuumEntityState);
    let didUpdateImage = false;
    for (const [vacuumComponentId, vacuumComponentRecord] of this.componentRecords) {
      if (
        vacuumComponentRecord.type !== "vacuum-map" ||
        vacuumComponentRecord.bindings?.entity?.entityId !== vacuumEntityIdInput
      ) {
        continue;
      }
      const mapImageElement = this.componentHosts
        .get(vacuumComponentId)
        ?.querySelector(".hb-vacuum-map-image");
      if (mapImageElement) {
        didUpdateImage = true;
        if (mapImageElement.dataset.vacuumMapSource !== mapImageSrc) {
          mapImageElement.dataset.vacuumMapSource = mapImageSrc;
        }
        if (
          mapImageElement.dataset.vacuumMapSuspended !== "true" &&
          mapImageElement.getAttribute("src") !== mapImageSrc
        ) {
          mapImageElement.src = mapImageSrc;
        }
      }
    }
    if (
      !didUpdateImage &&
      this.options.liveMedia !== false &&
      this.vacuumMapEntityIds.has(vacuumEntityIdInput)
    ) {
      this.runtimeVacuumMapImagePreloader.enqueue(mapImageSrc);
    }
  }
  applyOptimisticToggle(toggleEntityIdInput, toggleComponent = null) {
    const optimisticEntityId = toggleEntityIdInput;
    const resolvedPowerTargetEntityId = this.powerEntityId(toggleComponent, optimisticEntityId);
    const coverEntityState = this.states.get(resolvedPowerTargetEntityId);
    const currentEntityState = coverEntityState?.newState ||
      coverEntityState || {
        entityId: resolvedPowerTargetEntityId,
        attributes: {}
      };
    const isCoverDomainEntity = String(resolvedPowerTargetEntityId || "").startsWith("cover.");
    const coverIsDream =
      isCoverDomainEntity &&
      coverComponentIsDream(
        toggleComponent,
        resolvedPowerTargetEntityId,
        coverEntityState,
        this.entityMetadata
      );
    const optimisticComponent = this.runtimePowerComponent(toggleComponent, optimisticEntityId);
    const optimisticActiveState = !(isCoverDomainEntity
      ? coverIsDream
        ? runtimeEntityStateIsActive(coverEntityState)
        : runtimeCoverStateIsActive(coverEntityState)
      : entityPowerIsOn(resolvedPowerTargetEntityId, coverEntityState, optimisticComponent));
    const optimisticState = isCoverDomainEntity
      ? {
          ...currentEntityState,
          state: optimisticActiveState ? "open" : "closed",
          ...(coverIsDream
            ? {}
            : {
                attributes: {
                  ...(currentEntityState.attributes || {}),
                  current_position: optimisticActiveState ? 100 : 0
                }
              })
        }
      : optimisticToggleState(resolvedPowerTargetEntityId, currentEntityState, optimisticComponent);
    if (optimisticActiveState && String(resolvedPowerTargetEntityId || "").startsWith("light.")) {
      const lightVisualEntry = this.cachedLightVisualState(resolvedPowerTargetEntityId);
      if (lightVisualEntry?.attributes) {
        optimisticState.attributes = {
          ...(optimisticState.attributes || {}),
          ...lightVisualEntry.attributes
        };
      }
    }
    const nextStoredState = coverEntityState?.newState
      ? {
          ...coverEntityState,
          newState: optimisticState
        }
      : optimisticState;
    const optimisticEntityKey = String(resolvedPowerTargetEntityId || "");
    const pendingOptimisticEntry = {
      desiredActive: optimisticActiveState,
      expiresAt: Date.now() + 8000
    };
    this.pendingOptimisticStates.set(optimisticEntityKey, pendingOptimisticEntry);
    const expiryTimer = window.setTimeout(() => {
      if (this.pendingOptimisticStates.get(optimisticEntityKey) === pendingOptimisticEntry) {
        this.pendingOptimisticStates.delete(optimisticEntityKey);
        if (this.states.get(resolvedPowerTargetEntityId) === nextStoredState) {
          if (coverEntityState === undefined) {
            this.states.delete(resolvedPowerTargetEntityId);
          } else {
            this.states.set(resolvedPowerTargetEntityId, coverEntityState);
          }
          this.updateOptimisticToggleVisuals(resolvedPowerTargetEntityId);
        }
      }
    }, 8000);
    this.states.set(resolvedPowerTargetEntityId, nextStoredState);
    this.updateOptimisticToggleVisuals(resolvedPowerTargetEntityId);
    return () => {
      window.clearTimeout(expiryTimer);
      if (this.pendingOptimisticStates.get(optimisticEntityKey) === pendingOptimisticEntry) {
        this.pendingOptimisticStates.delete(optimisticEntityKey);
      }
      if (this.states.get(resolvedPowerTargetEntityId) === nextStoredState) {
        if (coverEntityState === undefined) {
          this.states.delete(resolvedPowerTargetEntityId);
        } else {
          this.states.set(resolvedPowerTargetEntityId, coverEntityState);
        }
        this.updateOptimisticToggleVisuals(resolvedPowerTargetEntityId);
      }
    };
  }
  renderComponent(
    renderedComponent,
    hostContainerElement = this.canvas,
    baseZIndex = 0,
    retainedHosts = null,
    existingEffectLayerMap = null
  ) {
    const normalizedComponent = normalizeIconButtonEffectComponent(renderedComponent);
    const renderPowerComponent = this.runtimePowerComponent(normalizedComponent);
    const retainedHostElement = [
      "camera",
      "vacuum-map",
      "floorplan-auto-diagram",
      "interaction3d",
      "group"
    ].includes(renderedComponent.type)
      ? retainedHosts?.get(renderedComponent.id)
      : null;
    if (retainedHostElement) {
      const retainedPosition = renderedComponent.position || {};
      const isRetainedFillLayout =
        hostContainerElement === this.canvas &&
        ["floorplan-auto-diagram", "interaction3d"].includes(renderedComponent.type) &&
        renderedComponent.properties?.layoutMode === "fill";
      const renderPosition = isRetainedFillLayout
        ? {
            ...retainedPosition,
            x: 0,
            y: 0,
            width: Number(this.document.canvas?.width || 2778),
            height: Number(this.document.canvas?.height || 1940),
            rotation: 0
          }
        : retainedPosition;
      const renderComponentScale = Math.max(
        0.01,
        Math.min(5, Number(renderedComponent.style?.scale || 1))
      );
      const zIndex = baseZIndex + Number(renderPosition.zIndex || 1);
      Object.assign(retainedHostElement.style, {
        left: (renderPosition.x || 0) + "px",
        top: (renderPosition.y || 0) + "px",
        width: (renderPosition.width || 100) + "px",
        height: (renderPosition.height || 100) + "px",
        zIndex: String(zIndex),
        transform:
          "rotate(" +
          (renderPosition.rotation || 0) +
          "deg) scale(" +
          (isRetainedFillLayout ? 1 : renderComponentScale) +
          ")"
      });
      retainedHostElement.style.setProperty("--hb-component-z", String(zIndex));
      retainedHostElement.hidden = renderedComponent.style?.visible === false;
      retainedHostElement.classList.toggle("layout-fill", isRetainedFillLayout);
      if (renderedComponent.type === "interaction3d") {
        retainedHostElement
          .querySelector(".hb-interaction3d-host")
          ?.updateInteraction3d?.(renderedComponent, this.document);
      }
      if (renderedComponent.type === "floorplan-auto-diagram") {
        const isDiagramViewMode = renderedComponent.properties?.interactionMode === "view";
        const retainedDiagramPreviewElement = retainedHostElement.querySelector(
          ".hb-floorplan-auto-diagram-preview"
        );
        const retainedDiagramHintElement = retainedHostElement.querySelector(
          ".hb-floorplan-auto-diagram-preview-hint"
        );
        retainedDiagramPreviewElement?.classList.toggle("is-view-mode", isDiagramViewMode);
        retainedDiagramPreviewElement?.classList.toggle("is-position-mode", !isDiagramViewMode);
        if (retainedDiagramHintElement) {
          retainedDiagramHintElement.textContent = isDiagramViewMode
            ? "拖动旋转 · 右键平移 · 滚轮缩放"
            : "拖动控件调整位置，右下角调整大小";
        }
      }
      this.componentHosts.set(renderedComponent.id, retainedHostElement);
      this.componentRecords.set(renderedComponent.id, renderedComponent);
      const datasetComponentId = hostContainerElement?.dataset?.componentId;
      if (datasetComponentId) {
        this.componentParentIds.set(renderedComponent.id, datasetComponentId);
      }
      this.indexRuntimeComponent(renderedComponent);
      if (retainedHostElement.parentElement !== hostContainerElement) {
        hostContainerElement.append(retainedHostElement);
      }
      return;
    }
    const componentElement = document.createElement("div");
    componentElement.className =
      "hb-component hb-component-" + renderedComponent.type.replace(/[^a-z0-9_-]/gi, "-");
    componentElement.dataset.componentId = renderedComponent.id;
    const sourcePosition = renderedComponent.position || {};
    const isFillComponentLayout =
      hostContainerElement === this.canvas &&
      ["image", "floorplan-auto-diagram", "interaction3d"].includes(renderedComponent.type) &&
      renderedComponent.properties?.layoutMode === "fill";
    const resolvedRenderPosition = isFillComponentLayout
      ? {
          ...sourcePosition,
          x: 0,
          y: 0,
          width: Number(this.document.canvas?.width || 2778),
          height: Number(this.document.canvas?.height || 1940),
          rotation: 0
        }
      : sourcePosition;
    const renderScale = Math.max(0.01, Math.min(5, Number(renderedComponent.style?.scale || 1)));
    const stackZIndex = baseZIndex + Number(resolvedRenderPosition.zIndex || 1);
    const componentZIndex = componentHostZIndex(
      renderedComponent,
      stackZIndex,
      hostContainerElement === this.canvas
    );
    Object.assign(componentElement.style, {
      left: (resolvedRenderPosition.x || 0) + "px",
      top: (resolvedRenderPosition.y || 0) + "px",
      width: (resolvedRenderPosition.width || 100) + "px",
      height: (resolvedRenderPosition.height || 100) + "px",
      zIndex: String(componentZIndex),
      transform:
        "rotate(" +
        (resolvedRenderPosition.rotation || 0) +
        "deg) scale(" +
        (isFillComponentLayout ? 1 : renderScale) +
        ")"
    });
    componentElement.style.setProperty("--hb-component-z", String(componentZIndex));
    componentElement.hidden = renderedComponent.style?.visible === false;
    if (
      renderedComponent.type === "icon-button-effect" &&
      renderedComponent.properties?.buttonVisible === false &&
      renderedComponent.properties?.hiddenContentClickable !== true &&
      !this.options.editable
    ) {
      componentElement.style.pointerEvents = "none";
    }
    componentElement.classList.toggle("layout-fill", isFillComponentLayout);
    this.componentHosts.set(renderedComponent.id, componentElement);
    this.componentRecords.set(renderedComponent.id, renderedComponent);
    const containerComponentId = hostContainerElement?.dataset?.componentId;
    if (containerComponentId) {
      this.componentParentIds.set(renderedComponent.id, containerComponentId);
    }
    this.indexRuntimeComponent(renderedComponent);
    const renderContext = {
      document: this.document,
      page: this.page,
      states: this.states,
      history: this.historySeries,
      entityMetadata: this.entityMetadata,
      deviceMetadata: this.deviceMetadata,
      entityTranslations: this.entityTranslations,
      renderNamespace: this.renderNamespace,
      editable: !!this.options.editable,
      liveMedia: this.options.liveMedia !== false,
      previewState: this.componentPreviewStates.get(renderedComponent.id) || "auto",
      isIconVisible: componentIconEntityId => this.iconVisibilityState(componentIconEntityId),
      navigate: componentPagePath => this.navigate(componentPagePath),
      callEntityService: (...forwardedServiceArgs) =>
        this.callEntityService(...forwardedServiceArgs),
      openCameraPreview: (previewComponent, cameraPreviewContext, previewElement) =>
        this.openInteraction3dCameraPreview(previewComponent, cameraPreviewContext, previewElement),
      openVacuumDetails: (vacuumDetailsComponent, vacuumDetailsContext, vacuumDetailsTarget) =>
        this.openInteraction3dVacuumDetails(
          vacuumDetailsComponent,
          vacuumDetailsContext,
          vacuumDetailsTarget
        ),
      runVacuumRoom: requestedVacuumRoom =>
        this.dispatchAction(
          {
            id: renderedComponent.id + ":room:" + requestedVacuumRoom.id,
            type: "device-button",
            properties: {
              label: requestedVacuumRoom.label
            },
            bindings: {
              entity: {
                entityId: requestedVacuumRoom.entityId
              }
            }
          },
          {
            type: "toggle",
            data: {}
          }
        ),
      onError: previewReportedError => this.options.onError?.(previewReportedError),
      registerRuntimeStateHandler: (runtimeHandlerEntityId, runtimeStateHandler) =>
        this.registerRuntimeStateHandler(
          runtimeHandlerEntityId,
          runtimeStateHandler,
          renderedComponent.id
        ),
      invalidate: () => this.renderComponents(true),
      cleanup: runtimeCleanupCallback => {
        if (["camera", "vacuum-map"].includes(renderedComponent.type)) {
          if (!this.cameraCleanups.has(renderedComponent.id)) {
            this.cameraCleanups.set(renderedComponent.id, []);
          }
          this.cameraCleanups.get(renderedComponent.id).push(runtimeCleanupCallback);
        } else {
          this.registerComponentCleanup(renderedComponent.id, runtimeCleanupCallback);
        }
      }
    };
    if (renderedComponent.type === "icon-button-effect") {
      const renderedEffectLayer = renderIconButtonEffectLayer(renderPowerComponent, renderContext);
      if (renderedEffectLayer) {
        const retainedEffectLayer = existingEffectLayerMap?.get(renderedComponent.id) || null;
        const activeEffectLayer = retainedEffectLayer || renderedEffectLayer;
        const renderedImageElement = renderedEffectLayer.querySelector("img");
        const activeImageElement = activeEffectLayer.querySelector("img");
        const layerIsActive = renderedEffectLayer.classList.contains("active");
        if (retainedEffectLayer && activeImageElement && renderedImageElement) {
          activeEffectLayer.classList.toggle(
            "awaiting-light-visual",
            renderedEffectLayer.classList.contains("awaiting-light-visual")
          );
          const sourceAttribute = renderedImageElement.dataset.effectSource || "";
          if (sourceAttribute) {
            activeImageElement.dataset.effectSource = sourceAttribute;
          } else {
            delete activeImageElement.dataset.effectSource;
            const imageSrc = renderedImageElement.getAttribute("src");
            if (imageSrc) {
              activeImageElement.src = imageSrc;
            }
          }
          activeImageElement.alt = renderedImageElement.alt;
          activeImageElement.draggable = false;
          activeImageElement.decoding = "async";
          activeImageElement.style.objectFit = renderedImageElement.style.objectFit;
          activeImageElement.style.mixBlendMode = renderedImageElement.style.mixBlendMode;
          for (const effectDatasetKey of [
            "effectOriginalWidth",
            "effectOriginalHeight",
            "effectCropX",
            "effectCropY",
            "effectCropWidth",
            "effectCropHeight"
          ]) {
            if (renderedImageElement.dataset[effectDatasetKey] !== undefined) {
              activeImageElement.dataset[effectDatasetKey] =
                renderedImageElement.dataset[effectDatasetKey];
            } else {
              delete activeImageElement.dataset[effectDatasetKey];
            }
          }
        }
        const componentEffectProperties = renderPowerComponent.properties || {};
        const canvasWidthPx = Number(this.document.canvas?.width || 2778);
        const canvasHeightPx = Number(this.document.canvas?.height || 1940);
        const isFillEffect = componentEffectProperties.effectLayoutMode === "fill";
        const isNested = hostContainerElement !== this.canvas;
        activeEffectLayer.dataset.effectFor = renderedComponent.id;
        activeEffectLayer.hidden = renderedComponent.style?.visible === false;
        const applyEffectLayerLayout = () => {
          const sourceDimensions = effectSourceDimensions(
            componentEffectProperties,
            activeImageElement,
            canvasWidthPx,
            canvasHeightPx
          );
          const cropRectangle = effectCropRectangle(activeImageElement, sourceDimensions);
          const referenceTransform =
            !isFillEffect && !sourceDimensions.pendingNaturalSize
              ? effectReferenceImageTransform(
                  this.page,
                  renderedComponent,
                  sourceDimensions.width,
                  sourceDimensions.height,
                  canvasWidthPx,
                  canvasHeightPx
                )
              : null;
          const effectScale = Math.max(
            0.01,
            Math.min(5, Number(componentEffectProperties.effectScale || 1))
          );
          const computedScale = isFillEffect
            ? Math.min(
                canvasWidthPx / sourceDimensions.width,
                canvasHeightPx / sourceDimensions.height
              )
            : (referenceTransform?.scale || 1) * effectScale;
          const effectRotationDeg = isFillEffect
            ? 0
            : Number(componentEffectProperties.effectRotation || 0);
          const effectLeftRatio = Number(componentEffectProperties.effectLeft ?? 50) / 100;
          const effectTopRatio = Number(componentEffectProperties.effectTop ?? 50) / 100;
          const layerCenterX = isFillEffect ? canvasWidthPx / 2 : canvasWidthPx * effectLeftRatio;
          const layerCenterY = isFillEffect ? canvasHeightPx / 2 : canvasHeightPx * effectTopRatio;
          const croppedGeometry = effectCroppedLayerGeometry({
            centerX: layerCenterX,
            centerY: layerCenterY,
            originalWidth: sourceDimensions.width,
            originalHeight: sourceDimensions.height,
            cropX: cropRectangle.x,
            cropY: cropRectangle.y,
            cropWidth: cropRectangle.width,
            cropHeight: cropRectangle.height,
            scale: computedScale,
            rotation: effectRotationDeg
          });
          let layerGeometry = croppedGeometry;
          if (isNested) {
            const layerCenterWorldX = croppedGeometry.left + croppedGeometry.width / 2;
            const layerCenterWorldY = croppedGeometry.top + croppedGeometry.height / 2;
            const nestedParentComponentId = hostContainerElement?.dataset?.componentId;
            const localCenterPoint = nestedParentComponentId
              ? this.worldPointToComponentLocal(
                  nestedParentComponentId,
                  layerCenterWorldX,
                  layerCenterWorldY
                )
              : {
                  x: layerCenterWorldX,
                  y: layerCenterWorldY
                };
            const parentWorldTransform = nestedParentComponentId
              ? this.componentWorldTransform(nestedParentComponentId)
              : {
                  scale: 1,
                  rotation: 0
                };
            layerGeometry = {
              ...croppedGeometry,
              left: localCenterPoint.x - croppedGeometry.width / 2,
              top: localCenterPoint.y - croppedGeometry.height / 2,
              scale: croppedGeometry.scale / Math.max(0.0001, parentWorldTransform.scale),
              rotation: croppedGeometry.rotation - parentWorldTransform.rotation
            };
          }
          Object.assign(activeEffectLayer.style, {
            left: layerGeometry.left + "px",
            top: layerGeometry.top + "px",
            width: croppedGeometry.width + "px",
            height: croppedGeometry.height + "px",
            visibility: sourceDimensions.pendingNaturalSize ? "hidden" : "",
            zIndex: String(isNested ? stackZIndex - 0.1 : stackZIndex),
            transform:
              "rotate(" + layerGeometry.rotation + "deg) scale(" + layerGeometry.scale + ")"
          });
          return sourceDimensions;
        };
        if (applyEffectLayerLayout().pendingNaturalSize && activeImageElement) {
          activeImageElement.addEventListener(
            "load",
            () => {
              if (activeEffectLayer.isConnected) {
                applyEffectLayerLayout();
              }
            },
            {
              once: true
            }
          );
        }
        (isNested
          ? hostContainerElement
          : isFillEffect
            ? this.canvas
            : hostContainerElement
        ).append(activeEffectLayer);
        this.componentEffectLayers.set(renderedComponent.id, activeEffectLayer);
        const activeSourceAttribute = activeImageElement?.dataset.effectSource || "";
        if (activeSourceAttribute) {
          this.runtimeEffectImageLoader.enqueue(activeImageElement, activeSourceAttribute, {
            active: layerIsActive
          });
        }
        if (retainedEffectLayer) {
          const imageFilter = renderedImageElement?.style.filter || "none";
          const imageOpacityValue = renderedEffectLayer.style.getPropertyValue(
            "--hb-effect-image-opacity"
          );
          const fadeDurationValue = renderedEffectLayer.style.getPropertyValue(
            "--hb-effect-fade-duration"
          );
          const visualTransitionValue = renderedEffectLayer.style.getPropertyValue(
            "--hb-effect-visual-transition-duration"
          );
          const layerOpacity = renderedEffectLayer.style.opacity;
          const layerTransition = renderedEffectLayer.style.transition;
          activeImageElement?.offsetWidth;
          if (activeImageElement) {
            activeImageElement.style.filter = imageFilter;
          }
          activeEffectLayer.style.opacity = layerOpacity;
          activeEffectLayer.style.transition = layerTransition;
          activeEffectLayer.style.setProperty("--hb-effect-image-opacity", imageOpacityValue);
          activeEffectLayer.style.setProperty("--hb-effect-fade-duration", fadeDurationValue);
          activeEffectLayer.style.setProperty(
            "--hb-effect-visual-transition-duration",
            visualTransitionValue
          );
          this.setEffectLayerActive(
            activeEffectLayer,
            layerIsActive,
            effectFadeDuration(renderedComponent)
          );
        }
      }
    }
    if (renderedComponent.type === "air-conditioner") {
      const renderedAirflowLayer = renderAirConditionerAirflowLayer(
        renderPowerComponent,
        renderContext
      );
      if (renderedAirflowLayer) {
        renderedAirflowLayer.dataset.airflowFor = renderedComponent.id;
        renderedAirflowLayer.hidden = renderedComponent.style?.visible === false;
        const isNestedAirflow = hostContainerElement !== this.canvas;
        const renderedAirflowGeometry = airflowLayerGeometry(renderedComponent, {
          grouped: isNestedAirflow
        });
        Object.assign(renderedAirflowLayer.style, {
          left: renderedAirflowGeometry.left + "px",
          top: renderedAirflowGeometry.top + "px",
          width: renderedAirflowGeometry.width + "px",
          height: renderedAirflowGeometry.height + "px",
          zIndex: String(stackZIndex),
          transform:
            "rotate(" +
            renderedAirflowGeometry.rotation +
            "deg) scale(" +
            renderedAirflowGeometry.scale +
            ")"
        });
        (isNestedAirflow ? componentElement : hostContainerElement).append(renderedAirflowLayer);
        this.componentAirflowLayers.set(renderedComponent.id, renderedAirflowLayer);
      }
    }
    const contentElement =
      renderedComponent.type === "group"
        ? (() => {
            const groupContainerElement = document.createElement("div");
            groupContainerElement.className = "hb-group-container";
            return groupContainerElement;
          })()
        : renderRegisteredComponent(renderPowerComponent, renderContext);
    const contentComponentScale = Number(this.document.canvas.componentScale || 1);
    if (contentComponentScale !== 1) {
      contentElement.style.width = 100 / contentComponentScale + "%";
      contentElement.style.height = 100 / contentComponentScale + "%";
      contentElement.style.transform = "scale(" + contentComponentScale + ")";
      contentElement.style.transformOrigin = "top left";
    }
    componentElement.append(contentElement);
    if (renderedComponent.type === "line-chart") {
      let lineChartElement = contentElement;
      const refreshLineChart = () => {
        if (!lineChartElement?.isConnected) {
          return;
        }
        const nextLineChartElement = renderRegisteredComponent(renderPowerComponent, renderContext);
        if (contentComponentScale !== 1) {
          nextLineChartElement.style.width = 100 / contentComponentScale + "%";
          nextLineChartElement.style.height = 100 / contentComponentScale + "%";
          nextLineChartElement.style.transform = "scale(" + contentComponentScale + ")";
          nextLineChartElement.style.transformOrigin = "top left";
        }
        lineChartElement.cleanupLineChartHover?.();
        lineChartElement.replaceWith(nextLineChartElement);
        lineChartElement = nextLineChartElement;
      };
      this.registerRuntimeStateHandler(
        renderedComponent.bindings?.entity?.entityId,
        lineChartEntityState => {
          lineChartElement.syncLineChartState?.(lineChartEntityState);
          if (lineChartElement.classList.contains("history-loading")) {
            refreshLineChart();
          }
        },
        renderedComponent.id
      );
      this.registerHistoryChartRefresher(refreshLineChart, renderedComponent.id);
    }
    if (this.options.editable) {
      componentElement.classList.add("editable");
      componentElement.addEventListener("pointerdown", movePointerEvent =>
        this.startComponentMove(movePointerEvent, renderedComponent, componentElement)
      );
    } else {
      const hasTapAction = Object.prototype.hasOwnProperty.call(
        renderedComponent.actions || {},
        "tap"
      );
      const actionableComponent =
        renderedComponent.type === "camera" &&
        renderedComponent.bindings?.entity?.entityId &&
        !hasTapAction
          ? {
              ...renderedComponent,
              actions: {
                tap: {
                  type: "more-info",
                  data: {
                    popupSource: "current"
                  }
                },
                ...(renderedComponent.actions || {})
              }
            }
          : renderedComponent;
      if (renderedComponent.type === "light-statistics") {
        componentElement.classList.add("hb-runtime-fitted-hit-area");
      }
      if (
        Object.values(actionableComponent.actions || {}).some(componentActionConfig =>
          isSupportedComponentAction(actionableComponent, componentActionConfig)
        )
      ) {
        componentElement.classList.add("interactive");
        let actionTargetElement = componentElement;
        if (
          ["title-button", "device-button", "light-statistics"].includes(renderedComponent.type)
        ) {
          actionTargetElement = document.createElement("span");
          actionTargetElement.className = "hb-runtime-action-hitbox";
          actionTargetElement.setAttribute("aria-hidden", "true");
          componentElement.classList.add("hb-runtime-fitted-hit-area");
          componentElement.append(actionTargetElement);
        }
        this.bindRuntimeActions(actionTargetElement, actionableComponent);
      }
    }
    hostContainerElement.append(componentElement);
    const mountedHitboxElement = componentElement.querySelector(
      ":scope > .hb-runtime-action-hitbox"
    );
    if (mountedHitboxElement) {
      const hitboxBoundsVisible =
        renderedComponent.type === "title-button"
          ? this.updateTitleButtonSelectionBounds(
              componentElement,
              renderedComponent,
              mountedHitboxElement
            )
          : renderedComponent.type === "light-statistics"
            ? this.updateLightStatisticsSelectionBounds(
                componentElement,
                renderedComponent,
                mountedHitboxElement
              )
            : this.updateDeviceButtonSelectionBounds(
                componentElement,
                renderedComponent,
                mountedHitboxElement
              );
      mountedHitboxElement.hidden = !hitboxBoundsVisible;
    }
    for (const childComponentData of renderedComponent.children || []) {
      this.renderComponent(
        childComponentData,
        componentElement,
        0,
        retainedHosts,
        existingEffectLayerMap
      );
    }
  }
  startComponentMove(
    dragPointerEvent,
    draggedComponent,
    dragHostElement,
    captureElement = dragHostElement
  ) {
    if (
      !this.options.editable ||
      !this.selectedComponentIds.has(draggedComponent.id) ||
      draggedComponent.properties?.layoutMode === "fill" ||
      dragPointerEvent.button !== 0 ||
      dragPointerEvent.target.closest(".hb-transform-handle")
    ) {
      return;
    }
    dragPointerEvent.preventDefault();
    dragPointerEvent.stopPropagation();
    const pointerStartX = dragPointerEvent.clientX;
    const pointerStartY = dragPointerEvent.clientY;
    const dragRecords = [...this.selectedComponentIds]
      .map(selectedRecordComponentId => ({
        component: this.componentRecords.get(selectedRecordComponentId),
        host: this.componentHosts.get(selectedRecordComponentId)
      }))
      .filter(dragRecord => dragRecord.component && dragRecord.host)
      .map(dragRecordEntry => ({
        ...dragRecordEntry,
        initialX: Number(dragRecordEntry.component.position?.x || 0),
        initialY: Number(dragRecordEntry.component.position?.y || 0),
        width: Number(dragRecordEntry.component.position?.width || 100),
        height: Number(dragRecordEntry.component.position?.height || 100),
        parentId: this.componentParentIds.get(dragRecordEntry.component.id) || null,
        parentTransform: this.componentParentTransform(dragRecordEntry.component.id),
        worldCenter: this.componentLocalPointToWorld(
          dragRecordEntry.component.id,
          Number(dragRecordEntry.component.position?.width || 100) / 2,
          Number(dragRecordEntry.component.position?.height || 100) / 2
        )
      }));
    if (
      !dragRecords.some(
        draggedRecordCheck => draggedRecordCheck.component.id === draggedComponent.id
      ) ||
      dragRecords.some(
        filledRecordCheck => filledRecordCheck.component.properties?.layoutMode === "fill"
      )
    ) {
      return;
    }
    let isCopyDrag = isModifierKeyPressed(dragPointerEvent);
    let isAirflowDrag =
      !isCopyDrag &&
      dragRecords.length === 1 &&
      draggedComponent.type === "air-conditioner" &&
      this.componentSelectionLayers.get(draggedComponent.id) !== "airflow";
    const initialAirflowOffsetX = Number(draggedComponent.properties?.airflowOffsetX ?? -75);
    const initialAirflowOffsetY = Number(draggedComponent.properties?.airflowOffsetY ?? 34);
    let nextAirflowOffsetX = initialAirflowOffsetX;
    let nextAirflowOffsetY = initialAirflowOffsetY;
    const dragCanvasWidthPx = Number(this.document?.canvas?.width || 2778);
    const dragCanvasHeightPx = Number(this.document?.canvas?.height || 1940);
    const dragBounds = dragRecords.reduce(
      (accumulatedBounds, boundsRecordEntry) => ({
        minX: Math.max(accumulatedBounds.minX, Math.min(0, -boundsRecordEntry.worldCenter.x)),
        maxX: Math.min(
          accumulatedBounds.maxX,
          Math.max(0, dragCanvasWidthPx - boundsRecordEntry.worldCenter.x)
        ),
        minY: Math.max(accumulatedBounds.minY, Math.min(0, -boundsRecordEntry.worldCenter.y)),
        maxY: Math.min(
          accumulatedBounds.maxY,
          Math.max(0, dragCanvasHeightPx - boundsRecordEntry.worldCenter.y)
        )
      }),
      {
        minX: -Infinity,
        maxX: Infinity,
        minY: -Infinity,
        maxY: Infinity
      }
    );
    const startComponentX = Number(draggedComponent.position?.x || 0);
    const startComponentY = Number(draggedComponent.position?.y || 0);
    let nextComponentX = startComponentX;
    let nextComponentY = startComponentY;
    let activeDragRecords = dragRecords;
    let copiedComponentEntries = [];
    let currentOffsets = dragRecords.map(initialOffsetRecord => ({
      componentId: initialOffsetRecord.component.id,
      x: initialOffsetRecord.initialX,
      y: initialOffsetRecord.initialY
    }));
    let draggedCopyId = draggedComponent.id;
    let didCreateCopies = false;
    let axisLockAxis = "";
    let isDragFinished = false;
    const dragPointerId = dragPointerEvent.pointerId;
    captureElement.setPointerCapture(dragPointerId);
    dragRecords.forEach(movingRecord => movingRecord.host.classList.add("moving"));
    const onDragPointerMove = moveEvent => {
      if (moveEvent.pointerId !== dragPointerId) {
        return;
      }
      if (!captureElement.hasPointerCapture?.(dragPointerId) && captureElement.isConnected) {
        try {
          captureElement.setPointerCapture(dragPointerId);
        } catch {}
      }
      if (!isCopyDrag && isModifierKeyPressed(moveEvent)) {
        isCopyDrag = true;
        isAirflowDrag = false;
      }
      let deltaClientX = moveEvent.clientX - pointerStartX;
      let deltaClientY = moveEvent.clientY - pointerStartY;
      if (isCopyDrag && !didCreateCopies) {
        if (Math.hypot(deltaClientX, deltaClientY) < 3) {
          return;
        }
        copiedComponentEntries = dragRecords.map(copiedSourceRecord => {
          const copiedComponent = assignComponentIds(structuredClone(copiedSourceRecord.component));
          copiedComponent.position = {
            ...(copiedComponent.position || {}),
            zIndex: Number(copiedComponent.position?.zIndex || 1) + 1
          };
          this.renderComponent(copiedComponent, copiedSourceRecord.host.parentElement);
          return {
            sourceComponentId: copiedSourceRecord.component.id,
            copiedComponent: copiedComponent
          };
        });
        activeDragRecords = copiedComponentEntries.map((copyEntry, copyIndex) => ({
          component: copyEntry.copiedComponent,
          host: this.componentHosts.get(copyEntry.copiedComponent.id),
          initialX: dragRecords[copyIndex].initialX,
          initialY: dragRecords[copyIndex].initialY,
          width: dragRecords[copyIndex].width,
          height: dragRecords[copyIndex].height,
          parentId: dragRecords[copyIndex].parentId,
          parentTransform: dragRecords[copyIndex].parentTransform
        }));
        draggedCopyId =
          copiedComponentEntries.find(
            matchedCopyEntry => matchedCopyEntry.sourceComponentId === draggedComponent.id
          )?.copiedComponent.id || copiedComponentEntries[0]?.copiedComponent.id;
        didCreateCopies = true;
        dragRecords.forEach(stoppedMovingRecord =>
          stoppedMovingRecord.host.classList.remove("moving")
        );
        activeDragRecords.forEach(copyDragRecord => copyDragRecord.host?.classList.add("moving"));
        this.selectedComponentId = draggedCopyId;
        this.selectedComponentIds = new Set(
          activeDragRecords.map(copyDragRecordEntry => copyDragRecordEntry.component.id)
        );
      }
      if (moveEvent.shiftKey) {
        if (!axisLockAxis && Math.hypot(deltaClientX, deltaClientY) >= 1) {
          axisLockAxis =
            Math.abs(deltaClientX) >= Math.abs(deltaClientY) ? "horizontal" : "vertical";
        }
        if (axisLockAxis === "horizontal") {
          deltaClientY = 0;
        }
        if (axisLockAxis === "vertical") {
          deltaClientX = 0;
        }
      } else {
        axisLockAxis = "";
      }
      const clampedDeltaX = Math.max(
        dragBounds.minX,
        Math.min(dragBounds.maxX, deltaClientX / (this.appliedScaleX || 1))
      );
      const clampedDeltaY = Math.max(
        dragBounds.minY,
        Math.min(dragBounds.maxY, deltaClientY / (this.appliedScaleY || 1))
      );
      const leadDragRecord =
        dragRecords.find(leadRecordMatch => leadRecordMatch.component.id === draggedComponent.id) ||
        dragRecords[0];
      const leadLocalDelta = groupedComponentLocalDelta(
        clampedDeltaX,
        clampedDeltaY,
        leadDragRecord.parentTransform
      );
      nextComponentX = startComponentX + leadLocalDelta.x;
      nextComponentY = startComponentY + leadLocalDelta.y;
      if (isAirflowDrag) {
        nextAirflowOffsetX =
          initialAirflowOffsetX -
          (leadLocalDelta.x / Math.max(1, Number(draggedComponent.position?.width || 100))) * 100;
        nextAirflowOffsetY =
          initialAirflowOffsetY -
          (leadLocalDelta.y / Math.max(1, Number(draggedComponent.position?.height || 100))) * 100;
        draggedComponent.properties = {
          ...(draggedComponent.properties || {}),
          airflowOffsetX: nextAirflowOffsetX,
          airflowOffsetY: nextAirflowOffsetY
        };
        this.options.onComponentPropertiesPreview?.(draggedComponent.id, {
          airflowOffsetX: nextAirflowOffsetX,
          airflowOffsetY: nextAirflowOffsetY
        });
      }
      const offsetUpdates = activeDragRecords.map(draggingCopyRecord => {
        const localDelta = groupedComponentLocalDelta(
          clampedDeltaX,
          clampedDeltaY,
          draggingCopyRecord.parentTransform
        );
        return {
          componentId: draggingCopyRecord.component.id,
          x: draggingCopyRecord.initialX + localDelta.x,
          y: draggingCopyRecord.initialY + localDelta.y
        };
      });
      currentOffsets = offsetUpdates;
      for (const offsetUpdate of offsetUpdates) {
        const offsetHostElement = this.componentHosts.get(offsetUpdate.componentId);
        if (offsetHostElement) {
          offsetHostElement.style.left = offsetUpdate.x + "px";
          offsetHostElement.style.top = offsetUpdate.y + "px";
        }
        const offsetOverlayElement = this.componentSelectionOverlays.get(offsetUpdate.componentId);
        if (offsetOverlayElement) {
          offsetOverlayElement.style.left = offsetUpdate.x + "px";
          offsetOverlayElement.style.top = offsetUpdate.y + "px";
        }
      }
      if (!didCreateCopies) {
        if (offsetUpdates.length > 1) {
          this.options.onComponentsTransformPreview?.(offsetUpdates, draggedComponent.id);
        } else {
          this.options.onComponentTransformPreview?.(draggedComponent.id, {
            x: nextComponentX,
            y: nextComponentY
          });
        }
      }
    };
    const onDragPointerEnd = (dragEndEvent = null) => {
      if (
        !isDragFinished &&
        (dragEndEvent?.pointerId == null || dragEndEvent.pointerId === dragPointerId) &&
        ((isDragFinished = true),
        activeDragRecords.forEach(settledCopyRecord =>
          settledCopyRecord.host?.classList.remove("moving")
        ),
        dragRecords.forEach(settledDragRecord => settledDragRecord.host.classList.remove("moving")),
        window.removeEventListener("pointermove", onDragPointerMove, true),
        window.removeEventListener("pointerup", onDragPointerEnd, true),
        window.removeEventListener("pointercancel", onDragPointerEnd, true),
        window.removeEventListener("blur", onDragPointerEnd),
        nextComponentX !== startComponentX || nextComponentY !== startComponentY)
      ) {
        if (didCreateCopies) {
          activeDragRecords.forEach(committedCopyRecord => {
            const matchingOffset = currentOffsets.find(
              offsetUpdateEntry =>
                offsetUpdateEntry.componentId === committedCopyRecord.component.id
            );
            committedCopyRecord.component.position = {
              ...(committedCopyRecord.component.position || {}),
              x: matchingOffset?.x ?? committedCopyRecord.initialX,
              y: matchingOffset?.y ?? committedCopyRecord.initialY
            };
          });
          this.options.onComponentsDuplicate?.(
            copiedComponentEntries,
            draggedComponent.id,
            draggedCopyId
          );
        } else if (dragRecords.length > 1) {
          const finalUpdates = currentOffsets.map(finalUpdateEntry => {
            const matchingDragRecord = dragRecords.find(
              finalRecordMatch => finalRecordMatch.component.id === finalUpdateEntry.componentId
            );
            if (matchingDragRecord) {
              matchingDragRecord.component.position = {
                ...(matchingDragRecord.component.position || {}),
                x: finalUpdateEntry.x,
                y: finalUpdateEntry.y
              };
            }
            return finalUpdateEntry;
          });
          this.options.onComponentsTransform?.(finalUpdates, draggedComponent.id);
        } else {
          draggedComponent.position = {
            ...(draggedComponent.position || {}),
            x: nextComponentX,
            y: nextComponentY
          };
          this.options.onComponentTransform?.(draggedComponent.id, {
            x: nextComponentX,
            y: nextComponentY,
            ...(isAirflowDrag
              ? {
                  airflowOffsetX: nextAirflowOffsetX,
                  airflowOffsetY: nextAirflowOffsetY
                }
              : {})
          });
        }
      }
    };
    window.addEventListener("pointermove", onDragPointerMove, true);
    window.addEventListener("pointerup", onDragPointerEnd, true);
    window.addEventListener("pointercancel", onDragPointerEnd, true);
    window.addEventListener("blur", onDragPointerEnd);
  }
  createComponentSelectionOverlay(overlayComponentHost, overlayComponentRecord) {
    if (
      !overlayComponentHost ||
      !overlayComponentRecord ||
      !overlayComponentHost.parentElement ||
      (overlayComponentHost.parentElement !== this.canvas && !overlayComponentHost.hidden)
    ) {
      return null;
    }
    const hostParentElement = overlayComponentHost.parentElement;
    const overlayElement = document.createElement("div");
    overlayElement.className = "hb-component-selection-overlay";
    if (overlayComponentRecord.type === "light-statistics") {
      overlayElement.classList.add("hb-light-statistics-selection-overlay");
    }
    if (
      overlayComponentRecord.type === "floorplan-auto-diagram" &&
      overlayComponentRecord.properties?.interactionMode === "view"
    ) {
      overlayElement.classList.add("hb-floorplan-auto-diagram-view-overlay");
    }
    overlayElement.dataset.selectionFor = overlayComponentRecord.id;
    Object.assign(overlayElement.style, {
      left: overlayComponentHost.style.left,
      top: overlayComponentHost.style.top,
      width: overlayComponentHost.style.width,
      height: overlayComponentHost.style.height,
      transform: overlayComponentHost.style.transform
    });
    if (overlayComponentRecord.type !== "light-statistics") {
      overlayElement.addEventListener("pointerdown", pointerEvent =>
        this.startComponentMove(
          pointerEvent,
          overlayComponentRecord,
          overlayComponentHost,
          overlayElement
        )
      );
    }
    hostParentElement.append(overlayElement);
    this.componentSelectionOverlays.set(overlayComponentRecord.id, overlayElement);
    return overlayElement;
  }
  createAirflowSelectionOverlay(airflowOverlayLayerElement, airflowComponentRecord) {
    if (
      !airflowOverlayLayerElement ||
      !airflowComponentRecord ||
      !airflowOverlayLayerElement.parentElement
    ) {
      return null;
    }
    const airflowOverlayElement = document.createElement("div");
    airflowOverlayElement.className = "hb-component-selection-overlay hb-airflow-selection-overlay";
    airflowOverlayElement.dataset.selectionFor = airflowComponentRecord.id;
    Object.assign(airflowOverlayElement.style, {
      left: airflowOverlayLayerElement.style.left,
      top: airflowOverlayLayerElement.style.top,
      width: airflowOverlayLayerElement.style.width,
      height: airflowOverlayLayerElement.style.height,
      transform: airflowOverlayLayerElement.style.transform
    });
    airflowOverlayLayerElement.parentElement.append(airflowOverlayElement);
    this.componentSelectionOverlays.set(airflowComponentRecord.id, airflowOverlayElement);
    return airflowOverlayElement;
  }
  syncAirflowLayerGeometry(
    syncedAirflowLayerElement,
    syncedComponentRecord,
    syncedOverlayElement = null
  ) {
    if (!syncedAirflowLayerElement || !syncedComponentRecord) {
      return;
    }
    const syncedAirflowGeometry = airflowLayerGeometry(syncedComponentRecord, {
      grouped: syncedAirflowLayerElement.parentElement !== this.canvas
    });
    const airflowStyle = {
      left: syncedAirflowGeometry.left + "px",
      top: syncedAirflowGeometry.top + "px",
      width: syncedAirflowGeometry.width + "px",
      height: syncedAirflowGeometry.height + "px",
      transform:
        "rotate(" +
        syncedAirflowGeometry.rotation +
        "deg) scale(" +
        syncedAirflowGeometry.scale +
        ")"
    };
    Object.assign(syncedAirflowLayerElement.style, airflowStyle);
    if (syncedOverlayElement) {
      Object.assign(syncedOverlayElement.style, airflowStyle);
    }
  }
  appendEffectSelectionBounds(effectComponentLayerElement, effectBoundsComponentRecord) {
    if (
      !effectComponentLayerElement ||
      !effectBoundsComponentRecord ||
      !effectComponentLayerElement.parentElement
    ) {
      return;
    }
    const effectOverlayElement = document.createElement("div");
    effectOverlayElement.className = "hb-component-selection-overlay hb-effect-selection-overlay";
    effectOverlayElement.dataset.selectionFor = effectBoundsComponentRecord.id;
    Object.assign(effectOverlayElement.style, {
      left: effectComponentLayerElement.style.left,
      top: effectComponentLayerElement.style.top,
      width: effectComponentLayerElement.style.width,
      height: effectComponentLayerElement.style.height,
      transform: effectComponentLayerElement.style.transform,
      pointerEvents: "none"
    });
    const effectBoundsElement = document.createElement("div");
    effectBoundsElement.className = "hb-selection-bounds hb-effect-selection-bounds";
    for (const cornerName of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const effectCornerMarkerElement = document.createElement("i");
      effectCornerMarkerElement.className = "hb-corner-marker hb-corner-" + cornerName;
      effectCornerMarkerElement.setAttribute("aria-hidden", "true");
      effectBoundsElement.append(effectCornerMarkerElement);
    }
    effectOverlayElement.append(effectBoundsElement);
    effectComponentLayerElement.parentElement.append(effectOverlayElement);
    this.componentSelectionOverlays.set(effectBoundsComponentRecord.id, effectOverlayElement);
    this.updateTransformHandleScale(
      effectComponentLayerElement,
      effectBoundsComponentRecord,
      effectBoundsElement
    );
  }
  syncComponentSelectionOverlay(overlayComponentId) {
    const selectionOverlay = this.componentSelectionOverlays.get(overlayComponentId);
    const hostElementForSelection = this.componentHosts.get(overlayComponentId);
    if (
      !!selectionOverlay &&
      !!hostElementForSelection &&
      !selectionOverlay.classList.contains("hb-airflow-selection-overlay") &&
      !selectionOverlay.classList.contains("hb-effect-selection-overlay")
    ) {
      Object.assign(selectionOverlay.style, {
        left: hostElementForSelection.style.left,
        top: hostElementForSelection.style.top,
        width: hostElementForSelection.style.width,
        height: hostElementForSelection.style.height,
        transform: hostElementForSelection.style.transform
      });
    }
  }
  appendTransformHandles(
    boundsComponentHost,
    boundsComponentRecord,
    allowResize = true,
    boundsContainerElement = boundsComponentHost
  ) {
    if (!boundsComponentHost || !boundsComponentRecord) {
      return;
    }
    const selectionBoundsContainer = document.createElement("div");
    selectionBoundsContainer.className = "hb-selection-bounds";
    for (const handleCornerPosition of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const handleCornerMarkerElement = document.createElement("i");
      handleCornerMarkerElement.className = "hb-corner-marker hb-corner-" + handleCornerPosition;
      handleCornerMarkerElement.setAttribute("aria-hidden", "true");
      selectionBoundsContainer.append(handleCornerMarkerElement);
    }
    if (allowResize && boundsComponentRecord.properties?.layoutMode !== "fill") {
      const selectionResizeHandle = document.createElement("button");
      selectionResizeHandle.type = "button";
      selectionResizeHandle.className = "hb-transform-handle hb-resize-handle";
      selectionResizeHandle.title = "拖动缩放";
      selectionResizeHandle.addEventListener("pointerdown", handleResizePointerEvent =>
        this.startComponentScale(
          handleResizePointerEvent,
          boundsComponentRecord,
          boundsComponentHost,
          selectionBoundsContainer
        )
      );
      const selectionRotateHandle = document.createElement("button");
      selectionRotateHandle.type = "button";
      selectionRotateHandle.className = "hb-transform-handle hb-rotate-handle";
      selectionRotateHandle.title = "拖动旋转";
      selectionRotateHandle.addEventListener("pointerdown", rotatePointerEvent =>
        this.startComponentRotate(
          rotatePointerEvent,
          boundsComponentRecord,
          boundsComponentHost,
          selectionBoundsContainer
        )
      );
      selectionBoundsContainer.append(selectionResizeHandle, selectionRotateHandle);
    }
    boundsContainerElement.append(selectionBoundsContainer);
    if (
      boundsComponentRecord.type === "light-statistics" &&
      boundsContainerElement.classList?.contains("hb-light-statistics-selection-overlay")
    ) {
      selectionBoundsContainer.addEventListener("pointerdown", statisticsMovePointerEvent =>
        this.startComponentMove(
          statisticsMovePointerEvent,
          boundsComponentRecord,
          boundsComponentHost,
          selectionBoundsContainer
        )
      );
    }
    this.updateImageSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    this.updateTextSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    this.updateTitleButtonSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    this.updateDeviceButtonSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    const statisticsBoundsVisible = this.updateLightStatisticsSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    if (boundsComponentRecord.type === "light-statistics" && !statisticsBoundsVisible) {
      Object.assign(selectionBoundsContainer.style, {
        left: "0",
        top: "0",
        width: "100%",
        height: "100%"
      });
    }
    this.updateAirConditionerButtonSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    this.updateTransformHandleScale(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
  }
  withSelectionMeasurementHost(measurementStartElement, measureCallback) {
    const hiddenElements = [];
    let measurementElement = measurementStartElement;
    while (measurementElement && measurementElement !== this.canvas) {
      if (measurementElement.hidden) {
        hiddenElements.push(measurementElement);
        measurementElement.hidden = false;
      }
      measurementElement = measurementElement.parentElement;
    }
    try {
      return measureCallback();
    } finally {
      for (const hiddenElement of hiddenElements) {
        hiddenElement.hidden = true;
      }
    }
  }
  selectionElementIsVisible(measuredElement) {
    if (!measuredElement || measuredElement.hidden) {
      return false;
    }
    const computedStyle = window.getComputedStyle?.(measuredElement);
    if (computedStyle?.display === "none" || computedStyle?.visibility === "hidden") {
      return false;
    } else {
      return (
        Number(
          measuredElement.offsetWidth || measuredElement.getBoundingClientRect?.().width || 0
        ) > 0 &&
        Number(
          measuredElement.offsetHeight || measuredElement.getBoundingClientRect?.().height || 0
        ) > 0
      );
    }
  }
  selectionElementBox(boxElement, boxAncestorElement) {
    let offsetLeftPx = 0;
    let offsetTopPx = 0;
    let offsetParent = boxElement;
    const visitedElements = new Set();
    while (
      offsetParent &&
      offsetParent !== boxAncestorElement &&
      !visitedElements.has(offsetParent)
    ) {
      visitedElements.add(offsetParent);
      offsetLeftPx += Number(offsetParent.offsetLeft || 0);
      offsetTopPx += Number(offsetParent.offsetTop || 0);
      offsetParent = offsetParent.offsetParent || offsetParent.parentElement;
    }
    const elementRect = boxElement.getBoundingClientRect?.();
    const elementWidthPx = Number(boxElement.offsetWidth || elementRect?.width || 0);
    const elementHeightPx = Number(boxElement.offsetHeight || elementRect?.height || 0);
    return {
      left: offsetLeftPx,
      top: offsetTopPx,
      width: elementWidthPx,
      height: elementHeightPx
    };
  }
  applyDoorWindowPerspective(
    perspectiveFrontElement,
    perspectiveComponentRecord,
    perspectiveCorners
  ) {
    const doorWindowVisualElement =
      perspectiveFrontElement?.querySelector(".hb-door-window-visual");
    if (!doorWindowVisualElement || !perspectiveComponentRecord) {
      return;
    }
    const canvasComponentScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1));
    const scaledVisualWidthPx = Math.max(
      1,
      Number(perspectiveComponentRecord.position?.width || 100) / canvasComponentScale
    );
    const scaledVisualHeightPx = Math.max(
      1,
      Number(perspectiveComponentRecord.position?.height || 100) / canvasComponentScale
    );
    doorWindowVisualElement.style.transform = doorWindowPerspectiveMatrix(
      scaledVisualWidthPx,
      scaledVisualHeightPx,
      perspectiveCorners
    );
  }
  updateDoorWindowPerspectiveHandles(handleHostElement, handleComponent) {
    if (!handleHostElement) {
      return;
    }
    const perspectiveCornerList = doorWindowPerspectiveCorners(handleComponent);
    handleHostElement
      .querySelector(".hb-door-window-perspective-guide polygon")
      ?.setAttribute(
        "points",
        [0, 1, 2, 3]
          .map(
            guideCornerIndex =>
              perspectiveCornerList[guideCornerIndex * 2] +
              "," +
              perspectiveCornerList[guideCornerIndex * 2 + 1]
          )
          .join(" ")
      );
    handleHostElement
      .querySelectorAll(".hb-door-window-perspective-handle")
      .forEach(perspectiveHandleElement => {
        const handleCornerIndex = Number(
          perspectiveHandleElement.dataset.perspectiveCornerIndex || 0
        );
        perspectiveHandleElement.style.left =
          perspectiveCornerList[handleCornerIndex * 2] * 100 + "%";
        perspectiveHandleElement.style.top =
          perspectiveCornerList[handleCornerIndex * 2 + 1] * 100 + "%";
      });
  }
  appendDoorWindowPerspectiveHandles(
    curtainHostElement,
    curtainComponentRecord,
    curtainOverlayElement = curtainHostElement
  ) {
    if (
      !curtainHostElement ||
      !curtainComponentRecord ||
      curtainComponentRecord.properties?.sensorKind !== "door-window"
    ) {
      return;
    }
    const curtainCorners = doorWindowPerspectiveCorners(
      curtainComponentRecord.properties?.perspectiveCorners
    );
    const perspectiveBoundsElement = document.createElement("div");
    perspectiveBoundsElement.className = "hb-selection-bounds hb-door-window-perspective-bounds";
    const svgGuideElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgGuideElement.classList.add("hb-door-window-perspective-guide");
    svgGuideElement.setAttribute("viewBox", "0 0 1 1");
    svgGuideElement.setAttribute("preserveAspectRatio", "none");
    svgGuideElement.append(document.createElementNS("http://www.w3.org/2000/svg", "polygon"));
    perspectiveBoundsElement.append(svgGuideElement);
    const cornerLabels = ["左上角", "右上角", "右下角", "左下角"];
    for (let cornerIndex = 0; cornerIndex < 4; cornerIndex += 1) {
      const perspectiveHandleButton = document.createElement("button");
      perspectiveHandleButton.type = "button";
      perspectiveHandleButton.className = "hb-door-window-perspective-handle";
      perspectiveHandleButton.dataset.perspectiveCornerIndex = String(cornerIndex);
      perspectiveHandleButton.title = "拖动" + cornerLabels[cornerIndex] + "调整透视";
      perspectiveHandleButton.setAttribute("aria-label", perspectiveHandleButton.title);
      perspectiveHandleButton.addEventListener("pointerdown", perspectivePointerEvent =>
        this.startDoorWindowPerspective(
          perspectivePointerEvent,
          curtainComponentRecord,
          curtainHostElement,
          perspectiveBoundsElement,
          cornerIndex
        )
      );
      perspectiveBoundsElement.append(perspectiveHandleButton);
    }
    curtainOverlayElement.append(perspectiveBoundsElement);
    this.updateDoorWindowPerspectiveHandles(perspectiveBoundsElement, curtainCorners);
    this.updateTransformHandleScale(
      curtainHostElement,
      curtainComponentRecord,
      perspectiveBoundsElement
    );
  }
  startDoorWindowPerspective(
    startPerspectivePointerEvent,
    startPerspectiveComponent,
    perspectiveFrontLayerElement,
    perspectiveBoundsLayerElement,
    draggedCornerIndex
  ) {
    if (startPerspectivePointerEvent.button !== 0) {
      return;
    }
    startPerspectivePointerEvent.preventDefault();
    startPerspectivePointerEvent.stopPropagation();
    const perspectivePointerId = startPerspectivePointerEvent.pointerId;
    const perspectiveStartX = startPerspectivePointerEvent.clientX;
    const perspectiveStartY = startPerspectivePointerEvent.clientY;
    const initialPerspectiveCorners = doorWindowPerspectiveCorners(
      startPerspectiveComponent.properties?.perspectiveCorners
    );
    const initialCornerX = initialPerspectiveCorners[draggedCornerIndex * 2];
    const initialCornerY = initialPerspectiveCorners[draggedCornerIndex * 2 + 1];
    const perspectiveWidthPx = Math.max(
      1,
      Number(startPerspectiveComponent.position?.width || 100)
    );
    const perspectiveHeightPx = Math.max(
      1,
      Number(startPerspectiveComponent.position?.height || 100)
    );
    const perspectiveWorldTransform = this.componentWorldTransform(startPerspectiveComponent.id);
    const perspectiveWorldScale = perspectiveWorldTransform.scale;
    const perspectiveRotationRad = (perspectiveWorldTransform.rotation * Math.PI) / 180;
    const perspectiveRotationCosine = Math.cos(perspectiveRotationRad);
    const perspectiveRotationSine = Math.sin(perspectiveRotationRad);
    let nextPerspectiveCorners = initialPerspectiveCorners;
    let isPerspectiveFinished = false;
    const onPerspectivePointerMove = perspectiveMoveEvent => {
      if (perspectiveMoveEvent.pointerId !== perspectivePointerId) {
        return;
      }
      const scaledMoveDeltaX =
        (perspectiveMoveEvent.clientX - perspectiveStartX) /
        Math.max(0.001, this.appliedScaleX || 1);
      const scaledMoveDeltaY =
        (perspectiveMoveEvent.clientY - perspectiveStartY) /
        Math.max(0.001, this.appliedScaleY || 1);
      const unrotatedDeltaX =
        (perspectiveRotationCosine * scaledMoveDeltaX +
          perspectiveRotationSine * scaledMoveDeltaY) /
        perspectiveWorldScale;
      const unrotatedDeltaY =
        (-perspectiveRotationSine * scaledMoveDeltaX +
          perspectiveRotationCosine * scaledMoveDeltaY) /
        perspectiveWorldScale;
      const cornersBuffer = initialPerspectiveCorners.slice();
      cornersBuffer[draggedCornerIndex * 2] = initialCornerX + unrotatedDeltaX / perspectiveWidthPx;
      cornersBuffer[draggedCornerIndex * 2 + 1] =
        initialCornerY + unrotatedDeltaY / perspectiveHeightPx;
      nextPerspectiveCorners = doorWindowPerspectiveCorners(cornersBuffer);
      startPerspectiveComponent.properties = {
        ...(startPerspectiveComponent.properties || {}),
        perspectiveCorners: nextPerspectiveCorners
      };
      this.applyDoorWindowPerspective(
        perspectiveFrontLayerElement,
        startPerspectiveComponent,
        nextPerspectiveCorners
      );
      this.updateDoorWindowPerspectiveHandles(
        perspectiveBoundsLayerElement,
        nextPerspectiveCorners
      );
      this.options.onComponentPropertiesPreview?.(startPerspectiveComponent.id, {
        perspectiveCorners: nextPerspectiveCorners
      });
    };
    const onPerspectivePointerEnd = (perspectiveEndEvent = null) => {
      if (
        !isPerspectiveFinished &&
        (perspectiveEndEvent?.pointerId == null ||
          perspectiveEndEvent.pointerId === perspectivePointerId)
      ) {
        isPerspectiveFinished = true;
        window.removeEventListener("pointermove", onPerspectivePointerMove, true);
        window.removeEventListener("pointerup", onPerspectivePointerEnd, true);
        window.removeEventListener("pointercancel", onPerspectivePointerEnd, true);
        window.removeEventListener("blur", onPerspectivePointerEnd);
        if (JSON.stringify(nextPerspectiveCorners) !== JSON.stringify(initialPerspectiveCorners)) {
          this.options.onComponentProperties?.(startPerspectiveComponent.id, {
            perspectiveCorners: nextPerspectiveCorners
          });
        }
      }
    };
    window.addEventListener("pointermove", onPerspectivePointerMove, true);
    window.addEventListener("pointerup", onPerspectivePointerEnd, true);
    window.addEventListener("pointercancel", onPerspectivePointerEnd, true);
    window.addEventListener("blur", onPerspectivePointerEnd);
  }
  appendAirflowTransformHandles(handleAirflowLayer, handleAirflowComponent) {
    if (!handleAirflowLayer || !handleAirflowComponent) {
      return;
    }
    const createdAirflowOverlay = this.createAirflowSelectionOverlay(
      handleAirflowLayer,
      handleAirflowComponent
    );
    if (!createdAirflowOverlay) {
      return;
    }
    const handleAirflowBounds = document.createElement("div");
    handleAirflowBounds.className = "hb-selection-bounds hb-airflow-selection-bounds";
    for (const airflowCornerPosition of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const airflowCornerMarkerElement = document.createElement("i");
      airflowCornerMarkerElement.className = "hb-corner-marker hb-corner-" + airflowCornerPosition;
      airflowCornerMarkerElement.setAttribute("aria-hidden", "true");
      handleAirflowBounds.append(airflowCornerMarkerElement);
    }
    const airflowResizeHandleElement = document.createElement("button");
    airflowResizeHandleElement.type = "button";
    airflowResizeHandleElement.className = "hb-transform-handle hb-resize-handle";
    airflowResizeHandleElement.title = "拖动缩放出风效果";
    airflowResizeHandleElement.addEventListener("pointerdown", airflowResizeHandlePointerEvent =>
      this.startAirflowScale(
        airflowResizeHandlePointerEvent,
        handleAirflowComponent,
        handleAirflowLayer,
        handleAirflowBounds,
        createdAirflowOverlay
      )
    );
    const airflowRotateHandleElement = document.createElement("button");
    airflowRotateHandleElement.type = "button";
    airflowRotateHandleElement.className = "hb-transform-handle hb-rotate-handle";
    airflowRotateHandleElement.title = "拖动旋转出风效果";
    airflowRotateHandleElement.addEventListener("pointerdown", airflowRotateHandlePointerEvent =>
      this.startAirflowRotate(
        airflowRotateHandlePointerEvent,
        handleAirflowComponent,
        handleAirflowLayer,
        handleAirflowBounds,
        createdAirflowOverlay
      )
    );
    handleAirflowBounds.append(airflowResizeHandleElement, airflowRotateHandleElement);
    handleAirflowBounds.addEventListener("pointerdown", airflowMovePointerEvent =>
      this.startAirflowMove(
        airflowMovePointerEvent,
        handleAirflowComponent,
        handleAirflowLayer,
        handleAirflowBounds,
        createdAirflowOverlay
      )
    );
    createdAirflowOverlay.append(handleAirflowBounds);
    this.updateAirflowHandleScale(handleAirflowComponent, handleAirflowBounds);
  }
  startAirflowMove(
    moveStartPointerEvent,
    movedComponentRecord,
    airflowMoveLayerElement,
    airflowMoveBoundsElement,
    airflowMoveOverlayElement
  ) {
    if (
      moveStartPointerEvent.button !== 0 ||
      moveStartPointerEvent.target.closest(".hb-transform-handle")
    ) {
      return;
    }
    moveStartPointerEvent.preventDefault();
    moveStartPointerEvent.stopPropagation();
    const airflowStartPointerX = moveStartPointerEvent.clientX;
    const airflowStartPointerY = moveStartPointerEvent.clientY;
    const airflowComponentWidthPx = Math.max(
      1,
      Number(movedComponentRecord.position?.width || 100)
    );
    const airflowComponentHeightPx = Math.max(
      1,
      Number(movedComponentRecord.position?.height || 100)
    );
    const airflowInitialOffsetX = Number(movedComponentRecord.properties?.airflowOffsetX ?? -75);
    const airflowInitialOffsetY = Number(movedComponentRecord.properties?.airflowOffsetY ?? 34);
    const airflowOffsetBounds = airflowCanvasOffsetBounds(
      movedComponentRecord,
      this.document?.canvas
    );
    let airflowNextOffsetX = airflowInitialOffsetX;
    let airflowNextOffsetY = airflowInitialOffsetY;
    let airflowAxisLock = "";
    let isAirflowDragFinished = false;
    const airflowPointerId = moveStartPointerEvent.pointerId;
    airflowMoveBoundsElement.setPointerCapture(airflowPointerId);
    const onAirflowPointerMove = airflowMoveEvent => {
      if (airflowMoveEvent.pointerId !== airflowPointerId) {
        return;
      }
      if (
        !airflowMoveBoundsElement.hasPointerCapture?.(airflowPointerId) &&
        airflowMoveBoundsElement.isConnected
      ) {
        try {
          airflowMoveBoundsElement.setPointerCapture(airflowPointerId);
        } catch {}
      }
      let airflowDeltaClientX = airflowMoveEvent.clientX - airflowStartPointerX;
      let airflowDeltaClientY = airflowMoveEvent.clientY - airflowStartPointerY;
      if (airflowMoveEvent.shiftKey) {
        if (!airflowAxisLock && Math.hypot(airflowDeltaClientX, airflowDeltaClientY) >= 1) {
          airflowAxisLock =
            Math.abs(airflowDeltaClientX) >= Math.abs(airflowDeltaClientY)
              ? "horizontal"
              : "vertical";
        }
        if (airflowAxisLock === "horizontal") {
          airflowDeltaClientY = 0;
        }
        if (airflowAxisLock === "vertical") {
          airflowDeltaClientX = 0;
        }
      } else {
        airflowAxisLock = "";
      }
      const airflowScaledDeltaX = airflowDeltaClientX / Math.max(0.001, this.appliedScaleX || 1);
      const airflowScaledDeltaY = airflowDeltaClientY / Math.max(0.001, this.appliedScaleY || 1);
      const airflowLocalDelta = groupedComponentLocalDelta(
        airflowScaledDeltaX,
        airflowScaledDeltaY,
        this.componentParentTransform(movedComponentRecord.id)
      );
      airflowNextOffsetX = Math.max(
        airflowOffsetBounds.minX,
        Math.min(
          airflowOffsetBounds.maxX,
          airflowInitialOffsetX + (airflowLocalDelta.x / airflowComponentWidthPx) * 100
        )
      );
      airflowNextOffsetY = Math.max(
        airflowOffsetBounds.minY,
        Math.min(
          airflowOffsetBounds.maxY,
          airflowInitialOffsetY + (airflowLocalDelta.y / airflowComponentHeightPx) * 100
        )
      );
      movedComponentRecord.properties = {
        ...(movedComponentRecord.properties || {}),
        airflowOffsetX: airflowNextOffsetX,
        airflowOffsetY: airflowNextOffsetY
      };
      this.syncAirflowLayerGeometry(
        airflowMoveLayerElement,
        movedComponentRecord,
        airflowMoveOverlayElement
      );
      this.options.onComponentPropertiesPreview?.(movedComponentRecord.id, {
        airflowOffsetX: airflowNextOffsetX,
        airflowOffsetY: airflowNextOffsetY
      });
    };
    const onAirflowPointerEnd = (airflowEndEvent = null) => {
      if (
        !isAirflowDragFinished &&
        (airflowEndEvent?.pointerId == null || airflowEndEvent.pointerId === airflowPointerId)
      ) {
        isAirflowDragFinished = true;
        window.removeEventListener("pointermove", onAirflowPointerMove, true);
        window.removeEventListener("pointerup", onAirflowPointerEnd, true);
        window.removeEventListener("pointercancel", onAirflowPointerEnd, true);
        window.removeEventListener("blur", onAirflowPointerEnd);
        if (
          airflowNextOffsetX !== airflowInitialOffsetX ||
          airflowNextOffsetY !== airflowInitialOffsetY
        ) {
          this.options.onComponentProperties?.(movedComponentRecord.id, {
            airflowOffsetX: airflowNextOffsetX,
            airflowOffsetY: airflowNextOffsetY
          });
        }
      }
    };
    window.addEventListener("pointermove", onAirflowPointerMove, true);
    window.addEventListener("pointerup", onAirflowPointerEnd, true);
    window.addEventListener("pointercancel", onAirflowPointerEnd, true);
    window.addEventListener("blur", onAirflowPointerEnd);
  }
  updateAirflowHandleScale(airflowHandleComponent, airflowHandleBoundsElement) {
    if (!airflowHandleComponent || !airflowHandleBoundsElement) {
      return;
    }
    const airflowUiScale = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1);
    const airflowHandleScale = Math.max(
      0.01,
      Math.min(5, Number(airflowHandleComponent.properties?.airflowScale || 1))
    );
    const airflowParentWorldScale = this.componentParentTransform(airflowHandleComponent.id).scale;
    const airflowHandleScaleFactor =
      1 / Math.max(0.001, airflowUiScale * airflowHandleScale * airflowParentWorldScale);
    airflowHandleBoundsElement.style.setProperty("--hb-ui-scale", String(airflowHandleScaleFactor));
    airflowHandleBoundsElement.style.setProperty(
      "--hb-handle-outset",
      airflowHandleScaleFactor * 30 + "px"
    );
    const airflowBoundsClientRect = airflowHandleBoundsElement.getBoundingClientRect();
    airflowHandleBoundsElement.classList.toggle(
      "handles-outside",
      airflowBoundsClientRect.width < 132 || airflowBoundsClientRect.height < 112
    );
  }
  startAirflowScale(
    airflowScalePointerEvent,
    airflowScaleComponentRecord,
    airflowScaleLayerElement,
    airflowScaleBoundsElement,
    airflowScaleOverlayElement
  ) {
    airflowScalePointerEvent.preventDefault();
    airflowScalePointerEvent.stopPropagation();
    const airflowScaleBoundsRect = airflowScaleBoundsElement.getBoundingClientRect();
    const airflowScaleCenterX = airflowScaleBoundsRect.left + airflowScaleBoundsRect.width / 2;
    const airflowScaleCenterY = airflowScaleBoundsRect.top + airflowScaleBoundsRect.height / 2;
    const airflowScaleStartDistancePx = Math.max(
      1,
      Math.hypot(
        airflowScalePointerEvent.clientX - airflowScaleCenterX,
        airflowScalePointerEvent.clientY - airflowScaleCenterY
      )
    );
    const airflowInitialScale = Math.max(
      0.01,
      Math.min(5, Number(airflowScaleComponentRecord.properties?.airflowScale || 1))
    );
    let airflowNextScale = airflowInitialScale;
    let isAirflowScaleFinished = false;
    const airflowScaleCaptureElement = airflowScalePointerEvent.currentTarget;
    airflowScaleCaptureElement.setPointerCapture(airflowScalePointerEvent.pointerId);
    const syncAirflowScaleGeometry = () => {
      this.syncAirflowLayerGeometry(
        airflowScaleLayerElement,
        airflowScaleComponentRecord,
        airflowScaleOverlayElement
      );
      this.updateAirflowHandleScale(airflowScaleComponentRecord, airflowScaleBoundsElement);
    };
    const onAirflowScalePointerMove = airflowScaleMoveEvent => {
      const airflowScaleMoveDistancePx = Math.hypot(
        airflowScaleMoveEvent.clientX - airflowScaleCenterX,
        airflowScaleMoveEvent.clientY - airflowScaleCenterY
      );
      airflowNextScale = Math.max(
        0.01,
        Math.min(
          5,
          (airflowInitialScale * airflowScaleMoveDistancePx) / airflowScaleStartDistancePx
        )
      );
      airflowScaleComponentRecord.properties = {
        ...(airflowScaleComponentRecord.properties || {}),
        airflowScale: airflowNextScale
      };
      syncAirflowScaleGeometry();
      this.options.onComponentPropertiesPreview?.(airflowScaleComponentRecord.id, {
        airflowScale: airflowNextScale
      });
    };
    const onAirflowScalePointerEnd = () => {
      if (!isAirflowScaleFinished) {
        isAirflowScaleFinished = true;
        airflowScaleCaptureElement.removeEventListener("pointermove", onAirflowScalePointerMove);
        airflowScaleCaptureElement.removeEventListener("pointerup", onAirflowScalePointerEnd);
        airflowScaleCaptureElement.removeEventListener("pointercancel", onAirflowScalePointerEnd);
        airflowScaleCaptureElement.removeEventListener(
          "lostpointercapture",
          onAirflowScalePointerEnd
        );
        if (airflowNextScale !== airflowInitialScale) {
          this.options.onComponentProperties?.(airflowScaleComponentRecord.id, {
            airflowScale: airflowNextScale
          });
        }
      }
    };
    airflowScaleCaptureElement.addEventListener("pointermove", onAirflowScalePointerMove);
    airflowScaleCaptureElement.addEventListener("pointerup", onAirflowScalePointerEnd);
    airflowScaleCaptureElement.addEventListener("pointercancel", onAirflowScalePointerEnd);
    airflowScaleCaptureElement.addEventListener("lostpointercapture", onAirflowScalePointerEnd);
  }
  startAirflowRotate(
    airflowRotatePointerEvent,
    airflowRotateComponentRecord,
    airflowRotateLayerElement,
    airflowRotateBoundsElement,
    airflowRotateOverlayElement
  ) {
    airflowRotatePointerEvent.preventDefault();
    airflowRotatePointerEvent.stopPropagation();
    const airflowRotateBoundsRect = airflowRotateBoundsElement.getBoundingClientRect();
    const airflowRotateCenterX = airflowRotateBoundsRect.left + airflowRotateBoundsRect.width / 2;
    const airflowRotateCenterY = airflowRotateBoundsRect.top + airflowRotateBoundsRect.height / 2;
    const airflowRotateStartAngleRad = Math.atan2(
      airflowRotatePointerEvent.clientY - airflowRotateCenterY,
      airflowRotatePointerEvent.clientX - airflowRotateCenterX
    );
    const airflowInitialRotationDeg = Number(
      airflowRotateComponentRecord.properties?.airflowRotation || 0
    );
    let airflowNextRotationDeg = airflowInitialRotationDeg;
    let isAirflowRotateFinished = false;
    const airflowRotateCaptureElement = airflowRotatePointerEvent.currentTarget;
    airflowRotateCaptureElement.setPointerCapture(airflowRotatePointerEvent.pointerId);
    const onAirflowRotatePointerMove = airflowRotateMoveEvent => {
      const airflowPointerAngleRad = Math.atan2(
        airflowRotateMoveEvent.clientY - airflowRotateCenterY,
        airflowRotateMoveEvent.clientX - airflowRotateCenterX
      );
      airflowNextRotationDeg =
        airflowInitialRotationDeg +
        ((airflowPointerAngleRad - airflowRotateStartAngleRad) * 180) / Math.PI;
      airflowRotateComponentRecord.properties = {
        ...(airflowRotateComponentRecord.properties || {}),
        airflowRotation: airflowNextRotationDeg
      };
      this.syncAirflowLayerGeometry(
        airflowRotateLayerElement,
        airflowRotateComponentRecord,
        airflowRotateOverlayElement
      );
      this.options.onComponentPropertiesPreview?.(airflowRotateComponentRecord.id, {
        airflowRotation: airflowNextRotationDeg
      });
    };
    const onAirflowRotatePointerEnd = () => {
      if (!isAirflowRotateFinished) {
        isAirflowRotateFinished = true;
        airflowRotateCaptureElement.removeEventListener("pointermove", onAirflowRotatePointerMove);
        airflowRotateCaptureElement.removeEventListener("pointerup", onAirflowRotatePointerEnd);
        airflowRotateCaptureElement.removeEventListener("pointercancel", onAirflowRotatePointerEnd);
        airflowRotateCaptureElement.removeEventListener(
          "lostpointercapture",
          onAirflowRotatePointerEnd
        );
        if (airflowNextRotationDeg !== airflowInitialRotationDeg) {
          this.options.onComponentProperties?.(airflowRotateComponentRecord.id, {
            airflowRotation: airflowNextRotationDeg
          });
        }
      }
    };
    airflowRotateCaptureElement.addEventListener("pointermove", onAirflowRotatePointerMove);
    airflowRotateCaptureElement.addEventListener("pointerup", onAirflowRotatePointerEnd);
    airflowRotateCaptureElement.addEventListener("pointercancel", onAirflowRotatePointerEnd);
    airflowRotateCaptureElement.addEventListener("lostpointercapture", onAirflowRotatePointerEnd);
  }
  updateAirConditionerButtonSelectionBounds(
    airConditionerHostElement,
    airConditionerRecord,
    airConditionerBoundsElement
  ) {
    if (
      !airConditionerHostElement ||
      airConditionerRecord?.type !== "air-conditioner" ||
      !airConditionerBoundsElement
    ) {
      return;
    }
    const airConditionerProperties = airConditionerRecord.properties || {};
    const airConditionerWidthPx = Math.max(1, Number(airConditionerRecord.position?.width || 100));
    const airConditionerHeightPx = Math.max(
      1,
      Number(airConditionerRecord.position?.height || 100)
    );
    const airConditionerUiScale = Math.max(
      0.01,
      Number(this.document?.canvas?.componentScale || 1)
    );
    const airConditionerRects = [];
    const clampAirConditionerValue = (
      airConditionerRawValue,
      airConditionerMinValue,
      airConditionerMaxValue,
      airConditionerFallbackValue
    ) => {
      const airConditionerNumericValue = Number(airConditionerRawValue);
      return Math.max(
        airConditionerMinValue,
        Math.min(
          airConditionerMaxValue,
          Number.isFinite(airConditionerNumericValue)
            ? airConditionerNumericValue
            : airConditionerFallbackValue
        )
      );
    };
    const pushAirConditionerCenteredRect = (
      airConditionerRectCenterX,
      airConditionerRectCenterY,
      airConditionerRectWidth,
      airConditionerRectHeight
    ) => {
      airConditionerRects.push({
        left: airConditionerRectCenterX - airConditionerRectWidth / 2,
        top: airConditionerRectCenterY - airConditionerRectHeight / 2,
        right: airConditionerRectCenterX + airConditionerRectWidth / 2,
        bottom: airConditionerRectCenterY + airConditionerRectHeight / 2
      });
    };
    const pushAirConditionerTextRect = (
      airConditionerTextElement,
      airConditionerLeftPercent,
      airConditionerTopPercent,
      airConditionerFontHeightPx
    ) => {
      const airConditionerTextWidthPx = Math.max(
        airConditionerFontHeightPx,
        Number(airConditionerTextElement?.offsetWidth || 0) * airConditionerUiScale
      );
      const airConditionerTextHeightPx = Math.max(
        airConditionerFontHeightPx,
        Number(airConditionerTextElement?.offsetHeight || 0) * airConditionerUiScale
      );
      const airConditionerTextCenterX =
        (airConditionerWidthPx *
          clampAirConditionerValue(airConditionerLeftPercent, -100, 200, 0)) /
        100;
      const airConditionerTextCenterY =
        (airConditionerHeightPx *
          clampAirConditionerValue(airConditionerTopPercent, -100, 200, 50)) /
        100;
      airConditionerRects.push({
        left: airConditionerTextCenterX,
        top: airConditionerTextCenterY - airConditionerTextHeightPx / 2,
        right: airConditionerTextCenterX + airConditionerTextWidthPx,
        bottom: airConditionerTextCenterY + airConditionerTextHeightPx / 2
      });
    };
    const airConditionerBadgeSizePx =
      (airConditionerHeightPx *
        clampAirConditionerValue(airConditionerProperties.badgeSize, 1, 100, 28)) /
      100;
    if (airConditionerProperties.iconVisible !== false) {
      pushAirConditionerCenteredRect(
        (airConditionerWidthPx *
          clampAirConditionerValue(airConditionerProperties.iconLeft, -100, 200, 20)) /
          100,
        (airConditionerHeightPx *
          clampAirConditionerValue(airConditionerProperties.iconTop, -100, 200, 50)) /
          100,
        airConditionerBadgeSizePx,
        airConditionerBadgeSizePx
      );
    }
    if (airConditionerProperties.mainTextVisible !== false) {
      pushAirConditionerTextRect(
        airConditionerHostElement.querySelector(
          ":scope > .hb-air-conditioner .hb-air-conditioner-text strong"
        ),
        airConditionerProperties.mainTextLeft,
        airConditionerProperties.mainTextTop,
        (airConditionerHeightPx *
          clampAirConditionerValue(airConditionerProperties.mainSize, 6, 120, 21)) /
          100
      );
    }
    if (airConditionerProperties.secondaryTextVisible !== false) {
      pushAirConditionerTextRect(
        airConditionerHostElement.querySelector(
          ":scope > .hb-air-conditioner .hb-air-conditioner-text small"
        ),
        airConditionerProperties.secondaryTextLeft,
        airConditionerProperties.secondaryTextTop,
        (airConditionerHeightPx *
          clampAirConditionerValue(airConditionerProperties.secondarySize, 5, 80, 12)) /
          100
      );
    }
    if (!airConditionerRects.length) {
      Object.assign(airConditionerBoundsElement.style, {
        left: "0px",
        top: "0px",
        width: airConditionerWidthPx + "px",
        height: airConditionerHeightPx + "px"
      });
      return;
    }
    const airConditionerPaddingPx = 4;
    const airConditionerBoundsLeftPx =
      Math.min(...airConditionerRects.map(airConditionerLeftRect => airConditionerLeftRect.left)) -
      airConditionerPaddingPx;
    const airConditionerBoundsTopPx =
      Math.min(...airConditionerRects.map(airConditionerTopRect => airConditionerTopRect.top)) -
      airConditionerPaddingPx;
    const airConditionerBoundsRightPx =
      Math.max(
        ...airConditionerRects.map(airConditionerRightRect => airConditionerRightRect.right)
      ) + airConditionerPaddingPx;
    const airConditionerBoundsBottomPx =
      Math.max(
        ...airConditionerRects.map(airConditionerBottomRect => airConditionerBottomRect.bottom)
      ) + airConditionerPaddingPx;
    Object.assign(airConditionerBoundsElement.style, {
      left: airConditionerBoundsLeftPx + "px",
      top: airConditionerBoundsTopPx + "px",
      width: Math.max(1, airConditionerBoundsRightPx - airConditionerBoundsLeftPx) + "px",
      height: Math.max(1, airConditionerBoundsBottomPx - airConditionerBoundsTopPx) + "px"
    });
  }
  updateDeviceButtonSelectionBounds(
    deviceButtonHostElement,
    deviceButtonRecord,
    deviceButtonBoundsElement
  ) {
    if (
      !deviceButtonHostElement ||
      deviceButtonRecord?.type !== "device-button" ||
      !deviceButtonBoundsElement
    ) {
      return false;
    }
    const deviceButtonProperties = deviceButtonRecord.properties || {};
    const deviceButtonHiddenContentClickable =
      deviceButtonProperties.hiddenContentClickable === true;
    const deviceButtonWidthPx = Math.max(1, Number(deviceButtonRecord.position?.width || 100));
    const deviceButtonHeightPx = Math.max(1, Number(deviceButtonRecord.position?.height || 100));
    const deviceButtonUiScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1));
    const deviceButtonRects = [];
    const clampDeviceButtonValue = (
      deviceButtonRawValue,
      deviceButtonMinValue,
      deviceButtonMaxValue,
      deviceButtonFallbackValue
    ) => {
      const deviceButtonNumericValue = Number(deviceButtonRawValue);
      return Math.max(
        deviceButtonMinValue,
        Math.min(
          deviceButtonMaxValue,
          Number.isFinite(deviceButtonNumericValue)
            ? deviceButtonNumericValue
            : deviceButtonFallbackValue
        )
      );
    };
    const pushDeviceButtonCenteredRect = (
      deviceButtonRectCenterX,
      deviceButtonRectCenterY,
      deviceButtonRectWidth,
      deviceButtonRectHeight
    ) => {
      if (
        !![
          deviceButtonRectCenterX,
          deviceButtonRectCenterY,
          deviceButtonRectWidth,
          deviceButtonRectHeight
        ].every(Number.isFinite) &&
        !(deviceButtonRectWidth <= 0) &&
        !(deviceButtonRectHeight <= 0)
      ) {
        deviceButtonRects.push({
          left: deviceButtonRectCenterX - deviceButtonRectWidth / 2,
          top: deviceButtonRectCenterY - deviceButtonRectHeight / 2,
          right: deviceButtonRectCenterX + deviceButtonRectWidth / 2,
          bottom: deviceButtonRectCenterY + deviceButtonRectHeight / 2
        });
      }
    };
    const pushDeviceButtonTextRect = (
      deviceButtonTextElement,
      deviceButtonLeftPercent,
      deviceButtonTopPercent,
      deviceButtonFontHeightPx
    ) => {
      const deviceButtonTextWidthPx = Math.max(
        deviceButtonFontHeightPx,
        Number(deviceButtonTextElement?.offsetWidth || 0) * deviceButtonUiScale
      );
      const deviceButtonTextHeightPx = Math.max(
        deviceButtonFontHeightPx,
        Number(deviceButtonTextElement?.offsetHeight || 0) * deviceButtonUiScale
      );
      const deviceButtonTextCenterX =
        (deviceButtonWidthPx * clampDeviceButtonValue(deviceButtonLeftPercent, -100, 200, 0)) / 100;
      const deviceButtonTextCenterY =
        (deviceButtonHeightPx * clampDeviceButtonValue(deviceButtonTopPercent, -100, 200, 50)) /
        100;
      deviceButtonRects.push({
        left: deviceButtonTextCenterX,
        top: deviceButtonTextCenterY - deviceButtonTextHeightPx / 2,
        right: deviceButtonTextCenterX + deviceButtonTextWidthPx,
        bottom: deviceButtonTextCenterY + deviceButtonTextHeightPx / 2
      });
    };
    const deviceButtonBadgeSizePx =
      (deviceButtonHeightPx *
        clampDeviceButtonValue(
          deviceButtonProperties.badgeSize ?? deviceButtonProperties.iconSize,
          1,
          100,
          28
        )) /
      100;
    if (deviceButtonProperties.iconVisible !== false || deviceButtonHiddenContentClickable) {
      pushDeviceButtonCenteredRect(
        (deviceButtonWidthPx *
          clampDeviceButtonValue(deviceButtonProperties.iconLeft, -100, 200, 20)) /
          100,
        (deviceButtonHeightPx *
          clampDeviceButtonValue(deviceButtonProperties.iconTop, -100, 200, 50)) /
          100,
        deviceButtonBadgeSizePx,
        deviceButtonBadgeSizePx
      );
    }
    if (deviceButtonProperties.mainTextVisible !== false || deviceButtonHiddenContentClickable) {
      pushDeviceButtonTextRect(
        deviceButtonHostElement.querySelector(
          ":scope > .hb-icon-button .hb-icon-button-text strong"
        ),
        deviceButtonProperties.mainTextLeft,
        deviceButtonProperties.mainTextTop,
        (deviceButtonHeightPx *
          clampDeviceButtonValue(deviceButtonProperties.mainSize, 6, 120, 21)) /
          100
      );
    }
    if (
      deviceButtonProperties.secondaryTextVisible !== false ||
      deviceButtonHiddenContentClickable
    ) {
      pushDeviceButtonTextRect(
        deviceButtonHostElement.querySelector(
          ":scope > .hb-icon-button .hb-icon-button-text small"
        ),
        deviceButtonProperties.secondaryTextLeft,
        deviceButtonProperties.secondaryTextTop,
        (deviceButtonHeightPx *
          clampDeviceButtonValue(deviceButtonProperties.secondarySize, 5, 80, 12)) /
          100
      );
    }
    if (!deviceButtonRects.length) {
      return false;
    }
    const deviceButtonPaddingPx = 4;
    const deviceButtonBoundsLeftPx =
      Math.min(...deviceButtonRects.map(deviceButtonLeftRect => deviceButtonLeftRect.left)) -
      deviceButtonPaddingPx;
    const deviceButtonBoundsTopPx =
      Math.min(...deviceButtonRects.map(deviceButtonTopRect => deviceButtonTopRect.top)) -
      deviceButtonPaddingPx;
    const deviceButtonBoundsRightPx =
      Math.max(...deviceButtonRects.map(deviceButtonRightRect => deviceButtonRightRect.right)) +
      deviceButtonPaddingPx;
    const deviceButtonBoundsBottomPx =
      Math.max(...deviceButtonRects.map(deviceButtonBottomRect => deviceButtonBottomRect.bottom)) +
      deviceButtonPaddingPx;
    Object.assign(deviceButtonBoundsElement.style, {
      left: deviceButtonBoundsLeftPx + "px",
      top: deviceButtonBoundsTopPx + "px",
      width: Math.max(1, deviceButtonBoundsRightPx - deviceButtonBoundsLeftPx) + "px",
      height: Math.max(1, deviceButtonBoundsBottomPx - deviceButtonBoundsTopPx) + "px"
    });
    return true;
  }
  updateTitleButtonSelectionBounds(
    titleButtonHostElement,
    titleButtonRecord,
    titleButtonBoundsElement
  ) {
    if (
      !titleButtonHostElement ||
      titleButtonRecord?.type !== "title-button" ||
      !titleButtonBoundsElement
    ) {
      return false;
    }
    const titleButtonProperties = titleButtonRecord.properties || {};
    const titleButtonHiddenContentClickable = titleButtonProperties.hiddenContentClickable === true;
    const titleButtonWidthPx = Math.max(1, Number(titleButtonRecord.position?.width || 100));
    const titleButtonHeightPx = Math.max(1, Number(titleButtonRecord.position?.height || 100));
    const titleButtonUiScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1));
    const titleButtonRects = [];
    const pushTitleButtonRect = (
      titleButtonRectLeft,
      titleButtonRectTop,
      titleButtonRectWidth,
      titleButtonRectHeight
    ) => {
      if (
        !![
          titleButtonRectLeft,
          titleButtonRectTop,
          titleButtonRectWidth,
          titleButtonRectHeight
        ].every(Number.isFinite) &&
        !(titleButtonRectWidth <= 0) &&
        !(titleButtonRectHeight <= 0)
      ) {
        titleButtonRects.push({
          left: titleButtonRectLeft,
          top: titleButtonRectTop,
          right: titleButtonRectLeft + titleButtonRectWidth,
          bottom: titleButtonRectTop + titleButtonRectHeight
        });
      }
    };
    const clampTitleButtonValue = (
      titleButtonRawValue,
      titleButtonMinValue,
      titleButtonMaxValue,
      titleButtonFallbackValue
    ) => {
      const titleButtonNumericValue = Number(titleButtonRawValue);
      return Math.max(
        titleButtonMinValue,
        Math.min(
          titleButtonMaxValue,
          Number.isFinite(titleButtonNumericValue)
            ? titleButtonNumericValue
            : titleButtonFallbackValue
        )
      );
    };
    if (titleButtonProperties.frameVisible !== false || titleButtonHiddenContentClickable) {
      const titleButtonFrameScale =
        clampTitleButtonValue(titleButtonProperties.frameSize, 10, 300, 100) / 100;
      const titleButtonFrameHeightPx = titleButtonHeightPx * 0.45 * titleButtonFrameScale;
      const titleButtonFrameCenterX =
        titleButtonWidthPx / 2 +
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.frameOffsetX, -100, 100, 0)) /
          100;
      const titleButtonFrameCenterY =
        titleButtonHeightPx / 2 +
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.frameOffsetY, -100, 100, 0)) /
          100;
      const titleButtonFrameSpacingPx =
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.frameSpacing, 0, 300, 100)) /
        200;
      const titleButtonFrameBarWidthPx = titleButtonHeightPx * 0.12;
      const titleButtonFrameBorderWidthPx = clampTitleButtonValue(
        titleButtonProperties.frameWidth,
        0,
        12,
        1.5
      );
      pushTitleButtonRect(
        titleButtonFrameCenterX - titleButtonFrameSpacingPx - titleButtonFrameBorderWidthPx / 2,
        titleButtonFrameCenterY - titleButtonFrameHeightPx / 2 - titleButtonFrameBorderWidthPx / 2,
        titleButtonFrameBarWidthPx + titleButtonFrameBorderWidthPx,
        titleButtonFrameHeightPx + titleButtonFrameBorderWidthPx
      );
      pushTitleButtonRect(
        titleButtonFrameCenterX +
          titleButtonFrameSpacingPx -
          titleButtonFrameBarWidthPx -
          titleButtonFrameBorderWidthPx / 2,
        titleButtonFrameCenterY - titleButtonFrameHeightPx / 2 - titleButtonFrameBorderWidthPx / 2,
        titleButtonFrameBarWidthPx + titleButtonFrameBorderWidthPx,
        titleButtonFrameHeightPx + titleButtonFrameBorderWidthPx
      );
    }
    if (titleButtonProperties.mainTextVisible !== false || titleButtonHiddenContentClickable) {
      const titleMainTextElement = titleButtonHostElement.querySelector(
        ":scope > .hb-title-button .hb-title-button-main"
      );
      const titleMainFontSizePx =
        (titleButtonHeightPx * clampTitleButtonValue(titleButtonProperties.mainSize, 8, 200, 34)) /
        100;
      pushTitleButtonRect(
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.mainTextLeft, -100, 200, 5.5)) /
          100,
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.mainTextTop, -100, 200, 45)) /
          100 -
          titleMainFontSizePx / 2,
        Math.max(
          titleMainFontSizePx,
          Number(titleMainTextElement?.offsetWidth || 0) * titleButtonUiScale
        ),
        Math.max(
          titleMainFontSizePx,
          Number(titleMainTextElement?.offsetHeight || 0) * titleButtonUiScale
        )
      );
    }
    if (titleButtonProperties.secondaryTextVisible !== false || titleButtonHiddenContentClickable) {
      const titleSecondaryTextElement = titleButtonHostElement.querySelector(
        ":scope > .hb-title-button .hb-title-button-secondary"
      );
      const titleSecondaryFontSizePx =
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.secondarySize, 6, 100, 12)) /
        100;
      const titleSecondaryBlockHeightPx = Math.max(
        titleSecondaryFontSizePx,
        Number(titleSecondaryTextElement?.offsetHeight || 0) * titleButtonUiScale
      );
      pushTitleButtonRect(
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.secondaryTextLeft, -100, 200, 54)) /
          100,
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.secondaryTextTop, -100, 200, 43)) /
          100 -
          titleSecondaryBlockHeightPx / 2,
        Math.max(
          titleSecondaryFontSizePx,
          Number(titleSecondaryTextElement?.offsetWidth || 0) * titleButtonUiScale
        ),
        titleSecondaryBlockHeightPx
      );
    }
    if (
      (titleButtonProperties.iconVisible !== false || titleButtonHiddenContentClickable) &&
      titleButtonProperties.icon
    ) {
      const titleIconSizePx =
        (titleButtonHeightPx * clampTitleButtonValue(titleButtonProperties.iconSize, 1, 100, 30)) /
        100;
      pushTitleButtonRect(
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.iconLeft, -100, 200, 50)) /
          100 -
          titleIconSizePx / 2,
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.iconTop, -100, 200, 45)) /
          100 -
          titleIconSizePx / 2,
        titleIconSizePx,
        titleIconSizePx
      );
    }
    if (titleButtonProperties.markerVisible !== false || titleButtonHiddenContentClickable) {
      const titleMarkerSizePx =
        (titleButtonHeightPx * clampTitleButtonValue(titleButtonProperties.markerSize, 2, 60, 10)) /
        100;
      const titleMarkerCenterX =
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.markerLeft, -100, 200, 1.8)) /
        100;
      const titleMarkerCenterY =
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.markerTop, -100, 200, 84)) /
        100;
      pushTitleButtonRect(
        titleMarkerCenterX - titleMarkerSizePx * 0.58,
        titleMarkerCenterY,
        titleMarkerSizePx * 1.16,
        titleMarkerSizePx
      );
    }
    if (!titleButtonRects.length) {
      return false;
    }
    const titleButtonPaddingPx = 4;
    const titleButtonBoundsLeftPx =
      Math.min(...titleButtonRects.map(titleButtonLeftRect => titleButtonLeftRect.left)) -
      titleButtonPaddingPx;
    const titleButtonBoundsTopPx =
      Math.min(...titleButtonRects.map(titleButtonTopRect => titleButtonTopRect.top)) -
      titleButtonPaddingPx;
    const titleButtonBoundsRightPx =
      Math.max(...titleButtonRects.map(titleButtonRightRect => titleButtonRightRect.right)) +
      titleButtonPaddingPx;
    const titleButtonBoundsBottomPx =
      Math.max(...titleButtonRects.map(titleButtonBottomRect => titleButtonBottomRect.bottom)) +
      titleButtonPaddingPx;
    Object.assign(titleButtonBoundsElement.style, {
      left: titleButtonBoundsLeftPx + "px",
      top: titleButtonBoundsTopPx + "px",
      width: Math.max(1, titleButtonBoundsRightPx - titleButtonBoundsLeftPx) + "px",
      height: Math.max(1, titleButtonBoundsBottomPx - titleButtonBoundsTopPx) + "px"
    });
    return true;
  }
  updateLightStatisticsSelectionBounds(
    statisticsHostElement,
    statisticsRecord,
    statisticsSelectionBoundsElement
  ) {
    if (
      !statisticsHostElement ||
      statisticsRecord?.type !== "light-statistics" ||
      !statisticsSelectionBoundsElement ||
      statisticsHostElement.hidden
    ) {
      return false;
    }
    const statisticsVisualElement = statisticsHostElement.querySelector(
      ":scope > .hb-light-statistics"
    );
    if (!statisticsVisualElement) {
      return false;
    }
    const statisticsVisibleChildren = [...statisticsVisualElement.children].filter(
      statisticsChildElement =>
        statisticsChildElement.hidden ||
        Number(statisticsChildElement.offsetWidth || 0) <= 0 ||
        Number(statisticsChildElement.offsetHeight || 0) <= 0
          ? false
          : window.getComputedStyle?.(statisticsChildElement).display !== "none"
    );
    if (!statisticsVisibleChildren.length) {
      return false;
    }
    const statisticsUiScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1));
    const statisticsPaddingPx = 4;
    const statisticsBoundsLeftPx =
      (Math.min(
        ...statisticsVisibleChildren.map(statisticsLeftChild => statisticsLeftChild.offsetLeft)
      ) -
        statisticsPaddingPx) *
      statisticsUiScale;
    const statisticsBoundsTopPx =
      (Math.min(
        ...statisticsVisibleChildren.map(statisticsTopChild => statisticsTopChild.offsetTop)
      ) -
        statisticsPaddingPx) *
      statisticsUiScale;
    const statisticsBoundsRightPx =
      (Math.max(
        ...statisticsVisibleChildren.map(
          statisticsRightChild => statisticsRightChild.offsetLeft + statisticsRightChild.offsetWidth
        )
      ) +
        statisticsPaddingPx) *
      statisticsUiScale;
    const statisticsBoundsBottomPx =
      (Math.max(
        ...statisticsVisibleChildren.map(
          statisticsBottomChild =>
            statisticsBottomChild.offsetTop + statisticsBottomChild.offsetHeight
        )
      ) +
        statisticsPaddingPx) *
      statisticsUiScale;
    Object.assign(statisticsSelectionBoundsElement.style, {
      left: statisticsBoundsLeftPx + "px",
      top: statisticsBoundsTopPx + "px",
      width: Math.max(1, statisticsBoundsRightPx - statisticsBoundsLeftPx) + "px",
      height: Math.max(1, statisticsBoundsBottomPx - statisticsBoundsTopPx) + "px"
    });
    return true;
  }
  updateTextSelectionBounds(
    selectionTextHostElement,
    selectionTextRecord,
    selectionTextBoundsElement
  ) {
    if (
      !selectionTextHostElement ||
      !["time", "date", "weather"].includes(selectionTextRecord?.type) ||
      !selectionTextBoundsElement
    ) {
      return false;
    } else {
      return this.withSelectionMeasurementHost(selectionTextHostElement, () => {
        const selectionTextVisualElement = selectionTextHostElement.querySelector(
          ":scope > .hb-time-component, :scope > .hb-date-component, :scope > .hb-weather-component"
        );
        if (!selectionTextVisualElement) {
          return false;
        }
        const selectionTextParts = (
          selectionTextRecord.type === "time"
            ? [
                ...selectionTextVisualElement.querySelectorAll(
                  ":scope > .hb-time-value, :scope > .hb-time-period"
                )
              ]
            : selectionTextRecord.type === "date"
              ? [
                  ...selectionTextVisualElement.querySelectorAll(
                    ":scope > .hb-date-primary, :scope > .hb-date-lunar"
                  )
                ]
              : [
                  ...selectionTextVisualElement.querySelectorAll(
                    ":scope > .hb-weather-icon, :scope > .hb-weather-content > strong, :scope > .hb-weather-content > small"
                  )
                ]
        ).filter(selectionTextPart => this.selectionElementIsVisible(selectionTextPart));
        const selectionTextUiScale = Math.max(
          0.01,
          Number(this.document?.canvas?.componentScale || 1)
        );
        const selectionTextWidthPx = Math.max(
          1,
          Number(selectionTextRecord.position?.width || 100)
        );
        const selectionTextHeightPx = Math.max(
          1,
          Number(selectionTextRecord.position?.height || 100)
        );
        if (!selectionTextParts.length) {
          const selectionTextFallbackBoxPx = Math.min(
            32,
            Math.max(20, Math.min(selectionTextWidthPx, selectionTextHeightPx) * 0.2)
          );
          Object.assign(selectionTextBoundsElement.style, {
            left: (selectionTextWidthPx - selectionTextFallbackBoxPx) / 2 + "px",
            top: (selectionTextHeightPx - selectionTextFallbackBoxPx) / 2 + "px",
            width: selectionTextFallbackBoxPx + "px",
            height: selectionTextFallbackBoxPx + "px"
          });
          return false;
        }
        const selectionTextBoxes = selectionTextParts.map(selectionTextPartEntry =>
          this.selectionElementBox(selectionTextPartEntry, selectionTextHostElement)
        );
        const selectionTextPaddingPx = 3;
        const selectionTextBoundsLeftPx =
          (Math.min(...selectionTextBoxes.map(selectionTextLeftBox => selectionTextLeftBox.left)) -
            selectionTextPaddingPx) *
          selectionTextUiScale;
        const selectionTextBoundsTopPx =
          (Math.min(...selectionTextBoxes.map(selectionTextTopBox => selectionTextTopBox.top)) -
            selectionTextPaddingPx) *
          selectionTextUiScale;
        const selectionTextBoundsRightPx =
          (Math.max(
            ...selectionTextBoxes.map(
              selectionTextRightBox => selectionTextRightBox.left + selectionTextRightBox.width
            )
          ) +
            selectionTextPaddingPx) *
          selectionTextUiScale;
        const selectionTextBoundsBottomPx =
          (Math.max(
            ...selectionTextBoxes.map(
              selectionTextBottomBox => selectionTextBottomBox.top + selectionTextBottomBox.height
            )
          ) +
            selectionTextPaddingPx) *
          selectionTextUiScale;
        Object.assign(selectionTextBoundsElement.style, {
          left: selectionTextBoundsLeftPx + "px",
          top: selectionTextBoundsTopPx + "px",
          width: Math.max(1, selectionTextBoundsRightPx - selectionTextBoundsLeftPx) + "px",
          height: Math.max(1, selectionTextBoundsBottomPx - selectionTextBoundsTopPx) + "px"
        });
        return true;
      });
    }
  }
  async updateImageSelectionBounds(imageHostElement, imageRecord, imageBoundsElement) {
    const imageTargetElement = imageHostElement.querySelector(":scope > .hb-image-component");
    if (
      !imageTargetElement ||
      ((!imageTargetElement.complete || !imageTargetElement.naturalWidth) &&
        (await new Promise(imageSettleCallback => {
          imageTargetElement.addEventListener("load", imageSettleCallback, {
            once: true
          });
          imageTargetElement.addEventListener("error", imageSettleCallback, {
            once: true
          });
        })),
      !imageHostElement.isConnected ||
        !imageBoundsElement.isConnected ||
        !imageTargetElement.naturalWidth ||
        !imageTargetElement.naturalHeight)
    ) {
      return;
    }
    const imageWidthPx = Number(imageRecord.position?.width || 100);
    const imageHeightPx = Number(imageRecord.position?.height || 100);
    const imageNaturalAspectRatio =
      imageTargetElement.naturalWidth / imageTargetElement.naturalHeight;
    const imageFrameAspectRatio = imageWidthPx / imageHeightPx;
    const imageRenderWidthPx =
      imageNaturalAspectRatio >= imageFrameAspectRatio
        ? imageWidthPx
        : imageHeightPx * imageNaturalAspectRatio;
    const imageRenderHeightPx =
      imageNaturalAspectRatio >= imageFrameAspectRatio
        ? imageWidthPx / imageNaturalAspectRatio
        : imageHeightPx;
    const imageOffsetLeftPx = (imageWidthPx - imageRenderWidthPx) / 2;
    const imageOffsetTopPx = (imageHeightPx - imageRenderHeightPx) / 2;
    Object.assign(imageBoundsElement.style, {
      left: (imageOffsetLeftPx / imageWidthPx) * 100 + "%",
      top: (imageOffsetTopPx / imageHeightPx) * 100 + "%",
      width: (imageRenderWidthPx / imageWidthPx) * 100 + "%",
      height: (imageRenderHeightPx / imageHeightPx) * 100 + "%"
    });
  }
  updateTransformHandleScale(
    transformScaleHostElement,
    transformComponent,
    transformOverlayElement = null
  ) {
    if (!transformScaleHostElement || !transformComponent) {
      return;
    }
    const appliedComponentScale = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1);
    const elementVisualScale = Math.max(
      0.01,
      Math.min(5, Number(transformComponent.style?.scale || 1))
    );
    const parentTransformScale = this.componentParentTransform(transformComponent.id).scale;
    const inverseHandleScale =
      1 / Math.max(0.001, appliedComponentScale * elementVisualScale * parentTransformScale);
    const transformBoundsElement =
      transformOverlayElement ||
      this.componentSelectionOverlays
        .get(transformComponent.id)
        ?.querySelector(":scope > .hb-selection-bounds") ||
      transformScaleHostElement.querySelector(":scope > .hb-selection-bounds");
    if (!transformBoundsElement) {
      return;
    }
    transformBoundsElement.style.setProperty("--hb-ui-scale", String(inverseHandleScale));
    transformBoundsElement.style.setProperty("--hb-handle-outset", inverseHandleScale * 30 + "px");
    const transformBoundsRect = transformBoundsElement.getBoundingClientRect();
    transformBoundsElement.classList.toggle(
      "handles-outside",
      transformBoundsRect.width < 132 || transformBoundsRect.height < 112
    );
  }
  startComponentScale(
    componentScalePointerEvent,
    scaleTargetRecord,
    scaleTargetHostElement,
    scaleTargetOverlayElement
  ) {
    componentScalePointerEvent.preventDefault();
    componentScalePointerEvent.stopPropagation();
    const scaleOriginRect =
      scaleTargetOverlayElement?.getBoundingClientRect() ||
      scaleTargetHostElement.getBoundingClientRect();
    const scaleOriginCenterX = scaleOriginRect.left + scaleOriginRect.width / 2;
    const scaleOriginCenterY = scaleOriginRect.top + scaleOriginRect.height / 2;
    const componentScaleStartDistancePx = Math.max(
      1,
      Math.hypot(
        componentScalePointerEvent.clientX - scaleOriginCenterX,
        componentScalePointerEvent.clientY - scaleOriginCenterY
      )
    );
    const componentInitialScale = Math.max(
      0.01,
      Math.min(5, Number(scaleTargetRecord.style?.scale || 1))
    );
    let componentNextScale = componentInitialScale;
    let isComponentScaleFinished = false;
    const componentScalePointerId = componentScalePointerEvent.pointerId;
    componentScalePointerEvent.currentTarget.setPointerCapture(componentScalePointerId);
    const onComponentScalePointerMove = componentScaleMoveEvent => {
      if (componentScaleMoveEvent.pointerId !== componentScalePointerId) {
        return;
      }
      const componentScaleMoveDistancePx = Math.hypot(
        componentScaleMoveEvent.clientX - scaleOriginCenterX,
        componentScaleMoveEvent.clientY - scaleOriginCenterY
      );
      componentNextScale = Math.max(
        0.01,
        Math.min(
          5,
          (componentInitialScale * componentScaleMoveDistancePx) / componentScaleStartDistancePx
        )
      );
      scaleTargetRecord.style = {
        ...(scaleTargetRecord.style || {}),
        scale: componentNextScale
      };
      scaleTargetHostElement.style.transform =
        "rotate(" +
        Number(scaleTargetRecord.position?.rotation || 0) +
        "deg) scale(" +
        componentNextScale +
        ")";
      const scaleOverlayLookupElement = this.componentSelectionOverlays.get(scaleTargetRecord.id);
      if (scaleOverlayLookupElement) {
        scaleOverlayLookupElement.style.transform = scaleTargetHostElement.style.transform;
      }
      this.updateTransformHandleScale(
        scaleTargetHostElement,
        scaleTargetRecord,
        scaleTargetOverlayElement
      );
      this.options.onComponentTransformPreview?.(scaleTargetRecord.id, {
        scale: componentNextScale
      });
    };
    const onComponentScalePointerEnd = (componentScaleEndEvent = null) => {
      if (
        !isComponentScaleFinished &&
        (componentScaleEndEvent?.pointerId == null ||
          componentScaleEndEvent.pointerId === componentScalePointerId)
      ) {
        isComponentScaleFinished = true;
        window.removeEventListener("pointermove", onComponentScalePointerMove, true);
        window.removeEventListener("pointerup", onComponentScalePointerEnd, true);
        window.removeEventListener("pointercancel", onComponentScalePointerEnd, true);
        window.removeEventListener("blur", onComponentScalePointerEnd);
        scaleTargetRecord.style = {
          ...(scaleTargetRecord.style || {}),
          scale: componentNextScale
        };
        if (componentNextScale !== componentInitialScale) {
          this.options.onComponentTransform?.(scaleTargetRecord.id, {
            scale: componentNextScale
          });
        }
      }
    };
    window.addEventListener("pointermove", onComponentScalePointerMove, true);
    window.addEventListener("pointerup", onComponentScalePointerEnd, true);
    window.addEventListener("pointercancel", onComponentScalePointerEnd, true);
    window.addEventListener("blur", onComponentScalePointerEnd);
  }
  startComponentRotate(
    componentRotatePointerEvent,
    rotateTargetRecord,
    rotateTargetHostElement,
    rotateTargetOverlayElement
  ) {
    componentRotatePointerEvent.preventDefault();
    componentRotatePointerEvent.stopPropagation();
    const rotateOriginRect =
      rotateTargetOverlayElement?.getBoundingClientRect() ||
      rotateTargetHostElement.getBoundingClientRect();
    const rotateOriginCenterX = rotateOriginRect.left + rotateOriginRect.width / 2;
    const rotateOriginCenterY = rotateOriginRect.top + rotateOriginRect.height / 2;
    const componentRotateStartAngleRad = Math.atan2(
      componentRotatePointerEvent.clientY - rotateOriginCenterY,
      componentRotatePointerEvent.clientX - rotateOriginCenterX
    );
    const componentInitialRotationDeg = Number(rotateTargetRecord.position?.rotation || 0);
    let componentNextRotationDeg = componentInitialRotationDeg;
    let isComponentRotateFinished = false;
    const componentRotatePointerId = componentRotatePointerEvent.pointerId;
    componentRotatePointerEvent.currentTarget.setPointerCapture(componentRotatePointerId);
    const onComponentRotatePointerMove = componentRotateMoveEvent => {
      if (componentRotateMoveEvent.pointerId !== componentRotatePointerId) {
        return;
      }
      const componentPointerAngleRad = Math.atan2(
        componentRotateMoveEvent.clientY - rotateOriginCenterY,
        componentRotateMoveEvent.clientX - rotateOriginCenterX
      );
      componentNextRotationDeg =
        componentInitialRotationDeg +
        ((componentPointerAngleRad - componentRotateStartAngleRad) * 180) / Math.PI;
      rotateTargetHostElement.style.transform =
        "rotate(" +
        componentNextRotationDeg +
        "deg) scale(" +
        Number(rotateTargetRecord.style?.scale || 1) +
        ")";
      const rotateOverlayLookupElement = this.componentSelectionOverlays.get(rotateTargetRecord.id);
      if (rotateOverlayLookupElement) {
        rotateOverlayLookupElement.style.transform = rotateTargetHostElement.style.transform;
      }
      this.options.onComponentTransformPreview?.(rotateTargetRecord.id, {
        rotation: componentNextRotationDeg
      });
    };
    const onComponentRotatePointerEnd = (componentRotateEndEvent = null) => {
      if (
        !isComponentRotateFinished &&
        (componentRotateEndEvent?.pointerId == null ||
          componentRotateEndEvent.pointerId === componentRotatePointerId)
      ) {
        isComponentRotateFinished = true;
        window.removeEventListener("pointermove", onComponentRotatePointerMove, true);
        window.removeEventListener("pointerup", onComponentRotatePointerEnd, true);
        window.removeEventListener("pointercancel", onComponentRotatePointerEnd, true);
        window.removeEventListener("blur", onComponentRotatePointerEnd);
        rotateTargetRecord.position = {
          ...(rotateTargetRecord.position || {}),
          rotation: componentNextRotationDeg
        };
        if (componentNextRotationDeg !== componentInitialRotationDeg) {
          this.options.onComponentTransform?.(rotateTargetRecord.id, {
            rotation: componentNextRotationDeg
          });
        }
      }
    };
    window.addEventListener("pointermove", onComponentRotatePointerMove, true);
    window.addEventListener("pointerup", onComponentRotatePointerEnd, true);
    window.addEventListener("pointercancel", onComponentRotatePointerEnd, true);
    window.addEventListener("blur", onComponentRotatePointerEnd);
  }
  bindRuntimeActions(runtimeActionElement, runtimeActionComponent) {
    let clickResetTimer = null;
    let doubleTapTimer = null;
    let holdTimer = null;
    let isHoldTriggered = false;
    let activePointerState = null;
    let lastTapRecord = null;
    let suppressClickUntilMs = 0;
    let rollbackToggle = null;
    let previousToggleState;
    const tapAction = isSupportedComponentAction(
      runtimeActionComponent,
      runtimeActionComponent.actions?.tap
    )
      ? runtimeActionComponent.actions.tap
      : null;
    const doubleTapAction = isSupportedComponentAction(
      runtimeActionComponent,
      runtimeActionComponent.actions?.doubleTap
    )
      ? runtimeActionComponent.actions.doubleTap
      : null;
    const holdAction = isSupportedComponentAction(
      runtimeActionComponent,
      runtimeActionComponent.actions?.hold
    )
      ? runtimeActionComponent.actions.hold
      : null;
    const isTapActionEnabled = !!tapAction?.type && tapAction.type !== "none";
    const hasDoubleTapAction = !!doubleTapAction?.type && doubleTapAction.type !== "none";
    const hasHoldAction = !!holdAction?.type && holdAction.type !== "none";
    const notifyRuntimeButtonPress = () => {
      this.options.onRuntimeButtonPress?.(runtimeActionElement);
    };
    const applyTapToggleOptimistic = () => {
      if (rollbackToggle || tapAction?.type !== "toggle") {
        return;
      }
      const tapEntityId = runtimeActionComponent.bindings?.entity?.entityId;
      if (tapEntityId && !isVirtualEntityId(tapEntityId)) {
        previousToggleState = this.states.get(
          this.powerEntityId(runtimeActionComponent, tapEntityId)
        );
        rollbackToggle = this.applyOptimisticToggle(tapEntityId, runtimeActionComponent);
      }
    };
    const rollbackOptimisticToggle = () => {
      rollbackToggle?.();
      rollbackToggle = null;
      previousToggleState = undefined;
    };
    const commitTapAction = () => {
      const pendingRollbackToggle = rollbackToggle;
      const pendingPreviousToggleState = previousToggleState;
      rollbackToggle = null;
      previousToggleState = undefined;
      if (isTapActionEnabled) {
        this.runAction(runtimeActionComponent, tapAction, {
          optimisticAlreadyApplied: !!pendingRollbackToggle,
          optimisticRollback: pendingRollbackToggle,
          optimisticPreviousState: pendingPreviousToggleState
        });
      }
    };
    runtimeActionElement.style.touchAction = "manipulation";
    runtimeActionElement.addEventListener("contextmenu", contextMenuEvent =>
      contextMenuEvent.preventDefault()
    );
    runtimeActionElement.addEventListener("selectstart", selectStartEvent =>
      selectStartEvent.preventDefault()
    );
    runtimeActionElement.addEventListener("dragstart", dragStartEvent =>
      dragStartEvent.preventDefault()
    );
    runtimeActionElement.addEventListener("pointerdown", pointerDownEvent => {
      isHoldTriggered = false;
      activePointerState = {
        pointerId: pointerDownEvent.pointerId,
        pointerType: pointerDownEvent.pointerType || "mouse",
        x: pointerDownEvent.clientX,
        y: pointerDownEvent.clientY,
        moved: false
      };
      if (hasHoldAction) {
        holdTimer = window.setTimeout(() => {
          isHoldTriggered = true;
          lastTapRecord = null;
          window.clearTimeout(doubleTapTimer);
          notifyRuntimeButtonPress();
          this.runAction(runtimeActionComponent, holdAction);
        }, 400);
      }
    });
    const clearHoldTimer = () => window.clearTimeout(holdTimer);
    runtimeActionElement.addEventListener("pointermove", pointerMoveEvent => {
      if (
        !!activePointerState &&
        activePointerState.pointerId === pointerMoveEvent.pointerId &&
        !(
          Math.hypot(
            pointerMoveEvent.clientX - activePointerState.x,
            pointerMoveEvent.clientY - activePointerState.y
          ) <= 18
        )
      ) {
        activePointerState.moved = true;
        clearHoldTimer();
      }
    });
    runtimeActionElement.addEventListener("pointerup", pointerUpEvent => {
      clearHoldTimer();
      const completedPointerState =
        activePointerState?.pointerId === pointerUpEvent.pointerId ? activePointerState : null;
      activePointerState = null;
      if (
        !completedPointerState ||
        completedPointerState.pointerType === "mouse" ||
        completedPointerState.moved ||
        isHoldTriggered
      ) {
        return;
      }
      pointerUpEvent.preventDefault();
      suppressClickUntilMs = performance.now() + 700;
      if (isTapActionEnabled || hasDoubleTapAction) {
        notifyRuntimeButtonPress();
      }
      const pointerUpTimeMs = performance.now();
      if (
        hasDoubleTapAction &&
        lastTapRecord &&
        pointerUpTimeMs - lastTapRecord.time <= 180 &&
        Math.hypot(
          pointerUpEvent.clientX - lastTapRecord.x,
          pointerUpEvent.clientY - lastTapRecord.y
        ) <= 34
      ) {
        window.clearTimeout(doubleTapTimer);
        rollbackOptimisticToggle();
        lastTapRecord = null;
        this.runAction(runtimeActionComponent, doubleTapAction);
        return;
      }
      lastTapRecord = {
        time: pointerUpTimeMs,
        x: pointerUpEvent.clientX,
        y: pointerUpEvent.clientY
      };
      if (hasDoubleTapAction) {
        applyTapToggleOptimistic();
        window.clearTimeout(doubleTapTimer);
        doubleTapTimer = window.setTimeout(() => {
          commitTapAction();
          lastTapRecord = null;
        }, 180);
      } else {
        if (isTapActionEnabled) {
          this.runAction(runtimeActionComponent, tapAction);
        }
        lastTapRecord = null;
      }
    });
    runtimeActionElement.addEventListener("pointercancel", () => {
      clearHoldTimer();
      activePointerState = null;
    });
    runtimeActionElement.addEventListener("click", () => {
      if (!(performance.now() < suppressClickUntilMs) && !isHoldTriggered) {
        if (isTapActionEnabled || hasDoubleTapAction) {
          notifyRuntimeButtonPress();
        }
        if (hasDoubleTapAction) {
          applyTapToggleOptimistic();
          window.clearTimeout(clickResetTimer);
          clickResetTimer = window.setTimeout(() => {
            commitTapAction();
          }, 180);
        } else if (isTapActionEnabled) {
          this.runAction(runtimeActionComponent, tapAction);
        }
      }
    });
    runtimeActionElement.addEventListener("dblclick", () => {
      window.clearTimeout(clickResetTimer);
      rollbackOptimisticToggle();
      if (hasDoubleTapAction) {
        this.runAction(runtimeActionComponent, doubleTapAction);
      }
    });
    this.cleanups.push(() => {
      window.clearTimeout(clickResetTimer);
      window.clearTimeout(doubleTapTimer);
      window.clearTimeout(holdTimer);
      rollbackOptimisticToggle();
    });
  }
  runAction(runActionComponent, runActionConfig, runActionOptions = {}) {
    if (!!runActionConfig?.type && runActionConfig.type !== "none") {
      this.dispatchAction(runActionComponent, runActionConfig, runActionOptions).catch(
        runActionError => {
          window.HABridgeLog?.error(runActionError, {
            componentId: runActionComponent.id,
            entityId: runActionComponent.bindings?.entity?.entityId || "",
            phase: "component-action"
          });
          this.options.onError?.(runActionError);
        }
      );
    }
  }
  previewAction(previewActionComponent, previewActionConfig) {
    if (previewActionConfig?.type === "more-info") {
      this.showActionPopup(previewActionComponent, previewActionConfig, {
        preview: true
      });
    }
  }
  popupComponentForEntity(requestedTargetEntityId, popupLabelText = "") {
    let resolvedEntityId = String(requestedTargetEntityId || "");
    let entityDomain = resolvedEntityId.split(".")[0];
    const entityDeviceProfile = this.deviceProfile(resolvedEntityId);
    if (
      entityDeviceProfile?.deviceType === "air-purifier" &&
      entityDeviceProfile.roles?.fan &&
      entityDomain !== "fan"
    ) {
      resolvedEntityId = entityDeviceProfile.roles.fan;
      entityDomain = "fan";
    }
    const climateRoleEntityId =
      entityDeviceProfile?.roles?.climate || entityDeviceProfile?.roles?.fan || "";
    if (
      ["air-conditioner", "bath-heater"].includes(entityDeviceProfile?.deviceType) &&
      climateRoleEntityId &&
      !["climate", "light"].includes(entityDomain)
    ) {
      resolvedEntityId = climateRoleEntityId;
      entityDomain = resolvedEntityId.split(".")[0];
    }
    const metadataRecord = this.entityMetadata.get(resolvedEntityId);
    if (
      entityDomain === "sensor" &&
      metadataRecord?.deviceId &&
      ["state", "status", "task_status"].includes(metadataRecord.translationKey)
    ) {
      const vacuumMetadataRecord = [...this.entityMetadata.values()].find(
        metadataCandidate =>
          metadataCandidate.deviceId === metadataRecord.deviceId &&
          metadataCandidate.domain === "vacuum" &&
          entityMetadataIsAvailable(metadataCandidate)
      );
      if (vacuumMetadataRecord?.entityId) {
        resolvedEntityId = vacuumMetadataRecord.entityId;
        entityDomain = "vacuum";
      }
    }
    const popupComponentType =
      entityDeviceProfile?.deviceType === "electric-bed"
        ? "electric-bed"
        : entityDeviceProfile?.deviceType === "air-purifier" && entityDomain === "fan"
          ? "air-purifier"
          : (["air-conditioner", "bath-heater"].includes(entityDeviceProfile?.deviceType) &&
                ["climate", "fan"].includes(entityDomain)) ||
              entityDomain === "climate"
            ? "air-conditioner"
            : entityDomain === "water_heater"
              ? "water-heater"
              : entityDomain === "camera"
                ? "camera"
                : entityDomain === "media_player"
                  ? "media-player"
                  : ["fan", "select", "number", "input_number"].includes(entityDomain)
                    ? "device-button"
                    : ["light", "switch", "input_boolean"].includes(entityDomain)
                      ? "icon-button"
                      : entityDomain === "sensor"
                        ? "line-chart"
                        : entityDomain === "vacuum"
                          ? "vacuum-control"
                          : "device-button";
    return {
      id: "popup-" + resolvedEntityId,
      type: popupComponentType,
      bindings: {
        entity: {
          entityId: resolvedEntityId
        }
      },
      properties: {
        label: popupLabelText || "",
        ...(["air-conditioner", "bath-heater"].includes(entityDeviceProfile?.deviceType)
          ? {
              deviceType: entityDeviceProfile.deviceType
            }
          : {}),
        ...(entityDeviceProfile?.deviceType === "air-purifier"
          ? {
              deviceType: "air-purifier"
            }
          : {}),
        ...(entityDeviceProfile?.deviceType === "electric-bed"
          ? {
              deviceType: "electric-bed"
            }
          : {}),
        ...(entityDeviceProfile?.coverKind
          ? {
              coverKind: entityDeviceProfile.coverKind
            }
          : {})
      },
      actions: {}
    };
  }
  showActionPopup(popupSourceComponent, popupActionConfig, { preview: popupPreview = false } = {}) {
    const popupSourceKind = popupActionConfig?.data?.popupSource || "current";
    if (popupSourceKind === "custom") {
      const matchedCustomPopup = (this.document?.customPopups || []).find(
        customPopupEntry => customPopupEntry.id === popupActionConfig.data?.popupId
      );
      if (!matchedCustomPopup) {
        throw new Error("选择的组合弹窗不存在。");
      }
      this.showCustomPopup(matchedCustomPopup, {
        preview: popupPreview
      });
      return;
    }
    const sourceEntityId = popupSourceComponent?.bindings?.entity?.entityId;
    const usesSourceComponent =
      String(sourceEntityId || "").split(".", 1)[0] === "cover" ||
      ["camera", "line-chart", "air-conditioner", "icon-button"].includes(
        popupSourceComponent?.type
      );
    let targetPopupComponent =
      popupSourceKind === "entity"
        ? this.popupComponentForEntity(
            popupActionConfig.data?.entityId,
            componentDialogTitle(
              popupSourceComponent,
              popupActionConfig.data?.title || popupActionConfig.data?.entityId
            )
          )
        : usesSourceComponent
          ? popupSourceComponent
          : this.popupComponentForEntity(
              sourceEntityId,
              componentDialogTitle(popupSourceComponent, "")
            );
    if (
      popupSourceKind !== "entity" &&
      targetPopupComponent !== popupSourceComponent &&
      popupSourceComponent?.properties?.relatedEntities
    ) {
      targetPopupComponent = {
        ...targetPopupComponent,
        properties: {
          ...(targetPopupComponent.properties || {}),
          relatedEntities: structuredClone(popupSourceComponent.properties.relatedEntities)
        }
      };
    }
    if (!targetPopupComponent?.bindings?.entity?.entityId) {
      throw new Error("该弹窗没有可用实体。");
    }
    if (targetPopupComponent.type === "camera") {
      this.showCameraPreview(targetPopupComponent, {
        preview: popupPreview
      });
    } else {
      this.showEntityDetails(targetPopupComponent, {
        preview: popupPreview
      });
    }
  }
  async dispatchAction(
    dispatchComponent,
    dispatchConfig,
    {
      optimisticAlreadyApplied: optimisticAlreadyApplied = false,
      optimisticRollback: optimisticRollback = null,
      optimisticPreviousState: optimisticPreviousState
    } = {}
  ) {
    if (dispatchConfig.type === "toggle") {
      const dispatchEntityId = dispatchComponent.bindings?.entity?.entityId;
      if (!dispatchEntityId) {
        throw new Error("该控件没有关联实体。");
      }
      if (isVirtualEntityId(dispatchEntityId)) {
        this.toggleVirtualEntity(dispatchEntityId);
        return;
      }
      const powerTargetEntityId =
        typeof this.powerEntityId == "function"
          ? this.powerEntityId(dispatchComponent, dispatchEntityId)
          : dispatchEntityId;
      const powerTargetDomain = powerTargetEntityId.split(".", 1)[0];
      if (["button", "script"].includes(powerTargetDomain)) {
        const buttonToggleCommand = entityToggleCommand(
          powerTargetEntityId,
          this.states.get(powerTargetEntityId),
          dispatchComponent
        );
        await this.callEntityService(
          buttonToggleCommand.domain,
          buttonToggleCommand.service,
          powerTargetEntityId,
          buttonToggleCommand.data
        );
        return;
      }
      const baseEntityState = optimisticAlreadyApplied
        ? optimisticPreviousState
        : this.states.get(powerTargetEntityId);
      const rollbackToggleAction = optimisticAlreadyApplied
        ? optimisticRollback || (() => {})
        : this.applyOptimisticToggle(powerTargetEntityId, dispatchComponent);
      try {
        if (powerTargetDomain === "cover") {
          const optimisticStatesSnapshot = new Map(this.states);
          if (baseEntityState === undefined) {
            optimisticStatesSnapshot.delete(powerTargetEntityId);
          } else {
            optimisticStatesSnapshot.set(powerTargetEntityId, baseEntityState);
          }
          await this.callEntityService(
            "cover",
            coverToggleServiceForComponent(
              dispatchComponent,
              this.entityMetadata,
              optimisticStatesSnapshot,
              powerTargetEntityId
            ),
            powerTargetEntityId
          );
        } else if (["climate", "fan", "water_heater", "media_player"].includes(powerTargetDomain)) {
          const resolvedPowerComponent =
            typeof this.runtimePowerComponent == "function"
              ? this.runtimePowerComponent(dispatchComponent, dispatchEntityId)
              : dispatchComponent;
          const runtimeToggleCommand = entityToggleCommand(
            powerTargetEntityId,
            baseEntityState,
            resolvedPowerComponent
          );
          await this.callEntityService(
            runtimeToggleCommand.domain,
            runtimeToggleCommand.service,
            powerTargetEntityId,
            runtimeToggleCommand.data
          );
        } else {
          await this.callEntityService("homeassistant", "toggle", powerTargetEntityId);
        }
      } catch (toggleActionError) {
        rollbackToggleAction();
        throw toggleActionError;
      }
      return;
    }
    if (dispatchConfig.type === "more-info") {
      this.showActionPopup(dispatchComponent, dispatchConfig);
      return;
    }
    if (dispatchConfig.type === "navigate") {
      if (
        !dispatchConfig.target ||
        !this.document?.pages?.some(
          documentPageRecord => documentPageRecord.path === dispatchConfig.target
        )
      ) {
        throw new Error("跳转的页面不存在。");
      }
      this.navigate(dispatchConfig.target);
    }
  }
  async callEntityService(serviceDomain, serviceName, serviceEntityId, serviceData = {}) {
    const serviceResponse = await fetch("/api/v1/ha/services/call", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        domain: serviceDomain,
        service: serviceName,
        entityId: serviceEntityId,
        data: serviceData
      }),
      hbLogContext: {
        entityId: serviceEntityId,
        service: serviceDomain + "." + serviceName,
        phase: "device-control"
      }
    });
    if (!serviceResponse.ok) {
      const serviceErrorBody = await serviceResponse.json().catch(() => ({}));
      const entityServiceError = new Error(
        typeof serviceErrorBody.detail == "string"
          ? serviceErrorBody.detail
          : serviceErrorBody.detail?.message || "实体操作失败。"
      );
      throw (
        window.HABridgeLog?.linkError(entityServiceError, serviceResponse) || entityServiceError
      );
    }
  }
  async browseMedia(
    mediaBrowserEntityId,
    mediaContentId = "media-source://",
    mediaContentType = ""
  ) {
    const mediaBrowseResponse = await fetch("/api/v1/ha/media/browse", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        entityId: mediaBrowserEntityId,
        mediaContentId: mediaContentId,
        mediaContentType: mediaContentType
      })
    });
    const mediaBrowseBody = await mediaBrowseResponse.json().catch(() => ({}));
    if (!mediaBrowseResponse.ok) {
      throw new Error(mediaBrowseBody.detail || "媒体目录读取失败。");
    }
    return mediaBrowseBody.result || {};
  }
  createMediaBrowserControl(mediaPlayerEntityId, { preview: mediaBrowserPreview = false } = {}) {
    const mediaBrowserElement = document.createElement("section");
    mediaBrowserElement.className = "hb-media-browser";
    const mediaBrowserTrigger = document.createElement("button");
    mediaBrowserTrigger.type = "button";
    mediaBrowserTrigger.className = "hb-media-browser-trigger";
    mediaBrowserTrigger.innerHTML = '<span aria-hidden="true"></span>';
    mediaBrowserTrigger.setAttribute("aria-label", "选择本地媒体");
    mediaBrowserTrigger.setAttribute("title", "选择本地媒体");
    mediaBrowserTrigger.setAttribute("aria-expanded", "false");
    mediaBrowserTrigger.disabled = mediaBrowserPreview;
    const mediaBrowserPanelElement = document.createElement("div");
    mediaBrowserPanelElement.className = "hb-media-browser-panel";
    mediaBrowserPanelElement.hidden = true;
    const mediaBrowserToolbarElement = document.createElement("div");
    mediaBrowserToolbarElement.className = "hb-media-browser-toolbar";
    const mediaBrowserBackButton = document.createElement("button");
    mediaBrowserBackButton.type = "button";
    mediaBrowserBackButton.className = "hb-media-browser-back";
    mediaBrowserBackButton.textContent = "返回";
    mediaBrowserBackButton.hidden = true;
    const mediaBrowserLocationElement = document.createElement("strong");
    mediaBrowserLocationElement.className = "hb-media-browser-location";
    mediaBrowserLocationElement.textContent = "媒体库";
    const mediaBrowserStatusElement = document.createElement("span");
    mediaBrowserStatusElement.className = "hb-media-browser-status";
    const mediaBrowserCloseButton = document.createElement("button");
    mediaBrowserCloseButton.type = "button";
    mediaBrowserCloseButton.className = "hb-media-browser-close";
    mediaBrowserCloseButton.textContent = "×";
    mediaBrowserCloseButton.setAttribute("aria-label", "关闭媒体选择");
    mediaBrowserToolbarElement.append(
      mediaBrowserBackButton,
      mediaBrowserLocationElement,
      mediaBrowserStatusElement,
      mediaBrowserCloseButton
    );
    const mediaBrowserListElement = document.createElement("div");
    mediaBrowserListElement.className = "hb-media-browser-list";
    mediaBrowserPanelElement.append(mediaBrowserToolbarElement, mediaBrowserListElement);
    mediaBrowserElement.append(mediaBrowserTrigger);
    let mediaCurrentContentId = "media-source://";
    let mediaCurrentContentType = "";
    let mediaHistoryStack = [];
    let isMediaBrowserBusy = false;
    let isMediaBrowserSupported = false;
    const setMediaBrowserStatus = (mediaStatusText = "") => {
      mediaBrowserStatusElement.textContent = mediaStatusText;
    };
    const closeMediaBrowserPanel = () => {
      mediaBrowserPanelElement.hidden = true;
      mediaBrowserTrigger.setAttribute("aria-expanded", "false");
    };
    const setMediaBrowserBusy = mediaBusyValue => {
      isMediaBrowserBusy = !!mediaBusyValue;
      mediaBrowserTrigger.disabled =
        mediaBrowserPreview || isMediaBrowserBusy || !isMediaBrowserSupported;
      mediaBrowserBackButton.disabled = isMediaBrowserBusy;
      mediaBrowserListElement.querySelectorAll("button").forEach(childButton => {
        childButton.disabled = isMediaBrowserBusy;
      });
    };
    const mediaEntryTitle = mediaEntry =>
      String(mediaEntry?.title || mediaEntry?.name || mediaEntry?.media_content_id || "未命名媒体");
    const openMediaDirectory = async (
      mediaContentEntryId,
      mediaContentEntryType = "",
      { pushHistory: pushHistory = true } = {}
    ) => {
      if (!isMediaBrowserBusy && !mediaBrowserPreview && !!isMediaBrowserSupported) {
        setMediaBrowserBusy(true);
        setMediaBrowserStatus("读取中…");
        try {
          const directoryResult = await this.browseMedia(
            mediaPlayerEntityId,
            mediaContentEntryId,
            mediaContentEntryType
          );
          if (pushHistory && mediaCurrentContentId !== mediaContentEntryId) {
            mediaHistoryStack.push({
              id: mediaCurrentContentId,
              type: mediaCurrentContentType,
              title: mediaBrowserLocationElement.textContent
            });
          }
          mediaCurrentContentId = mediaContentEntryId;
          mediaCurrentContentType = mediaContentEntryType || "";
          mediaBrowserLocationElement.textContent = mediaEntryTitle(directoryResult) || "媒体库";
          mediaBrowserBackButton.hidden = mediaHistoryStack.length === 0;
          mediaBrowserListElement.replaceChildren();
          const directoryChildren = Array.isArray(directoryResult?.children)
            ? directoryResult.children
            : [];
          if (!directoryChildren.length) {
            const emptyNoticeElement = document.createElement("p");
            emptyNoticeElement.className = "hb-media-browser-empty";
            emptyNoticeElement.textContent = "此处没有可播放的媒体。";
            mediaBrowserListElement.append(emptyNoticeElement);
          }
          directoryChildren.forEach(directoryChild => {
            const mediaItemElement = document.createElement("div");
            mediaItemElement.className = "hb-media-browser-item";
            const mediaItemTitleElement = document.createElement("span");
            mediaItemTitleElement.className = "hb-media-browser-item-title";
            mediaItemTitleElement.textContent = mediaEntryTitle(directoryChild);
            const mediaItemButton = document.createElement("button");
            mediaItemButton.type = "button";
            const canExpandEntry = !!directoryChild?.can_expand || !!directoryChild?.children;
            const canPlayEntry = !!directoryChild?.can_play;
            mediaItemButton.textContent = canExpandEntry ? "打开" : "播放";
            mediaItemButton.disabled = !canExpandEntry && !canPlayEntry;
            mediaItemButton.addEventListener("click", async () => {
              if (canExpandEntry) {
                await openMediaDirectory(
                  directoryChild.media_content_id,
                  directoryChild.media_content_type || "",
                  {
                    pushHistory: true
                  }
                );
                return;
              }
              if (!!canPlayEntry && !isMediaBrowserBusy) {
                setMediaBrowserBusy(true);
                setMediaBrowserStatus("发送播放…");
                try {
                  await this.callEntityService("media_player", "play_media", mediaPlayerEntityId, {
                    media_content_id: directoryChild.media_content_id,
                    media_content_type: directoryChild.media_content_type || "music"
                  });
                  setMediaBrowserStatus("");
                } catch (playMediaError) {
                  setMediaBrowserStatus(playMediaError.message || "播放失败");
                  this.options.onError?.(playMediaError);
                } finally {
                  setMediaBrowserBusy(false);
                }
              }
            });
            mediaItemElement.append(mediaItemTitleElement, mediaItemButton);
            mediaBrowserListElement.append(mediaItemElement);
          });
          mediaBrowserPanelElement.hidden = false;
          mediaBrowserTrigger.setAttribute("aria-expanded", "true");
          setMediaBrowserStatus(directoryChildren.length ? directoryChildren.length + " 项" : "");
        } catch (browseMediaError) {
          const mediaErrorMessage = String(browseMediaError?.message || "媒体目录读取失败");
          setMediaBrowserStatus(
            mediaErrorMessage.includes("Media directory does not exist")
              ? "此目录暂无媒体"
              : mediaErrorMessage
          );
          mediaBrowserListElement.replaceChildren();
          const mediaErrorElement = document.createElement("p");
          mediaErrorElement.className = "hb-media-browser-empty";
          mediaErrorElement.textContent = mediaErrorMessage.includes(
            "Media directory does not exist"
          )
            ? "此目录暂无可用媒体。"
            : mediaErrorMessage;
          mediaBrowserListElement.append(mediaErrorElement);
          mediaBrowserPanelElement.hidden = false;
          mediaBrowserTrigger.setAttribute("aria-expanded", "true");
        } finally {
          setMediaBrowserBusy(false);
        }
      }
    };
    mediaBrowserTrigger.addEventListener("click", () => {
      if (!mediaBrowserPanelElement.hidden) {
        closeMediaBrowserPanel();
        return;
      }
      openMediaDirectory(mediaCurrentContentId, mediaCurrentContentType, {
        pushHistory: false
      });
    });
    mediaBrowserCloseButton.addEventListener("click", closeMediaBrowserPanel);
    mediaBrowserBackButton.addEventListener("click", async () => {
      const mediaHistoryEntry = mediaHistoryStack.pop();
      if (mediaHistoryEntry) {
        await openMediaDirectory(mediaHistoryEntry.id, mediaHistoryEntry.type, {
          pushHistory: false
        });
        mediaBrowserLocationElement.textContent = mediaHistoryEntry.title || "媒体库";
        mediaBrowserBackButton.hidden = mediaHistoryStack.length === 0;
      }
    });
    return {
      root: mediaBrowserElement,
      panel: mediaBrowserPanelElement,
      sync: mediaBrowserEntityState => {
        isMediaBrowserSupported = !!(
          Number(mediaBrowserEntityState?.attributes?.supported_features || 0) & 512
        );
        mediaBrowserElement.hidden = !isMediaBrowserSupported;
        if (!isMediaBrowserSupported) {
          closeMediaBrowserPanel();
        }
        mediaBrowserTrigger.disabled =
          mediaBrowserPreview || isMediaBrowserBusy || !isMediaBrowserSupported;
      },
      cleanup: () => {
        mediaBrowserElement.remove();
        mediaBrowserPanelElement.remove();
      }
    };
  }
  registerRuntimeDialogScale(dialogLayerElement, dialogElement, designWidthPx, designHeightPx) {
    const usesStableMotion = runtimeDialogUsesStableMotion();
    dialogLayerElement.classList.toggle("hb-runtime-stable-motion", usesStableMotion);
    dialogLayerElement.classList.toggle(
      "hb-runtime-simplified-motion",
      usesStableMotion && dialogElement.classList.contains("hb-custom-popup-dialog")
    );
    const dialogScaleContext = {
      dialogLayer: dialogLayerElement,
      dialog: dialogElement,
      designWidth: Math.max(1, Number(designWidthPx) || 1),
      designHeight: Math.max(1, Number(designHeightPx) || 1),
      fillAvailable:
        dialogElement.dataset.runtimeDialogLayout === "fill" ||
        dialogElement.classList.contains("media-player-details"),
      tightFill: dialogElement.classList.contains("media-player-details"),
      targetOccupancy:
        dialogElement.dataset.runtimeDialogLayout === "compact"
          ? COMPACT_DIALOG_TARGET_OCCUPANCY
          : DEFAULT_DIALOG_TARGET_OCCUPANCY,
      measureFrame: 0,
      layoutObserver: null,
      entranceAnimations: []
    };
    this.runtimeDialogScaleContext = dialogScaleContext;
    dialogElement.classList.add("hb-runtime-scaled-dialog");
    dialogElement.style.width = dialogScaleContext.designWidth + "px";
    dialogElement.style.minWidth = dialogScaleContext.designWidth + "px";
    dialogElement.style.maxWidth = "none";
    dialogElement.style.height = "auto";
    dialogElement.style.minHeight = "0";
    dialogElement.style.maxHeight = "none";
    dialogElement.style.boxSizing = "border-box";
    dialogElement.style.setProperty(
      "--hb-runtime-dialog-design-height",
      dialogScaleContext.designHeight + "px"
    );
    const dialogCardElement = dialogElement.querySelector(":scope > .hb-custom-popup-card");
    if (dialogCardElement) {
      dialogCardElement.style.width = dialogScaleContext.designWidth + "px";
      dialogCardElement.style.minWidth = dialogScaleContext.designWidth + "px";
      dialogCardElement.style.maxWidth = "none";
    }
    this.updateRuntimeDialogScale();
    dialogScaleContext.measureFrame = window.requestAnimationFrame(() => {
      dialogScaleContext.measureFrame = 0;
      if (this.runtimeDialogScaleContext === dialogScaleContext) {
        this.updateRuntimeDialogScale();
        if (dialogElement.open) {
          dialogScaleContext.entranceAnimations = playStableRuntimeDialogEntrance(
            dialogLayerElement,
            dialogElement
          );
        }
      }
    });
    dialogScaleContext.layoutObserver = new ResizeObserver(() => {
      if (
        this.runtimeDialogScaleContext === dialogScaleContext &&
        !dialogScaleContext.measureFrame
      ) {
        dialogScaleContext.measureFrame = window.requestAnimationFrame(() => {
          dialogScaleContext.measureFrame = 0;
          if (this.runtimeDialogScaleContext === dialogScaleContext) {
            this.updateRuntimeDialogScale();
          }
        });
      }
    });
    dialogScaleContext.layoutObserver.observe(dialogElement);
    if (dialogCardElement) {
      dialogScaleContext.layoutObserver.observe(dialogCardElement);
    }
  }
  updateRuntimeDialogScale() {
    const activeDialogScaleContext = this.runtimeDialogScaleContext;
    if (
      !activeDialogScaleContext?.dialog?.isConnected ||
      !activeDialogScaleContext.dialogLayer?.isConnected
    ) {
      return;
    }
    const dialogLayerRect = activeDialogScaleContext.dialogLayer.getBoundingClientRect();
    const dashboardViewportRect = this.viewport?.getBoundingClientRect();
    const viewportMetrics = runtimeDialogViewport({
      layerLeft: dialogLayerRect.left,
      layerTop: dialogLayerRect.top,
      layerWidth:
        dialogLayerRect.width ||
        activeDialogScaleContext.dialogLayer.clientWidth ||
        this.container.clientWidth,
      layerHeight:
        dialogLayerRect.height ||
        activeDialogScaleContext.dialogLayer.clientHeight ||
        this.container.clientHeight,
      dashboardLeft: dashboardViewportRect?.left,
      dashboardTop: dashboardViewportRect?.top,
      dashboardWidth: dashboardViewportRect?.width,
      dashboardHeight: dashboardViewportRect?.height
    });
    const dialogLayerWidthPx = viewportMetrics.width;
    const dialogLayerHeightPx = viewportMetrics.height;
    const measuredDialogWidthPx = Math.max(
      Number(activeDialogScaleContext.dialog.offsetWidth || 0),
      Number(activeDialogScaleContext.dialog.scrollWidth || 0)
    );
    const measuredDialogHeightPx = Math.max(
      Number(activeDialogScaleContext.dialog.offsetHeight || 0),
      Number(activeDialogScaleContext.dialog.scrollHeight || 0)
    );
    const dialogLayoutWidthPx =
      measuredDialogWidthPx > 1 ? measuredDialogWidthPx : activeDialogScaleContext.designWidth;
    const dialogLayoutHeightPx =
      measuredDialogHeightPx > 1 ? measuredDialogHeightPx : activeDialogScaleContext.designHeight;
    const dialogLayoutMetrics = runtimeDialogLayout({
      layerWidth: dialogLayerWidthPx,
      layerHeight: dialogLayerHeightPx,
      layoutWidth: dialogLayoutWidthPx,
      layoutHeight: dialogLayoutHeightPx,
      fillAvailable: activeDialogScaleContext.fillAvailable,
      tightFill: activeDialogScaleContext.tightFill,
      targetOccupancy: activeDialogScaleContext.targetOccupancy
    });
    const dialogScale = dialogLayoutMetrics.scale;
    activeDialogScaleContext.dialog.style.position = "absolute";
    activeDialogScaleContext.dialog.style.inset = "auto";
    activeDialogScaleContext.dialog.style.top = viewportMetrics.centerY + "px";
    activeDialogScaleContext.dialog.style.left = viewportMetrics.centerX + "px";
    activeDialogScaleContext.dialog.style.margin = "0";
    activeDialogScaleContext.dialog.style.transform =
      "translate(-50%, -50%) scale(" + dialogScale + ")";
    activeDialogScaleContext.dialog.style.transformOrigin = "center";
    activeDialogScaleContext.dialog.style.setProperty(
      "--hb-runtime-dialog-scale",
      String(dialogScale)
    );
    activeDialogScaleContext.dialogLayer.dataset.dialogScale = dialogScale.toFixed(4);
    activeDialogScaleContext.dialogLayer.dataset.dialogLayoutWidth = String(
      Math.round(dialogLayoutWidthPx)
    );
    activeDialogScaleContext.dialogLayer.dataset.dialogLayoutHeight = String(
      Math.round(dialogLayoutHeightPx)
    );
    activeDialogScaleContext.dialogLayer.dataset.dialogSafeInset =
      dialogLayoutMetrics.safeInset.toFixed(2);
    activeDialogScaleContext.dialogLayer.dataset.dialogViewportWidth = String(
      Math.round(viewportMetrics.width)
    );
    activeDialogScaleContext.dialogLayer.dataset.dialogViewportHeight = String(
      Math.round(viewportMetrics.height)
    );
  }
  clearRuntimeDialogScale(clearedDialogElement) {
    if (this.runtimeDialogScaleContext?.dialog === clearedDialogElement) {
      window.cancelAnimationFrame(this.runtimeDialogScaleContext.measureFrame || 0);
      this.runtimeDialogScaleContext.layoutObserver?.disconnect();
      for (const entranceAnimation of this.runtimeDialogScaleContext.entranceAnimations || []) {
        entranceAnimation.cancel();
      }
      clearedDialogElement.classList.remove("hb-runtime-scaled-dialog");
      this.runtimeDialogScaleContext = null;
    }
  }
  closeRuntimeDialog(closedDialogElement = this.detailsDialog) {
    if (closedDialogElement) {
      if (closedDialogElement.open) {
        closedDialogElement.close();
      } else {
        closedDialogElement.dispatchEvent(new Event("close"));
      }
      if (closedDialogElement.isConnected) {
        closedDialogElement.remove();
      }
      if (this.detailsDialog === closedDialogElement) {
        this.detailsDialog = null;
      }
      if (this.detailsStateSync?.dialog === closedDialogElement) {
        this.detailsStateSync = null;
      }
    }
  }
  bindRuntimeDialogOutsideDismiss(dismissLayerElement, dismissDialogElement, dismissPanelElement) {
    const dismissAllowedAtMs = performance.now() + 320;
    dismissLayerElement.addEventListener("click", dismissClickEvent => {
      if (!dismissPanelElement.contains(dismissClickEvent.target)) {
        dismissClickEvent.preventDefault();
        dismissClickEvent.stopPropagation();
        if (!(performance.now() < dismissAllowedAtMs)) {
          dismissDialogElement.close();
        }
      }
    });
  }
  openInteraction3dCameraPreview(
    previewCameraComponent,
    previewCloseHandler,
    interaction3dPreviewOptions = {}
  ) {
    this.showCameraPreview(
      {
        id: "camera:" + previewCameraComponent.id,
        type: "camera",
        properties: {
          label: previewCameraComponent.label
        },
        bindings: {
          entity: {
            entityId: previewCameraComponent.entityId
          }
        }
      },
      {
        interaction3d: interaction3dPreviewOptions
      }
    );
    const previewDialogElement = this.detailsDialog;
    previewDialogElement?.addEventListener("close", previewCloseHandler, {
      once: true
    });
    return {
      updateLayout: () => previewDialogElement?.resizeInteraction3d?.(),
      close: () => {
        previewDialogElement?.removeEventListener("close", previewCloseHandler);
        previewDialogElement?.close();
      },
      contains: containedNode => previewDialogElement?.contains(containedNode)
    };
  }
  showCameraPreview(
    cameraPreviewComponent,
    { preview: cameraPreviewMode = false, interaction3d: interaction3dContext = null } = {}
  ) {
    const cameraPreviewEntityId = cameraPreviewComponent.bindings?.entity?.entityId;
    if (!cameraPreviewEntityId) {
      throw new Error("该摄像头控件没有关联实体。");
    }
    this.closeRuntimeDialog();
    const cameraDialogElement = document.createElement("dialog");
    cameraDialogElement.className = "hb-camera-preview-dialog fit-media-ratio";
    cameraDialogElement.dataset.componentId = cameraPreviewComponent.id || "";
    const cameraCardElement = document.createElement("div");
    cameraCardElement.className = "hb-camera-preview-card";
    const cameraHeadingElement = document.createElement("div");
    cameraHeadingElement.className = "hb-camera-preview-heading";
    const cameraTitleRowElement = document.createElement("div");
    const cameraTitleElement = document.createElement("strong");
    cameraTitleElement.textContent = componentDialogTitle(cameraPreviewComponent, "摄像头实时预览");
    const cameraStatusElement = document.createElement("span");
    cameraStatusElement.className = "hb-camera-preview-status";
    cameraStatusElement.textContent = interaction3dContext ? "正在加载画面" : "正在连接";
    cameraStatusElement.classList.add("is-connecting");
    cameraTitleRowElement.append(cameraTitleElement, cameraStatusElement);
    const cameraCloseButton = document.createElement("button");
    cameraCloseButton.type = "button";
    cameraCloseButton.setAttribute("aria-label", "关闭摄像头预览");
    cameraCloseButton.textContent = "×";
    cameraHeadingElement.append(cameraTitleRowElement, cameraCloseButton);
    const cameraDeviceVisualElement = document.createElement("section");
    cameraDeviceVisualElement.className = "hb-camera-device-visual";
    cameraDeviceVisualElement.setAttribute("aria-hidden", "true");
    const cameraDeviceMountElement = document.createElement("i");
    cameraDeviceMountElement.className = "hb-camera-device-mount";
    const cameraDeviceArmElement = document.createElement("i");
    cameraDeviceArmElement.className = "hb-camera-device-arm";
    const cameraDeviceBodyElement = document.createElement("div");
    cameraDeviceBodyElement.className = "hb-camera-device-body";
    const cameraDeviceLensElement = document.createElement("i");
    cameraDeviceLensElement.className = "hb-camera-device-lens";
    const cameraDeviceLedElement = document.createElement("i");
    cameraDeviceLedElement.className = "hb-camera-device-led";
    cameraDeviceBodyElement.append(cameraDeviceLensElement, cameraDeviceLedElement);
    cameraDeviceVisualElement.append(
      cameraDeviceMountElement,
      cameraDeviceArmElement,
      cameraDeviceBodyElement
    );
    let cameraLensTimer = 0;
    let cameraLensAnimation = null;
    let cameraLensOffset = 0;
    const cameraLensTransform = (cameraLensRotationDeg, cameraLensOffsetYPx = 0) =>
      "translateX(-50%) perspective(260px) rotateY(" +
      cameraLensRotationDeg +
      "deg) rotateZ(" +
      cameraLensRotationDeg * 0.035 +
      "deg) translateY(" +
      cameraLensOffsetYPx +
      "px)";
    const startCameraLensAnimation = () => {
      if (!cameraDeviceBodyElement.isConnected) {
        return;
      }
      const cameraLensCandidateOffsets = [-22, -16, -9, -4, 0, 6, 12, 18, 23].filter(
        cameraLensOffsetCandidate => Math.abs(cameraLensOffsetCandidate - cameraLensOffset) >= 7
      );
      const nextCameraLensOffset =
        cameraLensCandidateOffsets[Math.floor(Math.random() * cameraLensCandidateOffsets.length)] ??
        0;
      const cameraLensDirection = Math.sign(nextCameraLensOffset - cameraLensOffset) || 1;
      const cameraLensDistance = Math.abs(nextCameraLensOffset - cameraLensOffset);
      const cameraLensDurationMs = Math.round(430 + cameraLensDistance * 18 + Math.random() * 320);
      const cameraLensOvershootOffset =
        nextCameraLensOffset + cameraLensDirection * (1.4 + Math.random() * 2.2);
      const cameraLensOffsetY = Math.random() * 1.4 - 0.7;
      cameraDeviceLensElement.style.setProperty(
        "--hb-camera-lens-shift",
        (nextCameraLensOffset / 23) * 2.5 + "px"
      );
      cameraLensAnimation?.cancel();
      cameraLensAnimation = cameraDeviceBodyElement.animate(
        [
          {
            transform: cameraLensTransform(cameraLensOffset, 0),
            offset: 0
          },
          {
            transform: cameraLensTransform(cameraLensOvershootOffset, cameraLensOffsetY),
            offset: 0.78
          },
          {
            transform: cameraLensTransform(nextCameraLensOffset, cameraLensOffsetY * 0.35),
            offset: 1
          }
        ],
        {
          duration: cameraLensDurationMs,
          easing: "cubic-bezier(.2,.72,.22,1)",
          fill: "forwards"
        }
      );
      cameraLensAnimation.addEventListener(
        "finish",
        () => {
          cameraLensOffset = nextCameraLensOffset;
          cameraDeviceBodyElement.style.transform = cameraLensTransform(
            cameraLensOffset,
            cameraLensOffsetY * 0.35
          );
          cameraLensAnimation?.cancel();
          cameraLensAnimation = null;
          const cameraLensDelayMs =
            Math.random() < 0.22 ? 180 + Math.random() * 260 : 680 + Math.random() * 1500;
          cameraLensTimer = window.setTimeout(startCameraLensAnimation, cameraLensDelayMs);
        },
        {
          once: true
        }
      );
    };
    if (!interaction3dContext && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      cameraLensTimer = window.setTimeout(startCameraLensAnimation, 620);
    }
    const cameraStageElement = document.createElement("div");
    cameraStageElement.className = "hb-camera-preview-stage";
    cameraStageElement.classList.add("is-connecting");
    const cameraRevealVeilElement = document.createElement("i");
    cameraRevealVeilElement.className = "hb-camera-preview-reveal-veil";
    cameraRevealVeilElement.setAttribute("aria-hidden", "true");
    const cameraScanLineElement = document.createElement("i");
    cameraScanLineElement.className = "hb-camera-preview-scan-line";
    cameraScanLineElement.setAttribute("aria-hidden", "true");
    cameraStageElement.append(cameraRevealVeilElement, cameraScanLineElement);
    const isInteraction3dCamera = !!interaction3dContext;
    const isCameraMediaVisible = cameraPreviewComponent.properties?.mediaVisible !== false;
    cameraStageElement.classList.toggle("is-16-9", !isInteraction3dCamera);
    cameraStageElement.classList.toggle("media-hidden", !isCameraMediaVisible);
    const cameraMediaCleanups = [];
    let isCameraReady = false;
    const handleCameraReady = () => {
      if (!isCameraReady) {
        isCameraReady = true;
        cameraStatusElement.textContent = "实时画面";
        cameraStatusElement.classList.remove("is-connecting", "is-unavailable");
        cameraStatusElement.classList.add("is-live");
        cameraDeviceVisualElement.classList.remove("is-unavailable");
        cameraDeviceVisualElement.classList.add("is-live");
        cameraStageElement.classList.remove("is-connecting", "is-unavailable", "is-revealing");
        cameraStageElement.classList.add("is-ready");
      }
    };
    const handleCameraUnavailable = () => {
      cameraStatusElement.textContent = "画面不可用";
      cameraStatusElement.classList.remove("is-connecting", "is-live");
      cameraStatusElement.classList.add("is-unavailable");
      cameraDeviceVisualElement.classList.remove("is-live");
      cameraDeviceVisualElement.classList.add("is-unavailable");
      cameraStageElement.classList.remove("is-connecting", "is-revealing");
      cameraStageElement.classList.add("is-unavailable");
    };
    let cameraAspectRatio = interaction3dContext
      ? cameraPreviewRatio(cameraPreviewEntityId)
      : 16 / 9;
    const applyCameraPreviewLayout = () => {
      if (interaction3dContext) {
        cameraStageElement.style.aspectRatio = String(cameraAspectRatio);
        cameraDialogElement.resizeInteraction3d?.();
        return;
      }
      const cameraAvailableWidthPx = Math.max(280, this.container.clientWidth - 32);
      const cameraAvailableHeightPx = Math.max(
        180,
        Math.min(625, this.container.clientHeight - 88)
      );
      const cameraResolvedWidthPx = Math.min(
        760,
        cameraAvailableWidthPx,
        cameraAvailableHeightPx * cameraAspectRatio
      );
      const cameraResolvedHeightPx = cameraResolvedWidthPx / cameraAspectRatio;
      cameraDialogElement.style.width = Math.max(280, cameraResolvedWidthPx) + "px";
      cameraStageElement.style.aspectRatio = String(cameraAspectRatio);
      cameraStageElement.style.borderRadius = "16px";
    };
    if (isCameraMediaVisible && !cameraPreviewMode) {
      const cameraLoadingPlaceholder = document.createElement("span");
      cameraLoadingPlaceholder.textContent = "正在载入摄像头实时预览";
      cameraStageElement.append(cameraLoadingPlaceholder);
      const cameraMediaHandle = mountCameraMedia({
        container: cameraStageElement,
        entityId: cameraPreviewEntityId,
        label: cameraTitleElement.textContent,
        objectFit: interaction3dContext ? "contain" : "fill",
        placeholder: cameraLoadingPlaceholder,
        onReady: handleCameraReady,
        onUnavailable: handleCameraUnavailable,
        cleanup: cameraMediaCleanup => cameraMediaCleanups.push(cameraMediaCleanup)
      });
      const applyCameraMediaDimensions = (cameraMediaWidth, cameraMediaHeight) => {
        if (
          !!isInteraction3dCamera &&
          !!Number.isFinite(cameraMediaWidth) &&
          !!Number.isFinite(cameraMediaHeight) &&
          !(cameraMediaWidth <= 0) &&
          !(cameraMediaHeight <= 0)
        ) {
          cameraAspectRatio = cameraMediaWidth / cameraMediaHeight;
          cameraPreviewRatio(cameraPreviewEntityId, cameraAspectRatio);
          applyCameraPreviewLayout();
        }
      };
      const handleCameraVideoMetadata = () =>
        applyCameraMediaDimensions(
          cameraMediaHandle.video.videoWidth,
          cameraMediaHandle.video.videoHeight
        );
      const handleCameraImageLoad = () =>
        applyCameraMediaDimensions(
          cameraMediaHandle.image.naturalWidth,
          cameraMediaHandle.image.naturalHeight
        );
      cameraMediaHandle.video.addEventListener("loadedmetadata", handleCameraVideoMetadata);
      cameraMediaHandle.video.addEventListener("resize", handleCameraVideoMetadata);
      cameraMediaHandle.image.addEventListener("load", handleCameraImageLoad);
      cameraMediaCleanups.push(() =>
        cameraMediaHandle.video.removeEventListener("loadedmetadata", handleCameraVideoMetadata)
      );
      cameraMediaCleanups.push(() =>
        cameraMediaHandle.video.removeEventListener("resize", handleCameraVideoMetadata)
      );
      cameraMediaCleanups.push(() =>
        cameraMediaHandle.image.removeEventListener("load", handleCameraImageLoad)
      );
    } else if (cameraPreviewMode) {
      cameraStatusElement.textContent = "预览模式";
      cameraStatusElement.classList.remove("is-connecting");
      cameraStageElement.classList.remove("is-connecting");
      cameraStageElement.classList.add("is-ready");
      const cameraPreviewPlaceholder = document.createElement("span");
      cameraPreviewPlaceholder.textContent = "预览模式不获取摄像头实时画面";
      cameraStageElement.append(cameraPreviewPlaceholder);
    } else {
      cameraStatusElement.textContent = "画面已隐藏";
      cameraStatusElement.classList.remove("is-connecting");
      cameraStageElement.classList.remove("is-connecting");
      cameraStageElement.classList.add("is-ready");
      const cameraHiddenPlaceholder = document.createElement("span");
      cameraHiddenPlaceholder.textContent = "摄像头画面已隐藏";
      cameraStageElement.append(cameraHiddenPlaceholder);
    }
    window.addEventListener("resize", applyCameraPreviewLayout);
    cameraMediaCleanups.push(() => window.removeEventListener("resize", applyCameraPreviewLayout));
    applyCameraPreviewLayout();
    cameraCardElement.append(
      cameraHeadingElement,
      ...(interaction3dContext ? [] : [cameraDeviceVisualElement]),
      cameraStageElement
    );
    cameraDialogElement.append(cameraCardElement);
    const cameraLayerElement = document.createElement("div");
    cameraLayerElement.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    cameraLayerElement.tabIndex = -1;
    cameraLayerElement.append(cameraDialogElement);
    this.container.append(cameraLayerElement);
    this.detailsDialog = cameraDialogElement;
    if (interaction3dContext) {
      cameraLayerElement.classList.add("i3d-vacuum-dialog-layer");
      cameraDialogElement.classList.add("i3d-vacuum-details", "i3d-camera-details");
      const presentationRootElement = interaction3dContext.root || this.container;
      presentationRootElement.append(cameraLayerElement);
      cameraDialogElement.style.setProperty(
        "--i3d-panel-opacity",
        String(
          Math.max(
            0,
            Math.min(
              100,
              Number.isFinite(interaction3dContext.popupOpacity)
                ? interaction3dContext.popupOpacity
                : 74
            )
          ) / 100
        )
      );
      const applyInteraction3dLayout = () => {
        const presentationLayout = interaction3dContext.getPresentationLayout?.();
        const presentationWidthPx =
          presentationLayout?.width > 0
            ? presentationLayout.width
            : presentationRootElement.clientWidth;
        const presentationHeightPx =
          presentationLayout?.height > 0
            ? presentationLayout.height
            : presentationRootElement.clientHeight;
        const presentationHorizontalScale =
          presentationRootElement.clientWidth / Math.max(1, presentationWidthPx);
        const presentationVerticalScale =
          presentationRootElement.clientHeight / Math.max(1, presentationHeightPx);
        const cameraHeadingHeightPx = () =>
          Math.ceil(
            parseFloat(window.getComputedStyle?.(cameraHeadingElement)?.height) ||
              cameraHeadingElement.offsetHeight ||
              58
          );
        let interaction3dPopupLayout = cameraPopupLayout(
          presentationWidthPx,
          presentationHeightPx,
          cameraAspectRatio,
          cameraHeadingHeightPx()
        );
        cameraDialogElement.style.width = interaction3dPopupLayout.panelWidth + "px";
        interaction3dPopupLayout = cameraPopupLayout(
          presentationWidthPx,
          presentationHeightPx,
          cameraAspectRatio,
          cameraHeadingHeightPx()
        );
        const {
          panelWidth: cameraPanelWidthPx,
          mediaHeight: cameraMediaHeightPx,
          top: cameraPopupTopPx
        } = interaction3dPopupLayout;
        const cameraPopupPlacement = popupPlacement({
          width: presentationWidthPx,
          height: presentationHeightPx,
          panelWidth: cameraPanelWidthPx,
          panelHeight: cameraMediaHeightPx + cameraHeadingHeightPx() + 26,
          defaultScale: 2,
          defaultTop: cameraPopupTopPx,
          settings: interaction3dContext.getPopupLayout?.()
        });
        const cameraPlacedTopPx = cameraPopupPlacement.top * presentationVerticalScale;
        cameraDialogElement.style.width = cameraPanelWidthPx + "px";
        cameraStageElement.style.height = cameraMediaHeightPx + "px";
        cameraDialogElement.style.top = cameraPlacedTopPx + "px";
        cameraDialogElement.style.right =
          cameraPopupPlacement.right * presentationHorizontalScale + "px";
        cameraDialogElement.style.transform =
          "scale(" +
          cameraPopupPlacement.scale * presentationHorizontalScale +
          "," +
          cameraPopupPlacement.scale * presentationVerticalScale +
          ")";
        cameraDialogElement.style.maxHeight =
          Math.max(
            cameraPopupPlacement.custom ? 1 : 100,
            (presentationRootElement.clientHeight -
              cameraPlacedTopPx -
              presentationVerticalScale * 12) /
              Math.max(0.001, cameraPopupPlacement.scale * presentationVerticalScale)
          ) + "px";
      };
      cameraDialogElement.resizeInteraction3d = applyInteraction3dLayout;
      const cameraLayoutObserver = new ResizeObserver(applyInteraction3dLayout);
      cameraLayoutObserver.observe(presentationRootElement);
      cameraLayoutObserver.observe(cameraHeadingElement);
      cameraMediaCleanups.push(() => cameraLayoutObserver.disconnect());
      applyInteraction3dLayout();
    } else {
      this.registerRuntimeDialogScale(cameraLayerElement, cameraDialogElement, 760, 680);
    }
    cameraCloseButton.addEventListener("click", () => cameraDialogElement.close());
    this.bindRuntimeDialogOutsideDismiss(
      cameraLayerElement,
      cameraDialogElement,
      cameraCardElement
    );
    cameraLayerElement.addEventListener("keydown", cameraKeyEvent => {
      if (cameraKeyEvent.key === "Escape") {
        cameraDialogElement.close();
      }
    });
    cameraDialogElement.addEventListener(
      "close",
      () => {
        window.clearTimeout(cameraLensTimer);
        cameraLensAnimation?.cancel();
        for (const cameraTeardownCallback of cameraMediaCleanups.splice(0)) {
          cameraTeardownCallback();
        }
        this.clearRuntimeDialogScale(cameraDialogElement);
        if (this.detailsDialog === cameraDialogElement) {
          this.detailsDialog = null;
        }
        cameraLayerElement.remove();
      },
      {
        once: true
      }
    );
    cameraDialogElement.show();
    cameraDialogElement.resizeInteraction3d?.();
  }
  createCapabilityDetailsControls(
    capabilityEntityId,
    capabilityInitialState,
    {
      interactive: capabilityInteractive = true,
      variant: capabilityVariant = "",
      selectLabel: capabilitySelectLabel = "模式"
    } = {}
  ) {
    const capabilityControlsElement = document.createElement("section");
    capabilityControlsElement.className =
      "hb-capability-details-controls" +
      (capabilityVariant ? " hb-capability-details-controls--" + capabilityVariant : "");
    capabilityControlsElement.inert = !capabilityInteractive;
    const capabilityDomain = String(capabilityEntityId || "").split(".", 1)[0];
    let capabilityState = capabilityInitialState || {
      entityId: capabilityEntityId,
      state: "unknown",
      attributes: {}
    };
    const capabilityClimateDeviceType =
      capabilityDomain === "fan"
        ? resolveClimateDeviceType(
            {
              properties: {}
            },
            capabilityState,
            capabilityEntityId
          )
        : "generic";
    const translationContext = {
      entityId: capabilityEntityId,
      entityMetadata: this.entityMetadata,
      entityTranslations: this.entityTranslations
    };
    const capabilityAttributes = () => capabilityState?.attributes || {};
    const isCapabilityUnavailable = () =>
      ["unknown", "unavailable"].includes(String(capabilityState?.state || "").toLowerCase());
    const capabilityControlEntries = [];
    const hasPowerSwitchControl = ["fan", "switch", "input_boolean"].includes(capabilityDomain);
    const powerSwitchVisual = createSwitchVisual({
      label: "电源",
      interactive: capabilityInteractive,
      compact: capabilityVariant === "air-purifier",
      onToggle: async () => {
        if (!capabilityInteractive || isCapabilityUnavailable()) {
          return;
        }
        const isSwitchOff = String(capabilityState?.state || "").toLowerCase() === "off";
        const switchPreviousState = capabilityState;
        capabilityState = {
          ...capabilityState,
          state: isSwitchOff ? "on" : "off"
        };
        syncCapabilityState(capabilityState);
        try {
          await this.callEntityService(
            capabilityDomain === "fan" ? "fan" : "homeassistant",
            capabilityDomain === "fan" ? (isSwitchOff ? "turn_on" : "turn_off") : "toggle",
            capabilityEntityId
          );
        } catch (powerToggleError) {
          capabilityState = switchPreviousState;
          syncCapabilityState(switchPreviousState);
          this.options.onError?.(powerToggleError);
        }
      }
    });
    powerSwitchVisual.visual.classList.add("hb-capability-power");
    if (hasPowerSwitchControl) {
      capabilityControlsElement.append(powerSwitchVisual.visual);
    }
    const createCapabilityOptionGroup = (
      optionGroupLabel,
      optionGroupValues,
      optionGroupCurrent,
      optionGroupService,
      optionGroupDataKey,
      optionGroupDomain = capabilityDomain
    ) => {
      const normalizedGroupOptions = [
        ...new Set(
          (optionGroupValues || [])
            .map(groupOptionValue => String(groupOptionValue ?? "").trim())
            .filter(Boolean)
        )
      ];
      if (
        !normalizedGroupOptions.length &&
        (!["electric-bed", "electric-bed-memory"].includes(capabilityVariant) ||
          capabilityDomain !== "select")
      ) {
        return;
      }
      const optionGroupElement = document.createElement("section");
      optionGroupElement.className = "hb-capability-option-group";
      const optionGroupTitleElement = document.createElement("strong");
      optionGroupTitleElement.textContent = optionGroupLabel;
      const optionGroupOptionsElement = document.createElement("div");
      optionGroupOptionsElement.className = "hb-capability-options";
      if (
        ["electric-bed", "electric-bed-memory"].includes(capabilityVariant) &&
        capabilityDomain === "select"
      ) {
        const bedSelectWrapperElement = document.createElement("div");
        bedSelectWrapperElement.className = "hb-electric-bed-select";
        const bedSelectTriggerElement = document.createElement("button");
        bedSelectTriggerElement.type = "button";
        bedSelectTriggerElement.className = "hb-electric-bed-select-trigger";
        bedSelectTriggerElement.setAttribute("aria-label", optionGroupLabel);
        bedSelectTriggerElement.setAttribute("aria-haspopup", "listbox");
        bedSelectTriggerElement.setAttribute("aria-expanded", "false");
        const bedSelectValueElement = document.createElement("span");
        const bedSelectChevronElement = document.createElement("i");
        bedSelectChevronElement.setAttribute("aria-hidden", "true");
        bedSelectTriggerElement.append(bedSelectValueElement, bedSelectChevronElement);
        const bedSelectMenuElement = document.createElement("div");
        bedSelectMenuElement.className = "hb-electric-bed-select-menu";
        bedSelectMenuElement.id =
          "hb-bed-select-" +
          String(this.renderNamespace || "runtime").replace(/[^a-z0-9_-]/gi, "-") +
          "-" +
          capabilityEntityId.replace(/[^a-z0-9_-]/gi, "-");
        bedSelectMenuElement.setAttribute("role", "listbox");
        bedSelectMenuElement.setAttribute("popover", "auto");
        bedSelectMenuElement.hidden = true;
        bedSelectTriggerElement.setAttribute("aria-controls", bedSelectMenuElement.id);
        let isBedSelectPending = false;
        const isBedSelectMenuOpen = () => {
          try {
            return bedSelectMenuElement.matches(":popover-open");
          } catch {
            return bedSelectMenuElement.dataset.open === "true";
          }
        };
        const positionBedSelectMenu = () => {
          if (!isBedSelectMenuOpen() && bedSelectMenuElement.hidden) {
            return;
          }
          const bedSelectTriggerRect = bedSelectTriggerElement.getBoundingClientRect();
          const bedSelectViewportWidth = window.innerWidth;
          const bedSelectViewportHeight = window.innerHeight;
          const bedSelectMenuWidthPx = Math.min(
            Math.max(bedSelectTriggerRect.width, 150),
            Math.max(150, bedSelectViewportWidth - 20)
          );
          bedSelectMenuElement.style.width = bedSelectMenuWidthPx + "px";
          bedSelectMenuElement.style.maxHeight =
            Math.min(306, Math.max(96, bedSelectViewportHeight - 20)) + "px";
          const bedSelectMenuHeightPx = Math.min(bedSelectMenuElement.scrollHeight || 0, 306);
          const bedSelectSpaceBelowPx = bedSelectViewportHeight - bedSelectTriggerRect.bottom - 10;
          const bedSelectSpaceAbovePx = bedSelectTriggerRect.top - 10;
          const bedSelectMenuTopPx =
            bedSelectSpaceBelowPx < Math.min(bedSelectMenuHeightPx, 160) &&
            bedSelectSpaceAbovePx > bedSelectSpaceBelowPx
              ? Math.max(10, bedSelectTriggerRect.top - bedSelectMenuHeightPx - 5)
              : Math.min(
                  bedSelectViewportHeight - bedSelectMenuHeightPx - 10,
                  bedSelectTriggerRect.bottom + 5
                );
          bedSelectMenuElement.style.left =
            Math.max(
              10,
              Math.min(
                bedSelectTriggerRect.left,
                bedSelectViewportWidth - bedSelectMenuWidthPx - 10
              )
            ) + "px";
          bedSelectMenuElement.style.top = Math.max(10, bedSelectMenuTopPx) + "px";
        };
        const closeBedSelectMenu = () => {
          if (isBedSelectMenuOpen() && typeof bedSelectMenuElement.hidePopover == "function") {
            bedSelectMenuElement.hidePopover();
          }
          bedSelectMenuElement.hidden = true;
          bedSelectMenuElement.dataset.open = "false";
          bedSelectTriggerElement.setAttribute("aria-expanded", "false");
        };
        const openBedSelectMenu = (shouldFocusBedOption = false) => {
          if (!bedSelectTriggerElement.disabled) {
            bedSelectMenuElement.hidden = false;
            if (typeof bedSelectMenuElement.showPopover == "function") {
              bedSelectMenuElement.showPopover();
            } else {
              bedSelectMenuElement.dataset.open = "true";
            }
            bedSelectTriggerElement.setAttribute("aria-expanded", "true");
            positionBedSelectMenu();
            if (shouldFocusBedOption) {
              (
                bedSelectMenuElement.querySelector('[aria-selected="true"]') ||
                bedSelectMenuElement.querySelector('[role="option"]')
              )?.focus();
            }
          }
        };
        const selectBedOption = async bedOptionValue => {
          if (
            !capabilityInteractive ||
            isBedSelectPending ||
            !bedOptionValue ||
            isCapabilityUnavailable()
          ) {
            return;
          }
          const bedSelectRollbackState = capabilityState;
          isBedSelectPending = true;
          closeBedSelectMenu();
          capabilityState = {
            ...capabilityState,
            state: optionGroupService === "select_option" ? bedOptionValue : capabilityState.state,
            attributes: {
              ...capabilityAttributes(),
              [optionGroupDataKey]: bedOptionValue
            }
          };
          syncCapabilityState(capabilityState);
          try {
            await this.callEntityService(
              optionGroupDomain,
              optionGroupService,
              capabilityEntityId,
              {
                [optionGroupDataKey]: bedOptionValue
              }
            );
          } catch (bedSelectError) {
            capabilityState = bedSelectRollbackState;
            syncCapabilityState(bedSelectRollbackState);
            this.options.onError?.(bedSelectError);
          } finally {
            isBedSelectPending = false;
            syncCapabilityState(capabilityState);
          }
        };
        const renderBedSelectOptions = (bedOptionValues, bedSelectedValue) => {
          bedSelectMenuElement.replaceChildren(
            ...bedOptionValues.map(bedOptionEntry => {
              const bedOptionButton = document.createElement("button");
              bedOptionButton.type = "button";
              bedOptionButton.className = "hb-electric-bed-select-option";
              bedOptionButton.setAttribute("role", "option");
              bedOptionButton.dataset.value = bedOptionEntry;
              bedOptionButton.textContent = bedOptionEntry;
              const isBedOptionSelected = bedOptionEntry === String(bedSelectedValue ?? "");
              bedOptionButton.classList.toggle("active", isBedOptionSelected);
              bedOptionButton.setAttribute("aria-selected", String(isBedOptionSelected));
              bedOptionButton.addEventListener("click", () => selectBedOption(bedOptionEntry));
              return bedOptionButton;
            })
          );
          const bedSelectTriggerLabel = bedOptionValues.includes(String(bedSelectedValue ?? ""))
            ? String(bedSelectedValue)
            : bedOptionValues[0] || "读取中…";
          bedSelectValueElement.textContent = bedSelectTriggerLabel;
          bedSelectValueElement.title = bedSelectTriggerLabel;
        };
        bedSelectTriggerElement.addEventListener("click", () => {
          if (isBedSelectMenuOpen() || bedSelectMenuElement.dataset.open === "true") {
            closeBedSelectMenu();
          } else {
            openBedSelectMenu();
          }
        });
        bedSelectTriggerElement.addEventListener("keydown", bedSelectKeyEvent => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(bedSelectKeyEvent.key)) {
            bedSelectKeyEvent.preventDefault();
            openBedSelectMenu(true);
          }
        });
        bedSelectMenuElement.addEventListener("keydown", bedMenuKeyEvent => {
          const bedOptionButtons = [...bedSelectMenuElement.querySelectorAll('[role="option"]')];
          const bedFocusedOptionIndex = bedOptionButtons.indexOf(document.activeElement);
          if (bedMenuKeyEvent.key === "Escape") {
            bedMenuKeyEvent.preventDefault();
            closeBedSelectMenu();
            bedSelectTriggerElement.focus();
          } else if (bedMenuKeyEvent.key === "ArrowDown" || bedMenuKeyEvent.key === "ArrowUp") {
            bedMenuKeyEvent.preventDefault();
            const bedMoveDirection = bedMenuKeyEvent.key === "ArrowDown" ? 1 : -1;
            bedOptionButtons[
              (bedFocusedOptionIndex + bedMoveDirection + bedOptionButtons.length) %
                bedOptionButtons.length
            ]?.focus();
          } else if (bedMenuKeyEvent.key === "Enter" || bedMenuKeyEvent.key === " ") {
            bedMenuKeyEvent.preventDefault();
            document.activeElement?.click();
          }
        });
        bedSelectMenuElement.addEventListener("toggle", bedToggleEvent => {
          const isBedMenuOpen = bedToggleEvent.newState === "open";
          bedSelectMenuElement.hidden = !isBedMenuOpen;
          bedSelectMenuElement.dataset.open = String(isBedMenuOpen);
          bedSelectTriggerElement.setAttribute("aria-expanded", String(isBedMenuOpen));
          if (isBedMenuOpen) {
            positionBedSelectMenu();
          }
        });
        bedSelectWrapperElement.append(bedSelectTriggerElement, bedSelectMenuElement);
        optionGroupElement.append(optionGroupTitleElement, bedSelectWrapperElement);
        capabilityControlsElement.append(optionGroupElement);
        capabilityControlEntries.push({
          type: "bed-select",
          service: optionGroupService,
          dataKey: optionGroupDataKey,
          trigger: bedSelectTriggerElement,
          menu: bedSelectMenuElement,
          renderOptions: renderBedSelectOptions,
          closeMenu: closeBedSelectMenu,
          isPending: () => isBedSelectPending
        });
        return;
      }
      const modeOptionButtons = [];
      for (const presetModeValue of normalizedGroupOptions) {
        const modeOptionButton = document.createElement("button");
        modeOptionButton.type = "button";
        const airPurifierModeLabels = {
          auto: "自动",
          sleep: "睡眠",
          favorite: "喜爱",
          none: "标准",
          manual: "手动",
          silent: "静音"
        };
        modeOptionButton.textContent =
          capabilityVariant === "air-purifier" && optionGroupLabel === "运行模式"
            ? airPurifierModeLabels[presetModeValue.toLowerCase()] || presetModeValue
            : capabilityDomain === "fan" &&
                capabilityClimateDeviceType === "bath-heater" &&
                optionGroupLabel === "运行模式"
              ? climateModeLabel(presetModeValue, "bath-heater", translationContext)
              : presetModeValue;
        modeOptionButton.dataset.value = presetModeValue;
        modeOptionButton.classList.toggle(
          "active",
          presetModeValue === String(optionGroupCurrent ?? "")
        );
        modeOptionButton.addEventListener("click", async () => {
          if (!capabilityInteractive) {
            return;
          }
          modeOptionButtons.forEach(modeButtonElement => {
            modeButtonElement.disabled = true;
          });
          const modeRollbackState = capabilityState;
          capabilityState = {
            ...capabilityState,
            state: optionGroupService === "select_option" ? presetModeValue : capabilityState.state,
            attributes: {
              ...capabilityAttributes(),
              [optionGroupDataKey]: presetModeValue
            }
          };
          syncCapabilityState(capabilityState);
          try {
            await this.callEntityService(
              optionGroupDomain,
              optionGroupService,
              capabilityEntityId,
              {
                [optionGroupDataKey]: presetModeValue
              }
            );
          } catch (modeOptionError) {
            capabilityState = modeRollbackState;
            syncCapabilityState(modeRollbackState);
            this.options.onError?.(modeOptionError);
          } finally {
            modeOptionButtons.forEach(modeButtonEntry => {
              modeButtonEntry.disabled = false;
            });
          }
        });
        modeOptionButtons.push(modeOptionButton);
        optionGroupOptionsElement.append(modeOptionButton);
      }
      optionGroupElement.append(optionGroupTitleElement, optionGroupOptionsElement);
      capabilityControlsElement.append(optionGroupElement);
      capabilityControlEntries.push({
        type: "options",
        service: optionGroupService,
        dataKey: optionGroupDataKey,
        buttons: modeOptionButtons
      });
    };
    const fanPercentageValue = Number(capabilityAttributes().percentage);
    if (capabilityDomain === "fan" && Number.isFinite(fanPercentageValue)) {
      if (capabilityVariant === "air-purifier") {
        const speedGroupElement = document.createElement("section");
        speedGroupElement.className = "hb-capability-option-group hb-air-purifier-speed-group";
        const speedGroupTitleElement = document.createElement("strong");
        speedGroupTitleElement.textContent = "风速";
        const speedOptionsElement = document.createElement("div");
        speedOptionsElement.className = "hb-capability-options hb-air-purifier-speed-options";
        const speedOptionButtons = [
          {
            label: "低",
            value: 33
          },
          {
            label: "中",
            value: 66
          },
          {
            label: "高",
            value: 100
          }
        ].map(speedOption => {
          const speedOptionButton = document.createElement("button");
          speedOptionButton.type = "button";
          speedOptionButton.textContent = speedOption.label;
          speedOptionButton.dataset.percentage = String(speedOption.value);
          speedOptionButton.addEventListener("click", async () => {
            if (!capabilityInteractive || isCapabilityUnavailable()) {
              return;
            }
            speedOptionButtons.forEach(speedButtonElement => {
              speedButtonElement.disabled = true;
            });
            const speedRollbackState = capabilityState;
            capabilityState = {
              ...capabilityState,
              attributes: {
                ...capabilityAttributes(),
                percentage: speedOption.value
              }
            };
            syncCapabilityState(capabilityState);
            try {
              await this.callEntityService("fan", "set_percentage", capabilityEntityId, {
                percentage: speedOption.value
              });
            } catch (speedOptionError) {
              capabilityState = speedRollbackState;
              syncCapabilityState(speedRollbackState);
              this.options.onError?.(speedOptionError);
            } finally {
              speedOptionButtons.forEach(speedButtonEntry => {
                speedButtonEntry.disabled = false;
              });
            }
          });
          speedOptionsElement.append(speedOptionButton);
          return speedOptionButton;
        });
        speedGroupElement.append(speedGroupTitleElement, speedOptionsElement);
        capabilityControlsElement.append(speedGroupElement);
        capabilityControlEntries.push({
          type: "percentage-options",
          buttons: speedOptionButtons
        });
      } else {
        const percentageRangeGroupElement = document.createElement("section");
        percentageRangeGroupElement.className = "hb-capability-range-group";
        const percentageRangeHeadingElement = document.createElement("div");
        percentageRangeHeadingElement.className = "hb-capability-range-heading";
        const percentageRangeTitleElement = document.createElement("strong");
        percentageRangeTitleElement.textContent = "风速";
        const percentageRangeOutputElement = document.createElement("output");
        percentageRangeHeadingElement.append(
          percentageRangeTitleElement,
          percentageRangeOutputElement
        );
        const percentageRangeInputElement = document.createElement("input");
        percentageRangeInputElement.type = "range";
        percentageRangeInputElement.min = "0";
        percentageRangeInputElement.max = "100";
        percentageRangeInputElement.step = "1";
        percentageRangeInputElement.value = String(fanPercentageValue);
        percentageRangeInputElement.addEventListener("change", async () => {
          if (!capabilityInteractive || isCapabilityUnavailable()) {
            return;
          }
          percentageRangeInputElement.disabled = true;
          const percentageRollbackState = capabilityState;
          const nextFanPercentage = Number(percentageRangeInputElement.value);
          capabilityState = {
            ...capabilityState,
            attributes: {
              ...capabilityAttributes(),
              percentage: nextFanPercentage
            }
          };
          syncCapabilityState(capabilityState);
          try {
            await this.callEntityService("fan", "set_percentage", capabilityEntityId, {
              percentage: nextFanPercentage
            });
          } catch (percentageError) {
            capabilityState = percentageRollbackState;
            syncCapabilityState(percentageRollbackState);
            this.options.onError?.(percentageError);
          } finally {
            percentageRangeInputElement.disabled = false;
          }
        });
        percentageRangeGroupElement.append(
          percentageRangeHeadingElement,
          percentageRangeInputElement
        );
        capabilityControlsElement.append(percentageRangeGroupElement);
        capabilityControlEntries.push({
          type: "range",
          input: percentageRangeInputElement,
          output: percentageRangeOutputElement,
          dataKey: "percentage"
        });
      }
    }
    if (capabilityDomain === "fan") {
      createCapabilityOptionGroup(
        "运行模式",
        capabilityAttributes().preset_modes,
        capabilityAttributes().preset_mode,
        "set_preset_mode",
        "preset_mode"
      );
    }
    if (capabilityDomain === "select") {
      createCapabilityOptionGroup(
        capabilitySelectLabel,
        capabilityAttributes().options,
        capabilityState?.state,
        "select_option",
        "option",
        "select"
      );
    }
    if (["number", "input_number"].includes(capabilityDomain)) {
      const numberMinValue = Number.isFinite(Number(capabilityAttributes().min))
        ? Number(capabilityAttributes().min)
        : 0;
      const numberMaxValue = Number.isFinite(Number(capabilityAttributes().max))
        ? Number(capabilityAttributes().max)
        : 100;
      const numberStepValue =
        Number.isFinite(Number(capabilityAttributes().step)) &&
        Number(capabilityAttributes().step) > 0
          ? Number(capabilityAttributes().step)
          : 1;
      const numberRangeGroupElement = document.createElement("section");
      numberRangeGroupElement.className = "hb-capability-range-group";
      const numberRangeHeadingElement = document.createElement("div");
      numberRangeHeadingElement.className = "hb-capability-range-heading";
      const numberRangeTitleElement = document.createElement("strong");
      numberRangeTitleElement.textContent = capabilityAttributes().unit_of_measurement
        ? "数值（" + capabilityAttributes().unit_of_measurement + "）"
        : "数值";
      const numberRangeOutputElement = document.createElement("output");
      numberRangeHeadingElement.append(numberRangeTitleElement, numberRangeOutputElement);
      const numberRangeInputElement = document.createElement("input");
      numberRangeInputElement.type = "range";
      numberRangeInputElement.min = String(numberMinValue);
      numberRangeInputElement.max = String(numberMaxValue);
      numberRangeInputElement.step = String(numberStepValue);
      numberRangeInputElement.value = String(Number(capabilityState?.state) || numberMinValue);
      numberRangeInputElement.addEventListener("change", async () => {
        if (!capabilityInteractive || isCapabilityUnavailable()) {
          return;
        }
        numberRangeInputElement.disabled = true;
        const numberRollbackState = capabilityState;
        const nextNumberSetting = Number(numberRangeInputElement.value);
        capabilityState = {
          ...capabilityState,
          state: String(nextNumberSetting)
        };
        syncCapabilityState(capabilityState);
        try {
          await this.callEntityService(capabilityDomain, "set_value", capabilityEntityId, {
            value: nextNumberSetting
          });
        } catch (numberRangeError) {
          capabilityState = numberRollbackState;
          syncCapabilityState(numberRollbackState);
          this.options.onError?.(numberRangeError);
        } finally {
          numberRangeInputElement.disabled = false;
        }
      });
      numberRangeGroupElement.append(numberRangeHeadingElement, numberRangeInputElement);
      capabilityControlsElement.append(numberRangeGroupElement);
      capabilityControlEntries.push({
        type: "range",
        input: numberRangeInputElement,
        output: numberRangeOutputElement,
        dataKey: "state"
      });
    }
    function syncCapabilityState(nextCapabilityState) {
      capabilityState = nextCapabilityState || capabilityState;
      const normalizedCapabilityState = String(capabilityState?.state || "").toLowerCase();
      const isCapabilityActive =
        capabilityDomain === "fan"
          ? !["off", "unknown", "unavailable"].includes(normalizedCapabilityState)
          : normalizedCapabilityState === "on";
      const shouldHighlightActiveOption =
        capabilityVariant !== "air-purifier" || isCapabilityActive;
      if (hasPowerSwitchControl) {
        powerSwitchVisual.sync(isCapabilityActive, {
          unavailable: isCapabilityUnavailable()
        });
      }
      for (const controlEntry of capabilityControlEntries) {
        if (controlEntry.type === "options") {
          const activeOptionValue =
            controlEntry.service === "select_option"
              ? capabilityState?.state
              : capabilityAttributes()[controlEntry.dataKey];
          controlEntry.buttons.forEach(optionButtonElement =>
            optionButtonElement.classList.toggle(
              "active",
              shouldHighlightActiveOption &&
                optionButtonElement.dataset.value === String(activeOptionValue ?? "")
            )
          );
        } else if (controlEntry.type === "bed-select") {
          const bedSelectOptionValues = [
            ...new Set(
              (capabilityAttributes().options || [])
                .map(bedOptionValueEntry => String(bedOptionValueEntry ?? "").trim())
                .filter(Boolean)
            )
          ];
          const bedSelectCurrentValue =
            controlEntry.service === "select_option"
              ? capabilityState?.state
              : capabilityAttributes()[controlEntry.dataKey];
          controlEntry.renderOptions(bedSelectOptionValues, bedSelectCurrentValue);
          controlEntry.trigger.disabled =
            !capabilityInteractive ||
            controlEntry.isPending() ||
            !bedSelectOptionValues.length ||
            isCapabilityUnavailable();
          if (controlEntry.trigger.disabled) {
            controlEntry.closeMenu();
          }
        } else if (controlEntry.type === "select") {
          const selectOptionValues = [
            ...new Set(
              (capabilityAttributes().options || [])
                .map(selectOptionValue => String(selectOptionValue ?? "").trim())
                .filter(Boolean)
            )
          ];
          if (selectOptionValues.length) {
            const renderedOptionValues = [...controlEntry.input.options].map(
              optionElement => optionElement.value
            );
            if (
              renderedOptionValues.length !== selectOptionValues.length ||
              renderedOptionValues.some(
                (optionValue, optionIndex) => optionValue !== selectOptionValues[optionIndex]
              )
            ) {
              controlEntry.input.replaceChildren(
                ...selectOptionValues.map(optionValueEntry => {
                  const selectOptionElement = document.createElement("option");
                  selectOptionElement.value = optionValueEntry;
                  selectOptionElement.textContent = optionValueEntry;
                  return selectOptionElement;
                })
              );
            }
          }
          const selectCurrentValue =
            controlEntry.service === "select_option"
              ? capabilityState?.state
              : capabilityAttributes()[controlEntry.dataKey];
          if (
            selectCurrentValue != null &&
            [...controlEntry.input.options].some(
              optionElementEntry => optionElementEntry.value === String(selectCurrentValue)
            )
          ) {
            controlEntry.input.value = String(selectCurrentValue);
          }
          controlEntry.input.disabled =
            !capabilityInteractive || !selectOptionValues.length || isCapabilityUnavailable();
        } else if (controlEntry.type === "percentage-options") {
          const currentFanPercentage = Number(capabilityAttributes().percentage);
          const fanPercentageBucket =
            currentFanPercentage <= 0 || !Number.isFinite(currentFanPercentage)
              ? 0
              : currentFanPercentage <= 49
                ? 33
                : currentFanPercentage <= 82
                  ? 66
                  : 100;
          controlEntry.buttons.forEach(percentageButtonElement =>
            percentageButtonElement.classList.toggle(
              "active",
              shouldHighlightActiveOption &&
                Number(percentageButtonElement.dataset.percentage) === fanPercentageBucket
            )
          );
        } else {
          if (["number", "input_number"].includes(capabilityDomain)) {
            const rangeMinValue = Number.isFinite(Number(capabilityAttributes().min))
              ? Number(capabilityAttributes().min)
              : 0;
            const rangeMaxValue = Number.isFinite(Number(capabilityAttributes().max))
              ? Number(capabilityAttributes().max)
              : 100;
            const rangeStepValue =
              Number.isFinite(Number(capabilityAttributes().step)) &&
              Number(capabilityAttributes().step) > 0
                ? Number(capabilityAttributes().step)
                : 1;
            controlEntry.input.min = String(rangeMinValue);
            controlEntry.input.max = String(rangeMaxValue);
            controlEntry.input.step = String(rangeStepValue);
          }
          const rangeDisplayValue =
            controlEntry.dataKey === "state"
              ? Number(capabilityState?.state)
              : Number(capabilityAttributes()[controlEntry.dataKey]);
          if (Number.isFinite(rangeDisplayValue)) {
            controlEntry.input.value = String(rangeDisplayValue);
          }
          controlEntry.output.textContent = Number.isFinite(rangeDisplayValue)
            ? "" + rangeDisplayValue + (capabilityAttributes().unit_of_measurement || "%")
            : "--";
        }
      }
    }
    capabilityControlsElement.syncCapabilityState = syncCapabilityState;
    capabilityControlsElement.cleanupCapabilityDetails = () => {
      for (const cleanupControlEntry of capabilityControlEntries) {
        cleanupControlEntry.closeMenu?.();
      }
    };
    syncCapabilityState(capabilityState);
    return capabilityControlsElement;
  }
  showCapabilityDetails(
    capabilityDetailsComponent,
    { preview: capabilityDetailsPreview = false, title: capabilityDetailsTitle = "" } = {}
  ) {
    const capabilityDetailsEntityId = capabilityDetailsComponent.bindings?.entity?.entityId;
    if (!capabilityDetailsEntityId) {
      throw new Error("该控件没有关联实体。");
    }
    this.closeRuntimeDialog();
    const capabilityDetailsState = this.states.get(capabilityDetailsEntityId)?.newState ||
      this.states.get(capabilityDetailsEntityId) || {
        entityId: capabilityDetailsEntityId,
        state: "unknown",
        attributes: {}
      };
    const capabilityDetailsProfile = this.deviceProfile(capabilityDetailsEntityId);
    const isAirPurifierCapability = capabilityDetailsProfile?.deviceType === "air-purifier";
    const capabilityDialogElement = document.createElement("dialog");
    capabilityDialogElement.className =
      "hb-entity-details-dialog capability-details" +
      (isAirPurifierCapability ? " air-purifier-details" : "");
    const capabilityCardElement = document.createElement("div");
    capabilityCardElement.className = "hb-entity-details-card";
    const capabilityHeadingElement = document.createElement("div");
    capabilityHeadingElement.className = "hb-entity-details-heading";
    const capabilityTitleRowElement = document.createElement("div");
    const capabilityTitleElement = document.createElement("strong");
    capabilityTitleElement.textContent =
      capabilityDetailsTitle ||
      capabilityDetailsComponent.properties?.label ||
      capabilityDetailsState.attributes?.friendly_name ||
      capabilityDetailsEntityId;
    const capabilityStatusElement = document.createElement("span");
    capabilityStatusElement.textContent =
      capabilityDetailsState.state === "unavailable" ? "当前不可用" : "设备控制";
    capabilityTitleRowElement.append(capabilityTitleElement, capabilityStatusElement);
    const capabilityCloseButton = document.createElement("button");
    capabilityCloseButton.type = "button";
    capabilityCloseButton.textContent = "×";
    capabilityCloseButton.setAttribute("aria-label", "关闭弹窗");
    capabilityHeadingElement.append(capabilityTitleRowElement, capabilityCloseButton);
    const capabilityBodyElement = document.createElement("div");
    capabilityBodyElement.className = "hb-capability-details-body";
    const capabilityControls = this.createCapabilityDetailsControls(
      capabilityDetailsEntityId,
      capabilityDetailsState,
      {
        interactive: !capabilityDetailsPreview,
        variant: isAirPurifierCapability ? "air-purifier" : ""
      }
    );
    capabilityBodyElement.append(capabilityControls);
    capabilityCardElement.append(capabilityHeadingElement, capabilityBodyElement);
    capabilityDialogElement.append(capabilityCardElement);
    const capabilityMetricLabels = {
      pm25: "PM2.5",
      airQuality: "空气质量",
      temperature: "温度",
      humidity: "湿度",
      filterLife: "滤芯寿命"
    };
    const capabilityMetricEntries = isAirPurifierCapability
      ? ["pm25", "airQuality", "temperature", "humidity", "filterLife"]
          .map(metricRole => ({
            role: metricRole,
            id: capabilityDetailsProfile.roles?.[metricRole]
          }))
          .filter(({ id: metricId }) => metricId)
          .map(({ role: metricRoleEntry, id: metricIdEntry }) => ({
            role: metricRoleEntry,
            item: this.entityMetadata.get(metricIdEntry)
          }))
          .filter(
            ({ item: metricMetadataRecord }) =>
              ["sensor", "binary_sensor"].includes(metricMetadataRecord?.domain) &&
              entityMetadataIsAvailable(metricMetadataRecord)
          )
          .slice(0, 5)
      : [];
    const metricValueElementsByEntityId = new Map();
    if (capabilityMetricEntries.length) {
      const capabilityMetricsElement = document.createElement("div");
      capabilityMetricsElement.className = "hb-capability-metrics";
      for (const { role: metricRoleName, item: metricMetadataEntry } of capabilityMetricEntries) {
        const capabilityMetricElement = document.createElement("div");
        capabilityMetricElement.className =
          "hb-capability-metric hb-capability-metric--" + metricRoleName;
        const capabilityMetricLabelElement = document.createElement("small");
        capabilityMetricLabelElement.textContent =
          capabilityMetricLabels[metricRoleName] ||
          metricMetadataEntry.name ||
          metricMetadataEntry.originalName ||
          metricMetadataEntry.entityId;
        const capabilityMetricValueElement = document.createElement("strong");
        capabilityMetricElement.append(capabilityMetricLabelElement, capabilityMetricValueElement);
        capabilityMetricsElement.append(capabilityMetricElement);
        metricValueElementsByEntityId.set(
          metricMetadataEntry.entityId,
          capabilityMetricValueElement
        );
      }
      capabilityBodyElement.prepend(capabilityMetricsElement);
    }
    const capabilityLayerElement = document.createElement("div");
    capabilityLayerElement.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    capabilityLayerElement.tabIndex = -1;
    capabilityLayerElement.append(capabilityDialogElement);
    this.container.append(capabilityLayerElement);
    this.detailsDialog = capabilityDialogElement;
    const syncCapabilityDialogState = nextDetailsState => {
      capabilityControls.syncCapabilityState?.(nextDetailsState);
      capabilityStatusElement.textContent = ["unknown", "unavailable"].includes(
        String(nextDetailsState?.state || "").toLowerCase()
      )
        ? "当前不可用"
        : "设备控制";
    };
    const detailsHandlersByEntityId = new Map([
      [capabilityDetailsEntityId, [syncCapabilityDialogState]]
    ]);
    for (const { item: metricMetadataItem } of capabilityMetricEntries) {
      const syncCapabilityMetricValue = nextMetricState => {
        const metricValueElement = metricValueElementsByEntityId.get(metricMetadataItem.entityId);
        if (metricValueElement) {
          metricValueElement.textContent =
            nextMetricState?.state === "unknown" || nextMetricState?.state === "unavailable"
              ? "--"
              : (
                  (nextMetricState?.state ?? "--") +
                  " " +
                  (nextMetricState?.attributes?.unit_of_measurement || "")
                ).trim();
        }
      };
      syncCapabilityMetricValue(
        this.states.get(metricMetadataItem.entityId)?.newState ||
          this.states.get(metricMetadataItem.entityId)
      );
      detailsHandlersByEntityId.set(metricMetadataItem.entityId, [syncCapabilityMetricValue]);
    }
    this.detailsStateSync = {
      dialog: capabilityDialogElement,
      handlers: detailsHandlersByEntityId
    };
    this.registerRuntimeDialogScale(
      capabilityLayerElement,
      capabilityDialogElement,
      isAirPurifierCapability ? 620 : 560,
      isAirPurifierCapability ? 560 : 500
    );
    capabilityCloseButton.addEventListener("click", () => capabilityDialogElement.close());
    this.bindRuntimeDialogOutsideDismiss(
      capabilityLayerElement,
      capabilityDialogElement,
      capabilityCardElement
    );
    capabilityLayerElement.addEventListener("keydown", capabilityKeyEvent => {
      if (capabilityKeyEvent.key === "Escape") {
        capabilityDialogElement.close();
      }
    });
    capabilityDialogElement.addEventListener(
      "close",
      () => {
        capabilityControls.cleanupCapabilityDetails?.();
        this.clearRuntimeDialogScale(capabilityDialogElement);
        if (this.detailsDialog === capabilityDialogElement) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === capabilityDialogElement) {
          this.detailsStateSync = null;
        }
        capabilityLayerElement.remove();
      },
      {
        once: true
      }
    );
    capabilityDialogElement.show();
  }
  showAirPurifierDetails(
    purifierComponent,
    { preview: purifierPreview = false, title: purifierTitle = "" } = {}
  ) {
    const purifierEntityId = purifierComponent.bindings?.entity?.entityId;
    if (!purifierEntityId) {
      throw new Error("该控件没有关联实体。");
    }
    this.closeRuntimeDialog();
    const purifierDeviceProfile = this.deviceProfile(purifierEntityId);
    const purifierRelatedEntityIds = selectedRelatedEntityIds(purifierComponent);
    let purifierState = this.states.get(purifierEntityId)?.newState ||
      this.states.get(purifierEntityId) || {
        entityId: purifierEntityId,
        state: "unknown",
        attributes: {}
      };
    const purifierDialogElement = document.createElement("dialog");
    purifierDialogElement.className =
      "hb-entity-details-dialog air-purifier-details capability-details";
    const purifierCardElement = document.createElement("div");
    purifierCardElement.className = "hb-entity-details-card";
    const purifierHeadingElement = document.createElement("div");
    purifierHeadingElement.className = "hb-entity-details-heading";
    const purifierTitleRowElement = document.createElement("div");
    const purifierTitleElement = document.createElement("strong");
    purifierTitleElement.textContent =
      purifierTitle ||
      componentDialogTitle(
        purifierComponent,
        purifierState.attributes?.friendly_name || "空气净化器"
      );
    const purifierStatusElement = document.createElement("span");
    purifierTitleRowElement.append(purifierTitleElement, purifierStatusElement);
    const purifierPowerButton = document.createElement("button");
    purifierPowerButton.type = "button";
    purifierPowerButton.className = "hb-air-purifier-visual";
    purifierPowerButton.inert = purifierPreview;
    purifierPowerButton.setAttribute("aria-label", "切换空气净化器电源");
    const purifierAuraElement = document.createElement("i");
    purifierAuraElement.className = "hb-air-purifier-visual-aura";
    const purifierAirflowElement = document.createElement("span");
    purifierAirflowElement.className = "hb-air-purifier-visual-airflow";
    for (let purifierAirflowIndex = 0; purifierAirflowIndex < 4; purifierAirflowIndex += 1) {
      purifierAirflowElement.append(document.createElement("i"));
    }
    const purifierBodyElement = document.createElement("span");
    purifierBodyElement.className = "hb-air-purifier-visual-body";
    const purifierTopElement = document.createElement("i");
    purifierTopElement.className = "hb-air-purifier-visual-top";
    const purifierVentElement = document.createElement("i");
    purifierVentElement.className = "hb-air-purifier-visual-vent";
    const purifierDisplayElement = document.createElement("span");
    purifierDisplayElement.className = "hb-air-purifier-visual-display";
    const purifierDisplayTextElement = document.createElement("strong");
    purifierDisplayElement.append(purifierDisplayTextElement);
    purifierBodyElement.append(purifierTopElement, purifierVentElement, purifierDisplayElement);
    purifierPowerButton.append(purifierAuraElement, purifierAirflowElement, purifierBodyElement);
    const purifierCloseButton = document.createElement("button");
    purifierCloseButton.type = "button";
    purifierCloseButton.textContent = "×";
    purifierCloseButton.setAttribute("aria-label", "关闭弹窗");
    purifierHeadingElement.append(
      purifierTitleRowElement,
      purifierPowerButton,
      purifierCloseButton
    );
    const purifierLayoutElement = document.createElement("div");
    purifierLayoutElement.className = "hb-air-purifier-layout";
    const purifierSummaryElement = document.createElement("section");
    purifierSummaryElement.className = "hb-air-purifier-summary";
    const purifierGaugeWrapElement = document.createElement("div");
    purifierGaugeWrapElement.className = "hb-air-purifier-gauge-wrap";
    const purifierGaugeElement = document.createElement("div");
    purifierGaugeElement.className = "hb-air-purifier-gauge is-quality";
    const purifierGaugeOrbitElement = document.createElement("i");
    purifierGaugeOrbitElement.className = "hb-air-purifier-gauge-orbit";
    const purifierArcCapStartElement = document.createElement("i");
    purifierArcCapStartElement.className = "hb-air-purifier-arc-cap start";
    const purifierArcCapEndElement = document.createElement("i");
    purifierArcCapEndElement.className = "hb-air-purifier-arc-cap end";
    const purifierGaugeContentElement = document.createElement("div");
    purifierGaugeContentElement.className = "hb-air-purifier-gauge-content";
    const purifierGaugeLabelElement = document.createElement("small");
    purifierGaugeLabelElement.textContent = "室内空气质量";
    const purifierGaugeValueRowElement = document.createElement("strong");
    const purifierGaugeValueElement = document.createElement("span");
    const purifierGaugeUnitElement = document.createElement("small");
    purifierGaugeUnitElement.textContent = "";
    const purifierDeviceStatusElement = document.createElement("span");
    purifierDeviceStatusElement.textContent = "设备状态 --";
    purifierGaugeValueRowElement.append(purifierGaugeValueElement, purifierGaugeUnitElement);
    purifierGaugeContentElement.append(
      purifierGaugeLabelElement,
      purifierGaugeValueRowElement,
      purifierDeviceStatusElement
    );
    purifierGaugeElement.append(
      purifierArcCapStartElement,
      purifierArcCapEndElement,
      purifierGaugeContentElement
    );
    purifierGaugeWrapElement.append(purifierGaugeOrbitElement, purifierGaugeElement);
    const purifierSecondaryMetricsElement = document.createElement("div");
    purifierSecondaryMetricsElement.className = "hb-air-purifier-secondary-metrics";
    purifierSummaryElement.append(purifierGaugeWrapElement, purifierSecondaryMetricsElement);
    const purifierControls = this.createCapabilityDetailsControls(purifierEntityId, purifierState, {
      interactive: !purifierPreview,
      variant: "air-purifier"
    });
    const purifierControlsPaneElement = document.createElement("section");
    purifierControlsPaneElement.className = "hb-air-purifier-controls-pane";
    purifierControlsPaneElement.append(purifierControls);
    purifierLayoutElement.append(purifierSummaryElement, purifierControlsPaneElement);
    purifierCardElement.append(purifierHeadingElement, purifierLayoutElement);
    purifierDialogElement.append(purifierCardElement);
    const purifierMetricDefinitions = [
      {
        key: "pm25",
        label: "PM2.5",
        roles: ["pm25"]
      },
      {
        key: "pm10",
        label: "PM10",
        roles: ["pm10"]
      },
      {
        key: "hcho",
        label: "甲醛",
        roles: ["hcho"]
      },
      {
        key: "filter",
        label: "滤芯寿命",
        roles: ["filterLife", "filterLeftTime"]
      },
      {
        key: "temperature",
        label: "温度",
        roles: ["temperature"]
      },
      {
        key: "humidity",
        label: "湿度",
        roles: ["humidity"]
      }
    ]
      .map(rawMetricDefinition => ({
        ...rawMetricDefinition,
        candidates: rawMetricDefinition.roles
          .map(metricRoleToResolve => ({
            role: metricRoleToResolve,
            id: purifierDeviceProfile?.roles?.[metricRoleToResolve]
          }))
          .filter(
            ({ id: candidateId }, candidateIndex, candidateList) =>
              candidateId &&
              candidateList.findIndex(candidateEntry => candidateEntry.id === candidateId) ===
                candidateIndex
          )
          .map(candidateWithMetadata => ({
            ...candidateWithMetadata,
            item: this.entityMetadata.get(candidateWithMetadata.id)
          }))
          .filter(
            ({ item: candidateMetadataRecord }) =>
              candidateMetadataRecord?.domain === "sensor" &&
              entityMetadataIsAvailable(candidateMetadataRecord)
          )
      }))
      .filter(({ candidates: metricCandidates }) => metricCandidates.length);
    const numericStateValue = purifierEntityState => {
      const parsedStateValue = Number(purifierEntityState?.state);
      if (
        ["unknown", "unavailable"].includes(
          String(purifierEntityState?.state || "").toLowerCase()
        ) ||
        !Number.isFinite(parsedStateValue)
      ) {
        return null;
      } else {
        return parsedStateValue;
      }
    };
    const entityStateForCandidate = candidateForMetric =>
      this.states.get(candidateForMetric?.id)?.newState ||
      this.states.get(candidateForMetric?.id) ||
      null;
    const selectMetricCandidate = metricDefinitionInput =>
      metricDefinitionInput.candidates.find(
        selectedCandidate => numericStateValue(entityStateForCandidate(selectedCandidate)) != null
      ) ||
      metricDefinitionInput.candidates[0] ||
      null;
    const secondaryMetricSlots = Array.from(
      {
        length: 3
      },
      () => {
        const secondaryMetricElement = document.createElement("div");
        secondaryMetricElement.className = "hb-air-purifier-secondary-metric";
        const secondaryMetricLabelElement = document.createElement("small");
        const secondaryMetricValueElement = document.createElement("strong");
        secondaryMetricElement.append(secondaryMetricLabelElement, secondaryMetricValueElement);
        purifierSecondaryMetricsElement.append(secondaryMetricElement);
        return {
          item: secondaryMetricElement,
          label: secondaryMetricLabelElement,
          value: secondaryMetricValueElement
        };
      }
    );
    purifierSecondaryMetricsElement.hidden = true;
    const metricUnitLabels = {
      pm25: "μg/m³",
      pm10: "μg/m³",
      hcho: "mg/m³",
      filterLife: "%",
      filterLeftTime: "h",
      temperature: "°C",
      humidity: "%"
    };
    const formatMetricDisplay = (metricEntityState, metricUnitRole) => {
      if (
        ["unknown", "unavailable"].includes(String(metricEntityState?.state || "").toLowerCase())
      ) {
        return "--";
      }
      const timeUnitLabels = {
        hours: "小时",
        hour: "小时",
        days: "天",
        day: "天"
      };
      const rawUnitLabel =
        metricEntityState?.attributes?.unit_of_measurement ||
        metricUnitLabels[metricUnitRole] ||
        "";
      const displayUnitLabel = timeUnitLabels[String(rawUnitLabel).toLowerCase()] || rawUnitLabel;
      return (
        "" + (metricEntityState?.state ?? "--") + (displayUnitLabel ? " " + displayUnitLabel : "")
      );
    };
    const purifierHandlersByEntityId = new Map();
    const registerPurifierHandler = (purifierHandlerEntityId, purifierStateHandler) => {
      if (purifierHandlerEntityId) {
        if (!purifierHandlersByEntityId.has(purifierHandlerEntityId)) {
          purifierHandlersByEntityId.set(purifierHandlerEntityId, []);
        }
        purifierHandlersByEntityId.get(purifierHandlerEntityId).push(purifierStateHandler);
      }
    };
    const purifierMetricEntityIds = purifierMetricDefinitions.flatMap(metricDefinition =>
      metricDefinition.candidates.map(metricCandidateItem => metricCandidateItem.id)
    );
    const airQualityEntityId = purifierDeviceProfile?.roles?.airQuality || "";
    const purifierExtensionControls =
      purifierRelatedEntityIds !== null
        ? this.createWaterHeaterExtensionControls(purifierEntityId, {
            component: purifierComponent,
            interactive: !purifierPreview,
            excludedEntityIds: [
              ...purifierMetricEntityIds,
              ...(airQualityEntityId ? [airQualityEntityId] : [])
            ]
          })
        : null;
    if (purifierExtensionControls) {
      purifierCardElement.append(purifierExtensionControls);
      purifierDialogElement.classList.add("has-related-extensions");
      for (const [
        extensionEntityId,
        extensionHandlers
      ] of purifierExtensionControls.stateHandlers || []) {
        purifierHandlersByEntityId.set(extensionEntityId, extensionHandlers);
      }
    }
    const airQualityStateLabels = {
      excellent: "空气优",
      good: "空气良",
      moderate: "一般",
      fair: "一般",
      poor: "较差",
      unhealthy: "较差",
      very_poor: "很差"
    };
    let airQualityState = airQualityEntityId
      ? this.states.get(airQualityEntityId)?.newState || this.states.get(airQualityEntityId)
      : null;
    let isPurifierRunning = false;
    const pm25MetricDefinition = purifierMetricDefinitions.find(
      pm25MetricDefinitionEntry => pm25MetricDefinitionEntry.key === "pm25"
    );
    const resolvePm25Quality = () => {
      const pm25Candidate = pm25MetricDefinition
        ? selectMetricCandidate(pm25MetricDefinition)
        : null;
      const pm25NumericValue = numericStateValue(entityStateForCandidate(pm25Candidate));
      if (pm25NumericValue == null) {
        return {
          text: "--",
          level: "unknown"
        };
      } else if (pm25NumericValue <= 35) {
        return {
          text: "空气优",
          level: "excellent"
        };
      } else if (pm25NumericValue <= 75) {
        return {
          text: "空气良",
          level: "good"
        };
      } else if (pm25NumericValue <= 115) {
        return {
          text: "轻度污染",
          level: "warning"
        };
      } else {
        return {
          text: "空气较差",
          level: "poor"
        };
      }
    };
    const renderPurifierAirQuality = () => {
      const airQualityRawText = String(airQualityState?.state || "").trim();
      const airQualityNormalizedText = airQualityRawText.toLowerCase();
      let airQualityDisplayText = ["unknown", "unavailable", ""].includes(airQualityNormalizedText)
        ? ""
        : airQualityStateLabels[airQualityNormalizedText] || airQualityRawText;
      let airQualityLevel = "good";
      if (airQualityDisplayText) {
        if (
          /very.?poor|severe|很差|重度|严重/.test(airQualityNormalizedText) ||
          /poor|unhealthy|较差|中度/.test(airQualityNormalizedText)
        ) {
          airQualityLevel = "poor";
        } else if (/moderate|fair|一般|轻度|污染/.test(airQualityNormalizedText)) {
          airQualityLevel = "warning";
        } else if (/excellent|优/.test(airQualityNormalizedText)) {
          airQualityLevel = "excellent";
        }
      } else {
        ({ text: airQualityDisplayText, level: airQualityLevel } = resolvePm25Quality());
      }
      purifierGaugeValueElement.textContent = airQualityDisplayText || "--";
      purifierGaugeUnitElement.textContent = "";
      purifierGaugeElement.style.setProperty(
        "--hb-air-purifier-progress",
        {
          excellent: 72,
          good: 58,
          warning: 42,
          poor: 26,
          unknown: 0
        }[airQualityLevel] + "%"
      );
      purifierGaugeElement.classList.toggle("is-warning", airQualityLevel === "warning");
      purifierGaugeElement.classList.toggle("is-poor", airQualityLevel === "poor");
      const airQualityAccentColor =
        {
          excellent: "#76cfa1",
          good: "#76cfa1",
          warning: "#e4b15f",
          poor: "#db7770",
          unknown: "#7d8990"
        }[airQualityLevel] || "#76cfa1";
      const airQualityAccentSoftColor =
        {
          excellent: "rgba(118,207,161,.13)",
          good: "rgba(118,207,161,.13)",
          warning: "rgba(228,177,95,.15)",
          poor: "rgba(219,119,112,.15)",
          unknown: "rgba(125,137,144,.13)"
        }[airQualityLevel] || "rgba(118,207,161,.13)";
      purifierDialogElement.style.setProperty("--hb-air-purifier-accent", airQualityAccentColor);
      purifierDialogElement.style.setProperty(
        "--hb-air-purifier-accent-soft",
        airQualityAccentSoftColor
      );
    };
    const setAirQualityState = nextAirQualityState => {
      airQualityState = nextAirQualityState;
      renderPurifierAirQuality();
    };
    const syncPurifierPowerState = nextPurifierState => {
      purifierState = nextPurifierState || purifierState;
      const purifierNormalizedState = String(purifierState?.state || "").toLowerCase();
      const isPurifierUnavailable = ["unknown", "unavailable"].includes(purifierNormalizedState);
      const isPurifierActive = !isPurifierUnavailable && purifierNormalizedState !== "off";
      isPurifierRunning = isPurifierActive;
      purifierDisplayTextElement.textContent = isPurifierActive ? "ON" : "OFF";
      purifierStatusElement.textContent = isPurifierUnavailable
        ? "当前不可用"
        : isPurifierActive
          ? "已开启"
          : "已关闭";
      purifierDeviceStatusElement.textContent = isPurifierUnavailable
        ? "设备不可用"
        : isPurifierActive
          ? "净化中"
          : "已关闭";
      purifierStatusElement.classList.toggle("is-on", isPurifierActive);
      purifierPowerButton.classList.toggle("is-on", isPurifierActive);
      purifierPowerButton.classList.toggle("is-unavailable", isPurifierUnavailable);
      purifierGaugeElement.classList.toggle("is-running", isPurifierActive);
      purifierGaugeOrbitElement.classList.toggle("is-running", isPurifierActive);
      purifierPowerButton.setAttribute("aria-pressed", String(isPurifierActive));
      purifierControls.syncCapabilityState?.(purifierState);
    };
    const renderPurifierMetrics = () => {
      const resolvedMetricSelections = purifierMetricDefinitions
        .map(metricDefinitionItem => ({
          metric: metricDefinitionItem,
          selected: selectMetricCandidate(metricDefinitionItem)
        }))
        .filter(
          ({ selected: selectedMetricCandidate }) =>
            numericStateValue(entityStateForCandidate(selectedMetricCandidate)) != null
        )
        .slice(0, secondaryMetricSlots.length);
      secondaryMetricSlots.forEach((metricSlot, metricSlotIndex) => {
        const metricSelection = resolvedMetricSelections[metricSlotIndex];
        metricSlot.item.hidden = !metricSelection;
        metricSlot.item.className =
          "hb-air-purifier-secondary-metric" +
          (metricSelection
            ? " hb-air-purifier-secondary-metric--" + metricSelection.metric.key
            : "");
        if (!metricSelection) {
          metricSlot.label.textContent = "";
          metricSlot.value.textContent = "";
          return;
        }
        const resolvedMetricRole = metricSelection.selected?.role || metricSelection.metric.key;
        metricSlot.label.textContent =
          metricSelection.metric.key === "filter" && resolvedMetricRole === "filterLeftTime"
            ? "滤芯剩余时间"
            : metricSelection.metric.label;
        metricSlot.value.textContent = formatMetricDisplay(
          entityStateForCandidate(metricSelection.selected),
          resolvedMetricRole
        );
      });
      purifierSecondaryMetricsElement.hidden = resolvedMetricSelections.length === 0;
    };
    syncPurifierPowerState(purifierState);
    registerPurifierHandler(purifierEntityId, syncPurifierPowerState);
    for (const refreshedMetricDefinition of purifierMetricDefinitions) {
      const refreshPurifierMetric = () => {
        renderPurifierMetrics();
        if (refreshedMetricDefinition.key === "pm25") {
          renderPurifierAirQuality();
        }
      };
      refreshPurifierMetric();
      for (const refreshMetricCandidate of refreshedMetricDefinition.candidates) {
        registerPurifierHandler(refreshMetricCandidate.id, refreshPurifierMetric);
      }
    }
    setAirQualityState(airQualityState);
    registerPurifierHandler(airQualityEntityId, setAirQualityState);
    purifierPowerButton.addEventListener("click", () =>
      purifierControls.querySelector(".hb-capability-power")?.click()
    );
    const purifierLayerElement = document.createElement("div");
    purifierLayerElement.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    purifierLayerElement.tabIndex = -1;
    purifierLayerElement.append(purifierDialogElement);
    this.container.append(purifierLayerElement);
    this.detailsDialog = purifierDialogElement;
    this.detailsStateSync = {
      dialog: purifierDialogElement,
      handlers: purifierHandlersByEntityId
    };
    this.registerRuntimeDialogScale(
      purifierLayerElement,
      purifierDialogElement,
      920,
      purifierExtensionControls ? 620 : 540
    );
    purifierCloseButton.addEventListener("click", () => purifierDialogElement.close());
    this.bindRuntimeDialogOutsideDismiss(
      purifierLayerElement,
      purifierDialogElement,
      purifierCardElement
    );
    purifierLayerElement.addEventListener("keydown", purifierKeyEvent => {
      if (purifierKeyEvent.key === "Escape") {
        purifierDialogElement.close();
      }
    });
    purifierDialogElement.addEventListener(
      "close",
      () => {
        purifierControls.cleanupCapabilityDetails?.();
        this.clearRuntimeDialogScale(purifierDialogElement);
        if (this.detailsDialog === purifierDialogElement) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === purifierDialogElement) {
          this.detailsStateSync = null;
        }
        purifierLayerElement.remove();
      },
      {
        once: true
      }
    );
    purifierDialogElement.show();
  }
  showMediaPlayerDetails(mediaPlayerComponent, { preview: mediaPlayerPreview = false } = {}) {
    const mediaPlayerDetailsEntityId = mediaPlayerComponent.bindings?.entity?.entityId;
    if (!mediaPlayerDetailsEntityId) {
      throw new Error("该控件没有关联实体。");
    }
    this.closeRuntimeDialog();
    let mediaPlayerState = this.states.get(mediaPlayerDetailsEntityId)?.newState ||
      this.states.get(mediaPlayerDetailsEntityId) || {
        entityId: mediaPlayerDetailsEntityId,
        state: "unknown",
        attributes: {}
      };
    const mediaPlayerDialogElement = document.createElement("dialog");
    mediaPlayerDialogElement.className =
      "hb-entity-details-dialog media-player-details capability-details";
    const mediaPlayerCardElement = document.createElement("div");
    mediaPlayerCardElement.className = "hb-entity-details-card";
    const mediaPlayerHeadingElement = document.createElement("div");
    mediaPlayerHeadingElement.className = "hb-entity-details-heading";
    const mediaPlayerTitleRowElement = document.createElement("div");
    const mediaPlayerTitleElement = document.createElement("strong");
    mediaPlayerTitleElement.textContent = componentDialogTitle(
      mediaPlayerComponent,
      mediaPlayerState.attributes?.friendly_name || "媒体"
    );
    const mediaPlayerStatusElement = document.createElement("span");
    mediaPlayerTitleRowElement.append(mediaPlayerTitleElement, mediaPlayerStatusElement);
    const speakerVisualElement = document.createElement("div");
    speakerVisualElement.className = "hb-media-speaker-visual";
    speakerVisualElement.setAttribute("aria-hidden", "true");
    const speakerBodyElement = document.createElement("i");
    speakerBodyElement.className = "hb-media-speaker-body";
    const speakerArtworkElement = document.createElement("img");
    speakerArtworkElement.className = "hb-media-speaker-artwork";
    speakerArtworkElement.alt = "";
    speakerArtworkElement.hidden = true;
    const speakerLightElement = document.createElement("i");
    speakerLightElement.className = "hb-media-speaker-light";
    speakerVisualElement.append(speakerBodyElement, speakerArtworkElement, speakerLightElement);
    mediaPlayerHeadingElement.append(mediaPlayerTitleRowElement, speakerVisualElement);
    const mediaPlayerBodyElement = document.createElement("div");
    mediaPlayerBodyElement.className = "hb-media-player-details-body";
    const nowPlayingElement = document.createElement("section");
    nowPlayingElement.className = "hb-media-player-now-playing";
    const nowPlayingArtworkElement = document.createElement("img");
    nowPlayingArtworkElement.className = "hb-media-player-artwork";
    nowPlayingArtworkElement.alt = "";
    nowPlayingArtworkElement.hidden = true;
    const nowPlayingCopyElement = document.createElement("div");
    nowPlayingCopyElement.className = "hb-media-player-copy";
    const nowPlayingTitleElement = document.createElement("strong");
    const nowPlayingSubtitleElement = document.createElement("span");
    const progressElement = document.createElement("div");
    progressElement.className = "hb-media-player-progress";
    progressElement.hidden = true;
    const progressBarElement = document.createElement("progress");
    progressBarElement.max = 1;
    progressBarElement.value = 0;
    const progressTimesElement = document.createElement("span");
    const elapsedTimeElement = document.createElement("time");
    const durationTimeElement = document.createElement("time");
    progressTimesElement.append(elapsedTimeElement, durationTimeElement);
    progressElement.append(progressBarElement, progressTimesElement);
    nowPlayingCopyElement.append(
      nowPlayingTitleElement,
      nowPlayingSubtitleElement,
      progressElement
    );
    nowPlayingElement.append(nowPlayingArtworkElement, nowPlayingCopyElement);
    const mediaActionsElement = document.createElement("div");
    mediaActionsElement.className = "hb-media-player-actions";
    const createMediaActionButton = (mediaButtonLabel, mediaServiceName, mediaServiceData = {}) => {
      const mediaActionButton = document.createElement("button");
      mediaActionButton.type = "button";
      mediaActionButton.textContent = mediaButtonLabel;
      mediaActionButton.addEventListener("click", async () => {
        if (!mediaPlayerPreview) {
          mediaActionButton.disabled = true;
          try {
            await this.callEntityService(
              "media_player",
              mediaServiceName,
              mediaPlayerDetailsEntityId,
              mediaServiceData
            );
          } catch (mediaActionError) {
            this.options.onError?.(mediaActionError);
          } finally {
            mediaActionButton.disabled = false;
          }
        }
      });
      mediaActionsElement.append(mediaActionButton);
      return mediaActionButton;
    };
    const previousTrackButton = createMediaActionButton("上一曲", "media_previous_track");
    const playPauseButton = createMediaActionButton("播放", "media_play_pause");
    const nextTrackButton = createMediaActionButton("下一曲", "media_next_track");
    const mediaBrowserControl = this.createMediaBrowserControl(mediaPlayerDetailsEntityId, {
      preview: mediaPlayerPreview
    });
    const volumeGroupElement = document.createElement("section");
    volumeGroupElement.className = "hb-capability-range-group";
    const volumeHeadingElement = document.createElement("div");
    volumeHeadingElement.className = "hb-capability-range-heading";
    const volumeTitleElement = document.createElement("strong");
    volumeTitleElement.textContent = "音量";
    const volumeOutputElement = document.createElement("output");
    volumeHeadingElement.append(volumeTitleElement, volumeOutputElement);
    const volumeInputElement = document.createElement("input");
    volumeInputElement.type = "range";
    volumeInputElement.min = "0";
    volumeInputElement.max = "1";
    volumeInputElement.step = ".01";
    volumeInputElement.disabled = mediaPlayerPreview;
    volumeGroupElement.append(volumeHeadingElement, volumeInputElement);
    nowPlayingElement.append(mediaBrowserControl.root);
    mediaPlayerBodyElement.append(nowPlayingElement, mediaActionsElement, volumeGroupElement);
    let mediaArtworkUrl = "";
    let pendingVolumeValue = null;
    let lastReportedVolume = null;
    let localVolumeOverride = null;
    let queuedVolumeValue = null;
    let isVolumeFlushPending = false;
    let volumeFlushTimer = null;
    let volumeResetTimer = null;
    let mediaDurationSeconds = null;
    let mediaPositionSeconds = 0;
    let mediaPositionUpdatedAtMs = null;
    let isMediaPlaying = false;
    const formatPlaybackTime = totalSeconds => {
      const normalizedSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
      const minutePart = Math.floor(normalizedSeconds / 60);
      const secondPart = String(normalizedSeconds % 60).padStart(2, "0");
      return minutePart + ":" + secondPart;
    };
    const renderPlaybackProgress = () => {
      if (!Number.isFinite(mediaDurationSeconds) || mediaDurationSeconds <= 0) {
        progressElement.hidden = true;
        return;
      }
      let currentPositionSeconds = Number.isFinite(mediaPositionSeconds) ? mediaPositionSeconds : 0;
      if (isMediaPlaying && Number.isFinite(mediaPositionUpdatedAtMs)) {
        currentPositionSeconds += Math.max(0, (Date.now() - mediaPositionUpdatedAtMs) / 1000);
      }
      currentPositionSeconds = Math.max(0, Math.min(mediaDurationSeconds, currentPositionSeconds));
      progressElement.hidden = false;
      progressBarElement.max = mediaDurationSeconds;
      progressBarElement.value = currentPositionSeconds;
      elapsedTimeElement.textContent = formatPlaybackTime(currentPositionSeconds);
      durationTimeElement.textContent = formatPlaybackTime(mediaDurationSeconds);
    };
    const progressIntervalTimer = window.setInterval(renderPlaybackProgress, 1000);
    const isVolumeCloseEnough = (firstVolume, secondVolume) =>
      Number.isFinite(firstVolume) &&
      Number.isFinite(secondVolume) &&
      Math.abs(firstVolume - secondVolume) <= 0.005;
    const renderVolumeLevel = volumeLevel => {
      pendingVolumeValue = Math.max(0, Math.min(1, Number(volumeLevel) || 0));
      volumeInputElement.value = String(pendingVolumeValue);
      volumeOutputElement.textContent = Math.round(pendingVolumeValue * 100) + "%";
    };
    const flushVolumeLevel = async () => {
      window.clearTimeout(volumeFlushTimer);
      volumeFlushTimer = null;
      if (isVolumeFlushPending || queuedVolumeValue === null) {
        return;
      }
      const volumeToFlush = queuedVolumeValue;
      queuedVolumeValue = null;
      isVolumeFlushPending = true;
      try {
        await this.callEntityService("media_player", "volume_set", mediaPlayerDetailsEntityId, {
          volume_level: volumeToFlush
        });
      } catch (volumeSetError) {
        queuedVolumeValue = null;
        localVolumeOverride = null;
        window.clearTimeout(volumeResetTimer);
        if (lastReportedVolume !== null) {
          renderVolumeLevel(lastReportedVolume);
        }
        this.options.onError?.(volumeSetError);
      } finally {
        isVolumeFlushPending = false;
        if (queuedVolumeValue !== null && !isVolumeCloseEnough(queuedVolumeValue, volumeToFlush)) {
          volumeFlushTimer = window.setTimeout(flushVolumeLevel, 140);
        }
      }
    };
    const commitVolumeChange = () => {
      const nextVolumeLevel = Math.max(0, Math.min(1, Number(volumeInputElement.value) || 0));
      localVolumeOverride = nextVolumeLevel;
      queuedVolumeValue = nextVolumeLevel;
      window.clearTimeout(volumeResetTimer);
      if (!isVolumeFlushPending) {
        window.clearTimeout(volumeFlushTimer);
        volumeFlushTimer = window.setTimeout(flushVolumeLevel, 120);
      }
    };
    nowPlayingArtworkElement.addEventListener("error", () => {
      nowPlayingArtworkElement.hidden = true;
      nowPlayingElement.classList.remove("has-artwork");
    });
    nowPlayingArtworkElement.addEventListener("load", () => {
      nowPlayingArtworkElement.hidden = false;
      nowPlayingElement.classList.add("has-artwork");
    });
    speakerArtworkElement.addEventListener("error", () => {
      speakerArtworkElement.hidden = true;
      speakerVisualElement.classList.remove("has-artwork");
    });
    speakerArtworkElement.addEventListener("load", () => {
      speakerArtworkElement.hidden = false;
      speakerVisualElement.classList.add("has-artwork");
    });
    volumeInputElement.addEventListener("input", () => renderVolumeLevel(volumeInputElement.value));
    volumeInputElement.addEventListener("change", commitVolumeChange);
    const syncMediaPlayerState = nextPlayerState => {
      mediaPlayerState = nextPlayerState || mediaPlayerState;
      const playerAttributes = mediaPlayerState.attributes || {};
      const playerStateLabels = {
        off: "已关闭",
        on: "已开启",
        idle: "空闲",
        playing: "播放中",
        paused: "已暂停",
        buffering: "缓冲中",
        standby: "待机",
        unavailable: "不可用",
        unknown: "未知状态"
      };
      const playerNormalizedState = String(mediaPlayerState.state || "unknown").toLowerCase();
      const playerSupportedFeatures = Number(playerAttributes.supported_features || 0);
      mediaBrowserControl.sync(mediaPlayerState);
      mediaPlayerStatusElement.textContent =
        playerStateLabels[playerNormalizedState] || mediaPlayerState.state || "未知状态";
      speakerVisualElement.classList.toggle("is-playing", playerNormalizedState === "playing");
      speakerVisualElement.classList.toggle("is-paused", playerNormalizedState === "paused");
      speakerVisualElement.classList.toggle(
        "is-off",
        ["off", "unavailable", "unknown"].includes(playerNormalizedState)
      );
      nowPlayingTitleElement.textContent =
        playerAttributes.media_title ||
        playerAttributes.media_series_title ||
        playerAttributes.app_name ||
        playerAttributes.source ||
        "暂无播放内容";
      nowPlayingSubtitleElement.textContent =
        [playerAttributes.media_artist, playerAttributes.media_album_name]
          .filter(Boolean)
          .join(" · ") ||
        playerAttributes.media_content_type ||
        "媒体播放器";
      playPauseButton.textContent = playerNormalizedState === "playing" ? "暂停" : "播放";
      playPauseButton.disabled =
        mediaPlayerPreview || ["off", "unavailable", "unknown"].includes(playerNormalizedState);
      previousTrackButton.disabled = mediaPlayerPreview || !(playerSupportedFeatures & 16);
      nextTrackButton.disabled = mediaPlayerPreview || !(playerSupportedFeatures & 32);
      mediaDurationSeconds = Number.isFinite(Number(playerAttributes.media_duration))
        ? Number(playerAttributes.media_duration)
        : null;
      mediaPositionSeconds = Number.isFinite(Number(playerAttributes.media_position))
        ? Number(playerAttributes.media_position)
        : 0;
      const positionUpdatedAtMs = Date.parse(
        String(playerAttributes.media_position_updated_at || "")
      );
      mediaPositionUpdatedAtMs = Number.isFinite(positionUpdatedAtMs) ? positionUpdatedAtMs : null;
      isMediaPlaying = playerNormalizedState === "playing";
      renderPlaybackProgress();
      const reportedVolumeLevel = Number(playerAttributes.volume_level);
      volumeGroupElement.hidden = !Number.isFinite(reportedVolumeLevel);
      if (Number.isFinite(reportedVolumeLevel)) {
        if (localVolumeOverride === null) {
          lastReportedVolume = reportedVolumeLevel;
          renderVolumeLevel(reportedVolumeLevel);
        } else if (isVolumeCloseEnough(reportedVolumeLevel, localVolumeOverride)) {
          lastReportedVolume = reportedVolumeLevel;
          renderVolumeLevel(localVolumeOverride);
          window.clearTimeout(volumeResetTimer);
          volumeResetTimer = window.setTimeout(() => {
            localVolumeOverride = null;
          }, 1800);
        } else {
          window.clearTimeout(volumeResetTimer);
        }
      }
      const artworkSourceUrl =
        [
          playerAttributes.entity_picture_local,
          playerAttributes.entity_picture,
          playerAttributes.media_image_url
        ]
          .map(artworkCandidate => String(artworkCandidate || "").trim())
          .find(
            artworkUrl =>
              artworkUrl.startsWith("/api/media_player_proxy/") ||
              artworkUrl.startsWith("/api/image_proxy/")
          ) || "";
      if (artworkSourceUrl !== mediaArtworkUrl) {
        mediaArtworkUrl = artworkSourceUrl;
        nowPlayingArtworkElement.hidden = !mediaArtworkUrl;
        nowPlayingElement.classList.toggle("has-artwork", !!mediaArtworkUrl);
        speakerArtworkElement.hidden = !mediaArtworkUrl;
        speakerVisualElement.classList.toggle("has-artwork", !!mediaArtworkUrl);
        if (mediaArtworkUrl) {
          nowPlayingArtworkElement.src = mediaArtworkUrl;
          speakerArtworkElement.src = mediaArtworkUrl;
        } else {
          nowPlayingArtworkElement.removeAttribute("src");
          speakerArtworkElement.removeAttribute("src");
        }
      }
    };
    syncMediaPlayerState(mediaPlayerState);
    mediaPlayerCardElement.append(
      mediaPlayerHeadingElement,
      mediaPlayerBodyElement,
      mediaBrowserControl.panel
    );
    mediaPlayerDialogElement.append(mediaPlayerCardElement);
    const mediaPlayerLayerElement = document.createElement("div");
    mediaPlayerLayerElement.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    mediaPlayerLayerElement.tabIndex = -1;
    mediaPlayerLayerElement.append(mediaPlayerDialogElement);
    this.container.append(mediaPlayerLayerElement);
    this.detailsDialog = mediaPlayerDialogElement;
    this.detailsStateSync = {
      dialog: mediaPlayerDialogElement,
      handlers: new Map([[mediaPlayerDetailsEntityId, [syncMediaPlayerState]]])
    };
    this.registerRuntimeDialogScale(mediaPlayerLayerElement, mediaPlayerDialogElement, 540, 368);
    this.bindRuntimeDialogOutsideDismiss(
      mediaPlayerLayerElement,
      mediaPlayerDialogElement,
      mediaPlayerCardElement
    );
    mediaPlayerLayerElement.addEventListener("keydown", mediaPlayerKeyEvent => {
      if (mediaPlayerKeyEvent.key === "Escape") {
        mediaPlayerDialogElement.close();
      }
    });
    let speakerEntranceAnimation = null;
    mediaPlayerDialogElement.addEventListener(
      "close",
      () => {
        speakerEntranceAnimation?.cancel();
        mediaBrowserControl.cleanup?.();
        window.clearInterval(progressIntervalTimer);
        window.clearTimeout(volumeFlushTimer);
        window.clearTimeout(volumeResetTimer);
        this.clearRuntimeDialogScale(mediaPlayerDialogElement);
        if (this.detailsDialog === mediaPlayerDialogElement) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === mediaPlayerDialogElement) {
          this.detailsStateSync = null;
        }
        mediaPlayerLayerElement.remove();
      },
      {
        once: true
      }
    );
    mediaPlayerDialogElement.show();
    speakerEntranceAnimation = playMediaSpeakerEntrance(speakerVisualElement);
  }
  showCustomPopup(popupDefinition, { preview: popupPreviewMode = false } = {}) {
    this.closeRuntimeDialog();
    this.historyPopupGeneration += 1;
    this.activePopupId = String(popupDefinition?.id || "");
    this.connectRuntime();
    const popupDialogElement = document.createElement("dialog");
    popupDialogElement.className = "hb-custom-popup-dialog";
    const popupCardElement = document.createElement("div");
    popupCardElement.className = "hb-custom-popup-card";
    const popupModules = popupDefinition.modules || [];
    const popupMetrics = popupLayoutMetrics(popupModules, popupDefinition.layout);
    const popupWidthPx = popupMetrics.popupWidth;
    const popupHeightPx = popupMetrics.popupHeight;
    popupDialogElement.dataset.runtimeDialogLayout =
      popupMetrics.rows === 1 && popupMetrics.columns === 2 ? "compact" : "fill";
    popupCardElement.style.width = popupWidthPx + "px";
    popupCardElement.style.height = popupHeightPx + "px";
    popupCardElement.style.maxHeight = "none";
    const popupHeadingElement = document.createElement("div");
    popupHeadingElement.className = "hb-custom-popup-heading";
    const popupTitleRowElement = document.createElement("div");
    const popupTitleElement = document.createElement("strong");
    popupTitleElement.textContent = popupDefinition.name || "组合弹窗";
    popupTitleRowElement.append(popupTitleElement);
    const popupCloseButton = document.createElement("button");
    popupCloseButton.type = "button";
    popupCloseButton.textContent = "×";
    popupCloseButton.setAttribute("aria-label", "关闭组合弹窗");
    popupHeadingElement.append(popupTitleRowElement, popupCloseButton);
    const popupGridElement = document.createElement("div");
    popupGridElement.className = "hb-custom-popup-grid";
    popupGridElement.style.gridTemplateColumns =
      "repeat(" + popupMetrics.columns + ", minmax(0, 1fr))";
    popupGridElement.style.gridTemplateRows = "repeat(" + popupMetrics.rows + ", minmax(0, 1fr))";
    const popupCleanupCallbacks = [];
    const mediaSpeakerVisuals = [];
    const mediaBrowserPanels = [];
    const deviceDropEntries = [];
    const chartRefreshCleanups = [];
    const popupHandlersByEntityId = new Map();
    const registerPopupStateHandler = (popupHandlerEntityId, popupStateHandler) => {
      if (!popupHandlersByEntityId.has(popupHandlerEntityId)) {
        popupHandlersByEntityId.set(popupHandlerEntityId, []);
      }
      popupHandlersByEntityId.get(popupHandlerEntityId).push(popupStateHandler);
    };
    for (const [moduleIndex, popupModule] of popupModules.entries()) {
      const normalizedPopupModule =
        popupModule.type === "capability-device"
          ? {
              ...popupModule,
              type: "generic"
            }
          : popupModule;
      const moduleEntityId = String(normalizedPopupModule.entityId || "");
      const moduleDeviceProfile = this.deviceProfile(moduleEntityId);
      const profiledPopupModule = applyXiaomiDeviceProfile(
        {
          bindings: {
            entity: {
              entityId: normalizedPopupModule.entityId
            }
          },
          properties: {
            ...(normalizedPopupModule.properties || {}),
            deviceType:
              normalizedPopupModule.deviceType ||
              normalizedPopupModule.properties?.deviceType ||
              "auto"
          }
        },
        moduleDeviceProfile
      );
      const resolvedPopupModule = moduleDeviceProfile
        ? {
            ...normalizedPopupModule,
            properties: profiledPopupModule.properties,
            deviceType:
              profiledPopupModule.properties?.deviceType || normalizedPopupModule.deviceType
          }
        : normalizedPopupModule;
      const moduleGridPlacement = popupMetrics.placements[moduleIndex] || {
        x: 0,
        y: moduleIndex,
        width: 1,
        height: 1
      };
      const moduleColumnSpan = [
        "climate",
        "air-purifier",
        "water-heater",
        "media-player",
        "camera",
        "line-chart"
      ].includes(resolvedPopupModule.type)
        ? 2
        : moduleGridPlacement.width;
      const moduleResolvedEntityId = moduleEntityId || resolvedPopupModule.entityId;
      const moduleEntityState = this.states.get(moduleResolvedEntityId);
      const moduleCurrentState = moduleEntityState?.newState || moduleEntityState;
      const popupModuleElement = document.createElement("section");
      popupModuleElement.className =
        "hb-custom-popup-module hb-custom-popup-module--" + (resolvedPopupModule.type || "generic");
      popupModuleElement.style.gridColumn =
        moduleGridPlacement.x + 1 + " / span " + moduleColumnSpan;
      popupModuleElement.style.gridRow =
        moduleGridPlacement.y + 1 + " / span " + moduleGridPlacement.height;
      const popupModuleHeadingElement = document.createElement("div");
      popupModuleHeadingElement.className = "hb-custom-popup-module-heading";
      const popupModuleTitleElement = document.createElement("strong");
      popupModuleTitleElement.textContent = popupModuleDialogTitle(
        resolvedPopupModule,
        moduleCurrentState
      );
      const popupModuleStatusElement = document.createElement("span");
      popupModuleStatusElement.className =
        "hb-custom-popup-module-status type-" + (resolvedPopupModule.type || "generic");
      const popupModuleTypeLabels = {
        light: "灯光",
        climate: "空调 / 浴霸",
        "air-purifier": "空气净化器",
        "water-heater": "热水器",
        "media-player": "媒体",
        "electric-bed": "电动床",
        switch: "开关",
        cover: "窗帘",
        camera: "摄像头",
        "line-chart": "实时数据",
        generic: "设备"
      };
      popupModuleStatusElement.textContent =
        popupModuleTypeLabels[resolvedPopupModule.type] || popupModuleTypeLabels.generic;
      popupModuleHeadingElement.append(popupModuleTitleElement, popupModuleStatusElement);
      popupModuleElement.append(popupModuleHeadingElement);
      if (
        resolvedPopupModule.type === "electric-bed" &&
        moduleDeviceProfile?.deviceType !== "electric-bed"
      ) {
        popupModuleElement.classList.add("hb-custom-popup-module--electric-bed");
        const popupLoadingElement = document.createElement("section");
        popupLoadingElement.className =
          "hb-custom-electric-bed-loading hb-climate-details-loading is-loading";
        const popupLoadingSpinnerElement = document.createElement("i");
        popupLoadingSpinnerElement.setAttribute("aria-hidden", "true");
        const popupLoadingTextElement = document.createElement("strong");
        popupLoadingTextElement.textContent = "正在加载设备状态…";
        popupLoadingElement.append(popupLoadingSpinnerElement, popupLoadingTextElement);
        popupModuleElement.append(popupLoadingElement);
      } else if (resolvedPopupModule.type === "electric-bed") {
        popupModuleElement.classList.add("hb-custom-popup-module--electric-bed");
        const popupDeviceRoles =
          (moduleDeviceProfile || this.deviceProfile(moduleResolvedEntityId))?.roles || {};
        const stateForPopupEntity = popupStateEntityId => {
          const popupEntityStateValue = this.states.get(popupStateEntityId);
          return (
            popupEntityStateValue?.newState ||
            popupEntityStateValue || {
              entityId: popupStateEntityId,
              state: "unknown",
              attributes: {}
            }
          );
        };
        const bedBodyElement = document.createElement("div");
        bedBodyElement.className = "hb-custom-electric-bed-body";
        const bedVisualElement = document.createElement("section");
        bedVisualElement.className = "hb-electric-bed-visual";
        const bedModelElement = document.createElement("div");
        bedModelElement.className = "hb-electric-bed-model";
        for (const bedPartName of ["mattress", "back", "waist", "legs", "base"]) {
          const bedPartElement = document.createElement("i");
          bedPartElement.className = "hb-electric-bed-" + bedPartName;
          bedModelElement.append(bedPartElement);
        }
        const createBedAngleReadout = (readoutClassName, readoutLabelText) => {
          const bedReadoutElement = document.createElement("span");
          bedReadoutElement.className = "hb-electric-bed-angle-readout " + readoutClassName;
          const bedReadoutValueElement = document.createElement("strong");
          const bedReadoutLabelElement = document.createElement("small");
          bedReadoutLabelElement.textContent = readoutLabelText;
          bedReadoutElement.append(bedReadoutValueElement, bedReadoutLabelElement);
          return {
            item: bedReadoutElement,
            value: bedReadoutValueElement
          };
        };
        const bedBackReadout = createBedAngleReadout("back", "靠背");
        const bedWaistReadout = createBedAngleReadout("waist", "腰部");
        const bedLegsReadout = createBedAngleReadout("legs", "腿部");
        bedVisualElement.append(
          bedModelElement,
          bedBackReadout.item,
          bedWaistReadout.item,
          bedLegsReadout.item
        );
        const bedModeSectionElement = document.createElement("section");
        bedModeSectionElement.className = "hb-electric-bed-control hb-electric-bed-mode";
        const bedMemorySectionElement = document.createElement("section");
        bedMemorySectionElement.className = "hb-electric-bed-memory";
        const bedAngleControlsSectionElement = document.createElement("section");
        bedAngleControlsSectionElement.className = "hb-electric-bed-angle-controls";
        const bedModeEntityId = String(popupDeviceRoles.mode || "");
        const bedMemoryEntityIds = [popupDeviceRoles.memory1, popupDeviceRoles.memory2]
          .filter(Boolean)
          .slice(0, 2);
        const bedAngleControls = [
          ["backrest", "靠背角度", "back"],
          ["leg", "腿部角度", "legs"],
          ["waist", "腰部角度", "waist"]
        ]
          .map(([angleControlRole, angleControlLabel, angleControlVisualClass]) => ({
            role: angleControlRole,
            label: angleControlLabel,
            visualClass: angleControlVisualClass,
            entityId: String(popupDeviceRoles[angleControlRole] || "")
          }))
          .filter(angleControlEntry => angleControlEntry.entityId);
        const appendBedCapabilityControl = (
          sectionContainer,
          controlLabel,
          controlEntityId,
          controlVariant = ""
        ) => {
          const bedControlSectionElement = document.createElement("section");
          bedControlSectionElement.className = "hb-electric-bed-control";
          const bedControlTitleElement = document.createElement("strong");
          bedControlTitleElement.textContent = controlLabel;
          const bedCapabilityControls = this.createCapabilityDetailsControls(
            controlEntityId,
            stateForPopupEntity(controlEntityId),
            {
              interactive: !popupPreviewMode,
              variant: controlVariant
            }
          );
          bedCapabilityControls.classList.add("hb-electric-bed-capability");
          bedControlSectionElement.append(bedControlTitleElement, bedCapabilityControls);
          sectionContainer.append(bedControlSectionElement);
          popupCleanupCallbacks.push(() => bedCapabilityControls.cleanupCapabilityDetails?.());
          registerPopupStateHandler(controlEntityId, nextControlState =>
            bedCapabilityControls.syncCapabilityState?.(nextControlState)
          );
        };
        if (bedModeEntityId) {
          appendBedCapabilityControl(
            bedModeSectionElement,
            "模式",
            bedModeEntityId,
            "electric-bed"
          );
        } else {
          const bedModeTitleElement = document.createElement("strong");
          bedModeTitleElement.textContent = "模式";
          const bedModeSelectElement = document.createElement("select");
          bedModeSelectElement.className = "hb-capability-select";
          bedModeSelectElement.disabled = true;
          bedModeSelectElement.append(new Option("未识别到模式实体"));
          bedModeSectionElement.append(bedModeTitleElement, bedModeSelectElement);
        }
        const bedMemoryTitleElement = document.createElement("strong");
        bedMemoryTitleElement.textContent = "记忆姿势";
        const bedMemoryListElement = document.createElement("div");
        bedMemoryListElement.className = "hb-electric-bed-memory-list";
        for (let bedMemoryIndex = 0; bedMemoryIndex < 2; bedMemoryIndex += 1) {
          const bedMemoryEntityId = String(bedMemoryEntityIds[bedMemoryIndex] || "");
          const bedMemoryMetadata = bedMemoryEntityId
            ? this.entityMetadata.get(bedMemoryEntityId)
            : null;
          if (bedMemoryEntityId.split(".", 1)[0] === "select") {
            appendBedCapabilityControl(
              bedMemoryListElement,
              "记忆姿势 " + (bedMemoryIndex + 1),
              bedMemoryEntityId,
              "electric-bed-memory"
            );
            continue;
          }
          const bedMemoryButton = document.createElement("button");
          bedMemoryButton.type = "button";
          bedMemoryButton.className = "hb-electric-bed-memory-button";
          bedMemoryButton.textContent =
            bedMemoryMetadata?.name ||
            bedMemoryMetadata?.originalName ||
            "记忆姿势 " + (bedMemoryIndex + 1);
          bedMemoryButton.disabled = popupPreviewMode || !bedMemoryEntityId;
          bedMemoryButton.addEventListener("click", async () => {
            if (!popupPreviewMode && !!bedMemoryEntityId && !bedMemoryButton.disabled) {
              bedMemoryButton.disabled = true;
              try {
                await this.callEntityService("button", "press", bedMemoryEntityId);
                bedMemoryButton.classList.add("is-success");
                window.setTimeout(() => bedMemoryButton.classList.remove("is-success"), 900);
              } catch (bedMemoryPressError) {
                this.options.onError?.(bedMemoryPressError);
              } finally {
                bedMemoryButton.disabled = popupPreviewMode || !bedMemoryEntityId;
              }
            }
          });
          bedMemoryListElement.append(bedMemoryButton);
        }
        bedMemorySectionElement.append(bedMemoryTitleElement, bedMemoryListElement);
        for (const bedAngleControl of bedAngleControls) {
          appendBedCapabilityControl(
            bedAngleControlsSectionElement,
            bedAngleControl.label,
            bedAngleControl.entityId
          );
        }
        const syncBedAngleState = () => {
          const bedAngleStates = {
            backrest: stateForPopupEntity(popupDeviceRoles.backrest),
            leg: stateForPopupEntity(popupDeviceRoles.leg),
            waist: stateForPopupEntity(popupDeviceRoles.waist)
          };
          const bedAngleValueFor = bedAngleEntityState => {
            const bedAngleValue = Number(bedAngleEntityState?.state);
            if (Number.isFinite(bedAngleValue)) {
              return bedAngleValue;
            } else {
              return null;
            }
          };
          const renderBedAngleReadout = (
            bedAngleRole,
            bedAngleModelElement,
            bedAngleReadoutValueElement
          ) => {
            const bedAngleDegrees = bedAngleValueFor(bedAngleStates[bedAngleRole]);
            bedAngleReadoutValueElement.textContent =
              bedAngleDegrees === null ? "--" : Math.round(bedAngleDegrees) + "°";
            if (bedAngleDegrees !== null) {
              bedModelElement.style.setProperty(
                "--hb-bed-" + (bedAngleRole === "backrest" ? "backrest" : bedAngleRole) + "-angle",
                bedAngleDegrees + "deg"
              );
            }
          };
          renderBedAngleReadout("backrest", bedModelElement, bedBackReadout.value);
          renderBedAngleReadout("waist", bedModelElement, bedWaistReadout.value);
          renderBedAngleReadout("leg", bedModelElement, bedLegsReadout.value);
          popupModuleStatusElement.textContent = "已连接";
        };
        for (const bedAngleEntityId of [
          popupDeviceRoles.backrest,
          popupDeviceRoles.leg,
          popupDeviceRoles.waist
        ].filter(Boolean)) {
          registerPopupStateHandler(bedAngleEntityId, syncBedAngleState);
        }
        syncBedAngleState();
        bedBodyElement.append(
          bedModeSectionElement,
          bedVisualElement,
          bedMemorySectionElement,
          bedAngleControlsSectionElement
        );
        popupModuleElement.append(bedBodyElement);
      } else if (resolvedPopupModule.type === "camera") {
        const popupCameraVisualElement = document.createElement("section");
        popupCameraVisualElement.className =
          "hb-camera-device-visual hb-custom-camera-device-visual";
        popupCameraVisualElement.setAttribute("aria-hidden", "true");
        const popupCameraMountElement = document.createElement("i");
        popupCameraMountElement.className = "hb-camera-device-mount";
        const popupCameraArmElement = document.createElement("i");
        popupCameraArmElement.className = "hb-camera-device-arm";
        const popupCameraBodyElement = document.createElement("div");
        popupCameraBodyElement.className = "hb-camera-device-body";
        const popupCameraLensElement = document.createElement("i");
        popupCameraLensElement.className = "hb-camera-device-lens";
        const popupCameraLedElement = document.createElement("i");
        popupCameraLedElement.className = "hb-camera-device-led";
        popupCameraBodyElement.append(popupCameraLensElement, popupCameraLedElement);
        popupCameraVisualElement.append(
          popupCameraMountElement,
          popupCameraArmElement,
          popupCameraBodyElement
        );
        popupModuleHeadingElement.append(popupCameraVisualElement);
        let popupCameraLensTimer = 0;
        let popupCameraLensAnimation = null;
        let popupCameraLensOffset = 0;
        const popupCameraLensTransform = (
          popupCameraLensRotationDeg,
          popupCameraLensOffsetYPx = 0
        ) =>
          "translateX(-50%) perspective(260px) rotateY(" +
          popupCameraLensRotationDeg +
          "deg) rotateZ(" +
          popupCameraLensRotationDeg * 0.035 +
          "deg) translateY(" +
          popupCameraLensOffsetYPx +
          "px)";
        const startPopupCameraLensAnimation = () => {
          if (!popupCameraBodyElement.isConnected) {
            return;
          }
          const popupCameraLensCandidates = [-22, -16, -9, -4, 0, 6, 12, 18, 23].filter(
            popupCameraLensOffsetCandidate =>
              Math.abs(popupCameraLensOffsetCandidate - popupCameraLensOffset) >= 7
          );
          const nextPopupCameraLensOffset =
            popupCameraLensCandidates[
              Math.floor(Math.random() * popupCameraLensCandidates.length)
            ] ?? 0;
          const popupCameraLensDirection =
            Math.sign(nextPopupCameraLensOffset - popupCameraLensOffset) || 1;
          const popupCameraLensDistance = Math.abs(
            nextPopupCameraLensOffset - popupCameraLensOffset
          );
          const popupCameraLensDurationMs = Math.round(
            430 + popupCameraLensDistance * 18 + Math.random() * 320
          );
          const popupCameraLensOvershootOffset =
            nextPopupCameraLensOffset + popupCameraLensDirection * (1.4 + Math.random() * 2.2);
          const popupCameraLensOffsetY = Math.random() * 1.4 - 0.7;
          popupCameraLensElement.style.setProperty(
            "--hb-camera-lens-shift",
            (nextPopupCameraLensOffset / 23) * 2.5 + "px"
          );
          popupCameraLensAnimation?.cancel();
          popupCameraLensAnimation = popupCameraBodyElement.animate(
            [
              {
                transform: popupCameraLensTransform(popupCameraLensOffset, 0),
                offset: 0
              },
              {
                transform: popupCameraLensTransform(
                  popupCameraLensOvershootOffset,
                  popupCameraLensOffsetY
                ),
                offset: 0.78
              },
              {
                transform: popupCameraLensTransform(
                  nextPopupCameraLensOffset,
                  popupCameraLensOffsetY * 0.35
                ),
                offset: 1
              }
            ],
            {
              duration: popupCameraLensDurationMs,
              easing: "cubic-bezier(.2,.72,.22,1)",
              fill: "forwards"
            }
          );
          popupCameraLensAnimation.addEventListener(
            "finish",
            () => {
              popupCameraLensOffset = nextPopupCameraLensOffset;
              popupCameraBodyElement.style.transform = popupCameraLensTransform(
                popupCameraLensOffset,
                popupCameraLensOffsetY * 0.35
              );
              popupCameraLensAnimation?.cancel();
              popupCameraLensAnimation = null;
              const popupCameraLensDelayMs =
                Math.random() < 0.22 ? 180 + Math.random() * 260 : 680 + Math.random() * 1500;
              popupCameraLensTimer = window.setTimeout(
                startPopupCameraLensAnimation,
                popupCameraLensDelayMs
              );
            },
            {
              once: true
            }
          );
        };
        if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          popupCameraLensTimer = window.setTimeout(startPopupCameraLensAnimation, 620);
        }
        popupCleanupCallbacks.push(() => {
          window.clearTimeout(popupCameraLensTimer);
          popupCameraLensAnimation?.cancel();
        });
        const popupCameraStageElement = document.createElement("div");
        popupCameraStageElement.className = "hb-custom-popup-camera-stage is-connecting";
        popupModuleStatusElement.textContent = popupPreviewMode ? "预览模式" : "正在连接";
        popupModuleStatusElement.classList.add("is-connecting");
        const popupCameraRevealVeilElement = document.createElement("i");
        popupCameraRevealVeilElement.className = "hb-camera-preview-reveal-veil";
        const popupCameraScanLineElement = document.createElement("i");
        popupCameraScanLineElement.className = "hb-camera-preview-scan-line";
        popupCameraStageElement.append(popupCameraRevealVeilElement, popupCameraScanLineElement);
        const popupCameraPlaceholderElement = document.createElement("span");
        popupCameraPlaceholderElement.textContent = popupPreviewMode
          ? "预览模式不获取实时画面"
          : "正在载入摄像头实时预览";
        popupCameraStageElement.append(popupCameraPlaceholderElement);
        if (popupPreviewMode) {
          popupModuleStatusElement.classList.remove("is-connecting");
          popupCameraStageElement.classList.remove("is-connecting");
          popupCameraStageElement.classList.add("is-ready");
        } else {
          mountCameraMedia({
            container: popupCameraStageElement,
            entityId: moduleResolvedEntityId,
            label: popupModuleTitleElement.textContent,
            objectFit: "fill",
            placeholder: popupCameraPlaceholderElement,
            onReady: () => {
              popupModuleStatusElement.textContent = "实时画面";
              popupModuleStatusElement.classList.remove("is-connecting", "is-unavailable");
              popupModuleStatusElement.classList.add("is-live");
              popupCameraVisualElement.classList.remove("is-unavailable");
              popupCameraVisualElement.classList.add("is-live");
              popupCameraStageElement.classList.remove(
                "is-connecting",
                "is-unavailable",
                "is-revealing"
              );
              popupCameraStageElement.classList.add("is-ready");
            },
            onUnavailable: () => {
              popupModuleStatusElement.textContent = "画面不可用";
              popupModuleStatusElement.classList.remove("is-connecting", "is-live");
              popupModuleStatusElement.classList.add("is-unavailable");
              popupCameraVisualElement.classList.remove("is-live");
              popupCameraVisualElement.classList.add("is-unavailable");
              popupCameraStageElement.classList.remove("is-connecting", "is-revealing");
              popupCameraStageElement.classList.add("is-unavailable");
            },
            cleanup: popupCameraCleanup => popupCleanupCallbacks.push(popupCameraCleanup)
          });
        }
        popupModuleElement.append(popupCameraStageElement);
      } else if (resolvedPopupModule.type === "line-chart") {
        const popupLineChartComponent = {
          type: "line-chart",
          bindings: {
            entity: {
              entityId: moduleResolvedEntityId
            }
          },
          properties: {
            ...syncedLineChartProperties(
              this.document,
              this.page,
              moduleResolvedEntityId,
              resolvedPopupModule.properties
            ),
            compactDetailsHorizontal: true
          }
        };
        const popupChartOutputElement = document.createElement("output");
        popupChartOutputElement.className = "hb-custom-line-chart-current";
        const popupChartValueElement = document.createElement("strong");
        const popupChartUnitElement = document.createElement("small");
        const popupChartColor = String(popupLineChartComponent.properties?.valueColor || "#dce1e5");
        popupChartValueElement.style.color = popupChartColor;
        popupChartUnitElement.style.color = popupChartColor;
        popupChartOutputElement.append(popupChartValueElement, popupChartUnitElement);
        popupModuleHeadingElement.append(popupChartOutputElement);
        const renderPopupChartValue = popupChartState => {
          const popupChartNumericValue = Number.parseFloat(popupChartState?.state);
          popupChartValueElement.textContent = Number.isFinite(popupChartNumericValue)
            ? formatLineChartValue(
                popupChartNumericValue,
                popupLineChartComponent.properties?.statePrecision
              )
            : popupChartState?.state || "--";
          popupChartUnitElement.textContent = String(
            popupChartState?.attributes?.unit_of_measurement || ""
          );
          popupChartOutputElement.setAttribute(
            "aria-label",
            "当前数值 " + popupChartValueElement.textContent + popupChartUnitElement.textContent
          );
        };
        const popupChartRenderOptions = {
          states: this.states,
          history: this.historySeries,
          renderNamespace: this.renderNamespace + "-" + resolvedPopupModule.id,
          interactive: true,
          animate: false
        };
        let popupChartElement = renderLineChartDetails(
          popupLineChartComponent,
          popupChartRenderOptions
        );
        let popupChartRefreshTimer = 0;
        const refreshPopupChart = () => {
          popupChartRefreshTimer = 0;
          if (
            !popupChartElement?.isConnected ||
            this.detailsStateSync?.dialog !== popupDialogElement
          ) {
            return;
          }
          const nextPopupChartElement = renderLineChartDetails(
            popupLineChartComponent,
            popupChartRenderOptions
          );
          popupChartElement.cleanupLineChartHover?.();
          popupChartElement.replaceWith(nextPopupChartElement);
          popupChartElement = nextPopupChartElement;
          syncPopupChartAccent();
        };
        const schedulePopupChartRefresh = (refreshDelayMs = 700) => {
          popupChartRefreshTimer ||= window.setTimeout(
            refreshPopupChart,
            Math.max(0, Number(refreshDelayMs) || 0)
          );
        };
        chartRefreshCleanups.push(() => schedulePopupChartRefresh(0));
        const syncPopupChartAccent = () => {
          popupChartOutputElement.style.setProperty(
            "--hb-custom-chart-accent",
            popupChartElement.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e"
          );
        };
        renderPopupChartValue(moduleCurrentState);
        syncPopupChartAccent();
        registerPopupStateHandler(moduleResolvedEntityId, popupStateUpdate => {
          renderPopupChartValue(popupStateUpdate);
          popupChartElement.syncLineChartState?.(popupStateUpdate);
          syncPopupChartAccent();
        });
        popupCleanupCallbacks.push(() => {
          window.clearTimeout(popupChartRefreshTimer);
          popupChartElement.cleanupLineChartHover?.();
        });
        popupModuleElement.append(popupChartElement);
      } else if (resolvedPopupModule.type === "switch") {
        let switchPopupState = moduleCurrentState;
        let isSwitchPopupPending = false;
        let switchPopupActionStatus = "idle";
        let switchPopupToggleHandler = null;
        const isSwitchMomentaryButton = moduleResolvedEntityId.split(".")[0] === "button";
        const switchPopupVisual = createSwitchVisual({
          label: popupModuleTitleElement.textContent,
          interactive: !popupPreviewMode,
          momentary: isSwitchMomentaryButton,
          onToggle: () => switchPopupToggleHandler?.()
        });
        switchPopupVisual.visual.classList.add("hb-custom-switch-visual");
        const renderSwitchPopupState = nextState => {
          switchPopupState = nextState;
          const isSwitchUnavailable =
            !nextState?.state || ["unknown", "unavailable"].includes(nextState.state);
          const isSwitchOn = !isSwitchMomentaryButton && nextState?.state === "on";
          switchPopupVisual.sync(isSwitchOn, {
            unavailable: isSwitchUnavailable,
            pending: isSwitchPopupPending && switchPopupActionStatus !== "success",
            success: switchPopupActionStatus === "success"
          });
          popupModuleStatusElement.textContent = isSwitchUnavailable
            ? "当前不可用"
            : isSwitchMomentaryButton
              ? switchPopupActionStatus === "success"
                ? "执行成功"
                : isSwitchPopupPending
                  ? "正在执行"
                  : "按下执行"
              : isSwitchOn
                ? "已开启"
                : "已关闭";
          popupModuleStatusElement.classList.toggle(
            "is-live",
            (isSwitchMomentaryButton
              ? isSwitchPopupPending || switchPopupActionStatus === "success"
              : isSwitchOn) && !isSwitchUnavailable
          );
        };
        switchPopupToggleHandler = async () => {
          if (
            popupPreviewMode ||
            isSwitchPopupPending ||
            ["unknown", "unavailable"].includes(switchPopupState?.state)
          ) {
            return;
          }
          const previousSwitchState = switchPopupState;
          isSwitchPopupPending = true;
          switchPopupActionStatus = "idle";
          renderSwitchPopupState(
            isSwitchMomentaryButton
              ? previousSwitchState
              : {
                  ...previousSwitchState,
                  state: previousSwitchState?.state === "on" ? "off" : "on"
                }
          );
          try {
            if (isSwitchMomentaryButton) {
              await this.callEntityService("button", "press", moduleResolvedEntityId);
              switchPopupActionStatus = "success";
              renderSwitchPopupState(switchPopupState);
              await new Promise(resolveDelayedToggle =>
                window.setTimeout(resolveDelayedToggle, 900)
              );
            } else {
              await this.callEntityService("homeassistant", "toggle", moduleResolvedEntityId);
            }
          } catch (switchToggleError) {
            switchPopupActionStatus = "idle";
            renderSwitchPopupState(previousSwitchState);
            this.options.onError?.(switchToggleError);
          } finally {
            isSwitchPopupPending = false;
            switchPopupActionStatus = "idle";
            renderSwitchPopupState(switchPopupState);
          }
        };
        renderSwitchPopupState(moduleCurrentState);
        registerPopupStateHandler(moduleResolvedEntityId, renderSwitchPopupState);
        popupModuleElement.append(switchPopupVisual.visual);
      } else if (resolvedPopupModule.type === "light") {
        let lightDetailsControls = null;
        popupModuleHeadingElement.classList.add("has-light-visual");
        const lightVisualButton = document.createElement("button");
        lightVisualButton.type = "button";
        lightVisualButton.className = "hb-light-visual hb-custom-light-visual";
        lightVisualButton.style.animationDelay = 0.08 + moduleIndex * 0.07 + "s";
        lightVisualButton.inert = popupPreviewMode;
        lightVisualButton.setAttribute("aria-disabled", String(popupPreviewMode));
        const lightAuraElement = document.createElement("div");
        lightAuraElement.className = "hb-light-visual-aura";
        const lightLampElement = document.createElement("div");
        lightLampElement.className = "hb-light-visual-lamp";
        for (const lightPartName of ["cord", "shade", "bulb", "filament"]) {
          const lightPartElement = document.createElement("i");
          lightPartElement.className = "hb-light-visual-" + lightPartName;
          lightLampElement.append(lightPartElement);
        }
        lightVisualButton.append(lightAuraElement, lightLampElement);
        popupModuleHeadingElement.append(lightVisualButton);
        const lightAttributes = moduleCurrentState?.attributes || {};
        const isLightColorSupported = lightSupportsColor(lightAttributes);
        const lightMinKelvin =
          Number(lightAttributes.min_color_temp_kelvin) ||
          (Number.isFinite(Number(lightAttributes.max_mireds))
            ? 1000000 / Number(lightAttributes.max_mireds)
            : 2000);
        const lightMaxKelvin =
          Number(lightAttributes.max_color_temp_kelvin) ||
          (Number.isFinite(Number(lightAttributes.min_mireds))
            ? 1000000 / Number(lightAttributes.min_mireds)
            : 6500);
        const lightCurrentKelvin =
          Number(lightAttributes.color_temp_kelvin) ||
          (Number.isFinite(Number(lightAttributes.color_temp))
            ? 1000000 / Number(lightAttributes.color_temp)
            : NaN);
        const popupLightVisualState = {
          isOn: moduleCurrentState?.state === "on",
          brightnessPercent: Number.isFinite(Number(lightAttributes.brightness))
            ? (Number(lightAttributes.brightness) / 255) * 100
            : 100,
          colorTemperatureKelvin: Number.isFinite(lightCurrentKelvin)
            ? lightCurrentKelvin
            : (lightMinKelvin + lightMaxKelvin) / 2,
          colorRgb:
            isLightColorSupported && Array.isArray(lightAttributes.rgb_color)
              ? lightAttributes.rgb_color
                  .slice(0, 3)
                  .map(rgbChannelValue => Number(rgbChannelValue) || 0)
              : isLightColorSupported && Array.isArray(lightAttributes.hs_color)
                ? hsToRgbColor(lightAttributes.hs_color)
                : null
        };
        const renderLightVisual = (nextLightState = {}) => {
          const nextLightAttributes = nextLightState.attributes || {};
          if (typeof nextLightState.isOn == "boolean") {
            popupLightVisualState.isOn = nextLightState.isOn;
          } else if (typeof nextLightState.state == "string") {
            popupLightVisualState.isOn = nextLightState.state === "on";
          }
          if (Number.isFinite(Number(nextLightState.brightnessPercent))) {
            popupLightVisualState.brightnessPercent = Number(nextLightState.brightnessPercent);
          } else if (Number.isFinite(Number(nextLightAttributes.brightness))) {
            popupLightVisualState.brightnessPercent =
              (Number(nextLightAttributes.brightness) / 255) * 100;
          }
          if (Number.isFinite(Number(nextLightState.colorTemperatureKelvin))) {
            popupLightVisualState.colorTemperatureKelvin = Number(
              nextLightState.colorTemperatureKelvin
            );
          } else if (Number.isFinite(Number(nextLightAttributes.color_temp_kelvin))) {
            popupLightVisualState.colorTemperatureKelvin = Number(
              nextLightAttributes.color_temp_kelvin
            );
          } else if (Number.isFinite(Number(nextLightAttributes.color_temp))) {
            popupLightVisualState.colorTemperatureKelvin =
              1000000 / Number(nextLightAttributes.color_temp);
          }
          if (isLightColorSupported && Array.isArray(nextLightState.colorRgb)) {
            popupLightVisualState.colorRgb = nextLightState.colorRgb
              .slice(0, 3)
              .map(nextRgbChannel => Number(nextRgbChannel) || 0);
          } else if (isLightColorSupported && Array.isArray(nextLightAttributes.rgb_color)) {
            popupLightVisualState.colorRgb = nextLightAttributes.rgb_color
              .slice(0, 3)
              .map(stateRgbChannel => Number(stateRgbChannel) || 0);
          } else if (isLightColorSupported && Array.isArray(nextLightAttributes.hs_color)) {
            popupLightVisualState.colorRgb = hsToRgbColor(nextLightAttributes.hs_color);
          }
          const lightBrightnessPercent = Math.max(
            1,
            Math.min(100, Number(popupLightVisualState.brightnessPercent) || 1)
          );
          const lightTemperatureRatio =
            (Math.max(
              2000,
              Math.min(6500, Number(popupLightVisualState.colorTemperatureKelvin) || 4250)
            ) -
              2000) /
            4500;
          const warmLightRgb = [255, 132, 42];
          const coolLightRgb = [172, 225, 255];
          const lightRgbComponents =
            popupLightVisualState.colorRgb ||
            warmLightRgb.map((warmChannelValue, rgbChannelIndex) =>
              Math.round(
                warmChannelValue +
                  (coolLightRgb[rgbChannelIndex] - warmChannelValue) * lightTemperatureRatio
              )
            );
          lightVisualButton.classList.toggle("is-on", popupLightVisualState.isOn);
          lightVisualButton.style.setProperty(
            "--hb-light-visual-color",
            "rgb(" + lightRgbComponents.join(",") + ")"
          );
          lightVisualButton.style.setProperty(
            "--hb-light-visual-opacity",
            popupLightVisualState.isOn ? String(0.08 + (lightBrightnessPercent / 100) * 0.92) : "0"
          );
          lightVisualButton.style.setProperty(
            "--hb-light-visual-blur",
            Math.round(15 + lightBrightnessPercent * 1.14) + "px"
          );
          lightVisualButton.style.setProperty(
            "--hb-light-visual-scale",
            String(0.62 + (lightBrightnessPercent / 100) * 1.05)
          );
          lightVisualButton.setAttribute("aria-pressed", String(popupLightVisualState.isOn));
          lightVisualButton.setAttribute(
            "aria-label",
            "" +
              popupModuleTitleElement.textContent +
              (popupLightVisualState.isOn ? "已开启，点击关闭" : "已关闭，点击开启")
          );
          popupModuleStatusElement.textContent = popupLightVisualState.isOn ? "已开启" : "已关闭";
          popupModuleStatusElement.classList.toggle("is-live", popupLightVisualState.isOn);
        };
        renderLightVisual();
        let isLightTogglePending = false;
        lightVisualButton.addEventListener("click", async () => {
          if (popupPreviewMode || isLightTogglePending) {
            return;
          }
          isLightTogglePending = true;
          lightVisualButton.setAttribute("aria-busy", "true");
          const previousLightIsOn = popupLightVisualState.isOn;
          renderLightVisual({
            isOn: !previousLightIsOn
          });
          try {
            await this.callEntityService("homeassistant", "toggle", moduleResolvedEntityId);
          } catch (lightToggleError) {
            renderLightVisual({
              isOn: previousLightIsOn
            });
            this.options.onError?.(lightToggleError);
          } finally {
            isLightTogglePending = false;
            lightVisualButton.removeAttribute("aria-busy");
          }
        });
        lightDetailsControls = this.createLightDetailsControls(
          moduleResolvedEntityId,
          moduleCurrentState,
          {
            interactive: !popupPreviewMode,
            onTurnOn: () => {
              renderLightVisual({
                isOn: true
              });
            },
            onVisualChange: renderLightVisual
          }
        );
        popupCleanupCallbacks.push(() => lightDetailsControls?.cleanupLightDetails?.());
        registerPopupStateHandler(moduleResolvedEntityId, lightStateUpdate => {
          renderLightVisual(lightStateUpdate);
          lightDetailsControls?.syncLightState?.(lightStateUpdate);
        });
        popupModuleElement.append(lightDetailsControls);
      } else if (
        resolvedPopupModule.type === "climate" ||
        resolvedPopupModule.type === "water-heater"
      ) {
        popupModuleElement.classList.add("hb-custom-popup-module--climate");
        const popupClimateDeviceType =
          resolvedPopupModule.type === "water-heater"
            ? "water-heater"
            : resolveClimateDeviceType(
                {
                  properties: {
                    deviceType:
                      resolvedPopupModule.deviceType ||
                      resolvedPopupModule.properties?.deviceType ||
                      "auto",
                    label: resolvedPopupModule.title || ""
                  }
                },
                moduleCurrentState,
                moduleResolvedEntityId
              );
        let popupClimateState = moduleCurrentState;
        const popupClimateLabelContext = {
          entityId: moduleResolvedEntityId,
          entityMetadata: this.entityMetadata,
          entityTranslations: this.entityTranslations
        };
        const climateVisualButton = document.createElement("button");
        climateVisualButton.type = "button";
        climateVisualButton.className = "hb-climate-visual hb-custom-climate-visual";
        climateVisualButton.classList.toggle(
          "is-bath-heater",
          popupClimateDeviceType === "bath-heater"
        );
        climateVisualButton.classList.toggle(
          "is-water-heater",
          popupClimateDeviceType === "water-heater"
        );
        if (popupClimateDeviceType === "water-heater") {
          deviceDropEntries.push({
            visual: climateVisualButton,
            distance: 168,
            delay: 100 + moduleIndex * 45
          });
        }
        climateVisualButton.inert = popupPreviewMode;
        climateVisualButton.setAttribute("aria-disabled", String(popupPreviewMode));
        const climateUnitElement = document.createElement("div");
        climateUnitElement.className = "hb-climate-visual-unit";
        const climateBrandElement = document.createElement("span");
        climateBrandElement.className = "hb-climate-visual-brand";
        climateBrandElement.textContent =
          popupClimateDeviceType === "bath-heater"
            ? "BATH HEATER"
            : popupClimateDeviceType === "water-heater"
              ? "SMART WATER"
              : "SMART AIR";
        const climateDisplayElement = document.createElement("strong");
        climateDisplayElement.className = "hb-climate-visual-display";
        const climateVentElement = document.createElement("div");
        climateVentElement.className = "hb-climate-visual-vent";
        for (let climateVentIndex = 0; climateVentIndex < 5; climateVentIndex += 1) {
          climateVentElement.append(document.createElement("i"));
        }
        climateUnitElement.append(climateBrandElement, climateDisplayElement, climateVentElement);
        const climateAirflowElement = document.createElement("div");
        climateAirflowElement.className = "hb-climate-visual-airflow";
        for (let climateAirflowIndex = 0; climateAirflowIndex < 3; climateAirflowIndex += 1) {
          climateAirflowElement.append(document.createElement("i"));
        }
        climateVisualButton.append(climateUnitElement, climateAirflowElement);
        const renderPopupClimateVisual = ({
          mode: climateMode = "off",
          visualMode: climateVisualMode = "off",
          running: climateRunning = false,
          accentColor: climateAccentColor = "#65717a",
          targetTemperature: climateTargetTemperature
        } = {}) => {
          const isClimateVisualOn = climateVisualMode !== "off";
          climateVisualButton.classList.toggle("is-on", isClimateVisualOn);
          climateVisualButton.classList.toggle("is-running", climateRunning);
          climateVisualButton.classList.toggle(
            "is-airflow-mode",
            popupClimateDeviceType === "bath-heater" &&
              isClimateVisualOn &&
              bathHeaterModeUsesAirflow(climateMode)
          );
          climateVisualButton.dataset.visualMode = climateVisualMode;
          climateVisualButton.style.setProperty("--hb-climate-visual-accent", climateAccentColor);
          const hasTargetTemperature =
            climateTargetTemperature != null &&
            climateTargetTemperature !== "" &&
            Number.isFinite(Number(climateTargetTemperature));
          climateDisplayElement.textContent = isClimateVisualOn
            ? hasTargetTemperature
              ? Number(climateTargetTemperature) + "°"
              : climateModeLabel(climateMode, popupClimateDeviceType, popupClimateLabelContext)
            : "OFF";
          if (popupClimateDeviceType === "bath-heater") {
            climateVisualButton.setAttribute(
              "aria-label",
              popupModuleTitleElement.textContent + "，点击切换浴霸灯"
            );
          } else {
            climateVisualButton.setAttribute("aria-pressed", String(isClimateVisualOn));
            climateVisualButton.setAttribute(
              "aria-label",
              "" +
                popupModuleTitleElement.textContent +
                (isClimateVisualOn ? "已开启，点击关闭" : "已关闭，点击开启")
            );
          }
        };
        const popupClimateControls = this.createClimateDetailsControls(
          moduleResolvedEntityId,
          moduleCurrentState,
          {
            interactive: !popupPreviewMode,
            deviceType: popupClimateDeviceType,
            onVisualChange: ({
              mode: visualModeUpdate,
              visualMode: visualModeChange,
              running: runningUpdate,
              accentColor: accentColorUpdate,
              accentSoft: accentSoftColorUpdate,
              targetTemperature: targetTemperatureUpdate
            }) => {
              popupModuleStatusElement.textContent = climateModeLabel(
                visualModeUpdate,
                popupClimateDeviceType,
                popupClimateLabelContext
              );
              popupModuleStatusElement.classList.toggle("is-live", visualModeChange !== "off");
              popupModuleStatusElement.classList.toggle("is-running", runningUpdate);
              popupModuleStatusElement.style.setProperty("--hb-climate-accent", accentColorUpdate);
              popupModuleStatusElement.style.setProperty(
                "--hb-climate-accent-soft",
                accentSoftColorUpdate
              );
              renderPopupClimateVisual({
                mode: visualModeUpdate,
                visualMode: visualModeChange,
                running: runningUpdate,
                accentColor: accentColorUpdate,
                targetTemperature: targetTemperatureUpdate
              });
            }
          }
        );
        popupCleanupCallbacks.push(() => popupClimateControls.cleanupClimateDetails?.());
        const bathHeaterLightRoleId =
          popupClimateDeviceType === "bath-heater" ? moduleDeviceProfile?.roles?.light : "";
        const bathHeaterLightEntity = bathHeaterLightRoleId
          ? this.entityMetadata.get(bathHeaterLightRoleId)
          : popupClimateDeviceType === "bath-heater"
            ? relatedDeviceDomainEntity(this.entityMetadata, moduleResolvedEntityId, "light")
            : null;
        let bathHeaterLightControl = null;
        if (bathHeaterLightEntity?.entityId) {
          const bathHeaterLightState = this.states.get(bathHeaterLightEntity.entityId);
          const bathHeaterLightResolvedState = bathHeaterLightState?.newState ||
            bathHeaterLightState || {
              state: "unknown",
              attributes: {}
            };
          bathHeaterLightControl = this.createBathHeaterLightControl(
            bathHeaterLightEntity.entityId,
            bathHeaterLightResolvedState,
            {
              interactive: !popupPreviewMode,
              onStateChange: ({ isOn: lightIsOn, unavailable: lightIsUnavailable }) => {
                climateVisualButton.classList.toggle(
                  "is-light-on",
                  lightIsOn && !lightIsUnavailable
                );
                climateVisualButton.setAttribute(
                  "aria-pressed",
                  String(lightIsOn && !lightIsUnavailable)
                );
              }
            }
          );
          popupClimateControls.append(bathHeaterLightControl);
          registerPopupStateHandler(bathHeaterLightEntity.entityId, bathLightStateUpdate =>
            bathHeaterLightControl.syncBathLightState?.(bathLightStateUpdate)
          );
        }
        const climateControlChildren = Array.from(popupClimateControls.children);
        const thermostatControlElement = climateControlChildren.find(thermostatChild =>
          thermostatChild.classList.contains("hb-climate-thermostat")
        );
        const fanSliderControlElement = climateControlChildren.find(childNode =>
          childNode.classList.contains("hb-climate-fan-slider")
        );
        const climateLeftColumnElement = document.createElement("div");
        climateLeftColumnElement.className = "hb-custom-climate-left";
        const climateRightColumnElement = document.createElement("div");
        climateRightColumnElement.className = "hb-custom-climate-right";
        if (thermostatControlElement) {
          climateLeftColumnElement.append(thermostatControlElement);
        }
        if (fanSliderControlElement) {
          climateLeftColumnElement.append(fanSliderControlElement);
        }
        climateRightColumnElement.append(
          climateVisualButton,
          ...climateControlChildren.filter(
            remainingChild =>
              remainingChild !== thermostatControlElement &&
              remainingChild !== fanSliderControlElement
          )
        );
        const hasPrimaryClimateControls = !!thermostatControlElement || !!fanSliderControlElement;
        popupClimateControls.classList.toggle(
          "without-primary-controls",
          !hasPrimaryClimateControls
        );
        popupClimateControls.replaceChildren(
          ...(hasPrimaryClimateControls
            ? [climateLeftColumnElement, climateRightColumnElement]
            : [climateRightColumnElement])
        );
        let isClimateTogglePending = false;
        climateVisualButton.addEventListener("click", async () => {
          if (popupClimateDeviceType === "bath-heater") {
            if (bathHeaterLightControl?.toggleBathLight) {
              await bathHeaterLightControl.toggleBathLight();
            } else {
              this.options.onError?.(new Error("未找到与浴霸同设备的灯光实体。"));
            }
            return;
          }
          if (popupPreviewMode || isClimateTogglePending) {
            return;
          }
          isClimateTogglePending = true;
          climateVisualButton.setAttribute("aria-busy", "true");
          const previousClimateState = popupClimateState;
          const isClimatePowered = climateIsPoweredOn(previousClimateState, popupClimateDeviceType);
          const climateTargetMode =
            popupClimateControls.dataset.lastClimateMode ||
            (isClimatePowered ? previousClimateState.state : "auto");
          const optimisticClimateState = {
            state: isClimatePowered ? "off" : climateTargetMode,
            attributes: {
              ...(previousClimateState?.attributes || {}),
              hvac_action: isClimatePowered ? "off" : climateTargetMode
            }
          };
          popupClimateState = optimisticClimateState;
          popupClimateControls.syncClimateState?.(optimisticClimateState);
          try {
            const climatePowerRequest = climatePowerCommand(
              moduleResolvedEntityId,
              previousClimateState,
              !isClimatePowered,
              popupClimateDeviceType,
              popupClimateControls.dataset.lastClimateMode || ""
            );
            await this.callEntityService(
              climatePowerRequest.domain,
              climatePowerRequest.service,
              moduleResolvedEntityId,
              climatePowerRequest.data
            );
          } catch (climateToggleError) {
            popupClimateState = previousClimateState;
            popupClimateControls.syncClimateState?.(previousClimateState);
            this.options.onError?.(climateToggleError);
          } finally {
            isClimateTogglePending = false;
            climateVisualButton.removeAttribute("aria-busy");
          }
        });
        registerPopupStateHandler(moduleResolvedEntityId, climateStateUpdate => {
          popupClimateState = climateStateUpdate;
          popupClimateControls.syncClimateState?.(climateStateUpdate);
        });
        popupModuleElement.append(popupClimateControls);
      } else if (resolvedPopupModule.type === "cover") {
        let popupCoverState = moduleCurrentState;
        const coverAttributes = moduleCurrentState?.attributes || {};
        const isAirerCover = coverComponentIsAirer(
          resolvedPopupModule,
          moduleResolvedEntityId,
          moduleCurrentState,
          this.entityMetadata,
          this.deviceMetadata
        );
        const coverSupportedFeatures = Number(coverAttributes.supported_features || 0);
        const coverIdentityText =
          moduleResolvedEntityId +
          " " +
          (coverAttributes.friendly_name || "") +
          " " +
          (resolvedPopupModule.title || "");
        const supportsCoverTilt =
          Number.isFinite(Number(coverAttributes.current_tilt_position)) ||
          !!(coverSupportedFeatures & 240);
        const isDreamCurtainName = /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(
          coverIdentityText
        );
        const coverKind = ["standard", "dream", "airer"].includes(
          resolvedPopupModule.properties?.coverKind
        )
          ? resolvedPopupModule.properties.coverKind
          : "auto";
        const isDreamCurtainCover =
          !isAirerCover &&
          (coverKind === "dream" ||
            (coverKind === "auto" && (supportsCoverTilt || isDreamCurtainName)));
        const airerLightEntityId =
          (isAirerCover
            ? relatedAirerLightEntity(this.entityMetadata, moduleResolvedEntityId)
            : null
          )?.entityId || "";
        const airerLightStateRecord = airerLightEntityId
          ? this.states.get(airerLightEntityId)
          : null;
        let airerLightState = airerLightStateRecord?.newState || airerLightStateRecord || null;
        const airerPositionEntityId =
          (isAirerCover
            ? relatedAirerPositionNumberEntity(this.entityMetadata, moduleResolvedEntityId)
            : null
          )?.entityId || "";
        const airerPositionStateRecord = this.states.get(airerPositionEntityId);
        const airerPositionState =
          airerPositionStateRecord?.newState || airerPositionStateRecord || null;
        const airerCurrentPositionEntityId =
          (isAirerCover
            ? relatedAirerCurrentPositionSensor(this.entityMetadata, moduleResolvedEntityId)
            : null
          )?.entityId || "";
        const airerMotorSpeedEntityId =
          (isAirerCover
            ? relatedAirerMotorSpeedSensor(this.entityMetadata, moduleResolvedEntityId)
            : null
          )?.entityId || "";
        const airerMotorSpeedStateRecord = this.states.get(airerMotorSpeedEntityId);
        const airerMotorSpeedState =
          airerMotorSpeedStateRecord?.newState || airerMotorSpeedStateRecord || null;
        const airerMotorActionEntities = isAirerCover
          ? relatedAirerMotorActionEntities(this.entityMetadata, moduleResolvedEntityId)
          : {};
        const airerActionEntityIds = Object.fromEntries(
          Object.entries(airerMotorActionEntities).map(([actionName, actionEntity]) => [
            actionName,
            actionEntity?.entityId || ""
          ])
        );
        const airerFeedbackStateRecord = this.states.get(
          airerCurrentPositionEntityId || airerPositionEntityId
        );
        const airerFeedbackState =
          airerFeedbackStateRecord?.newState || airerFeedbackStateRecord || null;
        const supportsCoverTiltControl = isDreamCurtainCover && supportsCoverTilt;
        const isCoverMotorReversed = coverMotorIsReversedForComponent(
          resolvedPopupModule,
          this.entityMetadata,
          this.states,
          moduleResolvedEntityId
        );
        const closeCoverService = isCoverMotorReversed ? "open_cover" : "close_cover";
        const openCoverService = isCoverMotorReversed ? "close_cover" : "open_cover";
        const coverDirection = ["left", "right"].includes(
          resolvedPopupModule.properties?.coverDirection
        )
          ? resolvedPopupModule.properties.coverDirection
          : "split";
        const coverLayoutElement = document.createElement("div");
        coverLayoutElement.className = "hb-custom-cover-layout";
        const coverVisualButton = document.createElement("button");
        coverVisualButton.type = "button";
        coverVisualButton.className = "hb-cover-visual hb-custom-cover-visual";
        coverVisualButton.inert = popupPreviewMode;
        coverVisualButton.setAttribute("aria-disabled", String(popupPreviewMode));
        const coverRailElement = document.createElement("i");
        coverRailElement.className = "hb-cover-visual-rail";
        const coverLeftPanelElement = document.createElement("i");
        coverLeftPanelElement.className = "hb-cover-visual-panel left";
        const coverRightPanelElement = document.createElement("i");
        coverRightPanelElement.className = "hb-cover-visual-panel right";
        const coverSlatsElement = document.createElement("span");
        coverSlatsElement.className = "hb-cover-visual-slats";
        const coverSlatCount = 13;
        for (let slatIndex = 0; slatIndex < coverSlatCount; slatIndex += 1) {
          const coverSlatElement = document.createElement("span");
          coverSlatElement.className = "hb-cover-visual-slat";
          const coverSlatInnerElement = document.createElement("i");
          coverSlatElement.style.setProperty("--hb-cover-slat-index", String(slatIndex));
          const slatDelayIndex =
            coverDirection === "right"
              ? coverSlatCount - 1 - slatIndex
              : coverDirection === "split"
                ? Math.abs((coverSlatCount - 1) / 2 - slatIndex)
                : slatIndex;
          coverSlatElement.style.setProperty("--hb-cover-slat-delay-index", String(slatDelayIndex));
          const slatShiftPx =
            coverDirection === "left"
              ? -slatIndex * 14.5
              : coverDirection === "right"
                ? (coverSlatCount - 1 - slatIndex) * 14.5
                : slatIndex <= (coverSlatCount - 1) / 2
                  ? -slatIndex * 14.5
                  : (coverSlatCount - 1 - slatIndex) * 14.5;
          coverSlatElement.style.setProperty("--hb-cover-retracted-shift", slatShiftPx + "px");
          coverSlatElement.append(coverSlatInnerElement);
          coverSlatsElement.append(coverSlatElement);
        }
        const coverWindowElement = document.createElement("i");
        coverWindowElement.className = "hb-cover-visual-window";
        coverVisualButton.classList.toggle("is-dream", isDreamCurtainCover);
        coverVisualButton.classList.toggle("is-airer", isAirerCover);
        coverVisualButton.classList.add("direction-" + coverDirection);
        coverVisualButton.append(
          coverWindowElement,
          coverRailElement,
          coverLeftPanelElement,
          coverRightPanelElement,
          coverSlatsElement
        );
        if (isAirerCover) {
          appendAirerVisual(coverVisualButton);
        }
        const renderAirerLightState = (airerLightNextState = airerLightState) => {
          if (!isAirerCover) {
            return;
          }
          airerLightState = airerLightNextState || airerLightState;
          const isAirerLightUnavailable =
            !airerLightEntityId ||
            ["unknown", "unavailable"].includes(String(airerLightState?.state || "unknown"));
          const isAirerLightOn = airerLightState?.state === "on";
          coverVisualButton.classList.toggle(
            "is-light-on",
            isAirerLightOn && !isAirerLightUnavailable
          );
          coverVisualButton.classList.toggle("is-light-unavailable", isAirerLightUnavailable);
          coverVisualButton.disabled = popupPreviewMode || isAirerLightUnavailable;
          coverVisualButton.setAttribute(
            "aria-pressed",
            String(isAirerLightOn && !isAirerLightUnavailable)
          );
          coverVisualButton.setAttribute(
            "aria-label",
            isAirerLightUnavailable
              ? "晾衣机灯光实体不可用"
              : "晾衣机灯光" + (isAirerLightOn ? "已开启，点击关闭" : "已关闭，点击开启")
          );
        };
        renderAirerLightState();
        let coverPositionPercent = 0;
        const airerCalibration = airerPositionCalibration(
          this.entityMetadata,
          this.deviceMetadata,
          moduleResolvedEntityId
        );
        const renderPopupCoverVisual = ({
          position: coverTargetPosition = 0,
          state: coverStateText = ""
        } = {}) => {
          const coverPositionValue = Math.max(0, Math.min(100, Number(coverTargetPosition) || 0));
          const coverDisplayState = coverPresentationState(
            {
              state: coverStateText,
              attributes: {
                current_position: coverPositionValue
              }
            },
            isCoverMotorReversed
          );
          const resolvedPhysicalState = physicalCoverState(
            coverStateText || popupCoverState?.state,
            isCoverMotorReversed
          );
          const isCoverOpeningOrOpen =
            resolvedPhysicalState === "open" || resolvedPhysicalState === "opening";
          coverPositionPercent = coverPositionValue;
          coverVisualButton.style.setProperty("--hb-cover-open-position", coverPositionValue + "%");
          coverVisualButton.style.setProperty(
            "--hb-airer-drop",
            airerVisualDrop(coverPositionValue) + "px"
          );
          coverVisualButton.style.setProperty(
            "--hb-cover-panel-width",
            45.9 - coverPositionValue * 0.331 + "%"
          );
          coverVisualButton.style.setProperty(
            "--hb-cover-single-panel-width",
            91.8 - coverPositionValue * 0.79 + "%"
          );
          coverVisualButton.style.setProperty(
            "--hb-cover-slat-angle",
            coverPositionValue * 1.8 + "deg"
          );
          coverVisualButton.classList.toggle("is-tilt-reversed", coverPositionValue > 50);
          coverVisualButton.classList.toggle(
            "is-tilt-center",
            Math.abs(coverPositionValue - 50) <= 2
          );
          coverVisualButton.classList.toggle(
            "is-open",
            isDreamCurtainCover
              ? isCoverOpeningOrOpen
              : coverDisplayState === "open" || coverDisplayState === "opening"
          );
          coverVisualButton.classList.toggle(
            "is-moving",
            coverStateText === "opening" || coverStateText === "closing"
          );
          coverVisualButton.setAttribute(
            "aria-pressed",
            String(
              isDreamCurtainCover
                ? isCoverOpeningOrOpen
                : coverDisplayState === "open" || coverDisplayState === "opening"
            )
          );
          if (isAirerCover) {
            popupModuleStatusElement.textContent =
              airerPositionLabel(coverDisplayState) || Math.round(coverPositionValue) + "%";
          } else if (isDreamCurtainCover) {
            popupModuleStatusElement.textContent = dreamCurtainStatusText(
              coverStateText || popupCoverState?.state,
              coverPositionValue,
              isCoverMotorReversed
            );
          } else {
            popupModuleStatusElement.textContent =
              {
                open: "已打开",
                closed: "已关闭",
                opening: "正在打开",
                closing: "正在关闭"
              }[coverDisplayState] || Math.round(coverPositionValue) + "%";
          }
          popupModuleStatusElement.classList.toggle(
            "is-live",
            isDreamCurtainCover
              ? isCoverOpeningOrOpen
              : coverDisplayState === "open" || coverDisplayState === "opening"
          );
          if (!isAirerCover) {
            coverVisualButton.setAttribute(
              "aria-label",
              isDreamCurtainCover
                ? "" +
                    popupModuleTitleElement.textContent +
                    dreamCurtainStatusText(
                      coverStateText || popupCoverState?.state,
                      coverPositionValue,
                      isCoverMotorReversed
                    )
                : "" +
                    popupModuleTitleElement.textContent +
                    (coverDisplayState === "open" || coverDisplayState === "opening"
                      ? "已打开，点击关闭"
                      : "已关闭，点击打开")
            );
          }
        };
        const popupCoverControls = this.createCoverDetailsControls(
          moduleResolvedEntityId,
          moduleCurrentState,
          {
            interactive: !popupPreviewMode,
            dream: isDreamCurtainCover,
            airer: isAirerCover,
            tilt: supportsCoverTiltControl,
            motorReversed: isCoverMotorReversed,
            positionState: airerFeedbackState,
            positionCommandEntityId: airerPositionEntityId,
            positionCommandState: airerPositionState,
            motorState: airerMotorSpeedState,
            airerActionEntityIds: airerActionEntityIds,
            positionCalibration: airerCalibration,
            onVisualChange: renderPopupCoverVisual,
            onCurtainPositionChange: ({
              retracted: curtainIsRetracted,
              moving: curtainIsMoving
            }) => {
              coverVisualButton.classList.toggle("is-curtain-retracted", curtainIsRetracted);
              coverVisualButton.classList.toggle("is-curtain-moving", curtainIsMoving);
              coverVisualButton.dataset.curtainRetracted = String(curtainIsRetracted);
              if (isDreamCurtainCover) {
                popupModuleStatusElement.textContent = dreamCurtainStatusFromRetraction(
                  curtainIsRetracted,
                  curtainIsMoving,
                  coverPositionPercent
                );
                popupModuleStatusElement.classList.toggle("is-live", curtainIsRetracted);
              }
            }
          }
        );
        let isCoverTogglePending = false;
        coverVisualButton.addEventListener("click", async () => {
          if (popupPreviewMode || isCoverTogglePending) {
            return;
          }
          isCoverTogglePending = true;
          coverVisualButton.setAttribute("aria-busy", "true");
          if (isAirerCover) {
            const previousAirerLightState = airerLightState;
            renderAirerLightState({
              ...(airerLightState || {}),
              state: airerLightState?.state === "on" ? "off" : "on"
            });
            try {
              await this.callEntityService("homeassistant", "toggle", airerLightEntityId);
            } catch (airerLightToggleError) {
              renderAirerLightState(previousAirerLightState);
              this.options.onError?.(airerLightToggleError);
            } finally {
              isCoverTogglePending = false;
              coverVisualButton.removeAttribute("aria-busy");
            }
            return;
          }
          const previousCoverPosition = coverPositionPercent;
          const isCurtainRetractedNow =
            popupCoverControls.isDreamCurtainRetracted?.() ??
            coverVisualButton.dataset.curtainRetracted === "true";
          const shouldCloseCover = previousCoverPosition > COVER_CLOSED_POSITION_EPSILON;
          if (isDreamCurtainCover) {
            popupCoverControls.beginDreamCurtainMotion?.(!isCurtainRetractedNow);
          } else {
            popupCoverControls.beginCoverMotion?.(
              shouldCloseCover ? 0 : 100,
              shouldCloseCover ? "closing" : "opening"
            );
          }
          try {
            await this.callEntityService(
              "cover",
              isDreamCurtainCover
                ? dreamCurtainToggleService(
                    isCurtainRetractedNow,
                    openCoverService,
                    closeCoverService
                  )
                : shouldCloseCover
                  ? closeCoverService
                  : openCoverService,
              moduleResolvedEntityId
            );
          } catch (coverToggleError) {
            if (isDreamCurtainCover) {
              popupCoverControls.cancelDreamCurtainMotion?.();
              popupCoverControls.setDreamCurtainRetracted?.(isCurtainRetractedNow, false);
            } else {
              popupCoverControls.cancelCoverMotion?.();
            }
            popupCoverControls.syncCoverState?.(popupCoverState);
            this.options.onError?.(coverToggleError);
          } finally {
            isCoverTogglePending = false;
            coverVisualButton.removeAttribute("aria-busy");
          }
        });
        registerPopupStateHandler(moduleResolvedEntityId, coverStateUpdate => {
          popupCoverState = coverStateUpdate;
          popupCoverControls.syncCoverState?.(coverStateUpdate);
        });
        if (airerLightEntityId) {
          registerPopupStateHandler(airerLightEntityId, renderAirerLightState);
        }
        if (airerCurrentPositionEntityId) {
          registerPopupStateHandler(airerCurrentPositionEntityId, positionSensorUpdate =>
            popupCoverControls.syncCoverPositionState?.(positionSensorUpdate)
          );
        }
        if (airerPositionEntityId) {
          registerPopupStateHandler(airerPositionEntityId, positionCommandUpdate => {
            popupCoverControls.syncCoverPositionCommandState?.(positionCommandUpdate);
            if (!airerCurrentPositionEntityId) {
              popupCoverControls.syncCoverPositionState?.(positionCommandUpdate);
            }
          });
        }
        if (airerMotorSpeedEntityId) {
          registerPopupStateHandler(airerMotorSpeedEntityId, motorSpeedUpdate =>
            popupCoverControls.syncAirerMotorState?.(motorSpeedUpdate)
          );
        }
        popupCleanupCallbacks.push(() => popupCoverControls.cleanupCoverDetails?.());
        coverLayoutElement.append(coverVisualButton, popupCoverControls);
        popupModuleElement.append(coverLayoutElement);
      } else if (resolvedPopupModule.type === "air-purifier") {
        let popupAirPurifierState = moduleCurrentState || {
          entityId: moduleResolvedEntityId,
          state: "unknown",
          attributes: {}
        };
        const airPurifierVisualButton = document.createElement("button");
        airPurifierVisualButton.type = "button";
        airPurifierVisualButton.className = "hb-air-purifier-visual hb-custom-air-purifier-visual";
        airPurifierVisualButton.inert = popupPreviewMode;
        airPurifierVisualButton.setAttribute("aria-disabled", String(popupPreviewMode));
        const airPurifierAuraElement = document.createElement("i");
        airPurifierAuraElement.className = "hb-air-purifier-visual-aura";
        const airPurifierAirflowElement = document.createElement("span");
        airPurifierAirflowElement.className = "hb-air-purifier-visual-airflow";
        for (
          let airPurifierAirflowIndex = 0;
          airPurifierAirflowIndex < 4;
          airPurifierAirflowIndex += 1
        ) {
          airPurifierAirflowElement.append(document.createElement("i"));
        }
        const airPurifierBodyElement = document.createElement("span");
        airPurifierBodyElement.className = "hb-air-purifier-visual-body";
        const airPurifierTopElement = document.createElement("i");
        airPurifierTopElement.className = "hb-air-purifier-visual-top";
        const airPurifierVentElement = document.createElement("i");
        airPurifierVentElement.className = "hb-air-purifier-visual-vent";
        const airPurifierDisplayElement = document.createElement("span");
        airPurifierDisplayElement.className = "hb-air-purifier-visual-display";
        const airPurifierDisplayValueElement = document.createElement("strong");
        airPurifierDisplayElement.append(airPurifierDisplayValueElement);
        airPurifierBodyElement.append(
          airPurifierTopElement,
          airPurifierVentElement,
          airPurifierDisplayElement
        );
        airPurifierVisualButton.append(
          airPurifierAuraElement,
          airPurifierAirflowElement,
          airPurifierBodyElement
        );
        const airPurifierDetailsControls = this.createCapabilityDetailsControls(
          moduleResolvedEntityId,
          popupAirPurifierState,
          {
            interactive: !popupPreviewMode,
            variant: "air-purifier"
          }
        );
        const airPurifierLayoutElement = document.createElement("div");
        airPurifierLayoutElement.className = "hb-air-purifier-layout hb-custom-air-purifier-layout";
        const airPurifierSummaryElement = document.createElement("section");
        airPurifierSummaryElement.className = "hb-air-purifier-summary";
        const airPurifierGaugeWrapElement = document.createElement("div");
        airPurifierGaugeWrapElement.className = "hb-air-purifier-gauge-wrap";
        const airPurifierGaugeElement = document.createElement("div");
        airPurifierGaugeElement.className = "hb-air-purifier-gauge is-quality";
        const airPurifierGaugeOrbitElement = document.createElement("i");
        airPurifierGaugeOrbitElement.className = "hb-air-purifier-gauge-orbit";
        const airPurifierArcStartElement = document.createElement("i");
        airPurifierArcStartElement.className = "hb-air-purifier-arc-cap start";
        const airPurifierArcEndElement = document.createElement("i");
        airPurifierArcEndElement.className = "hb-air-purifier-arc-cap end";
        const airPurifierGaugeContentElement = document.createElement("div");
        airPurifierGaugeContentElement.className = "hb-air-purifier-gauge-content";
        const airPurifierGaugeLabelElement = document.createElement("small");
        airPurifierGaugeLabelElement.textContent = "室内空气质量";
        const airPurifierQualityValueElement = document.createElement("strong");
        const airPurifierQualityTextElement = document.createElement("span");
        const airPurifierStatusTextElement = document.createElement("span");
        airPurifierStatusTextElement.textContent = "设备状态 --";
        airPurifierQualityValueElement.append(airPurifierQualityTextElement);
        airPurifierGaugeContentElement.append(
          airPurifierGaugeLabelElement,
          airPurifierQualityValueElement,
          airPurifierStatusTextElement
        );
        airPurifierGaugeElement.append(
          airPurifierArcStartElement,
          airPurifierArcEndElement,
          airPurifierGaugeContentElement
        );
        airPurifierGaugeWrapElement.append(airPurifierGaugeOrbitElement, airPurifierGaugeElement);
        const airPurifierControlsPaneElement = document.createElement("section");
        airPurifierControlsPaneElement.className = "hb-air-purifier-controls-pane";
        airPurifierControlsPaneElement.append(airPurifierDetailsControls);
        const airPurifierMetricLabels = {
          pm25: "PM2.5",
          pm10: "PM10",
          filterLife: "滤芯寿命",
          filterLeftTime: "滤芯剩余时间",
          hcho: "甲醛",
          temperature: "温度",
          humidity: "湿度"
        };
        const airPurifierMetricDefinitions = [
          {
            role: "pm25",
            ids: [moduleDeviceProfile?.roles?.pm25]
          },
          {
            role: "pm10",
            ids: [moduleDeviceProfile?.roles?.pm10]
          },
          {
            role: "filterLife",
            ids: [
              moduleDeviceProfile?.roles?.filterLife,
              moduleDeviceProfile?.roles?.filterLeftTime
            ]
          },
          {
            role: "hcho",
            ids: [moduleDeviceProfile?.roles?.hcho]
          },
          {
            role: "temperature",
            ids: [moduleDeviceProfile?.roles?.temperature]
          },
          {
            role: "humidity",
            ids: [moduleDeviceProfile?.roles?.humidity]
          }
        ].map(airMetricDefinition => ({
          ...airMetricDefinition,
          ids: airMetricDefinition.ids.filter(Boolean)
        }));
        const getEntityStateRecord = entityId => {
          const entityStateRecord = this.states.get(entityId);
          return entityStateRecord?.newState || entityStateRecord || null;
        };
        const hasNumericEntityState = stateEntityId => {
          const entityStateValue = getEntityStateRecord(stateEntityId);
          return (
            entityStateValue &&
            !["unknown", "unavailable"].includes(
              String(entityStateValue.state || "").toLowerCase()
            ) &&
            Number.isFinite(Number(entityStateValue.state))
          );
        };
        const airPurifierMetrics = airPurifierMetricDefinitions
          .map(airMetricItem => ({
            ...airMetricItem,
            id:
              airMetricItem.ids.find(candidateEntityId =>
                hasNumericEntityState(candidateEntityId)
              ) ||
              airMetricItem.ids.find(fallbackEntityId => this.entityMetadata.has(fallbackEntityId))
          }))
          .filter(metricWithId => metricWithId.id)
          .slice(0, 3);
        const airPurifierSecondaryMetricsElement = document.createElement("div");
        airPurifierSecondaryMetricsElement.className =
          "hb-air-purifier-secondary-metrics hb-custom-air-purifier-metrics";
        for (const metric of airPurifierMetrics) {
          const metricMetadata = this.entityMetadata.get(metric.id);
          const metricRowElement = document.createElement("div");
          metricRowElement.className =
            "hb-air-purifier-secondary-metric hb-air-purifier-secondary-metric--" + metric.role;
          const metricLabelElement = document.createElement("small");
          metricLabelElement.textContent = airPurifierMetricLabels[metric.role] || metric.role;
          const metricStrongElement = document.createElement("strong");
          metricRowElement.append(metricLabelElement, metricStrongElement);
          airPurifierSecondaryMetricsElement.append(metricRowElement);
          const renderMetricValue = metricState => {
            metricStrongElement.textContent = ["unknown", "unavailable"].includes(
              String(metricState?.state || "").toLowerCase()
            )
              ? "--"
              : (
                  (metricState?.state ?? "--") +
                  " " +
                  (metricState?.attributes?.unit_of_measurement ||
                    metricMetadata?.unitOfMeasurement ||
                    "")
                ).trim();
          };
          renderMetricValue(getEntityStateRecord(metric.id));
          registerPopupStateHandler(metric.id, renderMetricValue);
        }
        const airQualityRoleId = moduleDeviceProfile?.roles?.airQuality;
        const pm25RoleId = moduleDeviceProfile?.roles?.pm25;
        const renderAirQualityGauge = () => {
          const airQualityStateValue = getEntityStateRecord(airQualityRoleId);
          const pm25State = getEntityStateRecord(pm25RoleId);
          const airQualityText = ["unknown", "unavailable"].includes(
            String(airQualityStateValue?.state || "").toLowerCase()
          )
            ? ""
            : String(airQualityStateValue?.state || "").trim();
          const pm25Value = Number(pm25State?.state);
          const airQualityKey = airQualityText.toLowerCase();
          let airQualityLabel = airQualityText;
          let airQualityGrade = "unknown";
          if (/excellent|优/.test(airQualityKey)) {
            airQualityGrade = "excellent";
          } else if (/good|良/.test(airQualityKey)) {
            airQualityGrade = "good";
          } else if (/moderate|fair|一般|轻度|污染/.test(airQualityKey)) {
            airQualityGrade = "warning";
          } else if (/poor|unhealthy|较差|中度|重度|严重/.test(airQualityKey)) {
            airQualityGrade = "poor";
          } else if (Number.isFinite(pm25Value)) {
            airQualityGrade =
              pm25Value <= 15
                ? "excellent"
                : pm25Value <= 35
                  ? "good"
                  : pm25Value <= 75
                    ? "warning"
                    : "poor";
            airQualityLabel = {
              excellent: "空气优",
              good: "空气良",
              warning: "轻度污染",
              poor: "空气较差"
            }[airQualityGrade];
          }
          airPurifierQualityTextElement.textContent = airQualityLabel || "--";
          airPurifierGaugeElement.style.setProperty(
            "--hb-air-purifier-progress",
            {
              excellent: 72,
              good: 58,
              warning: 42,
              poor: 26,
              unknown: 0
            }[airQualityGrade] + "%"
          );
          airPurifierGaugeElement.classList.toggle("is-warning", airQualityGrade === "warning");
          airPurifierGaugeElement.classList.toggle("is-poor", airQualityGrade === "poor");
          const airQualityColor = {
            excellent: "#76cfa1",
            good: "#76cfa1",
            warning: "#e4b15f",
            poor: "#db7770",
            unknown: "#7d8990"
          }[airQualityGrade];
          const airQualitySoftColor = {
            excellent: "rgba(118,207,161,.13)",
            good: "rgba(118,207,161,.13)",
            warning: "rgba(228,177,95,.15)",
            poor: "rgba(219,119,112,.15)",
            unknown: "rgba(125,137,144,.13)"
          }[airQualityGrade];
          popupModuleElement.style.setProperty("--hb-air-purifier-accent", airQualityColor);
          popupModuleElement.style.setProperty(
            "--hb-air-purifier-accent-soft",
            airQualitySoftColor
          );
        };
        if (airQualityRoleId) {
          registerPopupStateHandler(airQualityRoleId, renderAirQualityGauge);
        }
        if (pm25RoleId && pm25RoleId !== airQualityRoleId) {
          registerPopupStateHandler(pm25RoleId, renderAirQualityGauge);
        }
        renderAirQualityGauge();
        const renderAirPurifierPower = (airPurifierNextState = popupAirPurifierState) => {
          popupAirPurifierState = airPurifierNextState || popupAirPurifierState;
          const airPurifierStateKey = String(popupAirPurifierState?.state || "").toLowerCase();
          const isAirPurifierUnavailable = ["unknown", "unavailable"].includes(airPurifierStateKey);
          const isAirPurifierOn = !isAirPurifierUnavailable && airPurifierStateKey !== "off";
          airPurifierDisplayValueElement.textContent = isAirPurifierOn ? "ON" : "OFF";
          airPurifierVisualButton.classList.toggle("is-on", isAirPurifierOn);
          airPurifierVisualButton.classList.toggle("is-unavailable", isAirPurifierUnavailable);
          airPurifierVisualButton.setAttribute("aria-pressed", String(isAirPurifierOn));
          airPurifierVisualButton.setAttribute(
            "aria-label",
            "" +
              popupModuleTitleElement.textContent +
              (isAirPurifierOn ? "已开启，点击关闭" : "已关闭，点击开启")
          );
          popupModuleStatusElement.textContent = isAirPurifierUnavailable
            ? "当前不可用"
            : isAirPurifierOn
              ? "已开启"
              : "已关闭";
          popupModuleStatusElement.classList.toggle("is-live", isAirPurifierOn);
          airPurifierStatusTextElement.textContent = isAirPurifierUnavailable
            ? "设备不可用"
            : isAirPurifierOn
              ? "净化中"
              : "已关闭";
          airPurifierGaugeElement.classList.toggle("is-running", isAirPurifierOn);
          airPurifierGaugeOrbitElement.classList.toggle("is-running", isAirPurifierOn);
          airPurifierDetailsControls.syncCapabilityState?.(popupAirPurifierState);
        };
        renderAirPurifierPower();
        let isAirPurifierTogglePending = false;
        airPurifierVisualButton.addEventListener("click", async () => {
          if (
            popupPreviewMode ||
            isAirPurifierTogglePending ||
            ["unknown", "unavailable"].includes(
              String(popupAirPurifierState?.state || "").toLowerCase()
            )
          ) {
            return;
          }
          isAirPurifierTogglePending = true;
          airPurifierVisualButton.setAttribute("aria-busy", "true");
          const previousAirPurifierState = popupAirPurifierState;
          const isAirPurifierOff =
            String(previousAirPurifierState?.state || "").toLowerCase() === "off";
          renderAirPurifierPower({
            ...previousAirPurifierState,
            state: isAirPurifierOff ? "on" : "off"
          });
          try {
            await this.callEntityService(
              "fan",
              isAirPurifierOff ? "turn_on" : "turn_off",
              moduleResolvedEntityId
            );
          } catch (airPurifierToggleError) {
            renderAirPurifierPower(previousAirPurifierState);
            this.options.onError?.(airPurifierToggleError);
          } finally {
            isAirPurifierTogglePending = false;
            airPurifierVisualButton.removeAttribute("aria-busy");
          }
        });
        registerPopupStateHandler(moduleResolvedEntityId, renderAirPurifierPower);
        popupModuleHeadingElement.append(airPurifierVisualButton);
        airPurifierSummaryElement.append(
          airPurifierGaugeWrapElement,
          airPurifierSecondaryMetricsElement
        );
        airPurifierLayoutElement.append(airPurifierSummaryElement, airPurifierControlsPaneElement);
        popupModuleElement.append(airPurifierLayoutElement);
      } else if (resolvedPopupModule.type === "media-player") {
        popupModuleTitleElement.textContent = popupModuleDialogTitle(
          resolvedPopupModule,
          moduleCurrentState,
          "媒体"
        );
        popupModuleElement.classList.add("hb-media-player-details");
        const mediaSpeakerElement = document.createElement("div");
        mediaSpeakerElement.className = "hb-media-speaker-visual";
        mediaSpeakerElement.setAttribute("aria-hidden", "true");
        mediaSpeakerVisuals.push(mediaSpeakerElement);
        const mediaSpeakerBodyElement = document.createElement("i");
        mediaSpeakerBodyElement.className = "hb-media-speaker-body";
        const mediaSpeakerArtworkElement = document.createElement("img");
        mediaSpeakerArtworkElement.className = "hb-media-speaker-artwork";
        mediaSpeakerArtworkElement.alt = "";
        mediaSpeakerArtworkElement.hidden = true;
        const mediaSpeakerLightElement = document.createElement("i");
        mediaSpeakerLightElement.className = "hb-media-speaker-light";
        mediaSpeakerElement.append(
          mediaSpeakerBodyElement,
          mediaSpeakerArtworkElement,
          mediaSpeakerLightElement
        );
        popupModuleHeadingElement.append(mediaSpeakerElement);
        const popupMediaBodyElement = document.createElement("div");
        popupMediaBodyElement.className =
          "hb-media-player-details-body hb-custom-media-player-body";
        const mediaNowPlayingElement = document.createElement("section");
        mediaNowPlayingElement.className = "hb-media-player-now-playing";
        const mediaArtworkElement = document.createElement("img");
        mediaArtworkElement.className = "hb-media-player-artwork";
        mediaArtworkElement.alt = "";
        mediaArtworkElement.hidden = true;
        const mediaCopyElement = document.createElement("div");
        mediaCopyElement.className = "hb-media-player-copy";
        const mediaTitleElement = document.createElement("strong");
        const mediaSubtitleElement = document.createElement("span");
        const mediaProgressElement = document.createElement("div");
        mediaProgressElement.className = "hb-media-player-progress";
        mediaProgressElement.hidden = true;
        const mediaProgressBarElement = document.createElement("progress");
        mediaProgressBarElement.max = 1;
        mediaProgressBarElement.value = 0;
        const mediaTimeRowElement = document.createElement("span");
        const mediaElapsedTimeElement = document.createElement("time");
        const mediaDurationTimeElement = document.createElement("time");
        mediaTimeRowElement.append(mediaElapsedTimeElement, mediaDurationTimeElement);
        mediaProgressElement.append(mediaProgressBarElement, mediaTimeRowElement);
        mediaCopyElement.append(mediaTitleElement, mediaSubtitleElement, mediaProgressElement);
        mediaNowPlayingElement.append(mediaArtworkElement, mediaCopyElement);
        const popupMediaActionsElement = document.createElement("div");
        popupMediaActionsElement.className = "hb-media-player-actions";
        const createPopupMediaActionButton = (buttonLabel, buttonService) => {
          const popupMediaActionButton = document.createElement("button");
          popupMediaActionButton.type = "button";
          popupMediaActionButton.textContent = buttonLabel;
          popupMediaActionButton.addEventListener("click", async () => {
            if (!popupPreviewMode) {
              popupMediaActionButton.disabled = true;
              try {
                await this.callEntityService("media_player", buttonService, moduleResolvedEntityId);
              } catch (popupMediaActionError) {
                this.options.onError?.(popupMediaActionError);
              } finally {
                popupMediaActionButton.disabled = false;
              }
            }
          });
          popupMediaActionsElement.append(popupMediaActionButton);
          return popupMediaActionButton;
        };
        const popupPreviousTrackButton = createPopupMediaActionButton(
          "上一曲",
          "media_previous_track"
        );
        const popupPlayPauseButton = createPopupMediaActionButton("播放", "media_play_pause");
        const popupNextTrackButton = createPopupMediaActionButton("下一曲", "media_next_track");
        const popupMediaBrowserControl = this.createMediaBrowserControl(moduleResolvedEntityId, {
          preview: popupPreviewMode
        });
        popupCleanupCallbacks.push(() => popupMediaBrowserControl.cleanup?.());
        const popupVolumeGroupElement = document.createElement("section");
        popupVolumeGroupElement.className = "hb-capability-range-group";
        const popupVolumeHeadingElement = document.createElement("div");
        popupVolumeHeadingElement.className = "hb-capability-range-heading";
        const volumeLabelElement = document.createElement("strong");
        volumeLabelElement.textContent = "音量";
        const popupVolumeOutputElement = document.createElement("output");
        popupVolumeHeadingElement.append(volumeLabelElement, popupVolumeOutputElement);
        const volumeSliderElement = document.createElement("input");
        volumeSliderElement.type = "range";
        volumeSliderElement.min = "0";
        volumeSliderElement.max = "1";
        volumeSliderElement.step = ".01";
        volumeSliderElement.disabled = popupPreviewMode;
        popupVolumeGroupElement.append(popupVolumeHeadingElement, volumeSliderElement);
        let currentArtworkUrl = "";
        let popupMediaDurationSeconds = null;
        let popupMediaPositionSeconds = 0;
        let popupPositionUpdatedAtMs = null;
        let isPopupMediaPlaying = false;
        let pendingVolumeLevel = null;
        let confirmedVolumeLevel = null;
        let localVolumeLevel = null;
        let queuedVolumeLevel = null;
        let isVolumeRequestPending = false;
        let volumeRetryTimer = null;
        let volumeResyncTimer = null;
        const formatMediaTime = timeSeconds => {
          const popupTotalSeconds = Math.max(0, Math.floor(Number(timeSeconds) || 0));
          return (
            Math.floor(popupTotalSeconds / 60) +
            ":" +
            String(popupTotalSeconds % 60).padStart(2, "0")
          );
        };
        const renderMediaProgress = () => {
          if (!Number.isFinite(popupMediaDurationSeconds) || popupMediaDurationSeconds <= 0) {
            mediaProgressElement.hidden = true;
            return;
          }
          let elapsedSeconds = Number.isFinite(popupMediaPositionSeconds)
            ? popupMediaPositionSeconds
            : 0;
          if (isPopupMediaPlaying && Number.isFinite(popupPositionUpdatedAtMs)) {
            elapsedSeconds += Math.max(0, (Date.now() - popupPositionUpdatedAtMs) / 1000);
          }
          elapsedSeconds = Math.max(0, Math.min(popupMediaDurationSeconds, elapsedSeconds));
          mediaProgressElement.hidden = false;
          mediaProgressBarElement.max = popupMediaDurationSeconds;
          mediaProgressBarElement.value = elapsedSeconds;
          mediaElapsedTimeElement.textContent = formatMediaTime(elapsedSeconds);
          mediaDurationTimeElement.textContent = formatMediaTime(popupMediaDurationSeconds);
        };
        const mediaProgressTimer = window.setInterval(renderMediaProgress, 1000);
        popupCleanupCallbacks.push(() => {
          window.clearInterval(mediaProgressTimer);
          window.clearTimeout(volumeRetryTimer);
          window.clearTimeout(volumeResyncTimer);
        });
        mediaArtworkElement.addEventListener("error", () => {
          mediaArtworkElement.hidden = true;
          mediaNowPlayingElement.classList.remove("has-artwork");
        });
        mediaArtworkElement.addEventListener("load", () => {
          mediaArtworkElement.hidden = false;
          mediaNowPlayingElement.classList.add("has-artwork");
        });
        mediaSpeakerArtworkElement.addEventListener("error", () => {
          mediaSpeakerArtworkElement.hidden = true;
          mediaSpeakerElement.classList.remove("has-artwork");
        });
        mediaSpeakerArtworkElement.addEventListener("load", () => {
          mediaSpeakerArtworkElement.hidden = false;
          mediaSpeakerElement.classList.add("has-artwork");
        });
        const areNumbersClose = (firstNumber, secondNumber) =>
          Number.isFinite(firstNumber) &&
          Number.isFinite(secondNumber) &&
          Math.abs(firstNumber - secondNumber) <= 0.005;
        const renderPopupVolumeLevel = popupVolumeLevel => {
          pendingVolumeLevel = Math.max(0, Math.min(1, Number(popupVolumeLevel) || 0));
          volumeSliderElement.value = String(pendingVolumeLevel);
          popupVolumeOutputElement.textContent = Math.round(pendingVolumeLevel * 100) + "%";
        };
        const flushVolumeRequest = async () => {
          window.clearTimeout(volumeRetryTimer);
          volumeRetryTimer = null;
          if (isVolumeRequestPending || queuedVolumeLevel === null) {
            return;
          }
          const requestedVolumeLevel = queuedVolumeLevel;
          queuedVolumeLevel = null;
          isVolumeRequestPending = true;
          try {
            await this.callEntityService("media_player", "volume_set", moduleResolvedEntityId, {
              volume_level: requestedVolumeLevel
            });
          } catch (volumeRequestError) {
            queuedVolumeLevel = null;
            localVolumeLevel = null;
            window.clearTimeout(volumeResyncTimer);
            if (confirmedVolumeLevel !== null) {
              renderPopupVolumeLevel(confirmedVolumeLevel);
            }
            this.options.onError?.(volumeRequestError);
          } finally {
            isVolumeRequestPending = false;
            if (
              queuedVolumeLevel !== null &&
              !areNumbersClose(queuedVolumeLevel, requestedVolumeLevel)
            ) {
              volumeRetryTimer = window.setTimeout(flushVolumeRequest, 140);
            }
          }
        };
        const handleVolumeChange = () => {
          const sliderVolumeLevel = Math.max(
            0,
            Math.min(1, Number(volumeSliderElement.value) || 0)
          );
          localVolumeLevel = sliderVolumeLevel;
          queuedVolumeLevel = sliderVolumeLevel;
          window.clearTimeout(volumeResyncTimer);
          if (!isVolumeRequestPending) {
            window.clearTimeout(volumeRetryTimer);
            volumeRetryTimer = window.setTimeout(flushVolumeRequest, 120);
          }
        };
        volumeSliderElement.addEventListener("input", () =>
          renderPopupVolumeLevel(volumeSliderElement.value)
        );
        volumeSliderElement.addEventListener("change", handleVolumeChange);
        const renderMediaPlayerState = popupMediaState => {
          const mediaAttributes = popupMediaState?.attributes || {};
          const mediaStateKey = String(popupMediaState?.state || "unknown").toLowerCase();
          const mediaSupportedFeatures = Number(mediaAttributes.supported_features || 0);
          popupMediaBrowserControl.sync(popupMediaState);
          const mediaStateLabels = {
            off: "已关闭",
            on: "已开启",
            idle: "空闲",
            playing: "播放中",
            paused: "已暂停",
            buffering: "缓冲中",
            standby: "待机",
            unavailable: "不可用",
            unknown: "未知状态"
          };
          popupModuleStatusElement.textContent =
            mediaStateLabels[mediaStateKey] || popupMediaState?.state || "未知状态";
          popupModuleStatusElement.classList.toggle(
            "is-live",
            ["playing", "paused"].includes(mediaStateKey)
          );
          mediaTitleElement.textContent =
            mediaAttributes.media_title ||
            mediaAttributes.media_series_title ||
            mediaAttributes.app_name ||
            mediaAttributes.source ||
            "暂无播放内容";
          mediaSubtitleElement.textContent =
            [mediaAttributes.media_artist, mediaAttributes.media_album_name]
              .filter(Boolean)
              .join(" · ") ||
            mediaAttributes.media_content_type ||
            "媒体播放器";
          popupPlayPauseButton.textContent = mediaStateKey === "playing" ? "暂停" : "播放";
          popupPlayPauseButton.disabled =
            popupPreviewMode || ["off", "unavailable", "unknown"].includes(mediaStateKey);
          popupPreviousTrackButton.disabled = popupPreviewMode || !(mediaSupportedFeatures & 16);
          popupNextTrackButton.disabled = popupPreviewMode || !(mediaSupportedFeatures & 32);
          mediaSpeakerElement.classList.toggle("is-playing", mediaStateKey === "playing");
          mediaSpeakerElement.classList.toggle("is-paused", mediaStateKey === "paused");
          mediaSpeakerElement.classList.toggle(
            "is-off",
            ["off", "unavailable", "unknown"].includes(mediaStateKey)
          );
          popupMediaDurationSeconds = Number.isFinite(Number(mediaAttributes.media_duration))
            ? Number(mediaAttributes.media_duration)
            : null;
          popupMediaPositionSeconds = Number.isFinite(Number(mediaAttributes.media_position))
            ? Number(mediaAttributes.media_position)
            : 0;
          const positionUpdatedAtTimestamp = Date.parse(
            String(mediaAttributes.media_position_updated_at || "")
          );
          popupPositionUpdatedAtMs = Number.isFinite(positionUpdatedAtTimestamp)
            ? positionUpdatedAtTimestamp
            : null;
          isPopupMediaPlaying = mediaStateKey === "playing";
          renderMediaProgress();
          const remoteVolumeLevel = Number(mediaAttributes.volume_level);
          popupVolumeGroupElement.hidden = !Number.isFinite(remoteVolumeLevel);
          if (Number.isFinite(remoteVolumeLevel)) {
            if (localVolumeLevel === null) {
              confirmedVolumeLevel = remoteVolumeLevel;
              renderPopupVolumeLevel(remoteVolumeLevel);
            } else if (areNumbersClose(remoteVolumeLevel, localVolumeLevel)) {
              confirmedVolumeLevel = remoteVolumeLevel;
              renderPopupVolumeLevel(localVolumeLevel);
              window.clearTimeout(volumeResyncTimer);
              volumeResyncTimer = window.setTimeout(() => {
                localVolumeLevel = null;
              }, 1800);
            } else {
              window.clearTimeout(volumeResyncTimer);
            }
          }
          const popupArtworkUrl =
            [
              mediaAttributes.entity_picture_local,
              mediaAttributes.entity_picture,
              mediaAttributes.media_image_url
            ]
              .map(artworkCandidateUrl => String(artworkCandidateUrl || "").trim())
              .find(
                artworkProxyUrl =>
                  artworkProxyUrl.startsWith("/api/media_player_proxy/") ||
                  artworkProxyUrl.startsWith("/api/image_proxy/")
              ) || "";
          if (popupArtworkUrl !== currentArtworkUrl) {
            currentArtworkUrl = popupArtworkUrl;
            mediaArtworkElement.hidden = !currentArtworkUrl;
            mediaSpeakerArtworkElement.hidden = !currentArtworkUrl;
            mediaNowPlayingElement.classList.toggle("has-artwork", !!currentArtworkUrl);
            mediaSpeakerElement.classList.toggle("has-artwork", !!currentArtworkUrl);
            if (currentArtworkUrl) {
              mediaArtworkElement.src = currentArtworkUrl;
              mediaSpeakerArtworkElement.src = currentArtworkUrl;
            } else {
              mediaArtworkElement.removeAttribute("src");
              mediaSpeakerArtworkElement.removeAttribute("src");
            }
          }
        };
        mediaNowPlayingElement.append(popupMediaBrowserControl.root);
        renderMediaPlayerState(moduleCurrentState);
        registerPopupStateHandler(moduleResolvedEntityId, renderMediaPlayerState);
        popupMediaBodyElement.append(
          mediaNowPlayingElement,
          popupMediaActionsElement,
          popupVolumeGroupElement
        );
        mediaBrowserPanels.push(popupMediaBrowserControl.panel);
        popupModuleElement.append(popupMediaBodyElement);
      } else {
        const genericStatusElement = document.createElement("p");
        genericStatusElement.className = "hb-custom-popup-generic";
        const renderGenericStatus = genericStatusState => {
          genericStatusElement.textContent =
            "当前状态：" + (genericStatusState?.state ?? "暂无状态");
        };
        renderGenericStatus(moduleCurrentState);
        registerPopupStateHandler(moduleResolvedEntityId, renderGenericStatus);
        popupModuleElement.append(genericStatusElement);
      }
      popupGridElement.append(popupModuleElement);
    }
    if (!(popupDefinition.modules || []).length) {
      const emptyModulesElement = document.createElement("p");
      emptyModulesElement.className = "hb-custom-popup-generic";
      emptyModulesElement.textContent = "这个组合弹窗还没有添加模块。";
      popupGridElement.append(emptyModulesElement);
    }
    popupCardElement.append(popupHeadingElement, popupGridElement, ...mediaBrowserPanels);
    popupDialogElement.append(popupCardElement);
    const popupDialogLayerElement = document.createElement("div");
    popupDialogLayerElement.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    popupDialogLayerElement.tabIndex = -1;
    popupDialogLayerElement.append(popupDialogElement);
    this.container.append(popupDialogLayerElement);
    this.detailsDialog = popupDialogElement;
    const buildModulesSignature = moduleList =>
      moduleList
        .map(popupModuleEntry => {
          const bedDeviceProfile =
            popupModuleEntry.type === "electric-bed"
              ? this.deviceProfile(this.runtimeEntityId(popupModuleEntry.entityId))
              : null;
          const bedDeviceRoles =
            bedDeviceProfile?.deviceType === "electric-bed" ? bedDeviceProfile.roles || {} : {};
          return [
            popupModuleEntry.id,
            bedDeviceProfile?.deviceType || popupModuleEntry.type || "generic",
            "backrest",
            "leg",
            "waist",
            "mode",
            "memory1",
            "memory2"
          ]
            .map(bedRoleName =>
              String(
                bedRoleName === popupModuleEntry.id
                  ? popupModuleEntry.id
                  : bedDeviceRoles[bedRoleName] || ""
              )
            )
            .join(":");
        })
        .join("|");
    const modulesSignature = buildModulesSignature(popupModules);
    this.detailsStateSync = {
      dialog: popupDialogElement,
      handlers: popupHandlersByEntityId,
      refreshHistory: () => chartRefreshCleanups.forEach(refreshCleanup => refreshCleanup()),
      refreshEntityCatalog: () => {
        if (this.detailsDialog === popupDialogElement && !!popupDialogElement.open) {
          if (buildModulesSignature(popupModules) !== modulesSignature) {
            this.showCustomPopup(popupDefinition, {
              preview: popupPreviewMode
            });
          }
        }
      }
    };
    this.registerRuntimeDialogScale(
      popupDialogLayerElement,
      popupDialogElement,
      popupWidthPx,
      popupHeightPx
    );
    popupCloseButton.addEventListener("click", () => popupDialogElement.close());
    this.bindRuntimeDialogOutsideDismiss(
      popupDialogLayerElement,
      popupDialogElement,
      popupCardElement
    );
    popupDialogLayerElement.addEventListener("keydown", dialogKeyEvent => {
      if (dialogKeyEvent.key === "Escape") {
        popupDialogElement.close();
      }
    });
    popupDialogElement.addEventListener(
      "close",
      () => {
        for (const popupCleanupCallback of popupCleanupCallbacks.splice(0)) {
          popupCleanupCallback();
        }
        this.clearRuntimeDialogScale(popupDialogElement);
        if (this.detailsDialog === popupDialogElement) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === popupDialogElement) {
          this.detailsStateSync = null;
        }
        if (!this.replacingDocument && this.activePopupId === String(popupDefinition?.id || "")) {
          this.activePopupId = null;
          this.historyPopupGeneration += 1;
          this.connectRuntime();
          this.refreshHistorySeries();
        }
        popupDialogLayerElement.remove();
      },
      {
        once: true
      }
    );
    popupDialogElement.show();
    this.refreshHistorySeries();
    for (const speakerVisualEntry of mediaSpeakerVisuals) {
      const speakerEntranceHandle = playMediaSpeakerEntrance(speakerVisualEntry);
      if (speakerEntranceHandle) {
        popupCleanupCallbacks.push(() => speakerEntranceHandle.cancel());
      }
    }
    for (const dropEntranceEntry of deviceDropEntries) {
      const dropEntranceAnimation = playFixedDeviceDropEntrance(
        dropEntranceEntry.visual,
        dropEntranceEntry
      );
      if (dropEntranceAnimation) {
        popupCleanupCallbacks.push(() => dropEntranceAnimation.cancel());
      }
    }
  }
  createLightDetailsControls(
    lightControlsEntityId,
    lightControlsState,
    {
      interactive: lightControlsInteractive = true,
      onTurnOn: lightTurnOnCallback = null,
      onVisualChange: lightVisualChangeCallback = null
    } = {}
  ) {
    const detailLightAttributes = lightControlsState?.attributes || {};
    const isLightDomain = lightControlsEntityId.startsWith("light.");
    const isColorSupported = isLightDomain && lightSupportsColor(detailLightAttributes);
    const { brightness: supportsBrightness, colorTemperature: supportsColorTemperature } =
      lightRealtimeCapabilities(lightControlsEntityId, lightControlsState);
    const supportsTemperatureOnly = supportsColorTemperature && !isColorSupported;
    const lightControlsElement = document.createElement("section");
    lightControlsElement.className = "hb-light-details-controls";
    lightControlsElement.classList.toggle("has-color-picker", isColorSupported);
    lightControlsElement.inert = !lightControlsInteractive;
    const slidersByDataKey = new Map();
    const createLightSlider = ({
      label: sliderLabelText,
      value: sliderInitialValue,
      minimum: sliderMinimum,
      maximum: sliderMaximum,
      step: sliderStep,
      suffix: sliderSuffix,
      dataKey: sliderDataKey,
      className: sliderClassName = "",
      icon: sliderIcon,
      minimumLabel: sliderMinimumLabel,
      maximumLabel: sliderMaximumLabel,
      supported: sliderSupported = true
    }) => {
      const sliderLabelElement = document.createElement("label");
      sliderLabelElement.className = ("hb-light-details-slider " + sliderClassName).trim();
      sliderLabelElement.classList.toggle("is-unavailable", !sliderSupported);
      const sliderHeadingElement = document.createElement("span");
      sliderHeadingElement.className = "hb-light-details-slider-heading";
      const sliderIconElement = document.createElement("i");
      sliderIconElement.className = "hb-light-details-slider-icon";
      sliderIconElement.setAttribute("aria-hidden", "true");
      sliderIconElement.textContent = sliderIcon;
      const sliderNameElement = document.createElement("strong");
      sliderNameElement.textContent = sliderLabelText;
      const sliderOutputElement = document.createElement("output");
      const clampedSliderValue = Math.max(
        sliderMinimum,
        Math.min(sliderMaximum, sliderInitialValue)
      );
      sliderOutputElement.textContent = "" + Math.round(clampedSliderValue) + sliderSuffix;
      sliderHeadingElement.append(sliderIconElement, sliderNameElement, sliderOutputElement);
      const sliderInputElement = document.createElement("input");
      sliderInputElement.type = "range";
      sliderInputElement.min = String(sliderMinimum);
      sliderInputElement.max = String(sliderMaximum);
      sliderInputElement.step = String(sliderStep);
      sliderInputElement.value = String(clampedSliderValue);
      sliderInputElement.disabled = !sliderSupported;
      const updateSliderValue = ({ notify: shouldNotify = false } = {}) => {
        const inputSliderValue = Number(sliderInputElement.value);
        const sliderProgressPercent =
          ((inputSliderValue - sliderMinimum) / Math.max(1, sliderMaximum - sliderMinimum)) * 100;
        sliderOutputElement.textContent = sliderSupported
          ? "" + Math.round(inputSliderValue) + sliderSuffix
          : "不支持";
        sliderInputElement.style.setProperty(
          "--hb-light-slider-progress",
          Math.max(0, Math.min(100, sliderProgressPercent)) + "%"
        );
        if (shouldNotify && sliderSupported) {
          lightVisualChangeCallback?.(
            sliderDataKey === "brightness_pct"
              ? {
                  brightnessPercent: inputSliderValue
                }
              : {
                  colorTemperatureKelvin: inputSliderValue
                }
          );
        }
      };
      updateSliderValue();
      sliderInputElement.addEventListener("input", () => {
        clearPresetPending();
        updateSliderValue({
          notify: true
        });
      });
      sliderInputElement.addEventListener("change", async () => {
        if (!!lightControlsInteractive && !!sliderSupported) {
          try {
            await this.callEntityService("light", "turn_on", lightControlsEntityId, {
              [sliderDataKey]: Number(sliderInputElement.value)
            });
            lightTurnOnCallback?.();
          } catch (sliderSetError) {
            this.options.onError?.(sliderSetError);
            sliderOutputElement.textContent = "设置失败";
          }
        }
      });
      const sliderLegendElement = document.createElement("span");
      sliderLegendElement.className = "hb-light-details-slider-legend";
      const sliderMinLabelElement = document.createElement("small");
      sliderMinLabelElement.textContent = sliderMinimumLabel;
      const sliderMaxLabelElement = document.createElement("small");
      sliderMaxLabelElement.textContent = sliderMaximumLabel;
      sliderLegendElement.append(sliderMinLabelElement, sliderMaxLabelElement);
      sliderLabelElement.append(sliderHeadingElement, sliderInputElement, sliderLegendElement);
      lightControlsElement.append(sliderLabelElement);
      slidersByDataKey.set(sliderDataKey, {
        input: sliderInputElement,
        updateSliderValue: updateSliderValue,
        supported: sliderSupported
      });
    };
    let colorPickerElement = null;
    let colorHs = null;
    let isColorRequestPending = false;
    if (isColorSupported) {
      const initialHsColor = Array.isArray(detailLightAttributes.hs_color)
        ? detailLightAttributes.hs_color
        : rgbToHsColor(detailLightAttributes.rgb_color) || [0, 100];
      colorHs = {
        hue: Number(initialHsColor[0]) || 0,
        saturation: Number(initialHsColor[1]) || 0
      };
      colorPickerElement = document.createElement("div");
      colorPickerElement.className = "hb-light-color-picker";
      colorPickerElement.setAttribute("role", "slider");
      colorPickerElement.setAttribute("tabindex", lightControlsInteractive ? "0" : "-1");
      colorPickerElement.setAttribute("aria-label", "选择灯光颜色");
      const colorPickerGlowElement = document.createElement("i");
      colorPickerGlowElement.className = "hb-light-color-picker-glow";
      const colorPickerHandleElement = document.createElement("i");
      colorPickerHandleElement.className = "hb-light-color-picker-handle";
      colorPickerElement.append(colorPickerGlowElement, colorPickerHandleElement);
      const getColorPickerPoint = () =>
        lightColorPickerPointFromHs([colorHs.hue, colorHs.saturation]);
      const applyColorPickerHs = ({
        hue: pickerHue = colorHs.hue,
        saturation: pickerSaturation = colorHs.saturation
      } = {}) => {
        colorHs.hue = (((Number(pickerHue) || 0) % 360) + 360) % 360;
        colorHs.saturation = Math.max(0, Math.min(100, Number(pickerSaturation) || 0));
        const colorPickerPoint = getColorPickerPoint();
        const colorPickerRgb = hsToRgbColor([colorHs.hue, colorHs.saturation]);
        const colorPickerCssColor = "rgb(" + colorPickerRgb.join(",") + ")";
        colorPickerElement.style.setProperty(
          "--hb-light-color-picker-x",
          colorPickerPoint.x * 100 + "%"
        );
        colorPickerElement.style.setProperty(
          "--hb-light-color-picker-y",
          colorPickerPoint.y * 100 + "%"
        );
        colorPickerElement.style.setProperty("--hb-light-color-picker-color", colorPickerCssColor);
        colorPickerElement.setAttribute(
          "aria-valuetext",
          "色相 " + Math.round(colorHs.hue) + " 度，饱和度 " + Math.round(colorHs.saturation) + "%"
        );
        lightVisualChangeCallback?.({
          colorHs: [colorHs.hue, colorHs.saturation],
          colorRgb: colorPickerRgb
        });
      };
      const handleColorPickerPointer = colorPickerEvent => {
        const colorPickerRect = colorPickerElement.getBoundingClientRect();
        if (!colorPickerRect.width || !colorPickerRect.height) {
          return;
        }
        const pointerRatioX = Math.max(
          0,
          Math.min(1, (colorPickerEvent.clientX - colorPickerRect.left) / colorPickerRect.width)
        );
        const pointerRatioY = Math.max(
          0,
          Math.min(1, (colorPickerEvent.clientY - colorPickerRect.top) / colorPickerRect.height)
        );
        const [pickedHue, pickedSaturation] = lightColorPickerHsFromPoint(
          pointerRatioX,
          pointerRatioY
        );
        applyColorPickerHs({
          hue: pickedHue,
          saturation: pickedSaturation
        });
      };
      const commitColorPicker = async () => {
        if (!!lightControlsInteractive && !isColorRequestPending) {
          isColorRequestPending = true;
          colorPickerElement.setAttribute("aria-busy", "true");
          try {
            await this.callEntityService(
              "light",
              "turn_on",
              lightControlsEntityId,
              lightColorServiceData(detailLightAttributes, [colorHs.hue, colorHs.saturation])
            );
            lightTurnOnCallback?.();
          } catch (colorRequestError) {
            this.options.onError?.(colorRequestError);
          } finally {
            isColorRequestPending = false;
            colorPickerElement.removeAttribute("aria-busy");
          }
        }
      };
      colorPickerElement.addEventListener("pointerdown", colorPointerDownEvent => {
        if (lightControlsInteractive) {
          colorPickerElement.setPointerCapture?.(colorPointerDownEvent.pointerId);
          colorPickerElement.dataset.dragging = "true";
          handleColorPickerPointer(colorPointerDownEvent);
          colorPointerDownEvent.preventDefault();
        }
      });
      colorPickerElement.addEventListener("pointermove", colorPointerMoveEvent => {
        if (colorPickerElement.dataset.dragging === "true") {
          handleColorPickerPointer(colorPointerMoveEvent);
        }
      });
      const handleColorPickerRelease = async colorReleaseEvent => {
        if (colorPickerElement.dataset.dragging === "true") {
          colorPickerElement.dataset.dragging = "false";
          colorPickerElement.releasePointerCapture?.(colorReleaseEvent.pointerId);
          await commitColorPicker();
        }
      };
      colorPickerElement.addEventListener("pointerup", handleColorPickerRelease);
      colorPickerElement.addEventListener("pointercancel", handleColorPickerRelease);
      colorPickerElement.addEventListener("keydown", async colorPickerKeyEvent => {
        if (!lightControlsInteractive) {
          return;
        }
        const hueStepDegrees = colorPickerKeyEvent.shiftKey ? 10 : 3;
        let { hue: nextHue, saturation: nextSaturation } = colorHs;
        if (colorPickerKeyEvent.key === "ArrowLeft") {
          nextHue -= hueStepDegrees;
        } else if (colorPickerKeyEvent.key === "ArrowRight") {
          nextHue += hueStepDegrees;
        } else if (colorPickerKeyEvent.key === "ArrowUp") {
          nextSaturation -= hueStepDegrees;
        } else if (colorPickerKeyEvent.key === "ArrowDown") {
          nextSaturation += hueStepDegrees;
        } else if (colorPickerKeyEvent.key === "Enter" || colorPickerKeyEvent.key === " ") {
          await commitColorPicker();
          colorPickerKeyEvent.preventDefault();
          return;
        } else {
          return;
        }
        applyColorPickerHs({
          hue: nextHue,
          saturation: nextSaturation
        });
        colorPickerKeyEvent.preventDefault();
      });
      colorPickerElement.syncColorPicker = applyColorPickerHs;
      colorPickerElement.cleanupColorPicker = () => {
        colorPickerElement.dataset.dragging = "false";
      };
      applyColorPickerHs();
      lightControlsElement.append(colorPickerElement);
    }
    const maxKelvinFromMireds = Number.isFinite(Number(detailLightAttributes.max_mireds))
      ? 1000000 / Number(detailLightAttributes.max_mireds)
      : 2000;
    const minKelvinFromMireds = Number.isFinite(Number(detailLightAttributes.min_mireds))
      ? 1000000 / Number(detailLightAttributes.min_mireds)
      : 6500;
    const detailMinKelvin =
      Number(detailLightAttributes.min_color_temp_kelvin) || maxKelvinFromMireds;
    const detailMaxKelvin =
      Number(detailLightAttributes.max_color_temp_kelvin) || minKelvinFromMireds;
    const currentKelvinFromMireds = Number.isFinite(Number(detailLightAttributes.color_temp))
      ? 1000000 / Number(detailLightAttributes.color_temp)
      : detailMinKelvin;
    const detailCurrentKelvin =
      Number(detailLightAttributes.color_temp_kelvin) || currentKelvinFromMireds;
    if (!isColorSupported) {
      createLightSlider({
        label: "色温",
        value: detailCurrentKelvin,
        minimum: Math.round(detailMinKelvin),
        maximum: Math.round(detailMaxKelvin),
        step: 50,
        suffix: "K",
        dataKey: "color_temp_kelvin",
        className: "hb-light-details-temperature",
        icon: "♨",
        minimumLabel: "暖色",
        maximumLabel: "冷色",
        supported: supportsColorTemperature
      });
    }
    const detailBrightnessPercent = Number.isFinite(Number(detailLightAttributes.brightness))
      ? (Number(detailLightAttributes.brightness) / 255) * 100
      : 100;
    createLightSlider({
      label: "亮度",
      value: detailBrightnessPercent,
      minimum: 1,
      maximum: 100,
      step: 1,
      suffix: "%",
      dataKey: "brightness_pct",
      className: "hb-light-details-brightness",
      icon: "☀",
      minimumLabel: "暗",
      maximumLabel: "亮",
      supported: supportsBrightness
    });
    let pendingPreset = null;
    let presetTimer = 0;
    let latestLightState = lightControlsState;
    const clearPresetPending = ({ resync: shouldResync = false } = {}) => {
      window.clearTimeout(presetTimer);
      presetTimer = 0;
      pendingPreset = null;
      if (shouldResync) {
        lightControlsElement.syncLightState?.(latestLightState);
      }
    };
    const schedulePresetCheck = () => {
      window.clearTimeout(presetTimer);
      presetTimer = 0;
      if (!pendingPreset) {
        return;
      }
      const nowMs = Date.now();
      const presetDecision = lightPresetPendingDecision(pendingPreset, nowMs);
      if (presetDecision === "confirmed" || presetDecision === "timeout") {
        clearPresetPending({
          resync: true
        });
        return;
      }
      const presetResolveAtMs = pendingPreset.latestMatches
        ? Math.min(
            pendingPreset.expiresAt,
            Math.max(
              pendingPreset.minimumHoldUntil,
              pendingPreset.matchStartedAt + LIGHT_PRESET_STABLE_CONFIRMATION_MS
            )
          )
        : pendingPreset.expiresAt;
      presetTimer = window.setTimeout(schedulePresetCheck, Math.max(50, presetResolveAtMs - nowMs));
    };
    const presetDefinitions = LIGHT_DETAIL_PRESET_DEFINITIONS;
    const presetKelvin = presetEntry =>
      relativeLightColorTemperature(
        detailMinKelvin,
        detailMaxKelvin,
        presetEntry.colorTemperaturePercent
      );
    const presetsElement = document.createElement("div");
    presetsElement.className = "hb-light-details-presets";
    presetsElement.hidden = isColorSupported || (!supportsBrightness && !supportsTemperatureOnly);
    const presetButtons = presetDefinitions.map(presetItem => {
      const presetButtonElement = document.createElement("button");
      presetButtonElement.type = "button";
      presetButtonElement.disabled = !isLightDomain;
      const presetLabelElement = document.createElement("strong");
      presetLabelElement.textContent = presetItem.label;
      const presetDetailElement = document.createElement("small");
      presetDetailElement.textContent = supportsBrightness ? presetItem.detail : "开启";
      presetButtonElement.append(presetLabelElement, presetDetailElement);
      presetButtonElement.addEventListener("click", async () => {
        if (!lightControlsInteractive || !isLightDomain) {
          return;
        }
        const presetKelvinValue = presetKelvin(presetItem);
        const presetServiceData = {};
        if (supportsBrightness) {
          Object.assign(
            presetServiceData,
            lightPresetBrightnessServiceData(presetItem.brightnessPercent)
          );
        }
        if (supportsTemperatureOnly) {
          presetServiceData.color_temp_kelvin = Math.round(presetKelvinValue);
        }
        window.clearTimeout(presetTimer);
        const presetNowMs = Date.now();
        pendingPreset = {
          brightnessPercent: presetItem.brightnessPercent,
          colorTemperatureKelvin: presetKelvinValue,
          minimumHoldUntil: presetNowMs + LIGHT_PRESET_MINIMUM_HOLD_MS,
          expiresAt: presetNowMs + LIGHT_PRESET_MAXIMUM_HOLD_MS,
          latestMatches: false,
          matchStartedAt: null
        };
        schedulePresetCheck();
        const brightnessSlider = slidersByDataKey.get("brightness_pct");
        if (brightnessSlider?.supported) {
          brightnessSlider.input.value = String(presetItem.brightnessPercent);
          brightnessSlider.updateSliderValue({
            notify: true
          });
        }
        const temperatureSlider = slidersByDataKey.get("color_temp_kelvin");
        if (temperatureSlider?.supported) {
          temperatureSlider.input.value = String(presetKelvinValue);
          temperatureSlider.updateSliderValue({
            notify: true
          });
        }
        for (const presetButtonEntry of presetButtons) {
          presetButtonEntry.button.classList.toggle(
            "is-active",
            presetButtonEntry.button === presetButtonElement
          );
        }
        lightVisualChangeCallback?.({
          isOn: true,
          ...(supportsBrightness
            ? {
                brightnessPercent: presetItem.brightnessPercent
              }
            : {}),
          ...(supportsTemperatureOnly
            ? {
                colorTemperatureKelvin: presetKelvinValue
              }
            : {})
        });
        lightTurnOnCallback?.();
        try {
          await this.callEntityService(
            "light",
            "turn_on",
            lightControlsEntityId,
            presetServiceData
          );
        } catch (presetRequestError) {
          clearPresetPending({
            resync: true
          });
          presetButtonElement.classList.remove("is-active");
          this.options.onError?.(presetRequestError);
        }
      });
      presetsElement.append(presetButtonElement);
      return {
        button: presetButtonElement,
        ...presetItem
      };
    });
    lightControlsElement.append(presetsElement);
    const renderPresetActiveState = presetState => {
      const presetLightAttributes = presetState?.attributes || {};
      const isPresetLightOn = presetState?.state === "on";
      const presetBrightness = Number.isFinite(Number(presetLightAttributes.brightness))
        ? (Number(presetLightAttributes.brightness) / 255) * 100
        : NaN;
      const presetKelvinFromMireds = Number.isFinite(Number(presetLightAttributes.color_temp))
        ? 1000000 / Number(presetLightAttributes.color_temp)
        : NaN;
      const presetCurrentKelvin =
        Number(presetLightAttributes.color_temp_kelvin) || presetKelvinFromMireds;
      for (const presetActiveEntry of presetButtons) {
        const presetTargetKelvin = presetKelvin(presetActiveEntry);
        const presetKelvinTolerance = Math.max(50, (detailMaxKelvin - detailMinKelvin) * 0.06);
        const isPresetBrightnessMatch =
          !supportsBrightness ||
          (Number.isFinite(presetBrightness) &&
            Math.abs(presetBrightness - presetActiveEntry.brightnessPercent) <= 4);
        const isPresetTemperatureMatch =
          !supportsTemperatureOnly ||
          (Number.isFinite(presetCurrentKelvin) &&
            Math.abs(presetCurrentKelvin - presetTargetKelvin) <= presetKelvinTolerance);
        presetActiveEntry.button.classList.toggle(
          "is-active",
          isPresetLightOn && isPresetBrightnessMatch && isPresetTemperatureMatch
        );
      }
    };
    renderPresetActiveState(lightControlsState);
    lightControlsElement.syncLightState = syncState => {
      if (!syncState) {
        return;
      }
      latestLightState = syncState;
      const syncAttributes = syncState.attributes || {};
      const temperatureSliderControl = slidersByDataKey.get("color_temp_kelvin");
      const temperatureFromMireds = Number.isFinite(Number(syncAttributes.color_temp))
        ? 1000000 / Number(syncAttributes.color_temp)
        : NaN;
      const syncedTemperatureKelvin =
        Number(syncAttributes.color_temp_kelvin) || temperatureFromMireds;
      const brightnessSliderControl = slidersByDataKey.get("brightness_pct");
      const syncedBrightnessPercent = Number.isFinite(Number(syncAttributes.brightness))
        ? (Number(syncAttributes.brightness) / 255) * 100
        : NaN;
      if (pendingPreset) {
        const isBrightnessPresetMatch =
          !supportsBrightness ||
          (Number.isFinite(syncedBrightnessPercent) &&
            Math.abs(syncedBrightnessPercent - pendingPreset.brightnessPercent) <= 4);
        const isTemperaturePresetMatch =
          !supportsTemperatureOnly ||
          (Number.isFinite(syncedTemperatureKelvin) &&
            Math.abs(syncedTemperatureKelvin - pendingPreset.colorTemperatureKelvin) <= 220);
        const isPresetMatch = isBrightnessPresetMatch && isTemperaturePresetMatch;
        if (isPresetMatch && !pendingPreset.latestMatches) {
          pendingPreset.matchStartedAt = Date.now();
        }
        if (!isPresetMatch) {
          pendingPreset.matchStartedAt = null;
        }
        pendingPreset.latestMatches = isPresetMatch;
        schedulePresetCheck();
      }
      const displayTemperatureKelvin =
        pendingPreset?.colorTemperatureKelvin ?? syncedTemperatureKelvin;
      const displayBrightnessPercent = pendingPreset?.brightnessPercent ?? syncedBrightnessPercent;
      if (temperatureSliderControl?.supported && Number.isFinite(displayTemperatureKelvin)) {
        temperatureSliderControl.input.value = String(displayTemperatureKelvin);
        temperatureSliderControl.updateSliderValue();
      }
      if (brightnessSliderControl?.supported && Number.isFinite(displayBrightnessPercent)) {
        brightnessSliderControl.input.value = String(displayBrightnessPercent);
        brightnessSliderControl.updateSliderValue();
      }
      if (colorPickerElement) {
        const syncedHsColor = Array.isArray(syncAttributes.hs_color)
          ? syncAttributes.hs_color
          : rgbToHsColor(syncAttributes.rgb_color);
        if (syncedHsColor) {
          colorPickerElement.syncColorPicker({
            hue: syncedHsColor[0],
            saturation: syncedHsColor[1]
          });
        }
      }
      renderPresetActiveState(
        pendingPreset
          ? {
              state: "on",
              attributes: {
                ...syncAttributes,
                ...(supportsBrightness
                  ? {
                      brightness: (pendingPreset.brightnessPercent / 100) * 255
                    }
                  : {}),
                ...(supportsTemperatureOnly
                  ? {
                      color_temp_kelvin: pendingPreset.colorTemperatureKelvin
                    }
                  : {})
              }
            }
          : syncState
      );
      const visualTemperatureKelvin = lightVisualValueForCapability(
        supportsTemperatureOnly,
        displayTemperatureKelvin,
        UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN
      );
      const visualBrightnessPercent = lightVisualValueForCapability(
        supportsBrightness,
        displayBrightnessPercent,
        UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT
      );
      lightVisualChangeCallback?.({
        isOn: syncState.state === "on",
        colorTemperatureKelvin: visualTemperatureKelvin,
        brightnessPercent: visualBrightnessPercent
      });
    };
    lightControlsElement.syncLightState(lightControlsState);
    lightControlsElement.cleanupLightDetails = () => {
      clearPresetPending();
      colorPickerElement?.cleanupColorPicker?.();
    };
    return lightControlsElement;
  }
  createCoverDetailsControls(
    coverControlsEntityId,
    coverControlsState,
    {
      interactive: coverControlsInteractive = true,
      dream: isDreamCoverControl = false,
      airer: coverIsAirer = false,
      tilt: coverSupportsTilt = false,
      motorReversed: coverMotorReversed = false,
      positionState: coverPositionState = null,
      positionCommandEntityId: coverPositionCommandEntityId = "",
      positionCommandState: coverPositionCommandState = null,
      motorState: coverMotorState = null,
      airerActionEntityIds: coverAirerActionEntityIds = {},
      positionCalibration: coverPositionCalibration = {},
      onVisualChange: coverVisualChangeCallback = null,
      onCurtainPositionChange: curtainPositionChangeCallback = null
    } = {}
  ) {
    const coverControlsElement = document.createElement("section");
    coverControlsElement.className = "hb-cover-details-controls";
    coverControlsElement.inert = !coverControlsInteractive;
    const positionLabelElement = document.createElement("label");
    positionLabelElement.className = "hb-cover-details-position";
    const positionHeadingElement = document.createElement("span");
    positionHeadingElement.className = "hb-cover-details-position-heading";
    const positionTitleElement = document.createElement("strong");
    positionTitleElement.textContent = isDreamCoverControl
      ? "叶片角度"
      : coverIsAirer
        ? "晾杆高度"
        : "开合位置";
    const positionOutputElement = document.createElement("output");
    positionHeadingElement.append(positionTitleElement, positionOutputElement);
    const positionInputElement = document.createElement("input");
    positionInputElement.type = "range";
    positionInputElement.min = "0";
    positionInputElement.max = "100";
    positionInputElement.step = "1";
    const positionLegendElement = document.createElement("span");
    positionLegendElement.className = "hb-cover-details-position-legend";
    if (isDreamCoverControl) {
      positionLegendElement.append(
        Object.assign(document.createElement("small"), {
          textContent: "0 · 一侧闭合"
        }),
        Object.assign(document.createElement("small"), {
          textContent: "50 · 90°打开"
        }),
        Object.assign(document.createElement("small"), {
          textContent: "100 · 反向闭合"
        })
      );
    } else if (coverIsAirer) {
      positionLegendElement.append(
        Object.assign(document.createElement("small"), {
          textContent: "下降"
        }),
        Object.assign(document.createElement("small"), {
          textContent: "升起"
        })
      );
    } else {
      positionLegendElement.append(
        Object.assign(document.createElement("small"), {
          textContent: "关闭"
        }),
        Object.assign(document.createElement("small"), {
          textContent: "打开"
        })
      );
    }
    positionLabelElement.append(
      positionHeadingElement,
      positionInputElement,
      positionLegendElement
    );
    const coverActionsElement = document.createElement("div");
    coverActionsElement.className = "hb-cover-details-actions";
    const openCoverServiceName = "open_cover";
    const stopCoverServiceName = "stop_cover";
    const closeCoverServiceName = "close_cover";
    const primaryCoverService = coverMotorReversed ? openCoverServiceName : closeCoverServiceName;
    const secondaryCoverService = coverMotorReversed ? closeCoverServiceName : openCoverServiceName;
    let isCurtainRetracted = dreamCurtainIsRetracted(coverControlsState?.state, coverMotorReversed);
    const coverActionDefinitions = (
      isDreamCoverControl
        ? [
            {
              label: "关闭",
              icon: "←",
              service: primaryCoverService,
              curtainRetracted: false
            },
            {
              label: "暂停",
              icon: "Ⅱ",
              service: stopCoverServiceName
            },
            {
              label: "开启",
              icon: "→",
              service: secondaryCoverService,
              curtainRetracted: true
            }
          ]
        : coverIsAirer
          ? [
              {
                label: "下降",
                icon: "↓",
                service: primaryCoverService,
                action: "down"
              },
              {
                label: "暂停",
                icon: "Ⅱ",
                service: stopCoverServiceName,
                action: "pause"
              },
              {
                label: "升起",
                icon: "↑",
                service: secondaryCoverService,
                action: "up"
              }
            ]
          : [
              {
                label: "关闭",
                icon: "←",
                service: primaryCoverService
              },
              {
                label: "暂停",
                icon: "Ⅱ",
                service: stopCoverServiceName
              },
              {
                label: "打开",
                icon: "→",
                service: secondaryCoverService
              }
            ]
    ).map(coverAction => {
      const coverActionButton = document.createElement("button");
      coverActionButton.type = "button";
      coverActionButton.dataset.coverAction = coverAction.service;
      const coverActionIconElement = document.createElement("i");
      coverActionIconElement.textContent = coverAction.icon;
      coverActionIconElement.setAttribute("aria-hidden", "true");
      const coverActionLabelElement = document.createElement("strong");
      coverActionLabelElement.textContent = coverAction.label;
      coverActionButton.append(coverActionIconElement, coverActionLabelElement);
      coverActionButton.addEventListener("click", async () => {
        if (coverControlsInteractive) {
          if (isDreamCoverControl && typeof coverAction.curtainRetracted == "boolean") {
            coverControlsElement.beginDreamCurtainMotion?.(coverAction.curtainRetracted);
          }
          if (!isDreamCoverControl && coverAction.service === secondaryCoverService) {
            coverControlsElement.beginCoverMotion?.(100, "opening");
          } else if (!isDreamCoverControl && coverAction.service === primaryCoverService) {
            coverControlsElement.beginCoverMotion?.(0, "closing");
          } else {
            coverControlsElement.stopCoverMotion?.();
          }
          coverActionButton.classList.add("is-pending");
          try {
            const airerActionEntityId =
              coverIsAirer && coverAction.action
                ? coverAirerActionEntityIds[coverAction.action]
                : "";
            if (
              coverIsAirer &&
              coverPositionCommandEntityId &&
              ["up", "down"].includes(coverAction.action)
            ) {
              const airerTargetPosition = coverAction.action === "up" ? 100 : 0;
              const airerDeviceTargetPosition = airerDevicePosition(
                airerTargetPosition,
                coverPositionCalibration
              );
              await this.callEntityService("number", "set_value", coverPositionCommandEntityId, {
                value: airerDeviceTargetPosition
              });
            } else if (coverIsAirer && coverAction.action === "pause") {
              await this.callEntityService("cover", stopCoverServiceName, coverControlsEntityId);
            } else if (airerActionEntityId) {
              await this.callEntityService("button", "press", airerActionEntityId);
            } else {
              await this.callEntityService("cover", coverAction.service, coverControlsEntityId);
            }
          } catch (coverActionError) {
            coverControlsElement.cancelDreamCurtainMotion?.();
            coverControlsElement.cancelCoverMotion?.();
            coverControlsElement.syncCoverState?.(coverControlsState);
            this.options.onError?.(coverActionError);
          } finally {
            coverActionButton.classList.remove("is-pending");
          }
        }
      });
      coverActionsElement.append(coverActionButton);
      return coverActionButton;
    });
    let controlPositionState = coverPositionState;
    let controlPositionCommandState = coverPositionCommandState;
    let controlMotorState = coverMotorState;
    const learnPositionCalibration = () => {
      if (coverIsAirer) {
        learnAirerPositionCalibration(
          coverPositionCalibration,
          controlPositionState?.state,
          controlPositionCommandState?.state,
          controlMotorState?.state
        );
      }
    };
    learnPositionCalibration();
    let latestCoverStateText = String(coverControlsState?.state || "");
    const resolvePositionFromState = positionSourceState => {
      const reportedPosition = coverIsAirer
        ? airerReportedPosition(controlPositionState, positionSourceState, coverPositionCalibration)
        : Number(
            positionSourceState?.attributes?.[
              coverSupportsTilt ? "current_tilt_position" : "current_position"
            ]
          );
      if (Number.isFinite(reportedPosition)) {
        const clampedPosition = Math.max(0, Math.min(100, reportedPosition));
        if (coverIsAirer) {
          return airerPresentationPositionForState(
            clampedPosition,
            latestCoverStateText || positionSourceState?.state,
            coverPositionCalibration,
            coverMotorReversed
          );
        } else {
          return clampedPosition;
        }
      }
      if (positionSourceState?.state === "open") {
        return 100;
      } else {
        return 0;
      }
    };
    let latestCoverEntityState = coverControlsState;
    let displayedPosition = resolvePositionFromState(coverControlsState);
    let sliderPosition = displayedPosition;
    let isPositionDragging = false;
    let motionFrameHandle = 0;
    let motionState = null;
    let heldPosition = null;
    let holdUntilMs = 0;
    let pendingCurtainTarget = null;
    const stopMotionAnimation = () => {
      window.cancelAnimationFrame(motionFrameHandle);
      motionFrameHandle = 0;
    };
    const renderPositionState = (renderPositionValue, renderMotionState = "") => {
      sliderPosition = Math.max(0, Math.min(100, Number(renderPositionValue) || 0));
      positionInputElement.value = String(sliderPosition);
      positionInputElement.style.setProperty("--hb-cover-position-progress", sliderPosition + "%");
      positionOutputElement.textContent = Math.round(sliderPosition) + "%";
      for (const coverActionButtonEntry of coverActionDefinitions) {
        coverActionButtonEntry.classList.toggle(
          "is-active",
          coverActionButtonEntry.dataset.coverAction ===
            (renderMotionState === "opening"
              ? openCoverServiceName
              : renderMotionState === "closing"
                ? closeCoverServiceName
                : "")
        );
      }
      coverVisualChangeCallback?.({
        position: sliderPosition,
        state: renderMotionState
      });
    };
    coverControlsElement.setDreamCurtainRetracted = (
      curtainRetractedTarget,
      curtainMovingFlag = false
    ) => {
      if (isDreamCoverControl) {
        isCurtainRetracted = !!curtainRetractedTarget;
        positionInputElement.disabled = !coverControlsInteractive;
        curtainPositionChangeCallback?.({
          retracted: isCurtainRetracted,
          moving: !!curtainMovingFlag
        });
      }
    };
    coverControlsElement.isDreamCurtainRetracted = () => isCurtainRetracted;
    coverControlsElement.beginDreamCurtainMotion = curtainMotionTarget => {
      if (isDreamCoverControl) {
        pendingCurtainTarget = {
          target: !!curtainMotionTarget,
          expiresAt: Date.now() + 10000
        };
        coverControlsElement.setDreamCurtainRetracted?.(pendingCurtainTarget.target, true);
      }
    };
    coverControlsElement.cancelDreamCurtainMotion = () => {
      pendingCurtainTarget = null;
    };
    coverControlsElement.beginCoverMotion = (motionToPosition, motionToState) => {
      stopMotionAnimation();
      heldPosition = null;
      holdUntilMs = 0;
      const fromPosition = sliderPosition;
      const toPosition = Math.max(0, Math.min(100, Number(motionToPosition) || 0));
      motionState = {
        direction: toPosition >= fromPosition ? 1 : -1,
        target: toPosition,
        state: motionToState,
        initialPosition: fromPosition,
        lastServerPosition: fromPosition,
        sawMotorRunning: false,
        ignoreStaleUntil: Date.now() + 4000,
        expiresAt: Date.now() + (coverIsAirer ? 120000 : 10000)
      };
      const animationStartMs = performance.now();
      const animationDurationMs = Math.max(900, Math.abs(toPosition - fromPosition) * 28);
      const animatePositionStep = frameTimestampMs => {
        const animationProgress = Math.min(
          1,
          (frameTimestampMs - animationStartMs) / animationDurationMs
        );
        const easedProgress = 1 - (1 - animationProgress) ** 3;
        renderPositionState(
          fromPosition + (toPosition - fromPosition) * easedProgress,
          motionToState
        );
        if (animationProgress < 1) {
          motionFrameHandle = window.requestAnimationFrame(animatePositionStep);
        } else {
          motionFrameHandle = 0;
        }
      };
      renderPositionState(fromPosition, motionToState);
      motionFrameHandle = window.requestAnimationFrame(animatePositionStep);
    };
    coverControlsElement.stopCoverMotion = () => {
      stopMotionAnimation();
      motionState = null;
      renderPositionState(sliderPosition, "");
    };
    coverControlsElement.cancelCoverMotion = () => {
      stopMotionAnimation();
      motionState = null;
    };
    coverControlsElement.holdCoverPosition = holdTargetPosition => {
      stopMotionAnimation();
      heldPosition = null;
      holdUntilMs = 0;
      const holdTarget = Math.max(0, Math.min(100, Number(holdTargetPosition) || 0));
      const holdFromPosition = displayedPosition;
      const holdDirection = holdTarget >= holdFromPosition ? 1 : -1;
      const holdMotionState =
        isDreamCoverControl || Math.abs(holdTarget - holdFromPosition) < 0.5
          ? ""
          : holdDirection > 0
            ? "opening"
            : "closing";
      motionState = {
        direction: holdDirection,
        target: holdTarget,
        state: holdMotionState,
        initialPosition: holdFromPosition,
        lastServerPosition: holdFromPosition,
        sawMotorRunning: false,
        ignoreStaleUntil: Date.now() + 4000,
        expiresAt: Date.now() + (coverIsAirer ? 120000 : 10000)
      };
      renderPositionState(holdTarget, holdMotionState);
    };
    const applyCoverState = (coverSourceState, { primary: isPrimaryState = false } = {}) => {
      if (isPrimaryState) {
        latestCoverEntityState = coverSourceState || latestCoverEntityState;
        latestCoverStateText = String(coverSourceState?.state || latestCoverStateText);
      }
      if (heldPosition !== null && Date.now() >= holdUntilMs) {
        heldPosition = null;
        holdUntilMs = 0;
      }
      const nextPosition =
        coverIsAirer && heldPosition !== null
          ? heldPosition
          : resolvePositionFromState(coverSourceState);
      displayedPosition = nextPosition;
      const coverStateLabel = String(coverSourceState?.state || "");
      if (isDreamCoverControl) {
        const coverPhysicalState = physicalCoverState(coverStateLabel, coverMotorReversed);
        const coverIsRetractedState = dreamCurtainIsRetracted(coverStateLabel, coverMotorReversed);
        if (pendingCurtainTarget && coverIsRetractedState === pendingCurtainTarget.target) {
          const targetRetractedValue = pendingCurtainTarget.target;
          pendingCurtainTarget = null;
          coverControlsElement.setDreamCurtainRetracted?.(targetRetractedValue, false);
        } else if (pendingCurtainTarget && Date.now() < pendingCurtainTarget.expiresAt) {
          coverControlsElement.setDreamCurtainRetracted?.(pendingCurtainTarget.target, true);
        } else {
          pendingCurtainTarget = null;
          coverControlsElement.setDreamCurtainRetracted?.(
            coverIsRetractedState,
            coverPhysicalState === "opening" || coverPhysicalState === "closing"
          );
        }
      }
      if (!isPositionDragging) {
        if (motionState) {
          const frameNowMs = Date.now();
          const {
            direction: motionDirection,
            target: motionTargetPosition,
            state: motionStateName
          } = motionState;
          const reachedTarget = coverPositionReachedTarget(
            nextPosition,
            motionTargetPosition,
            motionDirection
          );
          const reachedEndpointState =
            (motionTargetPosition <= 0.5 && coverStateLabel === "closed") ||
            (motionTargetPosition >= 99.5 && coverStateLabel === "open");
          const motorSpeedValue = Number(controlMotorState?.state);
          const isMotorStopped =
            coverIsAirer &&
            motionState.sawMotorRunning &&
            Number.isFinite(motorSpeedValue) &&
            Math.abs(motorSpeedValue) < 0.5;
          if (
            coverIsAirer
              ? reachedEndpointState || (isMotorStopped && reachedTarget)
              : reachedTarget ||
                reachedEndpointState ||
                (motionTargetPosition >= 99.5 && nextPosition >= 99.5)
          ) {
            stopMotionAnimation();
            if (coverIsAirer) {
              heldPosition = motionTargetPosition;
              holdUntilMs = Date.now() + 120000;
            }
            motionState = null;
            renderPositionState(
              motionTargetPosition,
              coverStateLabel || (motionDirection < 0 ? "closed" : "open")
            );
            return;
          }
          if (
            motionDirection < 0
              ? nextPosition < motionState.lastServerPosition - 0.5 || coverStateLabel === "closing"
              : nextPosition > motionState.lastServerPosition + 0.5 || coverStateLabel === "opening"
          ) {
            motionState.lastServerPosition =
              motionDirection < 0
                ? Math.min(motionState.lastServerPosition, nextPosition)
                : Math.max(motionState.lastServerPosition, nextPosition);
            const pendingDisplayPosition = coverPendingDisplayPosition(
              sliderPosition,
              nextPosition,
              motionDirection
            );
            renderPositionState(pendingDisplayPosition, motionStateName);
            return;
          }
          if (
            frameNowMs < motionState.ignoreStaleUntil ||
            (coverIsAirer && frameNowMs < motionState.expiresAt) ||
            (frameNowMs < motionState.expiresAt &&
              Math.abs(nextPosition - motionState.initialPosition) < 0.5)
          ) {
            return;
          }
          stopMotionAnimation();
          motionState = null;
        } else {
          stopMotionAnimation();
        }
        renderPositionState(nextPosition, coverStateLabel);
      }
    };
    positionInputElement.addEventListener("pointerdown", () => {
      isPositionDragging = true;
      stopMotionAnimation();
      motionState = null;
    });
    positionInputElement.addEventListener("input", () => {
      isPositionDragging = true;
      stopMotionAnimation();
      motionState = null;
      const inputPosition = Number(positionInputElement.value);
      renderPositionState(
        inputPosition,
        isDreamCoverControl ? "" : inputPosition > 0 ? "open" : "closed"
      );
    });
    positionInputElement.addEventListener("change", async () => {
      isPositionDragging = false;
      if (!coverControlsInteractive) {
        return;
      }
      const requestedPosition = Number(positionInputElement.value);
      const deviceTargetPosition = airerDevicePosition(requestedPosition, coverPositionCalibration);
      coverControlsElement.holdCoverPosition(requestedPosition);
      try {
        if (coverIsAirer && coverPositionCommandEntityId) {
          await this.callEntityService("number", "set_value", coverPositionCommandEntityId, {
            value: deviceTargetPosition
          });
        } else {
          await this.callEntityService(
            "cover",
            coverSupportsTilt ? "set_cover_tilt_position" : "set_cover_position",
            coverControlsEntityId,
            {
              [coverSupportsTilt ? "tilt_position" : "position"]: requestedPosition
            }
          );
        }
      } catch (positionRequestError) {
        coverControlsElement.cancelCoverMotion();
        applyCoverState(latestCoverEntityState);
        this.options.onError?.(positionRequestError);
      }
    });
    positionInputElement.addEventListener("pointercancel", () => {
      isPositionDragging = false;
      applyCoverState(latestCoverEntityState);
    });
    coverControlsElement.append(positionLabelElement, coverActionsElement);
    coverControlsElement.syncCoverState = coverSyncState =>
      applyCoverState(coverSyncState, {
        primary: true
      });
    coverControlsElement.syncCoverPositionState = coverSyncPositionState => {
      controlPositionState = coverSyncPositionState || controlPositionState;
      learnPositionCalibration();
      applyCoverState(latestCoverEntityState);
    };
    coverControlsElement.syncCoverPositionCommandState = coverSyncCommandState => {
      controlPositionCommandState = coverSyncCommandState || controlPositionCommandState;
      learnPositionCalibration();
      applyCoverState(latestCoverEntityState);
    };
    coverControlsElement.syncAirerMotorState = coverSyncMotorState => {
      controlMotorState = coverSyncMotorState || controlMotorState;
      const currentMotorSpeed = Number(controlMotorState?.state);
      if (motionState && Number.isFinite(currentMotorSpeed) && Math.abs(currentMotorSpeed) >= 0.5) {
        motionState.sawMotorRunning = true;
      }
      learnPositionCalibration();
      applyCoverState(latestCoverEntityState);
    };
    coverControlsElement.cleanupCoverDetails = () => {
      stopMotionAnimation();
      motionState = null;
      pendingCurtainTarget = null;
      isPositionDragging = false;
    };
    applyCoverState(coverControlsState, {
      primary: true
    });
    return coverControlsElement;
  }
  createClimateDetailsControls(
    climateControlsEntityId,
    climateControlsState,
    {
      interactive: climateControlsInteractive = true,
      onPowerChange: climatePowerChangeCallback = null,
      onVisualChange: climateVisualChangeCallback = null,
      modeColors: climateModeColors = {},
      deviceType: climateDeviceType = "air-conditioner"
    } = {}
  ) {
    const climateCapabilities = normalizeClimateCapabilities(climateControlsState);
    const climateCapabilityAttributes = climateCapabilities.attributes;
    const climateEntityDomain = String(climateControlsEntityId || "").split(".", 1)[0];
    const climateLabelContext = {
      entityId: climateControlsEntityId,
      entityMetadata: this.entityMetadata,
      entityTranslations: this.entityTranslations
    };
    const climateControlsElement = document.createElement("section");
    climateControlsElement.className = "hb-climate-details-controls";
    climateControlsElement.dataset.climateDeviceType = climateDeviceType;
    climateControlsElement.dataset.climateStructureKey = climateControlStructureKey(
      climateControlsEntityId,
      climateControlsState,
      climateDeviceType
    );
    climateControlsElement.inert = !climateControlsInteractive;
    const capabilityCurrentTemperature = climateCapabilities.currentTemperature;
    const capabilityTargetTemperature = climateCapabilities.targetTemperature;
    const capabilityMinimumTemperature = climateCapabilities.minimumTemperature;
    const capabilityMaximumTemperature = climateCapabilities.maximumTemperature;
    const capabilityTemperatureStep = climateCapabilities.temperatureStep;
    const supportsTargetTemperature =
      ["climate", "water_heater"].includes(climateEntityDomain) &&
      climateCapabilities.supportsTargetTemperature;
    const isWaterHeater = climateEntityDomain === "water_heater";
    climateControlsElement.classList.toggle("without-temperature", !supportsTargetTemperature);
    let pendingTargetTemperature = supportsTargetTemperature
      ? capabilityTargetTemperature
      : capabilityMinimumTemperature;
    let confirmedCommand = null;
    let commandTimer = null;
    let commandClearTimer = null;
    const clearCommandTimers = () => {
      confirmedCommand = null;
      window.clearTimeout(commandTimer);
      window.clearTimeout(commandClearTimer);
      commandTimer = null;
      commandClearTimer = null;
    };
    const rememberConfirmedCommand = confirmedCommandValue => {
      confirmedCommand = confirmedCommandValue;
      window.clearTimeout(commandTimer);
      window.clearTimeout(commandClearTimer);
      commandClearTimer = null;
      commandTimer = window.setTimeout(() => {
        confirmedCommand = null;
        commandTimer = null;
      }, 8000);
    };
    const scheduleCommandClear = () => {
      window.clearTimeout(commandClearTimer);
      commandClearTimer = window.setTimeout(clearCommandTimers, 2500);
    };
    const thermostatElement = document.createElement("section");
    thermostatElement.className = "hb-climate-thermostat";
    const temperatureDownButton = document.createElement("button");
    temperatureDownButton.type = "button";
    temperatureDownButton.className = "hb-climate-temperature-step";
    temperatureDownButton.textContent = "−";
    temperatureDownButton.setAttribute("aria-label", "降低设定温度");
    const temperatureDialElement = document.createElement("div");
    temperatureDialElement.className = "hb-climate-temperature-dial";
    const dialArcStartElement = document.createElement("i");
    dialArcStartElement.className = "hb-climate-arc-cap start";
    dialArcStartElement.setAttribute("aria-hidden", "true");
    const dialArcEndElement = document.createElement("i");
    dialArcEndElement.className = "hb-climate-arc-cap end";
    dialArcEndElement.setAttribute("aria-hidden", "true");
    const temperatureThumbElement = document.createElement("button");
    temperatureThumbElement.type = "button";
    temperatureThumbElement.className = "hb-climate-temperature-thumb";
    temperatureThumbElement.setAttribute("aria-label", "拖动调节设定温度");
    const temperatureContentElement = document.createElement("div");
    temperatureContentElement.className = "hb-climate-temperature-content";
    const temperatureCaptionElement = document.createElement("small");
    temperatureCaptionElement.textContent = "设定温度";
    const temperatureValueElement = document.createElement("strong");
    const currentTemperatureElement = document.createElement("span");
    currentTemperatureElement.textContent = Number.isFinite(capabilityCurrentTemperature)
      ? "当前温度 " + capabilityCurrentTemperature + "°C"
      : "当前温度 --";
    temperatureContentElement.append(
      temperatureCaptionElement,
      temperatureValueElement,
      currentTemperatureElement
    );
    temperatureDialElement.append(
      dialArcStartElement,
      dialArcEndElement,
      temperatureThumbElement,
      temperatureContentElement
    );
    const temperatureUpButton = document.createElement("button");
    temperatureUpButton.type = "button";
    temperatureUpButton.className = "hb-climate-temperature-step";
    temperatureUpButton.textContent = "+";
    temperatureUpButton.setAttribute("aria-label", "提高设定温度");
    let latestClimateEntityState = climateControlsState;
    const resolveEffectMode = effectSourceState =>
      climateEffectMode(effectSourceState, climateDeviceType);
    const renderClimateControls = (controlsSourceState = latestClimateEntityState) => {
      latestClimateEntityState = controlsSourceState || latestClimateEntityState;
      const effectMode = resolveEffectMode(latestClimateEntityState);
      const temperatureRatio = Math.max(
        0,
        Math.min(
          1,
          (pendingTargetTemperature - capabilityMinimumTemperature) /
            Math.max(
              capabilityTemperatureStep,
              capabilityMaximumTemperature - capabilityMinimumTemperature
            )
        )
      );
      const modeAccentColor =
        effectMode === "cool"
          ? climateModeColors.cool || "#73c8ff"
          : effectMode === "heat"
            ? climateModeColors.heat || "#ff8a65"
            : climateModeColors.other || "#dce2e6";
      const climateAccentColorValue =
        effectMode === "off"
          ? "#65717a"
          : effectMode === "cool"
            ? mixHexColors(modeAccentColor, "#ffffff", temperatureRatio * 0.32)
            : effectMode === "heat"
              ? mixHexColors(modeAccentColor, "#ffffff", (1 - temperatureRatio) * 0.3)
              : modeAccentColor;
      climateControlsElement.dataset.climateVisualMode = effectMode;
      if (effectMode !== "off") {
        climateControlsElement.dataset.lastClimateMode = String(
          latestClimateEntityState?.state || "auto"
        );
      }
      const climateAccentSoftColorValue = mixHexColors(climateAccentColorValue, "#11171c", 0.72);
      climateControlsElement.style.setProperty("--hb-climate-accent", climateAccentColorValue);
      climateControlsElement.style.setProperty(
        "--hb-climate-accent-soft",
        climateAccentSoftColorValue
      );
      const isClimateRunning = climateIsRunning(latestClimateEntityState, climateDeviceType);
      climateControlsElement.classList.toggle("is-running", isClimateRunning);
      climateVisualChangeCallback?.({
        mode: climatePresentationMode(latestClimateEntityState, climateDeviceType),
        visualMode: effectMode,
        running: isClimateRunning,
        accentColor: climateAccentColorValue,
        accentSoft: climateAccentSoftColorValue,
        targetTemperature: supportsTargetTemperature ? pendingTargetTemperature : null
      });
      const normalizedCurrentTemperature =
        normalizeClimateCapabilities(latestClimateEntityState).currentTemperature;
      currentTemperatureElement.textContent =
        normalizedCurrentTemperature !== null
          ? "当前温度 " + normalizedCurrentTemperature + "°C"
          : "当前温度 --";
      const resolveServiceValue = climateServiceName =>
        climateServiceName === "set_hvac_mode"
          ? latestClimateEntityState?.state
          : climateServiceName === "set_fan_mode"
            ? latestClimateEntityState?.attributes?.fan_mode
            : climateServiceName === "set_swing_mode"
              ? latestClimateEntityState?.attributes?.swing_mode
              : climateServiceName === "set_swing_horizontal_mode"
                ? latestClimateEntityState?.attributes?.swing_horizontal_mode
                : climateServiceName === "set_preset_mode"
                  ? latestClimateEntityState?.attributes?.preset_mode
                  : climateServiceName === "set_operation_mode"
                    ? latestClimateEntityState?.attributes?.operation_mode
                    : null;
      for (const climateModeButtonElement of climateControlsElement.querySelectorAll(
        "button[data-climate-service]"
      )) {
        const modeButtonService = climateModeButtonElement.dataset.climateService;
        const modeButtonValue = resolveServiceValue(modeButtonService);
        climateModeButtonElement.classList.toggle(
          "active",
          climateModeButtonElement.dataset.climateValue === String(modeButtonValue ?? "")
        );
      }
      for (const climateSelectElement of climateControlsElement.querySelectorAll(
        ".hb-climate-select[data-climate-service]"
      )) {
        const climateSelectCurrentValue = String(
          resolveServiceValue(climateSelectElement.dataset.climateService) ?? ""
        );
        climateSelectElement.dataset.currentValue = climateSelectCurrentValue;
        const selectedOptionElement = Array.from(
          climateSelectElement.querySelectorAll('[role="option"]')
        ).find(selectOption => selectOption.dataset.value === climateSelectCurrentValue);
        const selectTriggerSpanElement = climateSelectElement.querySelector(
          ".hb-climate-select-trigger > span"
        );
        if (selectTriggerSpanElement) {
          selectTriggerSpanElement.textContent =
            selectedOptionElement?.textContent || climateSelectCurrentValue || "请选择";
          selectTriggerSpanElement.title = selectTriggerSpanElement.textContent;
        }
        climateSelectElement.querySelectorAll('[role="option"]').forEach(selectMenuOption => {
          const isOptionSelected = selectMenuOption.dataset.value === climateSelectCurrentValue;
          selectMenuOption.classList.toggle("active", isOptionSelected);
          selectMenuOption.setAttribute("aria-selected", String(isOptionSelected));
        });
      }
    };
    const renderThermostat = (shouldAnimate = false) => {
      temperatureValueElement.innerHTML = supportsTargetTemperature
        ? pendingTargetTemperature + "<small>°C</small>"
        : "--";
      const progressRatio =
        ((pendingTargetTemperature - capabilityMinimumTemperature) /
          Math.max(
            capabilityTemperatureStep,
            capabilityMaximumTemperature - capabilityMinimumTemperature
          )) *
        75;
      const clampedProgress = Math.max(0, Math.min(75, progressRatio));
      temperatureDialElement.style.setProperty(
        "--hb-climate-temperature-progress",
        clampedProgress + "%"
      );
      temperatureDialElement.style.setProperty(
        "--hb-climate-thumb-angle",
        225 + (clampedProgress / 75) * 270 + "deg"
      );
      temperatureThumbElement.setAttribute("aria-valuemin", String(capabilityMinimumTemperature));
      temperatureThumbElement.setAttribute("aria-valuemax", String(capabilityMaximumTemperature));
      temperatureThumbElement.setAttribute("aria-valuenow", String(pendingTargetTemperature));
      temperatureThumbElement.setAttribute("aria-valuetext", pendingTargetTemperature + "°C");
      const stepEpsilon = Math.max(0.001, capabilityTemperatureStep / 2);
      temperatureDownButton.disabled =
        !supportsTargetTemperature ||
        pendingTargetTemperature <= capabilityMinimumTemperature + stepEpsilon;
      temperatureUpButton.disabled =
        !supportsTargetTemperature ||
        pendingTargetTemperature >= capabilityMaximumTemperature - stepEpsilon;
      temperatureDownButton.title = "最低 " + capabilityMinimumTemperature + "°C";
      temperatureUpButton.title = "最高 " + capabilityMaximumTemperature + "°C";
      renderClimateControls();
      if (shouldAnimate) {
        temperatureValueElement.classList.remove("is-changing");
        window.requestAnimationFrame(() => temperatureValueElement.classList.add("is-changing"));
      }
    };
    let lastCommittedTemperature = pendingTargetTemperature;
    const temperatureQueue = [];
    let inFlightTemperature = null;
    let displayTargetTemperature = pendingTargetTemperature;
    let isTemperatureRequestPending = false;
    let temperatureQueueTimer = null;
    const areTemperaturesEqual = (firstTemperature, secondTemperature) =>
      firstTemperature !== null &&
      secondTemperature !== null &&
      Math.abs(firstTemperature - secondTemperature) < 1e-8;
    const peekQueuedTemperature = () => temperatureQueue.at(-1) ?? inFlightTemperature;
    const scheduleTemperatureQueue = () => {
      const queuedTemperature = peekQueuedTemperature();
      if (queuedTemperature !== null) {
        rememberConfirmedCommand(queuedTemperature);
      }
    };
    const flushTemperatureQueue = async () => {
      window.clearTimeout(temperatureQueueTimer);
      temperatureQueueTimer = null;
      if (isTemperatureRequestPending || !temperatureQueue.length) {
        return;
      }
      const nextTemperature = temperatureQueue.shift();
      inFlightTemperature = nextTemperature;
      if (areTemperaturesEqual(nextTemperature, lastCommittedTemperature)) {
        inFlightTemperature = null;
        scheduleTemperatureQueue();
        if (temperatureQueue.length) {
          temperatureQueueTimer = window.setTimeout(flushTemperatureQueue, 220);
        }
        return;
      }
      isTemperatureRequestPending = true;
      try {
        await this.callEntityService(
          climateEntityDomain === "climate" ? "climate" : climateEntityDomain,
          "set_temperature",
          climateControlsEntityId,
          {
            temperature: nextTemperature
          }
        );
        lastCommittedTemperature = nextTemperature;
        if (climateEntityDomain !== "water_heater") {
          climatePowerChangeCallback?.(true);
        }
      } catch (temperatureRequestError) {
        temperatureQueue.length = 0;
        clearCommandTimers();
        displayTargetTemperature = lastCommittedTemperature;
        pendingTargetTemperature = lastCommittedTemperature;
        renderThermostat(true);
        this.options.onError?.(temperatureRequestError);
      } finally {
        isTemperatureRequestPending = false;
        inFlightTemperature = null;
        scheduleTemperatureQueue();
        if (temperatureQueue.length) {
          temperatureQueueTimer = window.setTimeout(flushTemperatureQueue, 220);
        }
      }
    };
    const enqueueTemperature = ({
      preserveIntermediateSteps: preserveIntermediateSteps = true
    } = {}) => {
      const desiredTemperature = pendingTargetTemperature;
      displayTargetTemperature = desiredTemperature;
      const queuedTargetTemperature =
        temperatureQueue.at(-1) ?? inFlightTemperature ?? lastCommittedTemperature;
      if (areTemperaturesEqual(desiredTemperature, queuedTargetTemperature)) {
        scheduleTemperatureQueue();
        return;
      }
      if (preserveIntermediateSteps && isWaterHeater) {
        const secondaryQueuedTarget =
          temperatureQueue.at(-2) ?? inFlightTemperature ?? lastCommittedTemperature;
        if (
          temperatureQueue.length &&
          areTemperaturesEqual(desiredTemperature, secondaryQueuedTarget)
        ) {
          temperatureQueue.pop();
        } else {
          temperatureQueue.push(desiredTemperature);
        }
      } else {
        temperatureQueue.length = 0;
        temperatureQueue.push(desiredTemperature);
      }
      scheduleTemperatureQueue();
      if (!isTemperatureRequestPending) {
        window.clearTimeout(temperatureQueueTimer);
        temperatureQueueTimer = window.setTimeout(flushTemperatureQueue, 160);
      }
    };
    const stepTargetTemperature = stepCount => {
      if (!climateControlsInteractive || !supportsTargetTemperature) {
        return;
      }
      const previousTemperature = pendingTargetTemperature;
      const temperatureDecimals = String(capabilityTemperatureStep).split(".")[1]?.length || 0;
      pendingTargetTemperature = Number(
        Math.max(
          capabilityMinimumTemperature,
          Math.min(
            capabilityMaximumTemperature,
            pendingTargetTemperature + stepCount * capabilityTemperatureStep
          )
        ).toFixed(temperatureDecimals)
      );
      if (pendingTargetTemperature !== previousTemperature) {
        renderThermostat(true);
        enqueueTemperature();
      }
    };
    const temperatureFromPointer = dialPointerEvent => {
      const dialRect = temperatureDialElement.getBoundingClientRect();
      const dialCenterX = dialRect.left + dialRect.width / 2;
      const dialCenterY = dialRect.top + dialRect.height / 2;
      const pointerOffsetX = dialPointerEvent.clientX - dialCenterX;
      const pointerOffsetY = dialPointerEvent.clientY - dialCenterY;
      const pointerAngleDeg =
        ((Math.atan2(pointerOffsetX, -pointerOffsetY) * 180) / Math.PI + 360) % 360;
      let normalizedAngleDeg;
      if (pointerAngleDeg >= 225) {
        normalizedAngleDeg = pointerAngleDeg;
      } else if (pointerAngleDeg <= 135) {
        normalizedAngleDeg = pointerAngleDeg + 360;
      } else {
        normalizedAngleDeg = pointerAngleDeg <= 180 ? 495 : 225;
      }
      const angleRatio = Math.max(0, Math.min(1, (normalizedAngleDeg - 225) / 270));
      const decimalPlaces = String(capabilityTemperatureStep).split(".")[1]?.length || 0;
      return Number(
        (
          capabilityMinimumTemperature +
          Math.round(
            ((capabilityMaximumTemperature - capabilityMinimumTemperature) * angleRatio) /
              capabilityTemperatureStep
          ) *
            capabilityTemperatureStep
        ).toFixed(decimalPlaces)
      );
    };
    let activeDialDrag = null;
    temperatureDialElement.addEventListener("pointerdown", dialDownEvent => {
      if (!climateControlsInteractive || !supportsTargetTemperature) {
        return;
      }
      const dialDragRect = temperatureDialElement.getBoundingClientRect();
      const dialRadiusPx = Math.min(dialDragRect.width, dialDragRect.height) / 2;
      const pointerDistancePx = Math.hypot(
        dialDownEvent.clientX - (dialDragRect.left + dialDragRect.width / 2),
        dialDownEvent.clientY - (dialDragRect.top + dialDragRect.height / 2)
      );
      if (
        dialDownEvent.target === temperatureThumbElement ||
        !(Math.abs(pointerDistancePx - dialRadiusPx) > 34)
      ) {
        dialDownEvent.preventDefault();
        activeDialDrag = {
          pointerId: dialDownEvent.pointerId,
          previous: pendingTargetTemperature
        };
        temperatureDialElement.setPointerCapture(dialDownEvent.pointerId);
        temperatureDialElement.classList.add("is-dragging");
        pendingTargetTemperature = temperatureFromPointer(dialDownEvent);
        renderThermostat();
      }
    });
    temperatureDialElement.addEventListener("pointermove", dialMoveEvent => {
      if (!!activeDialDrag && dialMoveEvent.pointerId === activeDialDrag.pointerId) {
        pendingTargetTemperature = temperatureFromPointer(dialMoveEvent);
        renderThermostat();
      }
    });
    const endDialDrag = dialReleaseEvent => {
      if (!activeDialDrag || dialReleaseEvent.pointerId !== activeDialDrag.pointerId) {
        return;
      }
      const dragStartTemperature = activeDialDrag.previous;
      activeDialDrag = null;
      temperatureDialElement.classList.remove("is-dragging");
      if (temperatureDialElement.hasPointerCapture(dialReleaseEvent.pointerId)) {
        temperatureDialElement.releasePointerCapture(dialReleaseEvent.pointerId);
      }
      renderThermostat(true);
      if (pendingTargetTemperature !== dragStartTemperature) {
        enqueueTemperature({
          preserveIntermediateSteps: false
        });
      }
    };
    temperatureDialElement.addEventListener("pointerup", endDialDrag);
    temperatureDialElement.addEventListener("pointercancel", endDialDrag);
    temperatureThumbElement.disabled = !supportsTargetTemperature;
    temperatureDownButton.addEventListener("click", () => stepTargetTemperature(-1));
    temperatureUpButton.addEventListener("click", () => stepTargetTemperature(1));
    renderThermostat();
    thermostatElement.append(temperatureDownButton, temperatureDialElement, temperatureUpButton);
    if (supportsTargetTemperature) {
      climateControlsElement.append(thermostatElement);
    }
    const waterHeaterPanelElement =
      climateDeviceType === "water-heater" ? document.createElement("section") : null;
    if (waterHeaterPanelElement) {
      waterHeaterPanelElement.className = "hb-water-heater-control-panel";
      waterHeaterPanelElement.dataset.controlSource = "primary-entity";
      climateControlsElement.append(waterHeaterPanelElement);
      climateControlsElement.waterHeaterControlPanel = waterHeaterPanelElement;
    }
    const createClimateOptionGroup = ({
      label: optionLabel,
      values: optionValuesInput,
      current: optionCurrentValue,
      service: optionService,
      dataKey: optionDataKey,
      labels: optionLabels = {},
      icons: optionIcons = {},
      className: optionClassName = "",
      domain: optionDomain = "climate",
      presentation: optionPresentation = "auto"
    }) => {
      const optionValues = [
        ...new Set(
          (Array.isArray(optionValuesInput) ? optionValuesInput : [])
            .map(optionValueInput => String(optionValueInput ?? "").trim())
            .filter(Boolean)
        )
      ];
      if (!optionValues.length) {
        return;
      }
      const presentationMode =
        optionPresentation === "auto"
          ? climateOptionPresentation(optionValues, optionLabels)
          : optionPresentation;
      const climateOptionGroupElement = document.createElement("div");
      climateOptionGroupElement.className = ("hb-climate-details-group " + optionClassName).trim();
      if (waterHeaterPanelElement) {
        climateOptionGroupElement.dataset.controlSource = "primary-entity";
      }
      const climateOptionGroupTitleElement = document.createElement("strong");
      climateOptionGroupTitleElement.textContent = optionLabel;
      if (presentationMode === "select") {
        climateOptionGroupElement.classList.add("select-options");
        const climateSelectContainerElement = document.createElement("div");
        climateSelectContainerElement.className = "hb-climate-select";
        climateSelectContainerElement.dataset.climateService = optionService;
        climateSelectContainerElement.dataset.currentValue = String(optionCurrentValue ?? "");
        const selectTriggerElement = document.createElement("button");
        selectTriggerElement.type = "button";
        selectTriggerElement.className = "hb-climate-select-trigger";
        selectTriggerElement.setAttribute("aria-label", optionLabel);
        selectTriggerElement.setAttribute("aria-haspopup", "listbox");
        selectTriggerElement.setAttribute("aria-expanded", "false");
        selectTriggerElement.disabled = !climateControlsInteractive;
        const selectTriggerLabelElement = document.createElement("span");
        const selectChevronElement = document.createElement("i");
        selectChevronElement.setAttribute("aria-hidden", "true");
        selectTriggerElement.append(selectTriggerLabelElement, selectChevronElement);
        const selectMenuElement = document.createElement("div");
        selectMenuElement.className = "hb-climate-select-menu";
        selectMenuElement.id = "hb-climate-select-" + randomUuid();
        selectMenuElement.setAttribute("role", "listbox");
        selectMenuElement.setAttribute("aria-label", optionLabel);
        selectMenuElement.setAttribute("popover", "auto");
        selectMenuElement.hidden = true;
        selectTriggerElement.setAttribute("aria-controls", selectMenuElement.id);
        let isSelectRequestPending = false;
        const isSelectMenuOpen = () => {
          try {
            return selectMenuElement.matches(":popover-open");
          } catch {
            return selectMenuElement.dataset.open === "true";
          }
        };
        const renderSelectValue = selectValueOption => {
          const currentSelectValueText = String(selectValueOption ?? "");
          climateSelectContainerElement.dataset.currentValue = currentSelectValueText;
          const selectedMenuOptionElement = Array.from(
            selectMenuElement.querySelectorAll('[role="option"]')
          ).find(menuOptionSearch => menuOptionSearch.dataset.value === currentSelectValueText);
          selectTriggerLabelElement.textContent =
            selectedMenuOptionElement?.textContent || currentSelectValueText || "请选择";
          selectTriggerLabelElement.title = selectTriggerLabelElement.textContent;
          selectMenuElement.querySelectorAll('[role="option"]').forEach(menuOptionToggle => {
            const isMenuOptionSelected = menuOptionToggle.dataset.value === currentSelectValueText;
            menuOptionToggle.classList.toggle("active", isMenuOptionSelected);
            menuOptionToggle.setAttribute("aria-selected", String(isMenuOptionSelected));
          });
        };
        const positionSelectMenu = () => {
          if (!isSelectMenuOpen() && selectMenuElement.hidden) {
            return;
          }
          const triggerRect = selectTriggerElement.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const menuWidthPx = Math.min(
            Math.max(triggerRect.width, 190),
            Math.max(190, viewportWidth - 20)
          );
          selectMenuElement.style.width = menuWidthPx + "px";
          selectMenuElement.style.maxHeight =
            Math.min(360, Math.max(120, viewportHeight - 20)) + "px";
          const menuHeightPx = Math.min(selectMenuElement.scrollHeight || 0, 360);
          const spaceBelowPx = viewportHeight - triggerRect.bottom - 10;
          const spaceAbovePx = triggerRect.top - 10;
          const menuTopPx =
            spaceBelowPx < Math.min(menuHeightPx, 180) && spaceAbovePx > spaceBelowPx
              ? Math.max(10, triggerRect.top - menuHeightPx - 5)
              : Math.min(viewportHeight - menuHeightPx - 10, triggerRect.bottom + 5);
          selectMenuElement.style.left =
            Math.max(10, Math.min(triggerRect.left, viewportWidth - menuWidthPx - 10)) + "px";
          selectMenuElement.style.top = Math.max(10, menuTopPx) + "px";
        };
        const closeSelectMenu = () => {
          if (isSelectMenuOpen() && typeof selectMenuElement.hidePopover == "function") {
            selectMenuElement.hidePopover();
          }
          selectMenuElement.hidden = true;
          selectMenuElement.dataset.open = "false";
          selectTriggerElement.setAttribute("aria-expanded", "false");
        };
        const openSelectMenu = (shouldFocusFirstOption = false) => {
          if (!selectTriggerElement.disabled && !isSelectRequestPending) {
            selectMenuElement.hidden = false;
            if (typeof selectMenuElement.showPopover == "function") {
              selectMenuElement.showPopover();
            } else {
              selectMenuElement.dataset.open = "true";
            }
            selectTriggerElement.setAttribute("aria-expanded", "true");
            positionSelectMenu();
            if (shouldFocusFirstOption) {
              (
                selectMenuElement.querySelector('[aria-selected="true"]') ||
                selectMenuElement.querySelector('[role="option"]')
              )?.focus();
            }
          }
        };
        const commitSelectOption = async committedOptionValue => {
          if (!climateControlsInteractive || isSelectRequestPending) {
            return;
          }
          const previousSelectValue = climateSelectContainerElement.dataset.currentValue;
          isSelectRequestPending = true;
          selectTriggerElement.disabled = true;
          closeSelectMenu();
          renderSelectValue(committedOptionValue);
          try {
            await this.callEntityService(optionDomain, optionService, climateControlsEntityId, {
              [optionDataKey]: committedOptionValue
            });
            const nextClimateAttributes = {
              ...(latestClimateEntityState?.attributes || {}),
              [optionDataKey]: committedOptionValue
            };
            if (optionService === "set_hvac_mode") {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: committedOptionValue,
                attributes: {
                  ...nextClimateAttributes,
                  hvac_action:
                    committedOptionValue === "cool"
                      ? "cooling"
                      : committedOptionValue === "heat"
                        ? "heating"
                        : committedOptionValue === "off"
                          ? "off"
                          : committedOptionValue
                }
              };
              climatePowerChangeCallback?.(committedOptionValue !== "off");
            } else if (optionService === "set_preset_mode") {
              const isStandbyPreset =
                climateDeviceType === "bath-heater" &&
                ["idle", "standby", "待机", "关闭"].includes(
                  String(committedOptionValue).trim().toLowerCase()
                );
              const fallbackClimateMode =
                climateControlsElement.dataset.lastClimateMode ||
                climateCapabilities.hvacModes.find(
                  fallbackModeCandidate => fallbackModeCandidate !== "off"
                ) ||
                (climateEntityDomain === "fan" ? "on" : "auto");
              const nextPresetClimateState = {
                ...(latestClimateEntityState || {}),
                state: isStandbyPreset
                  ? "off"
                  : climateIsPoweredOn(latestClimateEntityState, climateDeviceType)
                    ? latestClimateEntityState?.state
                    : fallbackClimateMode,
                attributes: {
                  ...nextClimateAttributes,
                  preset_mode: committedOptionValue
                }
              };
              const presetEffectMode = climateEffectMode(nextPresetClimateState, climateDeviceType);
              nextPresetClimateState.attributes.hvac_action = isStandbyPreset
                ? "idle"
                : presetEffectMode === "cool"
                  ? "cooling"
                  : presetEffectMode === "heat"
                    ? "heating"
                    : "fan";
              latestClimateEntityState = nextPresetClimateState;
              climatePowerChangeCallback?.(!isStandbyPreset);
            } else if (optionService === "set_operation_mode") {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: committedOptionValue === "off" ? "off" : "on",
                attributes: {
                  ...nextClimateAttributes,
                  operation_mode: committedOptionValue
                }
              };
              climatePowerChangeCallback?.(committedOptionValue !== "off");
            } else {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                attributes: nextClimateAttributes
              };
            }
            renderClimateControls();
          } catch (selectRequestError) {
            renderSelectValue(previousSelectValue);
            this.options.onError?.(selectRequestError);
          } finally {
            isSelectRequestPending = false;
            selectTriggerElement.disabled = !climateControlsInteractive;
          }
        };
        for (const optionButtonValue of optionValues) {
          const climateSelectOptionElement = document.createElement("button");
          climateSelectOptionElement.type = "button";
          climateSelectOptionElement.className = "hb-climate-select-option";
          climateSelectOptionElement.setAttribute("role", "option");
          climateSelectOptionElement.dataset.value = optionButtonValue;
          climateSelectOptionElement.textContent =
            optionLabels[optionButtonValue] || optionButtonValue;
          climateSelectOptionElement.title = climateSelectOptionElement.textContent;
          climateSelectOptionElement.addEventListener("click", () =>
            commitSelectOption(optionButtonValue)
          );
          selectMenuElement.append(climateSelectOptionElement);
        }
        renderSelectValue(String(optionCurrentValue ?? ""));
        selectTriggerElement.addEventListener("click", () => {
          if (isSelectMenuOpen() || selectMenuElement.dataset.open === "true") {
            closeSelectMenu();
          } else {
            openSelectMenu();
          }
        });
        selectTriggerElement.addEventListener("keydown", triggerKeyEvent => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(triggerKeyEvent.key)) {
            triggerKeyEvent.preventDefault();
            openSelectMenu(true);
          }
        });
        selectMenuElement.addEventListener("keydown", menuKeyEvent => {
          const menuOptionElements = [...selectMenuElement.querySelectorAll('[role="option"]')];
          const focusedOptionIndex = menuOptionElements.indexOf(document.activeElement);
          if (menuKeyEvent.key === "Escape") {
            menuKeyEvent.preventDefault();
            closeSelectMenu();
            selectTriggerElement.focus();
          } else if (menuKeyEvent.key === "ArrowDown" || menuKeyEvent.key === "ArrowUp") {
            menuKeyEvent.preventDefault();
            const menuStepDirection = menuKeyEvent.key === "ArrowDown" ? 1 : -1;
            menuOptionElements[
              (focusedOptionIndex + menuStepDirection + menuOptionElements.length) %
                menuOptionElements.length
            ]?.focus();
          } else if (menuKeyEvent.key === "Enter" || menuKeyEvent.key === " ") {
            menuKeyEvent.preventDefault();
            document.activeElement?.click();
          }
        });
        selectMenuElement.addEventListener("toggle", menuToggleEvent => {
          const isMenuVisible = menuToggleEvent.newState === "open";
          selectMenuElement.hidden = !isMenuVisible;
          selectMenuElement.dataset.open = String(isMenuVisible);
          selectTriggerElement.setAttribute("aria-expanded", String(isMenuVisible));
          if (isMenuVisible) {
            positionSelectMenu();
          }
        });
        climateSelectContainerElement.append(selectTriggerElement, selectMenuElement);
        climateOptionGroupElement.append(
          climateOptionGroupTitleElement,
          climateSelectContainerElement
        );
        (waterHeaterPanelElement || climateControlsElement).append(climateOptionGroupElement);
        return;
      }
      const inlineOptionsElement = document.createElement("div");
      inlineOptionsElement.className = "hb-climate-details-options";
      for (const inlineOptionValue of optionValues) {
        const inlineOptionButton = document.createElement("button");
        inlineOptionButton.type = "button";
        inlineOptionButton.dataset.climateService = optionService;
        inlineOptionButton.dataset.climateValue = inlineOptionValue;
        const inlineOptionIconElement = document.createElement("i");
        inlineOptionIconElement.setAttribute("aria-hidden", "true");
        inlineOptionIconElement.textContent = optionIcons[inlineOptionValue] || "";
        const inlineOptionLabelElement = document.createElement("span");
        inlineOptionLabelElement.textContent = optionLabels[inlineOptionValue] || inlineOptionValue;
        inlineOptionButton.append(inlineOptionIconElement, inlineOptionLabelElement);
        inlineOptionButton.classList.toggle("active", inlineOptionValue === optionCurrentValue);
        inlineOptionButton.addEventListener("click", async () => {
          if (!climateControlsInteractive) {
            return;
          }
          const isStandbyOption =
            climateDeviceType === "bath-heater" &&
            optionService === "set_preset_mode" &&
            ["idle", "standby", "待机", "关闭"].includes(
              String(inlineOptionValue).trim().toLowerCase()
            );
          inlineOptionsElement.querySelectorAll("button").forEach(inlineOptionElement => {
            inlineOptionElement.disabled = true;
          });
          try {
            await this.callEntityService(optionDomain, optionService, climateControlsEntityId, {
              [optionDataKey]: inlineOptionValue
            });
            if (isStandbyOption) {
              const powerCommandRequest = climatePowerCommand(
                climateControlsEntityId,
                latestClimateEntityState,
                false,
                "bath-heater"
              );
              await this.callEntityService(
                powerCommandRequest.domain,
                powerCommandRequest.service,
                climateControlsEntityId,
                powerCommandRequest.data
              );
            }
            inlineOptionsElement
              .querySelectorAll("button")
              .forEach(inlineButtonElement =>
                inlineButtonElement.classList.toggle(
                  "active",
                  inlineButtonElement === inlineOptionButton
                )
              );
            if (optionService === "set_hvac_mode") {
              const hvacAction =
                inlineOptionValue === "cool"
                  ? "cooling"
                  : inlineOptionValue === "heat"
                    ? "heating"
                    : inlineOptionValue === "off"
                      ? "off"
                      : inlineOptionValue;
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: inlineOptionValue,
                attributes: {
                  ...(latestClimateEntityState?.attributes || {}),
                  hvac_action: hvacAction
                }
              };
              renderClimateControls();
              climatePowerChangeCallback?.(inlineOptionValue !== "off");
            } else if (optionService === "set_preset_mode") {
              const isStandbyOptionValue = isStandbyOption;
              const fallbackModeValue =
                climateControlsElement.dataset.lastClimateMode ||
                climateCapabilities.hvacModes.find(
                  fallbackModeOption => fallbackModeOption !== "off"
                ) ||
                (climateEntityDomain === "fan" ? "on" : "auto");
              const nextPresetStateValue = {
                ...(latestClimateEntityState || {}),
                state: isStandbyOptionValue
                  ? "off"
                  : climateIsPoweredOn(latestClimateEntityState, climateDeviceType)
                    ? latestClimateEntityState?.state
                    : fallbackModeValue,
                attributes: {
                  ...(latestClimateEntityState?.attributes || {}),
                  preset_mode: inlineOptionValue
                }
              };
              const presetEffectModeValue = climateEffectMode(
                nextPresetStateValue,
                climateDeviceType
              );
              nextPresetStateValue.attributes.hvac_action = isStandbyOptionValue
                ? "idle"
                : presetEffectModeValue === "cool"
                  ? "cooling"
                  : presetEffectModeValue === "heat"
                    ? "heating"
                    : "fan";
              latestClimateEntityState = nextPresetStateValue;
              renderClimateControls();
              climatePowerChangeCallback?.(!isStandbyOptionValue);
            } else if (optionService === "set_operation_mode") {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: inlineOptionValue === "off" ? "off" : "on",
                attributes: {
                  ...(latestClimateEntityState?.attributes || {}),
                  operation_mode: inlineOptionValue
                }
              };
              renderClimateControls();
              climatePowerChangeCallback?.(inlineOptionValue !== "off");
            }
          } catch (optionRequestError) {
            this.options.onError?.(optionRequestError);
          } finally {
            inlineOptionsElement.querySelectorAll("button").forEach(disabledButtonElement => {
              disabledButtonElement.disabled = false;
            });
          }
        });
        inlineOptionsElement.append(inlineOptionButton);
      }
      climateOptionGroupElement.append(climateOptionGroupTitleElement, inlineOptionsElement);
      (waterHeaterPanelElement || climateControlsElement).append(climateOptionGroupElement);
    };
    const operationModes = climateOperationModeValues(climateControlsState, climateDeviceType);
    const operationModeLabels = Object.fromEntries(
      operationModes.map(operationModeValue => [
        operationModeValue,
        climateModeLabel(operationModeValue, climateDeviceType, climateLabelContext)
      ])
    );
    const operationModeIcons = Object.fromEntries(
      operationModes.map(operationModeIconValue => [
        operationModeIconValue,
        climateModeIcon(operationModeIconValue, climateDeviceType)
      ])
    );
    createClimateOptionGroup({
      label: "运行模式",
      values: operationModes,
      current: String(
        climateDeviceType === "water-heater"
          ? climateCapabilityAttributes.operation_mode || ""
          : climateControlsState?.state || ""
      ),
      service: climateDeviceType === "water-heater" ? "set_operation_mode" : "set_hvac_mode",
      dataKey: climateDeviceType === "water-heater" ? "operation_mode" : "hvac_mode",
      labels: operationModeLabels,
      icons: operationModeIcons,
      className: "mode-options",
      domain: climateDeviceType === "water-heater" ? "water_heater" : "climate",
      presentation: climateOptionPresentation(operationModes, operationModeLabels)
    });
    const climateFanModes = climateEntityDomain === "climate" ? climateCapabilities.fanModes : [];
    if (climateFanModes.length) {
      const fanModeLabels = {
        silent: "静音",
        low: "低",
        medium: "中",
        high: "高",
        full: "强劲",
        auto: "自动",
        1: "一档",
        2: "二档",
        3: "三档",
        4: "四档",
        5: "五档",
        6: "六档",
        7: "七档",
        max: "Max档"
      };
      const autoFanMode = climateFanModes.find(autoFanModeCandidate =>
        ["auto", "自动"].includes(String(autoFanModeCandidate).toLowerCase())
      );
      const manualFanModes = climateFanModes.filter(
        manualFanModeCandidate => manualFanModeCandidate !== autoFanMode
      );
      const fanSliderElement = document.createElement("section");
      fanSliderElement.className = "hb-climate-fan-slider";
      const fanSliderHeadingElement = document.createElement("span");
      fanSliderHeadingElement.className = "hb-climate-fan-slider-heading";
      const fanSliderIconElement = document.createElement("i");
      fanSliderIconElement.setAttribute("aria-hidden", "true");
      fanSliderIconElement.textContent = "✾";
      const fanSliderNameElement = document.createElement("strong");
      fanSliderNameElement.textContent = "风速";
      const fanSliderOutputElement = document.createElement("output");
      const initialFanIndex = Math.max(
        0,
        manualFanModes.indexOf(climateCapabilityAttributes.fan_mode)
      );
      let committedFanIndex = initialFanIndex;
      let isAutoFanSelected = !!autoFanMode && climateCapabilityAttributes.fan_mode === autoFanMode;
      let currentFanMode = climateCapabilityAttributes.fan_mode;
      const fanRangeElement = document.createElement("input");
      fanRangeElement.type = "range";
      fanRangeElement.min = "0";
      fanRangeElement.max = String(Math.max(0, manualFanModes.length - 1));
      fanRangeElement.step = "1";
      fanRangeElement.value = String(initialFanIndex);
      fanRangeElement.disabled = manualFanModes.length === 0;
      const fanModeLabelAt = fanModeIndex =>
        fanModeLabels[String(manualFanModes[fanModeIndex]).toLowerCase()] ||
        manualFanModes[fanModeIndex] ||
        "--";
      const autoFanButton = document.createElement("button");
      autoFanButton.type = "button";
      autoFanButton.className = "hb-climate-fan-auto";
      autoFanButton.textContent = "自动";
      autoFanButton.hidden = !autoFanMode;
      autoFanButton.classList.toggle("active", isAutoFanSelected);
      const renderFanSlider = () => {
        const fanSliderIndex = Number(fanRangeElement.value);
        const fanProgressPercent =
          manualFanModes.length > 1 ? (fanSliderIndex / (manualFanModes.length - 1)) * 100 : 100;
        fanSliderOutputElement.textContent = isAutoFanSelected
          ? "自动"
          : fanModeLabelAt(fanSliderIndex);
        fanRangeElement.style.setProperty("--hb-climate-fan-progress", fanProgressPercent + "%");
      };
      fanSliderHeadingElement.append(
        fanSliderIconElement,
        fanSliderNameElement,
        fanSliderOutputElement,
        autoFanButton
      );
      fanRangeElement.addEventListener("input", () => {
        isAutoFanSelected = false;
        autoFanButton.classList.remove("active");
        renderFanSlider();
      });
      fanRangeElement.addEventListener("change", async () => {
        if (!climateControlsInteractive || !manualFanModes.length) {
          return;
        }
        const selectedFanIndex = Number(fanRangeElement.value);
        const selectedFanMode = manualFanModes[selectedFanIndex];
        fanRangeElement.disabled = true;
        autoFanButton.disabled = true;
        try {
          await this.callEntityService("climate", "set_fan_mode", climateControlsEntityId, {
            fan_mode: selectedFanMode
          });
          committedFanIndex = selectedFanIndex;
          currentFanMode = selectedFanMode;
          isAutoFanSelected = false;
        } catch (fanModeRequestError) {
          isAutoFanSelected = !!autoFanMode && currentFanMode === autoFanMode;
          if (!isAutoFanSelected) {
            fanRangeElement.value = String(committedFanIndex);
          }
          autoFanButton.classList.toggle("active", isAutoFanSelected);
          renderFanSlider();
          this.options.onError?.(fanModeRequestError);
        } finally {
          fanRangeElement.disabled = false;
          autoFanButton.disabled = false;
        }
      });
      autoFanButton.addEventListener("click", async () => {
        if (!!climateControlsInteractive && !!autoFanMode && !autoFanButton.disabled) {
          fanRangeElement.disabled = true;
          autoFanButton.disabled = true;
          try {
            await this.callEntityService("climate", "set_fan_mode", climateControlsEntityId, {
              fan_mode: autoFanMode
            });
            isAutoFanSelected = true;
            currentFanMode = autoFanMode;
            autoFanButton.classList.add("active");
            renderFanSlider();
          } catch (autoFanRequestError) {
            this.options.onError?.(autoFanRequestError);
          } finally {
            fanRangeElement.disabled = manualFanModes.length === 0;
            autoFanButton.disabled = false;
          }
        }
      });
      const fanSliderLegendElement = document.createElement("span");
      fanSliderLegendElement.className = "hb-climate-fan-slider-legend";
      const fanMinLabelElement = document.createElement("small");
      fanMinLabelElement.textContent = fanModeLabelAt(0);
      const fanMaxLabelElement = document.createElement("small");
      fanMaxLabelElement.textContent = fanModeLabelAt(manualFanModes.length - 1);
      fanSliderLegendElement.append(fanMinLabelElement, fanMaxLabelElement);
      renderFanSlider();
      fanSliderElement.append(fanSliderHeadingElement, fanRangeElement, fanSliderLegendElement);
      climateControlsElement.append(fanSliderElement);
    }
    let syncFanPercentage = null;
    if (climateEntityDomain === "fan" && climateCapabilities.supportsFanPercentage) {
      const fanPercentageGroupElement = document.createElement("section");
      fanPercentageGroupElement.className = "hb-climate-fan-slider";
      const fanPercentageHeadingElement = document.createElement("span");
      fanPercentageHeadingElement.className = "hb-climate-fan-slider-heading";
      const fanPercentageIconElement = document.createElement("i");
      fanPercentageIconElement.setAttribute("aria-hidden", "true");
      fanPercentageIconElement.textContent = "✾";
      const fanPercentageNameElement = document.createElement("strong");
      fanPercentageNameElement.textContent = "风速";
      const fanPercentageOutputElement = document.createElement("output");
      let fanPercentage = Math.max(0, Math.min(100, climateCapabilities.fanPercentage));
      const fanPercentageRangeElement = document.createElement("input");
      fanPercentageRangeElement.type = "range";
      fanPercentageRangeElement.min = "0";
      fanPercentageRangeElement.max = "100";
      fanPercentageRangeElement.step = String(climateCapabilities.fanPercentageStep);
      fanPercentageRangeElement.value = String(fanPercentage);
      const renderFanPercentage = () => {
        const inputPercentageValue = Math.max(
          0,
          Math.min(100, Number(fanPercentageRangeElement.value) || 0)
        );
        fanPercentageOutputElement.textContent = Math.round(inputPercentageValue) + "%";
        fanPercentageRangeElement.style.setProperty(
          "--hb-climate-fan-progress",
          inputPercentageValue + "%"
        );
      };
      syncFanPercentage = fanPercentageSourceState => {
        const stateFanPercentage =
          normalizeClimateCapabilities(fanPercentageSourceState).fanPercentage;
        if (stateFanPercentage !== null) {
          fanPercentage = Math.max(0, Math.min(100, stateFanPercentage));
          fanPercentageRangeElement.value = String(fanPercentage);
          renderFanPercentage();
        }
      };
      fanPercentageRangeElement.addEventListener("input", renderFanPercentage);
      fanPercentageRangeElement.addEventListener("change", async () => {
        if (!climateControlsInteractive || fanPercentageRangeElement.disabled) {
          return;
        }
        const requestedPercentage = Math.max(
          0,
          Math.min(100, Number(fanPercentageRangeElement.value) || 0)
        );
        fanPercentageRangeElement.disabled = true;
        try {
          await this.callEntityService("fan", "set_percentage", climateControlsEntityId, {
            percentage: requestedPercentage
          });
          fanPercentage = requestedPercentage;
          latestClimateEntityState = {
            ...(latestClimateEntityState || {}),
            state: requestedPercentage > 0 ? "on" : "off",
            attributes: {
              ...(latestClimateEntityState?.attributes || {}),
              percentage: requestedPercentage
            }
          };
          renderClimateControls();
          climatePowerChangeCallback?.(requestedPercentage > 0);
        } catch (fanPercentageRequestError) {
          fanPercentageRangeElement.value = String(fanPercentage);
          renderFanPercentage();
          this.options.onError?.(fanPercentageRequestError);
        } finally {
          fanPercentageRangeElement.disabled = false;
        }
      });
      const fanPercentageLegendElement = document.createElement("span");
      fanPercentageLegendElement.className = "hb-climate-fan-slider-legend";
      const fanPercentageMinLabelElement = document.createElement("small");
      fanPercentageMinLabelElement.textContent = "关闭";
      const fanPercentageMaxLabelElement = document.createElement("small");
      fanPercentageMaxLabelElement.textContent = "最大";
      fanPercentageLegendElement.append(fanPercentageMinLabelElement, fanPercentageMaxLabelElement);
      fanPercentageHeadingElement.append(
        fanPercentageIconElement,
        fanPercentageNameElement,
        fanPercentageOutputElement
      );
      renderFanPercentage();
      fanPercentageGroupElement.append(
        fanPercentageHeadingElement,
        fanPercentageRangeElement,
        fanPercentageLegendElement
      );
      climateControlsElement.append(fanPercentageGroupElement);
    }
    const swingModeLabels = Object.fromEntries(
      climateCapabilities.swingModes.map(swingModeValue => [
        swingModeValue,
        climateSwingModeLabel(swingModeValue, "vertical", climateLabelContext)
      ])
    );
    createClimateOptionGroup({
      label: climateCapabilities.horizontalSwingModes.length ? "纵向摆风" : "摆风",
      values: climateCapabilities.swingModes,
      current: climateCapabilityAttributes.swing_mode,
      service: "set_swing_mode",
      dataKey: "swing_mode",
      labels: swingModeLabels,
      icons: {
        off: "—",
        vertical: "↕",
        horizontal: "↔",
        both: "✣"
      },
      className: "compact-options",
      presentation: climateOptionPresentation(climateCapabilities.swingModes, swingModeLabels, {
        inlineIcon: true
      })
    });
    const horizontalSwingModeLabels = Object.fromEntries(
      climateCapabilities.horizontalSwingModes.map(horizontalSwingModeValue => [
        horizontalSwingModeValue,
        climateSwingModeLabel(horizontalSwingModeValue, "horizontal", climateLabelContext)
      ])
    );
    createClimateOptionGroup({
      label: "水平摆风",
      values: climateCapabilities.horizontalSwingModes,
      current: climateCapabilityAttributes.swing_horizontal_mode,
      service: "set_swing_horizontal_mode",
      dataKey: "swing_horizontal_mode",
      labels: horizontalSwingModeLabels,
      className: "compact-options",
      presentation: climateOptionPresentation(
        climateCapabilities.horizontalSwingModes,
        horizontalSwingModeLabels,
        {
          inlineIcon: true
        }
      )
    });
    const presetModeLabels = Object.fromEntries(
      climateCapabilities.presetModes.map(presetModeItem => [
        presetModeItem,
        climateModeLabel(presetModeItem, climateDeviceType, climateLabelContext)
      ])
    );
    const presetModeIcons = Object.fromEntries(
      climateCapabilities.presetModes.map(presetModeIconValue => [
        presetModeIconValue,
        climateModeIcon(presetModeIconValue, climateDeviceType)
      ])
    );
    createClimateOptionGroup({
      label: "预设模式",
      values: climateCapabilities.presetModes,
      current: climateCapabilityAttributes.preset_mode,
      service: "set_preset_mode",
      dataKey: "preset_mode",
      labels: presetModeLabels,
      icons: presetModeIcons,
      className: "compact-options",
      domain: climateEntityDomain === "fan" ? "fan" : "climate",
      presentation: climateOptionPresentation(climateCapabilities.presetModes, presetModeLabels, {
        inlineIcon: true
      })
    });
    let renderLoadingState = null;
    if (!climateControlsElement.childElementCount) {
      const climateLoadingSectionElement = document.createElement("section");
      climateLoadingSectionElement.className = "hb-climate-details-loading";
      const climateLoadingIconElement = document.createElement("i");
      climateLoadingIconElement.setAttribute("aria-hidden", "true");
      const climateLoadingTitleElement = document.createElement("strong");
      const climateLoadingHintElement = document.createElement("span");
      renderLoadingState = loadingSourceState => {
        const loadingStateText = String(loadingSourceState?.state || "")
          .trim()
          .toLowerCase();
        const isLoadingState =
          !loadingSourceState || !loadingStateText || loadingStateText === "unknown";
        const isUnavailableState = loadingStateText === "unavailable";
        climateLoadingSectionElement.classList.toggle("is-loading", isLoadingState);
        climateLoadingSectionElement.classList.toggle("is-unavailable", isUnavailableState);
        climateLoadingTitleElement.textContent = isLoadingState
          ? "正在加载设备状态…"
          : isUnavailableState
            ? "设备当前不可用"
            : "暂无可用控制数据";
        climateLoadingHintElement.textContent = isLoadingState
          ? "状态到达后会自动显示，无需重新打开弹窗"
          : isUnavailableState
            ? "连接恢复后会自动更新"
            : "请检查该实体在 Home Assistant 中提供的控制能力";
      };
      renderLoadingState(climateControlsState);
      climateLoadingSectionElement.append(
        climateLoadingIconElement,
        climateLoadingTitleElement,
        climateLoadingHintElement
      );
      climateControlsElement.append(climateLoadingSectionElement);
    }
    climateControlsElement.syncClimateGrid = () => {
      const climateGridChildren = Array.from(climateControlsElement.children);
      const gridThermostatElement = climateGridChildren.find(thermostatGridChild =>
        thermostatGridChild.classList.contains("hb-climate-thermostat")
      );
      if (!gridThermostatElement) {
        return;
      }
      const gridWaterHeaterElement = climateGridChildren.find(waterHeaterGridChild =>
        waterHeaterGridChild.classList.contains("is-water-heater")
      );
      const gridRowSpan = climateGridChildren.filter(
        gridChildNode =>
          gridChildNode !== gridThermostatElement && gridChildNode !== gridWaterHeaterElement
      ).length;
      gridThermostatElement.style.gridRow = "1 / span " + Math.max(1, gridRowSpan);
      if (gridWaterHeaterElement) {
        gridWaterHeaterElement.style.gridRow = "1 / span " + Math.max(1, gridRowSpan);
      }
    };
    climateControlsElement.syncClimateGrid();
    climateControlsElement.syncClimateState = syncClimateStateValue => {
      if (!syncClimateStateValue) {
        return;
      }
      latestClimateEntityState = syncClimateStateValue;
      renderLoadingState?.(syncClimateStateValue);
      syncFanPercentage?.(syncClimateStateValue);
      const stateTargetTemperature =
        normalizeClimateCapabilities(syncClimateStateValue).targetTemperature;
      const reconciledTarget = reconcileClimateTargetTemperature(
        displayTargetTemperature,
        stateTargetTemperature,
        confirmedCommand,
        capabilityTemperatureStep
      );
      if (confirmedCommand === null || reconciledTarget.confirmed) {
        displayTargetTemperature = reconciledTarget.temperature;
      }
      pendingTargetTemperature = displayTargetTemperature;
      if (
        stateTargetTemperature !== null &&
        (confirmedCommand === null || reconciledTarget.confirmed)
      ) {
        lastCommittedTemperature = stateTargetTemperature;
      }
      if (confirmedCommand !== null && reconciledTarget.confirmed) {
        if (isWaterHeater) {
          scheduleCommandClear();
        } else {
          clearCommandTimers();
        }
      }
      renderThermostat();
    };
    climateControlsElement.cleanupClimateDetails = () => {
      window.clearTimeout(temperatureQueueTimer);
      temperatureQueueTimer = null;
      temperatureQueue.length = 0;
      inFlightTemperature = null;
      clearCommandTimers();
    };
    renderClimateControls();
    return climateControlsElement;
  }
  createWaterHeaterExtensionControls(
    extensionsEntityId,
    {
      component: extensionComponent = null,
      interactive: extensionsInteractive = true,
      excludedEntityIds: extensionExcludedEntityIds = []
    } = {}
  ) {
    const extensionPopupContext = extensionComponent
      ? relatedPopupContext(
          extensionComponent,
          this.entityMetadata,
          this.deviceMetadata,
          this.states
        )
      : null;
    const extensionSelectedEntities = extensionComponent
      ? selectedRelatedEntities(
          extensionComponent,
          this.entityMetadata,
          this.deviceMetadata,
          this.states
        )
      : null;
    const excludedEntityIdSet = new Set(extensionExcludedEntityIds);
    const extensionRelatedEntities = (
      extensionSelectedEntities === null
        ? relatedWaterHeaterEntities(this.entityMetadata, extensionsEntityId)
        : extensionSelectedEntities
    ).filter(relatedEntityEntry => !excludedEntityIdSet.has(relatedEntityEntry.entityId));
    const primaryEntityMetadata =
      extensionPopupContext?.primary || this.entityMetadata.get(extensionsEntityId);
    if (!extensionRelatedEntities.length) {
      return null;
    }
    const extensionsElement = document.createElement("section");
    extensionsElement.className =
      "hb-related-entity-extensions hb-water-heater-extensions" +
      (extensionPopupContext?.deviceType ? " is-" + extensionPopupContext.deviceType : "");
    extensionsElement.dataset.controlSource =
      extensionSelectedEntities === null ? "automatic-device" : "user-selected";
    const stateHandlersByEntityId = new Map();
    const getExtensionEntityState = handlerTargetEntityId => {
      const extensionStateRecord = this.states.get(handlerTargetEntityId);
      return (
        extensionStateRecord?.newState ||
        extensionStateRecord || {
          entityId: handlerTargetEntityId,
          state: "unknown",
          attributes: {}
        }
      );
    };
    const registerExtensionStateHandler = (registeredHandlerEntityId, entityStateHandler) => {
      if (!stateHandlersByEntityId.has(registeredHandlerEntityId)) {
        stateHandlersByEntityId.set(registeredHandlerEntityId, []);
      }
      stateHandlersByEntityId.get(registeredHandlerEntityId).push(entityStateHandler);
    };
    const extensionGridElement = document.createElement("div");
    extensionGridElement.className = "hb-water-heater-extension-grid";
    for (const relatedEntityRecord of extensionRelatedEntities) {
      const relatedEntityId = relatedEntityRecord.entityId;
      const relatedEntityDomain = String(relatedEntityRecord.domain || "");
      const relatedEntityLabelText = extensionPopupContext
        ? relatedEntityLabel(extensionPopupContext, relatedEntityRecord)
        : waterHeaterRelatedEntityLabel(primaryEntityMetadata, relatedEntityRecord);
      if (["light", "switch", "input_boolean", "fan"].includes(relatedEntityDomain)) {
        const toggleButtonElement = document.createElement("button");
        toggleButtonElement.type = "button";
        toggleButtonElement.className = "hb-water-heater-extension-toggle";
        const toggleIconElement = document.createElement("i");
        toggleIconElement.setAttribute("aria-hidden", "true");
        const toggleTextElement = document.createElement("span");
        const toggleLabelElement = document.createElement("strong");
        toggleLabelElement.textContent = relatedEntityLabelText;
        const toggleStateElement = document.createElement("small");
        toggleTextElement.append(toggleLabelElement, toggleStateElement);
        toggleButtonElement.append(toggleIconElement, toggleTextElement);
        let toggleEntityState = getExtensionEntityState(relatedEntityId);
        let isTogglePending = false;
        const renderExtensionToggle = (toggleSourceState = toggleEntityState) => {
          toggleEntityState = toggleSourceState || toggleEntityState;
          const toggleStateText = String(toggleEntityState?.state || "").toLowerCase();
          const isToggleUnavailable = ["unknown", "unavailable"].includes(toggleStateText);
          const isToggleOn = toggleStateText === "on";
          toggleButtonElement.classList.toggle("is-on", isToggleOn && !isToggleUnavailable);
          toggleButtonElement.classList.toggle("is-unavailable", isToggleUnavailable);
          toggleButtonElement.disabled =
            !extensionsInteractive || isTogglePending || isToggleUnavailable;
          toggleButtonElement.setAttribute("aria-pressed", String(isToggleOn));
          toggleButtonElement.setAttribute("aria-busy", String(isTogglePending));
          toggleStateElement.textContent = isToggleUnavailable
            ? "不可用"
            : isToggleOn
              ? "已开启"
              : "已关闭";
        };
        toggleButtonElement.addEventListener("click", async () => {
          if (
            !extensionsInteractive ||
            isTogglePending ||
            toggleButtonElement.classList.contains("is-unavailable")
          ) {
            return;
          }
          const toggleStateBeforeChange = toggleEntityState;
          const nextToggleIsOn = String(toggleEntityState?.state || "").toLowerCase() !== "on";
          isTogglePending = true;
          renderExtensionToggle({
            ...(toggleEntityState || {}),
            state: nextToggleIsOn ? "on" : "off"
          });
          try {
            await this.callEntityService("homeassistant", "toggle", relatedEntityId);
          } catch (toggleRequestError) {
            renderExtensionToggle(toggleStateBeforeChange);
            this.options.onError?.(toggleRequestError);
          } finally {
            isTogglePending = false;
            renderExtensionToggle(toggleEntityState);
          }
        });
        renderExtensionToggle(toggleEntityState);
        registerExtensionStateHandler(relatedEntityId, renderExtensionToggle);
        extensionGridElement.append(toggleButtonElement);
      } else if (["select", "input_select"].includes(relatedEntityDomain)) {
        const extensionSelectElement = document.createElement("div");
        extensionSelectElement.className = "hb-water-heater-extension-select";
        const extensionSelectLabelElement = document.createElement("span");
        extensionSelectLabelElement.textContent = relatedEntityLabelText;
        extensionSelectLabelElement.title = relatedEntityLabelText;
        const extensionSelectTriggerElement = document.createElement("button");
        extensionSelectTriggerElement.type = "button";
        extensionSelectTriggerElement.className = "hb-related-select-trigger";
        extensionSelectTriggerElement.setAttribute("aria-label", relatedEntityLabelText);
        extensionSelectTriggerElement.setAttribute("aria-haspopup", "listbox");
        extensionSelectTriggerElement.setAttribute("aria-expanded", "false");
        const extensionSelectValueElement = document.createElement("span");
        const extensionSelectChevronElement = document.createElement("i");
        extensionSelectChevronElement.setAttribute("aria-hidden", "true");
        extensionSelectTriggerElement.append(
          extensionSelectValueElement,
          extensionSelectChevronElement
        );
        const extensionSelectMenuElement = document.createElement("div");
        extensionSelectMenuElement.className = "hb-related-select-menu";
        extensionSelectMenuElement.id =
          "hb-related-select-" +
          String(this.renderNamespace || "runtime").replace(/[^a-z0-9_-]/gi, "-") +
          "-" +
          relatedEntityId.replace(/[^a-z0-9_-]/gi, "-");
        extensionSelectMenuElement.setAttribute("role", "listbox");
        extensionSelectMenuElement.setAttribute("popover", "auto");
        extensionSelectMenuElement.hidden = true;
        extensionSelectTriggerElement.setAttribute("aria-controls", extensionSelectMenuElement.id);
        let extensionSelectState = getExtensionEntityState(relatedEntityId);
        let extensionSelectedValue = String(extensionSelectState?.state || "");
        let isExtensionSelectPending = false;
        let lastOptionsSignature = "";
        let selectOptions = [];
        const selectLabelContext = {
          entityId: relatedEntityId,
          entityMetadata: this.entityMetadata,
          entityTranslations: this.entityTranslations,
          attributes: ["options", "option"]
        };
        const formatOptionLabel = optionLabelValue =>
          extensionPopupContext?.deviceType === "bath-heater"
            ? climateModeLabel(optionLabelValue, "bath-heater", selectLabelContext)
            : String(optionLabelValue || "");
        const isExtensionMenuOpen = () => {
          try {
            return extensionSelectMenuElement.matches(":popover-open");
          } catch {
            return extensionSelectMenuElement.dataset.open === "true";
          }
        };
        const positionExtensionMenu = () => {
          if (!isExtensionMenuOpen() && extensionSelectMenuElement.hidden) {
            return;
          }
          const extensionTriggerRect = extensionSelectTriggerElement.getBoundingClientRect();
          const extensionViewportWidth = window.innerWidth;
          const extensionViewportHeight = window.innerHeight;
          const extensionMenuWidthPx = Math.min(
            Math.max(extensionTriggerRect.width, 132),
            Math.max(132, extensionViewportWidth - 16)
          );
          extensionSelectMenuElement.style.width = extensionMenuWidthPx + "px";
          extensionSelectMenuElement.style.maxHeight =
            Math.min(216, Math.max(88, extensionViewportHeight - 16)) + "px";
          const extensionMenuHeightPx = Math.min(extensionSelectMenuElement.scrollHeight || 0, 216);
          const extensionSpaceBelow = extensionViewportHeight - extensionTriggerRect.bottom - 8;
          const extensionSpaceAbove = extensionTriggerRect.top - 8;
          const extensionMenuTop =
            extensionSpaceBelow < Math.min(extensionMenuHeightPx, 140) &&
            extensionSpaceAbove > extensionSpaceBelow
              ? Math.max(8, extensionTriggerRect.top - extensionMenuHeightPx - 4)
              : Math.min(
                  extensionViewportHeight - extensionMenuHeightPx - 8,
                  extensionTriggerRect.bottom + 4
                );
          extensionSelectMenuElement.style.left =
            Math.max(
              8,
              Math.min(extensionTriggerRect.left, extensionViewportWidth - extensionMenuWidthPx - 8)
            ) + "px";
          extensionSelectMenuElement.style.top = Math.max(8, extensionMenuTop) + "px";
        };
        const closeExtensionMenu = () => {
          if (
            isExtensionMenuOpen() &&
            typeof extensionSelectMenuElement.hidePopover == "function"
          ) {
            extensionSelectMenuElement.hidePopover();
          }
          extensionSelectMenuElement.hidden = true;
          extensionSelectMenuElement.dataset.open = "false";
          extensionSelectTriggerElement.setAttribute("aria-expanded", "false");
        };
        const openExtensionMenu = (shouldFocusFirst = false) => {
          if (!extensionSelectTriggerElement.disabled) {
            extensionSelectMenuElement.hidden = false;
            if (typeof extensionSelectMenuElement.showPopover == "function") {
              extensionSelectMenuElement.showPopover();
            } else {
              extensionSelectMenuElement.dataset.open = "true";
            }
            extensionSelectTriggerElement.setAttribute("aria-expanded", "true");
            positionExtensionMenu();
            if (shouldFocusFirst) {
              (
                extensionSelectMenuElement.querySelector('[aria-selected="true"]') ||
                extensionSelectMenuElement.querySelector('[role="option"]')
              )?.focus();
            }
          }
        };
        const commitExtensionOption = async extensionOptionValue => {
          if (!extensionsInteractive || isExtensionSelectPending || !extensionOptionValue) {
            return;
          }
          const previousExtensionState = extensionSelectState;
          isExtensionSelectPending = true;
          closeExtensionMenu();
          renderExtensionSelect({
            ...(extensionSelectState || {}),
            state: extensionOptionValue,
            attributes: {
              ...(extensionSelectState?.attributes || {}),
              options: selectOptions
            }
          });
          try {
            const extensionSelectService = relatedEntitySelectService(relatedEntityDomain);
            if (!extensionSelectService) {
              throw new Error("实体 " + relatedEntityId + " 不支持选项服务。");
            }
            await this.callEntityService(
              extensionSelectService.domain,
              extensionSelectService.service,
              relatedEntityId,
              {
                option: extensionOptionValue
              }
            );
            extensionSelectedValue = extensionOptionValue;
          } catch (extensionSelectRequestError) {
            renderExtensionSelect(previousExtensionState);
            this.options.onError?.(extensionSelectRequestError);
          } finally {
            isExtensionSelectPending = false;
            renderExtensionSelect(extensionSelectState);
          }
        };
        const renderExtensionOptions = (extensionOptions, extensionOptionsCurrent) => {
          extensionSelectMenuElement.replaceChildren(
            ...extensionOptions.map(extensionOptionLabelValue => {
              const selectOptionButtonElement = document.createElement("button");
              selectOptionButtonElement.type = "button";
              selectOptionButtonElement.className = "hb-related-select-option";
              selectOptionButtonElement.setAttribute("role", "option");
              selectOptionButtonElement.dataset.value = extensionOptionLabelValue;
              selectOptionButtonElement.textContent = formatOptionLabel(extensionOptionLabelValue);
              selectOptionButtonElement.title = selectOptionButtonElement.textContent;
              const isExtensionOptionSelected =
                extensionOptionLabelValue === extensionOptionsCurrent;
              selectOptionButtonElement.classList.toggle("active", isExtensionOptionSelected);
              selectOptionButtonElement.setAttribute(
                "aria-selected",
                String(isExtensionOptionSelected)
              );
              selectOptionButtonElement.addEventListener("click", () =>
                commitExtensionOption(extensionOptionLabelValue)
              );
              return selectOptionButtonElement;
            })
          );
        };
        const renderExtensionSelect = (extensionSelectSourceState = extensionSelectState) => {
          extensionSelectState = extensionSelectSourceState || extensionSelectState;
          const extensionCurrentValueText = String(extensionSelectState?.state || "");
          const extensionOptionsList = relatedEntityOptions(
            relatedEntityRecord,
            extensionSelectState
          );
          selectOptions = extensionOptionsList;
          const extensionOptionsSignature = JSON.stringify(extensionOptionsList);
          if (extensionOptionsSignature !== lastOptionsSignature) {
            lastOptionsSignature = extensionOptionsSignature;
            renderExtensionOptions(extensionOptionsList, extensionCurrentValueText);
          } else {
            for (const extensionOptionElement of extensionSelectMenuElement.querySelectorAll(
              '[role="option"]'
            )) {
              const isExtensionValueSelected =
                extensionOptionElement.dataset.value === extensionCurrentValueText;
              extensionOptionElement.classList.toggle("active", isExtensionValueSelected);
              extensionOptionElement.setAttribute(
                "aria-selected",
                String(isExtensionValueSelected)
              );
            }
          }
          if (
            extensionCurrentValueText &&
            !["unknown", "unavailable"].includes(extensionCurrentValueText.toLowerCase())
          ) {
            extensionSelectedValue = extensionCurrentValueText;
          }
          extensionSelectValueElement.textContent = extensionSelectedValue
            ? formatOptionLabel(extensionSelectedValue)
            : extensionOptionsList.length
              ? formatOptionLabel(extensionOptionsList[0])
              : "无选项";
          extensionSelectValueElement.title = extensionSelectValueElement.textContent;
          extensionSelectTriggerElement.disabled =
            !extensionsInteractive ||
            isExtensionSelectPending ||
            !extensionOptionsList.length ||
            extensionCurrentValueText.toLowerCase() === "unavailable";
        };
        extensionSelectTriggerElement.addEventListener("click", () => {
          if (isExtensionMenuOpen() || extensionSelectMenuElement.dataset.open === "true") {
            closeExtensionMenu();
          } else {
            openExtensionMenu();
          }
        });
        extensionSelectTriggerElement.addEventListener("keydown", extensionTriggerKeyEvent => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(extensionTriggerKeyEvent.key)) {
            extensionTriggerKeyEvent.preventDefault();
            openExtensionMenu(true);
          }
        });
        extensionSelectMenuElement.addEventListener("keydown", extensionMenuKeyEvent => {
          const extensionOptionElements = [
            ...extensionSelectMenuElement.querySelectorAll('[role="option"]')
          ];
          const extensionFocusedIndex = extensionOptionElements.indexOf(document.activeElement);
          if (extensionMenuKeyEvent.key === "Escape") {
            extensionMenuKeyEvent.preventDefault();
            closeExtensionMenu();
            extensionSelectTriggerElement.focus();
          } else if (
            extensionMenuKeyEvent.key === "ArrowDown" ||
            extensionMenuKeyEvent.key === "ArrowUp"
          ) {
            extensionMenuKeyEvent.preventDefault();
            const extensionStepDirection = extensionMenuKeyEvent.key === "ArrowDown" ? 1 : -1;
            extensionOptionElements[
              (extensionFocusedIndex + extensionStepDirection + extensionOptionElements.length) %
                extensionOptionElements.length
            ]?.focus();
          } else if (extensionMenuKeyEvent.key === "Enter" || extensionMenuKeyEvent.key === " ") {
            extensionMenuKeyEvent.preventDefault();
            document.activeElement?.click();
          }
        });
        extensionSelectMenuElement.addEventListener("toggle", extensionMenuToggleEvent => {
          const isExtensionMenuVisible = extensionMenuToggleEvent.newState === "open";
          extensionSelectMenuElement.hidden = !isExtensionMenuVisible;
          extensionSelectMenuElement.dataset.open = String(isExtensionMenuVisible);
          extensionSelectTriggerElement.setAttribute(
            "aria-expanded",
            String(isExtensionMenuVisible)
          );
          if (isExtensionMenuVisible) {
            positionExtensionMenu();
          }
        });
        extensionSelectElement.append(
          extensionSelectLabelElement,
          extensionSelectTriggerElement,
          extensionSelectMenuElement
        );
        renderExtensionSelect(extensionSelectState);
        registerExtensionStateHandler(relatedEntityId, renderExtensionSelect);
        extensionGridElement.append(extensionSelectElement);
      } else if (["number", "input_number"].includes(relatedEntityDomain)) {
        const numberControlElement = document.createElement("div");
        numberControlElement.className = "hb-water-heater-extension-number";
        const numberLabelElement = document.createElement("span");
        numberLabelElement.textContent = relatedEntityLabelText;
        const numberStepperElement = document.createElement("span");
        const decrementButton = document.createElement("button");
        decrementButton.type = "button";
        decrementButton.textContent = "−";
        const numberOutputElement = document.createElement("output");
        const incrementButton = document.createElement("button");
        incrementButton.type = "button";
        incrementButton.textContent = "+";
        numberStepperElement.append(decrementButton, numberOutputElement, incrementButton);
        numberControlElement.append(numberLabelElement, numberStepperElement);
        let numberEntityState = getExtensionEntityState(relatedEntityId);
        let numericValue = Number(numberEntityState?.state);
        let isSteppingPending = false;
        const resolveNumberBounds = () => {
          const numberAttributes = numberEntityState?.attributes || {};
          const numberMinimum = Number(numberAttributes.min);
          const numberMaximum = Number(numberAttributes.max);
          const numberStep = Math.max(0.001, Number(numberAttributes.step) || 1);
          return {
            minimum: Number.isFinite(numberMinimum) ? numberMinimum : 0,
            maximum: Number.isFinite(numberMaximum) ? numberMaximum : 100,
            step: numberStep
          };
        };
        const renderNumberControl = (numberSourceState = numberEntityState) => {
          numberEntityState = numberSourceState || numberEntityState;
          const stateNumber = Number(numberEntityState?.state);
          const isNumberUnavailable =
            !Number.isFinite(stateNumber) ||
            ["unknown", "unavailable"].includes(
              String(numberEntityState?.state || "").toLowerCase()
            );
          if (!isNumberUnavailable) {
            numericValue = stateNumber;
          }
          const numberUnit = String(numberEntityState?.attributes?.unit_of_measurement || "");
          numberOutputElement.textContent = isNumberUnavailable
            ? "--"
            : "" + stateNumber + numberUnit;
          decrementButton.disabled =
            !extensionsInteractive || isSteppingPending || isNumberUnavailable;
          incrementButton.disabled =
            !extensionsInteractive || isSteppingPending || isNumberUnavailable;
        };
        const stepNumber = async stepDirection => {
          if (!extensionsInteractive || isSteppingPending || !Number.isFinite(numericValue)) {
            return;
          }
          const {
            minimum: boundMinimum,
            maximum: boundMaximum,
            step: boundStep
          } = resolveNumberBounds();
          const numberDecimals = String(boundStep).split(".")[1]?.length || 0;
          const nextNumberValue = Number(
            Math.max(
              boundMinimum,
              Math.min(boundMaximum, numericValue + stepDirection * boundStep)
            ).toFixed(numberDecimals)
          );
          if (nextNumberValue === numericValue) {
            return;
          }
          const previousNumberState = numberEntityState;
          isSteppingPending = true;
          renderNumberControl({
            ...(numberEntityState || {}),
            state: String(nextNumberValue)
          });
          try {
            await this.callEntityService(relatedEntityDomain, "set_value", relatedEntityId, {
              value: nextNumberValue
            });
            numericValue = nextNumberValue;
          } catch (numberRequestError) {
            renderNumberControl(previousNumberState);
            this.options.onError?.(numberRequestError);
          } finally {
            isSteppingPending = false;
            renderNumberControl(numberEntityState);
          }
        };
        decrementButton.addEventListener("click", () => stepNumber(-1));
        incrementButton.addEventListener("click", () => stepNumber(1));
        renderNumberControl(numberEntityState);
        registerExtensionStateHandler(relatedEntityId, renderNumberControl);
        extensionGridElement.append(numberControlElement);
      } else if (relatedEntityDomain === "button") {
        const actionButtonElement = document.createElement("button");
        actionButtonElement.type = "button";
        actionButtonElement.className = "hb-water-heater-extension-action";
        actionButtonElement.textContent = relatedEntityLabelText;
        let isActionPending = false;
        const renderActionButton = actionSourceState => {
          const isActionUnavailable =
            String(actionSourceState?.state || "").toLowerCase() === "unavailable";
          actionButtonElement.disabled =
            !extensionsInteractive || isActionPending || isActionUnavailable;
        };
        actionButtonElement.addEventListener("click", async () => {
          if (
            !!extensionsInteractive &&
            !isActionPending &&
            !actionButtonElement.disabled &&
            (!relatedEntityNeedsConfirmation(relatedEntityRecord) ||
              !!window.confirm("确认执行“" + relatedEntityLabelText + "”吗？"))
          ) {
            isActionPending = true;
            renderActionButton(getExtensionEntityState(relatedEntityId));
            try {
              await this.callEntityService("button", "press", relatedEntityId);
            } catch (actionRequestError) {
              this.options.onError?.(actionRequestError);
            } finally {
              isActionPending = false;
              renderActionButton(getExtensionEntityState(relatedEntityId));
            }
          }
        });
        renderActionButton(getExtensionEntityState(relatedEntityId));
        registerExtensionStateHandler(relatedEntityId, renderActionButton);
        extensionGridElement.append(actionButtonElement);
      } else if (["sensor", "binary_sensor"].includes(relatedEntityDomain)) {
        const readonlyControlElement = document.createElement("div");
        readonlyControlElement.className = "hb-water-heater-extension-readonly";
        const readonlyLabelElement = document.createElement("strong");
        readonlyLabelElement.textContent = relatedEntityLabelText;
        const readonlyValueElement = document.createElement("small");
        const renderReadonlyValue = readonlySourceState => {
          const readonlyStateText = String(readonlySourceState?.state || "unknown");
          const isReadonlyUnavailable = ["unknown", "unavailable"].includes(
            readonlyStateText.toLowerCase()
          );
          const readonlyUnit = String(readonlySourceState?.attributes?.unit_of_measurement || "");
          if (isReadonlyUnavailable) {
            readonlyValueElement.textContent = "不可用";
          } else if (relatedEntityDomain === "binary_sensor") {
            readonlyValueElement.textContent = readonlyStateText === "on" ? "已触发" : "正常";
          } else {
            readonlyValueElement.textContent =
              "" + readonlyStateText + (readonlyUnit ? " " + readonlyUnit : "");
          }
          readonlyControlElement.classList.toggle("is-unavailable", isReadonlyUnavailable);
        };
        readonlyControlElement.append(readonlyLabelElement, readonlyValueElement);
        renderReadonlyValue(getExtensionEntityState(relatedEntityId));
        registerExtensionStateHandler(relatedEntityId, renderReadonlyValue);
        extensionGridElement.append(readonlyControlElement);
      }
    }
    if (extensionGridElement.childElementCount) {
      const extensionTitleElement = document.createElement("strong");
      extensionTitleElement.className = "hb-water-heater-extension-title";
      extensionTitleElement.textContent = "扩展功能";
      extensionsElement.dataset.controlCount = String(extensionGridElement.childElementCount);
      extensionGridElement.dataset.controlCount = String(extensionGridElement.childElementCount);
      extensionsElement.append(extensionTitleElement, extensionGridElement);
    }
    extensionsElement.stateHandlers = stateHandlersByEntityId;
    extensionsElement.relatedEntityIds = extensionRelatedEntities.map(
      extensionEntityEntry => extensionEntityEntry.entityId
    );
    return extensionsElement;
  }
  createBathHeaterLightControl(
    bathLightEntityId,
    bathLightEntityState,
    {
      interactive: bathLightInteractive = true,
      onStateChange: bathLightStateChangeCallback = null
    } = {}
  ) {
    const bathHeaterLightElement = document.createElement("section");
    bathHeaterLightElement.className = "hb-bath-heater-light-control";
    const bathLightCaptionElement = document.createElement("span");
    const bathLightIconElement = document.createElement("i");
    bathLightIconElement.setAttribute("aria-hidden", "true");
    bathLightIconElement.textContent = "☀";
    const bathLightLabelElement = document.createElement("strong");
    bathLightLabelElement.textContent = String(
      bathLightEntityState?.attributes?.friendly_name || "浴霸灯"
    );
    const bathLightOutputElement = document.createElement("output");
    bathLightCaptionElement.append(
      bathLightIconElement,
      bathLightLabelElement,
      bathLightOutputElement
    );
    const bathLightButtonElement = document.createElement("button");
    bathLightButtonElement.type = "button";
    bathLightButtonElement.disabled = !bathLightInteractive;
    let bathLightCurrentState = bathLightEntityState;
    let isBathLightPending = false;
    const renderBathLight = (bathLightSourceState = bathLightCurrentState) => {
      bathLightCurrentState = bathLightSourceState || bathLightCurrentState;
      const isBathLightUnavailable = ["unknown", "unavailable"].includes(
        String(bathLightCurrentState?.state || "")
      );
      const isBathLightOn = bathLightCurrentState?.state === "on";
      bathHeaterLightElement.classList.toggle("is-on", isBathLightOn && !isBathLightUnavailable);
      bathHeaterLightElement.classList.toggle("is-unavailable", isBathLightUnavailable);
      bathLightOutputElement.textContent = isBathLightUnavailable
        ? "不可用"
        : isBathLightOn
          ? "已开启"
          : "已关闭";
      bathLightButtonElement.textContent = isBathLightOn ? "关闭灯光" : "开启灯光";
      bathLightButtonElement.disabled =
        !bathLightInteractive || isBathLightPending || isBathLightUnavailable;
      bathLightButtonElement.setAttribute("aria-pressed", String(isBathLightOn));
      bathLightStateChangeCallback?.({
        isOn: isBathLightOn,
        unavailable: isBathLightUnavailable
      });
    };
    const toggleBathLight = async () => {
      if (!bathLightInteractive || isBathLightPending) {
        return;
      }
      isBathLightPending = true;
      const previousBathLightState = bathLightCurrentState;
      renderBathLight({
        ...(bathLightCurrentState || {}),
        state: bathLightCurrentState?.state === "on" ? "off" : "on"
      });
      try {
        await this.callEntityService("homeassistant", "toggle", bathLightEntityId);
      } catch (bathLightRequestError) {
        renderBathLight(previousBathLightState);
        this.options.onError?.(bathLightRequestError);
      } finally {
        isBathLightPending = false;
        renderBathLight(bathLightCurrentState);
      }
    };
    bathLightButtonElement.addEventListener("click", toggleBathLight);
    bathHeaterLightElement.append(bathLightCaptionElement, bathLightButtonElement);
    bathHeaterLightElement.syncBathLightState = renderBathLight;
    bathHeaterLightElement.toggleBathLight = toggleBathLight;
    renderBathLight(bathLightEntityState);
    return bathHeaterLightElement;
  }
  showElectricBedLoadingDetails(bedLoadingComponent, { preview: bedLoadingPreview = false } = {}) {
    if (!bedLoadingComponent.bindings?.entity?.entityId) {
      return;
    }
    this.closeRuntimeDialog();
    const bedDialogElement = document.createElement("dialog");
    bedDialogElement.className =
      "hb-entity-details-dialog electric-bed-details electric-bed-loading-details";
    bedDialogElement.tabIndex = -1;
    const bedCardElement = document.createElement("div");
    bedCardElement.className = "hb-entity-details-card";
    const bedHeadingElement = document.createElement("div");
    bedHeadingElement.className = "hb-entity-details-heading";
    const bedTitleElement = document.createElement("strong");
    bedTitleElement.textContent = componentDialogTitle(bedLoadingComponent, "电动床");
    bedHeadingElement.append(bedTitleElement);
    const bedDialogBodyElement = document.createElement("section");
    bedDialogBodyElement.className = "hb-electric-bed-loading-body";
    const bedLoadingSectionElement = document.createElement("section");
    bedLoadingSectionElement.className = "hb-climate-details-loading is-loading";
    const bedLoadingIconElement = document.createElement("i");
    bedLoadingIconElement.setAttribute("aria-hidden", "true");
    const bedLoadingTitleElement = document.createElement("strong");
    bedLoadingTitleElement.textContent = "正在加载设备状态…";
    const bedLoadingHintElement = document.createElement("span");
    bedLoadingHintElement.textContent = "状态到达后会自动显示，无需重新打开弹窗";
    bedLoadingSectionElement.append(
      bedLoadingIconElement,
      bedLoadingTitleElement,
      bedLoadingHintElement
    );
    bedDialogBodyElement.append(bedLoadingSectionElement);
    bedCardElement.append(bedHeadingElement, bedDialogBodyElement);
    bedDialogElement.append(bedCardElement);
    const bedDialogLayerElement = document.createElement("div");
    bedDialogLayerElement.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    bedDialogLayerElement.tabIndex = -1;
    bedDialogLayerElement.append(bedDialogElement);
    this.container.append(bedDialogLayerElement);
    this.detailsDialog = bedDialogElement;
    this.registerRuntimeDialogScale(bedDialogLayerElement, bedDialogElement, 760, 420);
    this.bindRuntimeDialogOutsideDismiss(bedDialogLayerElement, bedDialogElement, bedCardElement);
    bedDialogLayerElement.addEventListener("keydown", bedDialogKeyEvent => {
      if (bedDialogKeyEvent.key === "Escape") {
        bedDialogElement.close();
      }
    });
    bedDialogElement.addEventListener(
      "close",
      () => {
        this.clearRuntimeDialogScale(bedDialogElement);
        if (this.detailsDialog === bedDialogElement) {
          this.detailsDialog = null;
        }
        bedDialogLayerElement.remove();
      },
      {
        once: true
      }
    );
    bedDialogElement.show();
    bedDialogElement.focus({
      preventScroll: true
    });
  }
  showElectricBedDetails(bedDetailsComponent, { preview: bedDetailsPreview = false } = {}) {
    const bedEntityId = bedDetailsComponent.bindings?.entity?.entityId;
    if (!bedEntityId) {
      throw new Error("该电动床控件没有关联实体。");
    }
    const bedDeviceProfileEntry = this.deviceProfile(bedEntityId);
    const electricBedRoles = bedDeviceProfileEntry?.roles || {};
    const bedControlRoles = [
      ["backrest", "靠背角度"],
      ["leg", "腿部角度"],
      ["waist", "腰部角度"]
    ]
      .map(([bedRole, bedRoleLabel]) => ({
        role: bedRole,
        label: bedRoleLabel,
        entityId: String(electricBedRoles[bedRole] || "")
      }))
      .filter(bedRoleEntry => bedRoleEntry.entityId);
    const bedModeRoleEntityId = String(electricBedRoles.mode || "");
    const bedEntityMetadata = this.entityMetadata.get(bedEntityId);
    const bedControlEntityIds = bedEntityMetadata?.deviceId
      ? [...this.entityMetadata.values()]
          .filter(
            bedMetadataEntry =>
              bedMetadataEntry.deviceId === bedEntityMetadata.deviceId &&
              ["button", "select"].includes(
                String(bedMetadataEntry.domain || bedMetadataEntry.entityId || "").split(".", 1)[0]
              ) &&
              bedMetadataEntry.entityId !== electricBedRoles.mode &&
              entityMetadataIsAvailable(bedMetadataEntry)
          )
          .sort((leftBedEntry, rightBedEntry) =>
            String(leftBedEntry.entityId || "").localeCompare(String(rightBedEntry.entityId || ""))
          )
          .map(bedControlMetadata => bedControlMetadata.entityId)
      : [];
    const electricBedMemoryEntityIds = [
      ...new Set(
        [
          String(electricBedRoles.memory1 || ""),
          String(electricBedRoles.memory2 || ""),
          ...bedControlEntityIds
        ].filter(Boolean)
      )
    ].slice(0, 2);
    this.closeRuntimeDialog();
    const bedDetailsDialog = document.createElement("dialog");
    bedDetailsDialog.className = "hb-entity-details-dialog electric-bed-details";
    const bedDetailsCard = document.createElement("div");
    bedDetailsCard.className = "hb-entity-details-card";
    const bedDetailsHeading = document.createElement("div");
    bedDetailsHeading.className = "hb-entity-details-heading";
    const bedTitleRow = document.createElement("div");
    const bedTitleText = document.createElement("strong");
    bedTitleText.textContent = componentDialogTitle(
      bedDetailsComponent,
      bedDeviceProfileEntry?.deviceName || "电动床"
    );
    const bedStatusText = document.createElement("span");
    bedTitleRow.append(bedTitleText, bedStatusText);
    const bedCloseButton = document.createElement("button");
    bedCloseButton.type = "button";
    bedCloseButton.textContent = "×";
    bedCloseButton.setAttribute("aria-label", "关闭电动床详情");
    bedDetailsHeading.append(bedTitleRow, bedCloseButton);
    const bedDetailsBody = document.createElement("div");
    bedDetailsBody.className = "hb-electric-bed-details-body";
    const bedVisualPanel = document.createElement("section");
    bedVisualPanel.className = "hb-electric-bed-visual";
    const bedModelFigure = document.createElement("div");
    bedModelFigure.className = "hb-electric-bed-model";
    const bedMattressShape = document.createElement("i");
    bedMattressShape.className = "hb-electric-bed-mattress";
    const bedBackShape = document.createElement("i");
    bedBackShape.className = "hb-electric-bed-back";
    const bedWaistShape = document.createElement("i");
    bedWaistShape.className = "hb-electric-bed-waist";
    const bedLegsShape = document.createElement("i");
    bedLegsShape.className = "hb-electric-bed-legs";
    const bedBaseShape = document.createElement("i");
    bedBaseShape.className = "hb-electric-bed-base";
    bedModelFigure.append(
      bedMattressShape,
      bedBackShape,
      bedWaistShape,
      bedLegsShape,
      bedBaseShape
    );
    const createElectricBedReadout = (readoutModifierClass, readoutCaption) => {
      const readoutElement = document.createElement("span");
      readoutElement.className = "hb-electric-bed-angle-readout " + readoutModifierClass;
      const readoutValueElement = document.createElement("strong");
      const readoutCaptionElement = document.createElement("small");
      readoutCaptionElement.textContent = readoutCaption;
      readoutElement.append(readoutValueElement, readoutCaptionElement);
      return {
        readout: readoutElement,
        value: readoutValueElement
      };
    };
    const backrestReadout = createElectricBedReadout("back", "靠背");
    const waistReadout = createElectricBedReadout("waist", "腰部");
    const legReadout = createElectricBedReadout("legs", "腿部");
    const bedPrimaryStatusText = document.createElement("strong");
    const bedSecondaryStatusText = document.createElement("small");
    bedVisualPanel.append(
      bedModelFigure,
      backrestReadout.readout,
      waistReadout.readout,
      legReadout.readout,
      bedPrimaryStatusText,
      bedSecondaryStatusText
    );
    const bedUtilitiesPanel = document.createElement("section");
    bedUtilitiesPanel.className = "hb-electric-bed-utilities";
    const bedMainPanel = document.createElement("section");
    bedMainPanel.className = "hb-electric-bed-main";
    const bedAngleControlsPanel = document.createElement("section");
    bedAngleControlsPanel.className = "hb-electric-bed-angle-controls";
    const bedStateHandlers = new Map();
    const bedControlBindings = [];
    const readBedEntityState = electricBedEntityId => {
      const bedEntityState = this.states.get(electricBedEntityId);
      return (
        bedEntityState?.newState ||
        bedEntityState || {
          entityId: electricBedEntityId,
          state: "unknown",
          attributes: {}
        }
      );
    };
    const addBedRoleControl = (
      roleLabel,
      bedControlRoleEntityId,
      bedControlVariant = "",
      controlHost = bedAngleControlsPanel
    ) => {
      const roleEntityState = readBedEntityState(bedControlRoleEntityId);
      const roleControlElement = document.createElement("section");
      roleControlElement.className = "hb-electric-bed-control";
      if (roleLabel === "模式") {
        roleControlElement.classList.add("hb-electric-bed-mode");
      }
      const roleControlLabel = document.createElement("strong");
      roleControlLabel.textContent = roleLabel;
      const bedRoleCapabilityControls = this.createCapabilityDetailsControls(
        bedControlRoleEntityId,
        roleEntityState,
        {
          interactive: !bedDetailsPreview,
          variant: bedControlVariant
        }
      );
      bedRoleCapabilityControls.classList.add("hb-electric-bed-capability");
      roleControlElement.append(roleControlLabel, bedRoleCapabilityControls);
      controlHost.append(roleControlElement);
      const syncRoleCapability = roleCapabilityState =>
        bedRoleCapabilityControls.syncCapabilityState?.(roleCapabilityState);
      bedStateHandlers.set(bedControlRoleEntityId, [syncRoleCapability]);
      bedControlBindings.push({
        role: roleLabel,
        entityId: bedControlRoleEntityId,
        sync: syncRoleCapability,
        cleanup: () => bedRoleCapabilityControls.cleanupCapabilityDetails?.()
      });
    };
    for (const electricBedRoleEntry of bedControlRoles) {
      addBedRoleControl(electricBedRoleEntry.label, electricBedRoleEntry.entityId);
    }
    if (bedModeRoleEntityId) {
      addBedRoleControl("模式", bedModeRoleEntityId, "electric-bed", bedUtilitiesPanel);
    } else {
      const modeControlElement = document.createElement("section");
      modeControlElement.className = "hb-electric-bed-control hb-electric-bed-mode is-unavailable";
      const modeControlLabel = document.createElement("strong");
      modeControlLabel.textContent = "模式";
      const modeSelectElement = document.createElement("select");
      modeSelectElement.className = "hb-capability-select";
      modeSelectElement.disabled = true;
      modeSelectElement.setAttribute("aria-label", "模式");
      const modePlaceholderOption = document.createElement("option");
      modePlaceholderOption.textContent = "未识别到模式实体";
      modeSelectElement.append(modePlaceholderOption);
      modeControlElement.append(modeControlLabel, modeSelectElement);
      bedUtilitiesPanel.append(modeControlElement);
    }
    const bedMemoryPanel = document.createElement("section");
    bedMemoryPanel.className = "hb-electric-bed-memory";
    const bedMemoryTitle = document.createElement("strong");
    bedMemoryTitle.textContent = "记忆姿势";
    const bedMemoryList = document.createElement("div");
    bedMemoryList.className = "hb-electric-bed-memory-list";
    for (let memorySlotIndex = 0; memorySlotIndex < 2; memorySlotIndex += 1) {
      const memorySlotEntityId = electricBedMemoryEntityIds[memorySlotIndex] || "";
      const memorySlotMetadata = memorySlotEntityId
        ? this.entityMetadata.get(memorySlotEntityId)
        : null;
      if (String(memorySlotEntityId).split(".", 1)[0] === "select") {
        const memorySlotElement = document.createElement("section");
        memorySlotElement.className = "hb-electric-bed-memory-control hb-electric-bed-control";
        const memorySlotLabel = document.createElement("strong");
        memorySlotLabel.textContent = "记忆姿势 " + (memorySlotIndex + 1);
        const memorySlotControls = this.createCapabilityDetailsControls(
          memorySlotEntityId,
          readBedEntityState(memorySlotEntityId),
          {
            interactive: !bedDetailsPreview,
            variant: "electric-bed-memory",
            selectLabel: "姿势"
          }
        );
        memorySlotControls.classList.add("hb-electric-bed-capability");
        memorySlotElement.append(memorySlotLabel, memorySlotControls);
        bedMemoryList.append(memorySlotElement);
        const syncMemorySlotCapability = memorySlotState =>
          memorySlotControls.syncCapabilityState?.(memorySlotState);
        bedStateHandlers.set(memorySlotEntityId, [syncMemorySlotCapability]);
        bedControlBindings.push({
          role: "memory" + (memorySlotIndex + 1),
          entityId: memorySlotEntityId,
          sync: syncMemorySlotCapability,
          cleanup: () => memorySlotControls.cleanupCapabilityDetails?.()
        });
        continue;
      }
      const memoryButton = document.createElement("button");
      memoryButton.type = "button";
      memoryButton.className = "hb-electric-bed-memory-button";
      memoryButton.textContent =
        memorySlotMetadata?.name ||
        memorySlotMetadata?.originalName ||
        "记忆姿势 " + (memorySlotIndex + 1);
      memoryButton.disabled = bedDetailsPreview || !memorySlotEntityId;
      memoryButton.classList.toggle("is-unavailable", !memorySlotEntityId);
      memoryButton.addEventListener("click", async () => {
        if (!bedDetailsPreview && !!memorySlotEntityId && !memoryButton.disabled) {
          memoryButton.disabled = true;
          memoryButton.classList.add("is-pending");
          try {
            await this.callEntityService("button", "press", memorySlotEntityId);
            memoryButton.classList.add("is-success");
            window.setTimeout(() => memoryButton.classList.remove("is-success"), 900);
          } catch (memoryButtonError) {
            this.options.onError?.(memoryButtonError);
          } finally {
            memoryButton.classList.remove("is-pending");
            memoryButton.disabled = bedDetailsPreview || !memorySlotEntityId;
          }
        }
      });
      bedMemoryList.append(memoryButton);
    }
    bedMemoryPanel.append(bedMemoryTitle, bedMemoryList);
    bedUtilitiesPanel.append(bedMemoryPanel);
    if (!bedControlRoles.length) {
      const bedEmptyHint = document.createElement("p");
      bedEmptyHint.className = "hb-electric-bed-empty";
      bedEmptyHint.textContent = "暂未识别到角度实体";
      bedAngleControlsPanel.append(bedEmptyHint);
    }
    bedMainPanel.append(bedVisualPanel, bedAngleControlsPanel);
    bedDetailsBody.append(bedUtilitiesPanel, bedMainPanel);
    bedDetailsCard.append(bedDetailsHeading, bedDetailsBody);
    bedDetailsDialog.append(bedDetailsCard);
    const bedAnglePercent = (angleRoleId, angleEntityState) => {
      const angleStateValue = Number(angleEntityState?.state);
      const angleMinValue = Number(angleEntityState?.attributes?.min);
      const angleMaxValue = Number(angleEntityState?.attributes?.max);
      if (Number.isFinite(angleStateValue)) {
        if (
          !Number.isFinite(angleMinValue) ||
          !Number.isFinite(angleMaxValue) ||
          angleMaxValue <= angleMinValue
        ) {
          return Math.max(0, Math.min(100, angleStateValue));
        } else {
          return Math.max(
            0,
            Math.min(
              100,
              ((angleStateValue - angleMinValue) / (angleMaxValue - angleMinValue)) * 100
            )
          );
        }
      } else {
        return 0;
      }
    };
    const refreshBedReadouts = () => {
      const backrestEntityState = readBedEntityState(electricBedRoles.backrest);
      const legEntityState = readBedEntityState(electricBedRoles.leg);
      const waistEntityState = readBedEntityState(electricBedRoles.waist);
      const formatAngleReading = angleReadingState => {
        const angleReadingValue = Number(angleReadingState?.state);
        if (!Number.isFinite(angleReadingValue)) {
          return "--";
        }
        const angleUnit = String(angleReadingState?.attributes?.unit_of_measurement || "°");
        return "" + angleReadingValue + angleUnit;
      };
      backrestReadout.value.textContent = formatAngleReading(backrestEntityState);
      waistReadout.value.textContent = formatAngleReading(waistEntityState);
      legReadout.value.textContent = formatAngleReading(legEntityState);
      bedVisualPanel.style.setProperty(
        "--hb-bed-backrest-angle",
        bedAnglePercent(electricBedRoles.backrest, backrestEntityState) * -0.42 + "deg"
      );
      bedVisualPanel.style.setProperty(
        "--hb-bed-leg-angle",
        bedAnglePercent(electricBedRoles.leg, legEntityState) * -0.28 + "deg"
      );
      bedVisualPanel.style.setProperty(
        "--hb-bed-waist-angle",
        bedAnglePercent(electricBedRoles.waist, waistEntityState) * -0.1 + "deg"
      );
      const electricBedAngleStates = [backrestEntityState, legEntityState, waistEntityState].map(
        angleStateEntry => String(angleStateEntry?.state || "").toLowerCase()
      );
      const hasUnavailableAngle = electricBedAngleStates.some(
        angleStateText => angleStateText === "unavailable"
      );
      const isReadingAngles =
        !hasUnavailableAngle &&
        electricBedAngleStates.some(
          angleStateCandidate => angleStateCandidate === "unknown" || !angleStateCandidate
        );
      bedPrimaryStatusText.textContent = hasUnavailableAngle
        ? "部分实体不可用"
        : isReadingAngles
          ? "正在读取实体"
          : "设备在线";
      bedSecondaryStatusText.textContent =
        bedControlRoles.length === 3 ? "三个角度独立控制" : "正在读取电动床实体";
      bedStatusText.textContent = hasUnavailableAngle ? "部分功能不可用" : "";
    };
    refreshBedReadouts();
    for (const bedControlRoleEntry of bedControlRoles) {
      bedStateHandlers.get(bedControlRoleEntry.entityId)?.push(() => {
        refreshBedReadouts();
      });
    }
    if (bedModeRoleEntityId) {
      bedStateHandlers.get(bedModeRoleEntityId)?.push(() => refreshBedReadouts());
    }
    this.detailsStateSync = {
      dialog: bedDetailsDialog,
      handlers: bedStateHandlers
    };
    const bedDialogLayer = document.createElement("div");
    bedDialogLayer.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    bedDialogLayer.tabIndex = -1;
    bedDialogLayer.append(bedDetailsDialog);
    this.container.append(bedDialogLayer);
    this.detailsDialog = bedDetailsDialog;
    this.registerRuntimeDialogScale(bedDialogLayer, bedDetailsDialog, 760, 560);
    bedCloseButton.addEventListener("click", () => bedDetailsDialog.close());
    this.bindRuntimeDialogOutsideDismiss(bedDialogLayer, bedDetailsDialog, bedDetailsCard);
    bedDialogLayer.addEventListener("keydown", bedLayerKeyEvent => {
      if (bedLayerKeyEvent.key === "Escape") {
        bedDetailsDialog.close();
      }
    });
    bedDetailsDialog.addEventListener(
      "close",
      () => {
        for (const bedControlBinding of bedControlBindings) {
          bedControlBinding.cleanup?.();
        }
        this.clearRuntimeDialogScale(bedDetailsDialog);
        if (this.detailsDialog === bedDetailsDialog) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === bedDetailsDialog) {
          this.detailsStateSync = null;
        }
        bedDialogLayer.remove();
      },
      {
        once: true
      }
    );
    bedDetailsDialog.show();
  }
  openInteraction3dVacuumDetails(
    vacuumComponentConfig,
    onDialogClose,
    {
      states: initialStates = {},
      root: presentationRoot,
      frame: presentationFrame,
      popupOpacity: popupOpacityPercent = 74,
      getPresentationLayout: getPresentationLayout,
      getPopupLayout: getPopupLayout
    } = {}
  ) {
    const vacuumEntityIds = new Set([
      vacuumComponentConfig.entityId,
      ...(vacuumComponentConfig.relatedEntityIds || [])
    ]);
    let vacuumDialog = null;
    let vacuumOptionsSignature = "";
    const computeVacuumOptionsSignature = () =>
      JSON.stringify(
        [...vacuumEntityIds]
          .filter(vacuumEntityId => /^(vacuum|select)\./.test(vacuumEntityId))
          .map(relatedVacuumEntityId => {
            const relatedEntityState = this.states.get(relatedVacuumEntityId);
            const relatedEntityAttributes =
              (relatedEntityState?.newState || relatedEntityState)?.attributes || {};
            return [
              relatedVacuumEntityId,
              relatedEntityAttributes.fan_speed_list,
              relatedEntityAttributes.suction_level_list,
              relatedEntityAttributes.cleaning_mode_list,
              relatedEntityAttributes.options
            ];
          })
      );
    const applyVacuumStates = vacuumStates => {
      for (const vacuumEntityKey of vacuumEntityIds) {
        const vacuumEntitySnapshot = vacuumStates[vacuumEntityKey] || {
          entityId: vacuumEntityKey,
          state: "unavailable",
          attributes: {}
        };
        this.states.set(vacuumEntityKey, vacuumEntitySnapshot);
        if (this.detailsStateSync?.dialog === vacuumDialog) {
          for (const vacuumStateHandler of this.detailsStateSync.handlers.get(vacuumEntityKey) ||
            []) {
            vacuumStateHandler(vacuumEntitySnapshot);
          }
        }
      }
      if (vacuumDialog && computeVacuumOptionsSignature() !== vacuumOptionsSignature) {
        showVacuumDialog();
      }
    };
    applyVacuumStates(initialStates);
    const findVacuumControlComponent = componentList => {
      for (const componentEntry of componentList || []) {
        if (
          componentEntry.type === "vacuum-control" &&
          componentEntry.bindings?.entity?.entityId === vacuumComponentConfig.entityId
        ) {
          return componentEntry;
        }
        const nestedVacuumComponent = findVacuumControlComponent(componentEntry.children);
        if (nestedVacuumComponent) {
          return nestedVacuumComponent;
        }
      }
      return null;
    };
    const vacuumControlDefinition = (this.document?.pages || [])
      .map(page => findVacuumControlComponent(page.components))
      .find(Boolean);
    const relatedModeEntityIds =
      vacuumControlDefinition?.properties?.relatedEntities?.mode === "selected"
        ? (vacuumControlDefinition.properties.relatedEntities.entityIds || []).filter(
            relatedEntityIdentifier => vacuumEntityIds.has(relatedEntityIdentifier)
          )
        : [];
    const vacuumComponentDraft = {
      id: "vacuum:" + vacuumComponentConfig.id,
      type: "vacuum-control",
      properties: {
        label: vacuumComponentConfig.label,
        relatedEntities: {
          mode: "selected",
          entityIds: relatedModeEntityIds
        }
      },
      bindings: {
        entity: {
          entityId: vacuumComponentConfig.entityId
        }
      }
    };
    const showVacuumDialog = () => {
      vacuumDialog?.removeEventListener("close", onDialogClose);
      this.showVacuumDetails(vacuumComponentDraft, {
        preview: !!this.options.editable,
        interaction3d: {
          root: presentationRoot,
          frame: presentationFrame,
          popupOpacity: popupOpacityPercent,
          getPresentationLayout: getPresentationLayout,
          getPopupLayout: getPopupLayout
        }
      });
      vacuumDialog = this.detailsDialog;
      vacuumOptionsSignature = computeVacuumOptionsSignature();
      vacuumDialog?.addEventListener("close", onDialogClose, {
        once: true
      });
    };
    showVacuumDialog();
    return {
      updateStates: applyVacuumStates,
      updateLayout: () => vacuumDialog?.resizeInteraction3d?.(),
      close: () => {
        vacuumDialog?.removeEventListener("close", onDialogClose);
        vacuumDialog?.close();
      },
      contains: node => vacuumDialog?.contains(node)
    };
  }
  showVacuumDetails(
    vacuumControlComponent,
    { preview: isPreview = false, interaction3d: interaction3dOptions = null } = {}
  ) {
    const vacuumPrimaryEntityId = vacuumControlComponent.bindings?.entity?.entityId;
    if (!vacuumPrimaryEntityId) {
      throw new Error("该扫地机器人控件没有关联实体。");
    }
    const selectedEntityIds = selectedRelatedEntityIds(vacuumControlComponent);
    this.closeRuntimeDialog();
    const vacuumPrimaryState = this.states.get(vacuumPrimaryEntityId);
    let vacuumState = vacuumPrimaryState?.newState ||
      vacuumPrimaryState || {
        state: "unknown",
        attributes: {}
      };
    const vacuumDialogElement = document.createElement("dialog");
    vacuumDialogElement.className = "hb-entity-details-dialog vacuum-details";
    if (interaction3dOptions) {
      vacuumDialogElement.classList.add("i3d-vacuum-details");
    }
    const vacuumCardElement = document.createElement("div");
    vacuumCardElement.className = "hb-entity-details-card";
    vacuumCardElement.classList.add("hb-vacuum-details-card");
    const vacuumHeadingElement = document.createElement("div");
    vacuumHeadingElement.className = "hb-entity-details-heading";
    const vacuumTitleRow = document.createElement("div");
    const vacuumTitleText = document.createElement("strong");
    const vacuumDisplayName =
      String(vacuumState.attributes?.friendly_name || "扫地机器人").replace(/^\d+/, "") ||
      "扫地机器人";
    vacuumTitleText.textContent = componentDialogTitle(vacuumControlComponent, vacuumDisplayName);
    const vacuumSubtitleElement = document.createElement("span");
    vacuumSubtitleElement.className = "hb-vacuum-details-subtitle";
    const vacuumCloseButton = document.createElement("button");
    vacuumCloseButton.type = "button";
    vacuumCloseButton.setAttribute("aria-label", "关闭扫地机器人详情");
    vacuumCloseButton.textContent = "×";
    vacuumTitleRow.append(vacuumTitleText, vacuumSubtitleElement);
    vacuumHeadingElement.append(vacuumTitleRow, vacuumCloseButton);
    const vacuumLayoutElement = document.createElement("div");
    vacuumLayoutElement.className = "hb-vacuum-details-layout";
    const vacuumOverviewElement = document.createElement("section");
    vacuumOverviewElement.className = "hb-vacuum-details-overview";
    const vacuumVisualElement = document.createElement("div");
    vacuumVisualElement.className = "hb-vacuum-visual";
    const vacuumBatteryRingElement = document.createElement("div");
    vacuumBatteryRingElement.className = "hb-vacuum-battery-ring";
    const vacuumRobotElement = document.createElement("div");
    vacuumRobotElement.className = "hb-vacuum-robot";
    const vacuumLidarElement = document.createElement("i");
    vacuumLidarElement.className = "hb-vacuum-robot-lidar";
    const vacuumSensorElement = document.createElement("i");
    vacuumSensorElement.className = "hb-vacuum-robot-sensor";
    const vacuumBumperElement = document.createElement("i");
    vacuumBumperElement.className = "hb-vacuum-robot-bumper";
    const vacuumBrushElement = document.createElement("i");
    vacuumBrushElement.className = "hb-vacuum-robot-brush";
    const vacuumLeftMopElement = document.createElement("i");
    vacuumLeftMopElement.className = "hb-vacuum-robot-mop left";
    const vacuumRightMopElement = document.createElement("i");
    vacuumRightMopElement.className = "hb-vacuum-robot-mop right";
    vacuumRobotElement.append(
      vacuumLidarElement,
      vacuumSensorElement,
      vacuumBumperElement,
      vacuumBrushElement,
      vacuumLeftMopElement,
      vacuumRightMopElement
    );
    const vacuumBatteryElement = document.createElement("div");
    vacuumBatteryElement.className = "hb-vacuum-battery";
    const vacuumBatteryValueElement = document.createElement("strong");
    const vacuumBatteryLabelElement = document.createElement("small");
    vacuumBatteryLabelElement.textContent = "电量";
    vacuumBatteryElement.append(vacuumBatteryValueElement, vacuumBatteryLabelElement);
    vacuumBatteryRingElement.append(vacuumRobotElement);
    vacuumHeadingElement.append(vacuumBatteryElement);
    const vacuumVisualStatusElement = document.createElement("span");
    vacuumVisualStatusElement.className = "hb-vacuum-visual-status";
    vacuumVisualElement.append(vacuumBatteryRingElement, vacuumVisualStatusElement);
    const vacuumStatsElement = document.createElement("div");
    vacuumStatsElement.className = "hb-vacuum-details-stats";
    const createVacuumStat = (statLabel, statIcon) => {
      const statElement = document.createElement("div");
      const statValueRow = document.createElement("span");
      statValueRow.className = "hb-vacuum-details-stat-value";
      const statIconElement = document.createElement("i");
      statIconElement.textContent = statIcon;
      statIconElement.setAttribute("aria-hidden", "true");
      const statValueElement = document.createElement("strong");
      const statLabelElement = document.createElement("small");
      statLabelElement.textContent = statLabel;
      statValueRow.append(statIconElement, statValueElement);
      statElement.append(statValueRow, statLabelElement);
      vacuumStatsElement.append(statElement);
      return statValueElement;
    };
    const vacuumAreaValue = createVacuumStat("本次面积", "◇");
    const vacuumDurationValue = createVacuumStat("清扫时长", "◷");
    if (!interaction3dOptions) {
      vacuumOverviewElement.append(vacuumVisualElement);
    }
    vacuumOverviewElement.append(vacuumStatsElement);
    const vacuumControlsElement = document.createElement("section");
    vacuumControlsElement.className = "hb-vacuum-details-controls";
    const vacuumActionsElement = document.createElement("div");
    vacuumActionsElement.className = "hb-vacuum-details-actions";
    const createVacuumActionButton = (
      actionLabel,
      actionDescription,
      actionIcon,
      actionService
    ) => {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.dataset.service = actionService;
      actionButton.disabled = isPreview;
      const actionIconElement = document.createElement("i");
      actionIconElement.textContent = actionIcon;
      actionIconElement.setAttribute("aria-hidden", "true");
      const actionTextElement = document.createElement("span");
      const actionLabelElement = document.createElement("strong");
      actionLabelElement.textContent = actionLabel;
      const actionDescriptionElement = document.createElement("small");
      actionDescriptionElement.textContent = actionDescription;
      actionTextElement.append(actionLabelElement, actionDescriptionElement);
      actionButton.append(actionIconElement, actionTextElement);
      vacuumActionsElement.append(actionButton);
      return {
        button: actionButton,
        name: actionLabelElement,
        description: actionDescriptionElement
      };
    };
    const vacuumActionDefinitions = [
      ["start", "开始清扫", "启动全屋任务", "▶"],
      ["pause", "暂停", "保留当前进度", "Ⅱ"],
      ["stop", "停止", "结束当前任务", "■"],
      ["return_to_base", "回充", "返回充电座", "⌂"],
      ["locate", "定位", "让设备发出声音", "◎"],
      ["clean_spot", "局部清扫", "清扫当前位置", "⌖"]
    ];
    const vacuumActionsByService = new Map(
      vacuumActionDefinitions.map(
        ([actionServiceKey, actionLabelText, actionDescriptionText, actionIconText]) => [
          actionServiceKey,
          createVacuumActionButton(
            actionLabelText,
            actionDescriptionText,
            actionIconText,
            actionServiceKey
          )
        ]
      )
    );
    const vacuumStartAction = vacuumActionsByService.get("start");
    const vacuumPauseAction = vacuumActionsByService.get("pause");
    const vacuumStopAction = vacuumActionsByService.get("stop");
    const vacuumReturnAction = vacuumActionsByService.get("return_to_base");
    const vacuumLocateAction = vacuumActionsByService.get("locate");
    const vacuumSpotAction = vacuumActionsByService.get("clean_spot");
    vacuumControlsElement.append(vacuumActionsElement);
    const normalizeVacuumOptionKey = optionRawValue =>
      String(optionRawValue || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
    const cleaningModeLabels = {
      sweeping: "扫地",
      mopping: "拖地",
      sweeping_and_mopping: "扫拖同步",
      mopping_after_sweeping: "先扫后拖"
    };
    const fanSpeedLabels = {
      silent: "静音",
      quiet: "静音",
      standard: "标准",
      strong: "强力",
      turbo: "超强"
    };
    const vacuumOptionGroups = [];
    const createVacuumOptionGroup = ({
      label: groupLabel,
      detail: groupDetail,
      options: groupOptions,
      current: currentOption,
      labels: optionLabelMap,
      onSelect: onOptionSelect,
      enabled: isOptionGroupEnabled = true
    }) => {
      if (!groupOptions.length) {
        return null;
      }
      const vacuumOptionGroupElement = document.createElement("section");
      vacuumOptionGroupElement.className = "hb-vacuum-details-option-group";
      const optionGroupHeader = document.createElement("div");
      const optionGroupTitle = document.createElement("strong");
      optionGroupTitle.textContent = groupLabel;
      const optionGroupDetail = document.createElement("small");
      optionGroupDetail.textContent = groupDetail;
      optionGroupHeader.append(optionGroupTitle, optionGroupDetail);
      const optionGroupBody = document.createElement("div");
      optionGroupBody.className = "hb-vacuum-details-options";
      const optionEntries = groupOptions.map(optionChoice => {
        const optionKey = normalizeVacuumOptionKey(optionChoice);
        const optionButton = document.createElement("button");
        optionButton.type = "button";
        optionButton.textContent = optionLabelMap[optionKey] || String(optionChoice);
        optionButton.disabled = isPreview || !isOptionGroupEnabled;
        optionButton.addEventListener("click", () => onOptionSelect(optionChoice, optionButton));
        optionGroupBody.append(optionButton);
        return {
          button: optionButton,
          key: optionKey
        };
      });
      const syncOptionGroup = selectedOption => {
        const selectedOptionKey = normalizeVacuumOptionKey(selectedOption);
        for (const optionEntry of optionEntries) {
          optionEntry.button.classList.toggle("active", optionEntry.key === selectedOptionKey);
        }
      };
      syncOptionGroup(currentOption);
      vacuumOptionGroups.push({
        group: vacuumOptionGroupElement,
        sync: syncOptionGroup
      });
      vacuumOptionGroupElement.append(optionGroupHeader, optionGroupBody);
      vacuumControlsElement.append(vacuumOptionGroupElement);
      return {
        group: vacuumOptionGroupElement,
        sync: syncOptionGroup,
        entries: optionEntries
      };
    };
    const vacuumAttributes = vacuumState.attributes || {};
    const cleaningModeEntityIdCandidate =
      "select." +
      vacuumPrimaryEntityId.slice(vacuumPrimaryEntityId.indexOf(".") + 1) +
      "_cleaning_mode";
    const cleaningModeEntity = relatedDeviceEntity(
      this.entityMetadata,
      vacuumPrimaryEntityId,
      "select",
      "cleaning_mode",
      cleaningModeEntityIdCandidate
    );
    const cleaningModeEntityId = String(cleaningModeEntity?.entityId || "");
    const cleaningModeState = cleaningModeEntityId ? this.states.get(cleaningModeEntityId) : null;
    let cleaningModeCurrentState = cleaningModeState?.newState || cleaningModeState || null;
    const vacuumBatteryEntity = relatedVacuumBatteryEntity(
      this.entityMetadata,
      this.states,
      vacuumPrimaryEntityId
    );
    const vacuumBatteryEntityId = String(vacuumBatteryEntity?.entityId || "");
    const vacuumBatteryState = vacuumBatteryEntityId
      ? this.states.get(vacuumBatteryEntityId)
      : null;
    let vacuumBatteryCurrentState = vacuumBatteryState?.newState || vacuumBatteryState || null;
    let cleaningModeGroup = null;
    const applyCleaningModeState = nextCleaningModeState => {
      if (nextCleaningModeState) {
        cleaningModeCurrentState = nextCleaningModeState;
        cleaningModeGroup?.sync(nextCleaningModeState.state);
      }
    };
    let isVacuumActionPending = false;
    const setVacuumActionPending = isPending => {
      isVacuumActionPending = isPending;
      vacuumControlsElement.classList.toggle("is-pending", isPending);
      for (const actionControl of vacuumControlsElement.querySelectorAll(
        ":scope > .hb-vacuum-details-actions button, :scope > .hb-vacuum-details-option-group button"
      )) {
        actionControl.disabled =
          isPreview || isPending || actionControl.dataset.unsupported === "true";
      }
    };
    const invokeVacuumService = async (
      vacuumServiceDomain,
      vacuumServiceName,
      vacuumServiceEntityId,
      vacuumServiceData,
      optimisticVacuumState = null,
      rollbackStateHandler = renderVacuumState,
      rollbackState = vacuumState
    ) => {
      if (isPreview || isVacuumActionPending) {
        return false;
      }
      if (optimisticVacuumState) {
        rollbackStateHandler(optimisticVacuumState);
      }
      setVacuumActionPending(true);
      try {
        await this.callEntityService(
          vacuumServiceDomain,
          vacuumServiceName,
          vacuumServiceEntityId,
          vacuumServiceData
        );
        return true;
      } catch (vacuumServiceError) {
        rollbackStateHandler(rollbackState);
        this.options.onError?.(vacuumServiceError);
        return false;
      } finally {
        setVacuumActionPending(false);
      }
    };
    const cleaningModeOptions = Array.isArray(cleaningModeCurrentState?.attributes?.options)
      ? cleaningModeCurrentState.attributes.options
      : Array.isArray(vacuumAttributes.cleaning_mode_list)
        ? vacuumAttributes.cleaning_mode_list
        : [];
    const hasCleaningModeEntity = !!cleaningModeEntityId;
    cleaningModeGroup = createVacuumOptionGroup({
      label: "清洁模式",
      detail: hasCleaningModeEntity ? "选择本次任务方式" : "当前设备未提供模式切换实体",
      options: cleaningModeOptions,
      current: cleaningModeCurrentState?.state || vacuumAttributes.cleaning_mode,
      labels: cleaningModeLabels,
      enabled: hasCleaningModeEntity,
      onSelect: async selectedCleaningMode => {
        const cleaningModeFallbackState = cleaningModeCurrentState || {
          state: vacuumAttributes.cleaning_mode || "unknown",
          attributes: {
            options: cleaningModeOptions
          }
        };
        const optimisticCleaningModeState = {
          ...cleaningModeFallbackState,
          state: selectedCleaningMode,
          attributes: {
            ...(cleaningModeFallbackState.attributes || {}),
            options: cleaningModeOptions
          }
        };
        await invokeVacuumService(
          "select",
          "select_option",
          cleaningModeEntityId,
          {
            option: selectedCleaningMode
          },
          optimisticCleaningModeState,
          applyCleaningModeState,
          cleaningModeFallbackState
        );
      }
    });
    if (cleaningModeGroup && !hasCleaningModeEntity) {
      for (const modeOptionEntry of cleaningModeGroup.entries) {
        modeOptionEntry.button.dataset.unsupported = "true";
      }
    }
    const fanSpeedOptions =
      Array.isArray(vacuumAttributes.fan_speed_list) && vacuumAttributes.fan_speed_list.length
        ? vacuumAttributes.fan_speed_list
        : Array.isArray(vacuumAttributes.suction_level_list)
          ? vacuumAttributes.suction_level_list
          : [];
    const fanSpeedGroup = createVacuumOptionGroup({
      label: "吸力",
      detail: "按地面情况调节",
      options: fanSpeedOptions,
      current: vacuumAttributes.fan_speed || vacuumAttributes.suction_level,
      labels: fanSpeedLabels,
      onSelect: async selectedFanSpeed => {
        const currentVacuumState = vacuumState;
        const optimisticFanSpeedState = {
          ...currentVacuumState,
          attributes: {
            ...(currentVacuumState.attributes || {}),
            fan_speed: selectedFanSpeed,
            suction_level: selectedFanSpeed
          }
        };
        await invokeVacuumService(
          "vacuum",
          "set_fan_speed",
          vacuumPrimaryEntityId,
          {
            fan_speed: selectedFanSpeed
          },
          optimisticFanSpeedState
        );
      }
    });
    const waterHeaterExtensions =
      selectedEntityIds !== null
        ? this.createWaterHeaterExtensionControls(vacuumPrimaryEntityId, {
            component: vacuumControlComponent,
            interactive: !isPreview,
            excludedEntityIds: [cleaningModeEntityId, vacuumBatteryEntityId].filter(Boolean)
          })
        : null;
    const vacuumWarningElement = document.createElement("p");
    vacuumWarningElement.className = "hb-vacuum-details-warning";
    vacuumControlsElement.append(vacuumWarningElement);
    vacuumLayoutElement.append(vacuumOverviewElement, vacuumControlsElement);
    vacuumCardElement.append(vacuumHeadingElement, vacuumLayoutElement);
    if (waterHeaterExtensions) {
      vacuumCardElement.append(waterHeaterExtensions);
      vacuumDialogElement.classList.add("has-related-extensions");
    }
    vacuumDialogElement.append(vacuumCardElement);
    const vacuumStatusText = vacuumStatusState => {
      const vacuumStatusAttributes = vacuumStatusState?.attributes || {};
      if (vacuumStatusAttributes.washing) {
        if (vacuumStatusAttributes.washing_paused) {
          return "拖布清洗已暂停";
        } else {
          return "正在清洗拖布";
        }
      }
      if (vacuumStatusAttributes.drying) {
        return "正在烘干拖布";
      }
      if (vacuumStatusAttributes.draining) {
        return "正在排水";
      }
      if (vacuumStatusAttributes.returning) {
        return "正在返回充电座";
      }
      if (vacuumStatusAttributes.mapping) {
        return "正在绘制地图";
      }
      const vacuumStateKey = String(
        vacuumStatusAttributes.vacuum_state || vacuumStatusState?.state || ""
      ).toLowerCase();
      return (
        {
          cleaning: "正在清扫",
          sweeping: "正在扫地",
          mopping: "正在拖地",
          paused: "任务已暂停",
          returning: "正在返回充电座",
          docked: "已在充电座",
          charging: "正在充电",
          charging_completed: "充电完成",
          idle: "待机",
          error: "设备异常",
          unavailable: "设备不可用",
          unknown: "状态未知",
          washing: "正在清洗拖布",
          drying: "正在烘干拖布",
          mapping: "正在绘制地图"
        }[vacuumStateKey] || String(vacuumStatusState?.state || "状态未知")
      );
    };
    const formatVacuumNumber = (numericMetric, fallbackText = "--") =>
      Number.isFinite(Number(numericMetric)) ? Number(numericMetric) : fallbackText;
    const isVacuumBusy = busyState => {
      const busyAttributes = busyState?.attributes || {};
      return (
        !!busyAttributes.running ||
        !!busyAttributes.returning ||
        !!busyAttributes.washing ||
        !!busyAttributes.drying ||
        !!busyAttributes.mapping ||
        ["cleaning", "returning"].includes(String(busyState?.state || "").toLowerCase())
      );
    };
    const renderVacuumBattery = () => {
      const batteryPercent = vacuumBatteryPercent(vacuumState, vacuumBatteryCurrentState);
      vacuumBatteryValueElement.textContent =
        batteryPercent === null ? "--" : Math.round(batteryPercent) + "%";
    };
    const applyVacuumBatteryState = nextBatteryState => {
      vacuumBatteryCurrentState = nextBatteryState || vacuumBatteryCurrentState;
      renderVacuumBattery();
    };
    function renderVacuumState(nextVacuumState) {
      if (!nextVacuumState) {
        return;
      }
      vacuumState = nextVacuumState;
      const vacuumStateAttributes = nextVacuumState.attributes || {};
      const vacuumStatusLabel = vacuumStatusText(nextVacuumState);
      const isVacuumActive = isVacuumBusy(nextVacuumState);
      const isVacuumPaused =
        !!vacuumStateAttributes.paused ||
        !!vacuumStateAttributes.washing_paused ||
        nextVacuumState.state === "paused";
      const isVacuumReturning =
        !!vacuumStateAttributes.returning || nextVacuumState.state === "returning";
      const cleaningModeKey = normalizeVacuumOptionKey(vacuumStateAttributes.cleaning_mode);
      const isSweepingMode = [
        "sweeping",
        "sweeping_and_mopping",
        "mopping_after_sweeping"
      ].includes(cleaningModeKey);
      const isMoppingMode = ["mopping", "sweeping_and_mopping", "mopping_after_sweeping"].includes(
        cleaningModeKey
      );
      const supportedVacuumActions = new Set(vacuumSupportedActions(nextVacuumState));
      for (const [actionServiceName, actionEntry] of vacuumActionsByService) {
        actionEntry.button.hidden =
          !supportedVacuumActions.has(actionServiceName) ||
          (!!interaction3dOptions && actionServiceName === "clean_spot");
      }
      const visibleVacuumActions = [...vacuumActionsByService.values()].filter(
        actionDescriptor => !actionDescriptor.button.hidden
      );
      const visibleActionCount = visibleVacuumActions.length;
      vacuumActionsElement.hidden = visibleActionCount === 0;
      vacuumActionsElement.classList.toggle("has-many-actions", visibleActionCount > 3);
      for (const actionControlEntry of vacuumActionsByService.values()) {
        actionControlEntry.button.classList.remove("is-last-row-pair", "is-last-row-single");
      }
      const lastRowActionCount = visibleActionCount % 3 || Math.min(visibleActionCount, 3);
      if (lastRowActionCount === 2) {
        for (const lastRowAction of visibleVacuumActions.slice(-2)) {
          lastRowAction.button.classList.add("is-last-row-pair");
        }
      } else if (lastRowActionCount === 1) {
        visibleVacuumActions.at(-1)?.button.classList.add("is-last-row-single");
      }
      vacuumSubtitleElement.textContent = vacuumStatusLabel;
      vacuumSubtitleElement.classList.toggle("is-active", isVacuumActive && !isVacuumPaused);
      vacuumVisualStatusElement.textContent = vacuumStatusLabel;
      renderVacuumBattery();
      vacuumVisualElement.classList.toggle("is-working", isVacuumActive && !isVacuumPaused);
      vacuumVisualElement.classList.toggle("is-paused", isVacuumPaused);
      vacuumVisualElement.classList.toggle("is-returning", isVacuumReturning);
      vacuumVisualElement.classList.toggle("is-sweeping", isSweepingMode);
      vacuumVisualElement.classList.toggle("is-mopping", isMoppingMode);
      vacuumAreaValue.textContent = formatVacuumNumber(vacuumStateAttributes.cleaned_area) + " m²";
      vacuumDurationValue.textContent =
        formatVacuumNumber(vacuumStateAttributes.cleaning_time) + " min";
      vacuumStartAction.button.classList.toggle(
        "active",
        isVacuumActive && !isVacuumPaused && !isVacuumReturning
      );
      vacuumPauseAction.button.classList.toggle("active", isVacuumPaused);
      vacuumStopAction.button.classList.toggle("active", false);
      vacuumReturnAction.button.classList.toggle("active", isVacuumReturning);
      vacuumLocateAction.button.classList.toggle("active", false);
      vacuumSpotAction.button.classList.toggle(
        "active",
        isVacuumActive &&
          !isVacuumPaused &&
          !isVacuumReturning &&
          nextVacuumState.state === "cleaning"
      );
      vacuumStartAction.name.textContent = isVacuumPaused ? "继续清扫" : "开始清扫";
      if (!cleaningModeEntityId) {
        cleaningModeGroup?.sync(vacuumStateAttributes.cleaning_mode);
      }
      fanSpeedGroup?.sync(vacuumStateAttributes.fan_speed || vacuumStateAttributes.suction_level);
      const vacuumErrorMessage = String(vacuumStateAttributes.error || "").trim();
      const vacuumWaterWarningMessage = String(
        vacuumStateAttributes.low_water_warning || ""
      ).trim();
      const vacuumAlerts = [];
      if (vacuumErrorMessage && !/^no error$/i.test(vacuumErrorMessage)) {
        vacuumAlerts.push(vacuumErrorMessage);
      }
      if (vacuumWaterWarningMessage && !/^no warning$/i.test(vacuumWaterWarningMessage)) {
        vacuumAlerts.push(vacuumWaterWarningMessage);
      }
      vacuumWarningElement.textContent = vacuumAlerts.length
        ? "注意：" + vacuumAlerts.join(" · ")
        : "";
      vacuumWarningElement.hidden = !vacuumAlerts.length;
    }
    vacuumStartAction.button.addEventListener("click", () =>
      invokeVacuumService(
        "vacuum",
        vacuumActionService(vacuumState, "start"),
        vacuumPrimaryEntityId,
        {},
        {
          ...vacuumState,
          state: "cleaning",
          attributes: {
            ...(vacuumState.attributes || {}),
            running: true,
            paused: false,
            returning: false
          }
        }
      )
    );
    vacuumPauseAction.button.addEventListener("click", () =>
      invokeVacuumService(
        "vacuum",
        "pause",
        vacuumPrimaryEntityId,
        {},
        {
          ...vacuumState,
          state: "paused",
          attributes: {
            ...(vacuumState.attributes || {}),
            running: false,
            paused: true
          }
        }
      )
    );
    vacuumReturnAction.button.addEventListener("click", () =>
      invokeVacuumService(
        "vacuum",
        "return_to_base",
        vacuumPrimaryEntityId,
        {},
        {
          ...vacuumState,
          state: "returning",
          attributes: {
            ...(vacuumState.attributes || {}),
            running: false,
            paused: false,
            returning: true
          }
        }
      )
    );
    vacuumStopAction.button.addEventListener("click", () =>
      invokeVacuumService(
        "vacuum",
        vacuumActionService(vacuumState, "stop"),
        vacuumPrimaryEntityId,
        {},
        {
          ...vacuumState,
          state: "idle",
          attributes: {
            ...(vacuumState.attributes || {}),
            running: false,
            paused: false,
            returning: false
          }
        }
      )
    );
    vacuumLocateAction.button.addEventListener("click", () =>
      invokeVacuumService("vacuum", "locate", vacuumPrimaryEntityId, {})
    );
    vacuumSpotAction.button.addEventListener("click", () =>
      invokeVacuumService(
        "vacuum",
        "clean_spot",
        vacuumPrimaryEntityId,
        {},
        {
          ...vacuumState,
          state: "cleaning",
          attributes: {
            ...(vacuumState.attributes || {}),
            running: true,
            paused: false,
            returning: false
          }
        }
      )
    );
    renderVacuumState(vacuumState);
    const vacuumDialogLayer = document.createElement("div");
    vacuumDialogLayer.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    vacuumDialogLayer.tabIndex = -1;
    vacuumDialogLayer.append(vacuumDialogElement);
    this.container.append(vacuumDialogLayer);
    this.detailsDialog = vacuumDialogElement;
    const vacuumStateHandlers = new Map([[vacuumPrimaryEntityId, [renderVacuumState]]]);
    if (cleaningModeEntityId) {
      vacuumStateHandlers.set(cleaningModeEntityId, [applyCleaningModeState]);
    }
    if (vacuumBatteryEntityId) {
      vacuumStateHandlers.set(vacuumBatteryEntityId, [applyVacuumBatteryState]);
    }
    for (const [extraHandlerEntityId, extraHandlerList] of waterHeaterExtensions?.stateHandlers ||
      []) {
      vacuumStateHandlers.set(extraHandlerEntityId, extraHandlerList);
    }
    this.detailsStateSync = {
      dialog: vacuumDialogElement,
      handlers: vacuumStateHandlers
    };
    let vacuumResizeObserver = null;
    if (interaction3dOptions) {
      vacuumDialogLayer.classList.add("i3d-vacuum-dialog-layer");
      (interaction3dOptions.root || this.container).append(vacuumDialogLayer);
      vacuumDialogElement.style.setProperty(
        "--i3d-panel-opacity",
        String(
          Math.max(
            0,
            Math.min(
              100,
              Number.isFinite(interaction3dOptions.popupOpacity)
                ? interaction3dOptions.popupOpacity
                : 74
            )
          ) / 100
        )
      );
      const layoutVacuumDialog = () => {
        const layoutRootElement = interaction3dOptions.root || this.container;
        const rootClientWidth = layoutRootElement.clientWidth;
        const rootClientHeight = layoutRootElement.clientHeight;
        const presentationLayoutInfo = interaction3dOptions.getPresentationLayout?.();
        const presentationWidth =
          presentationLayoutInfo?.width > 0 ? presentationLayoutInfo.width : rootClientWidth;
        const presentationHeight =
          presentationLayoutInfo?.height > 0 ? presentationLayoutInfo.height : rootClientHeight;
        const widthScaleFactor = rootClientWidth / Math.max(1, presentationWidth);
        const heightScaleFactor = rootClientHeight / Math.max(1, presentationHeight);
        const defaultDialogTop = Math.max(
          12,
          Math.min(presentationHeight * 0.56 - 400, presentationHeight - 812)
        );
        const dialogPlacement = popupPlacement({
          width: presentationWidth,
          height: presentationHeight,
          panelWidth: 360,
          panelHeight:
            Math.max(
              vacuumDialogElement.scrollHeight ? vacuumDialogElement.scrollHeight + 2 : 0,
              vacuumDialogElement.offsetHeight || 0
            ) || 400,
          defaultScale: 2,
          defaultTop: defaultDialogTop,
          settings: interaction3dOptions.getPopupLayout?.()
        });
        const dialogScaleX = dialogPlacement.scale * widthScaleFactor;
        const dialogScaleY = dialogPlacement.scale * heightScaleFactor;
        const dialogTop = dialogPlacement.top * heightScaleFactor;
        vacuumDialogElement.style.top = dialogTop + "px";
        vacuumDialogElement.style.right = dialogPlacement.right * widthScaleFactor + "px";
        vacuumDialogElement.style.transform = "scale(" + dialogScaleX + "," + dialogScaleY + ")";
        vacuumDialogElement.style.maxHeight =
          Math.max(
            dialogPlacement.custom ? 1 : 100,
            (rootClientHeight - dialogTop - heightScaleFactor * 12) / dialogScaleY
          ) + "px";
      };
      vacuumDialogElement.resizeInteraction3d = layoutVacuumDialog;
      vacuumResizeObserver = new ResizeObserver(layoutVacuumDialog);
      vacuumResizeObserver.observe(interaction3dOptions.root || this.container);
      vacuumResizeObserver.observe(vacuumDialogElement);
      if (interaction3dOptions.frame) {
        vacuumResizeObserver.observe(interaction3dOptions.frame);
      }
      layoutVacuumDialog();
    } else {
      this.registerRuntimeDialogScale(
        vacuumDialogLayer,
        vacuumDialogElement,
        840,
        waterHeaterExtensions ? 560 : 458
      );
    }
    vacuumCloseButton.addEventListener("click", () => vacuumDialogElement.close());
    this.bindRuntimeDialogOutsideDismiss(vacuumDialogLayer, vacuumDialogElement, vacuumCardElement);
    vacuumDialogLayer.addEventListener("keydown", layerKeyEvent => {
      if (layerKeyEvent.key === "Escape") {
        vacuumDialogElement.close();
      }
    });
    vacuumDialogElement.addEventListener(
      "close",
      () => {
        vacuumResizeObserver?.disconnect();
        this.clearRuntimeDialogScale(vacuumDialogElement);
        if (this.detailsDialog === vacuumDialogElement) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === vacuumDialogElement) {
          this.detailsStateSync = null;
        }
        vacuumDialogLayer.remove();
      },
      {
        once: true
      }
    );
    vacuumDialogElement.show();
    vacuumDialogElement.resizeInteraction3d?.();
  }
  showPresenceDetails(presenceComponent, { preview: presencePreview = false } = {}) {
    const presenceEntityId = presenceComponent.bindings?.entity?.entityId;
    if (!presenceEntityId) {
      throw new Error("该控件没有关联实体。");
    }
    this.closeRuntimeDialog();
    const presenceSensorKind = [
      "presence",
      "door-window",
      "water-leak",
      "smoke",
      "natural-gas"
    ].includes(presenceComponent.properties?.sensorKind)
      ? presenceComponent.properties.sensorKind
      : "presence";
    const presenceCopy = {
      presence: {
        title: "人在检测",
        occupied: "有人",
        clear: "无人",
        unavailable: "传感器离线",
        unknown: "等待状态",
        hintOccupied: "空间内检测到人",
        hintClear: "当前空间无人"
      },
      "door-window": {
        title: "门窗状态",
        occupied: "打开",
        clear: "关闭",
        unavailable: "传感器离线",
        unknown: "等待状态",
        hintOccupied: "门窗当前已打开",
        hintClear: "门窗当前已关闭"
      },
      "water-leak": {
        title: "水浸检测",
        occupied: "检测到水浸",
        clear: "正常",
        unavailable: "传感器离线",
        unknown: "等待状态",
        hintOccupied: "传感器检测到水浸",
        hintClear: "当前未检测到水浸"
      },
      smoke: {
        title: "烟雾检测",
        occupied: "检测到烟雾",
        clear: "正常",
        unavailable: "传感器离线",
        unknown: "等待状态",
        hintOccupied: "传感器检测到烟雾",
        hintClear: "当前未检测到烟雾"
      },
      "natural-gas": {
        title: "天然气检测",
        occupied: "检测到天然气",
        clear: "正常",
        unavailable: "传感器离线",
        unknown: "等待状态",
        hintOccupied: "传感器检测到天然气",
        hintClear: "当前未检测到天然气"
      }
    }[presenceSensorKind];
    let presenceState = this.states.get(presenceEntityId)?.newState ||
      this.states.get(presenceEntityId) || {
        entityId: presenceEntityId,
        state: "unknown",
        attributes: {}
      };
    const presenceHistoryHours = Math.max(
      1,
      Math.min(168, Number(presenceComponent.properties?.historyHours || 24))
    );
    const presenceHistoryPoints = this.historySeries.get(presenceEntityId)?.points || [];
    const presenceOccupiedColor =
      presenceComponent.properties?.iconOnColor ||
      presenceComponent.properties?.occupiedColor ||
      "#ffffff";
    const presenceClearColor =
      presenceComponent.properties?.iconColor ||
      presenceComponent.properties?.clearColor ||
      "#758189";
    const resolvePresencePresentation = (presenceInputState, presenceNow = Date.now()) =>
      presenceSensorPresentation(presenceInputState, "auto", {
        ...presenceMotionEventConfig(
          presenceEntityId,
          presenceInputState,
          this.entityMetadata,
          this.states,
          presenceComponent.properties
        ),
        now: presenceNow
      });
    const presenceDialog = document.createElement("dialog");
    presenceDialog.className = "hb-entity-details-dialog presence-details";
    presenceDialog.dataset.sensorKind = presenceSensorKind;
    presenceDialog.style.setProperty("--hb-presence-occupied", presenceOccupiedColor);
    presenceDialog.style.setProperty("--hb-presence-clear", presenceClearColor);
    const presenceCard = document.createElement("div");
    presenceCard.className = "hb-entity-details-card";
    const presenceHeading = document.createElement("div");
    presenceHeading.className = "hb-entity-details-heading";
    const presenceTitleRow = document.createElement("div");
    const presenceTitleText = document.createElement("strong");
    presenceTitleText.textContent = componentDialogTitle(
      presenceComponent,
      presenceState.attributes?.friendly_name || presenceCopy.title
    );
    const presenceStatusText = document.createElement("span");
    presenceTitleRow.append(presenceTitleText, presenceStatusText);
    const presenceCloseButton = document.createElement("button");
    presenceCloseButton.type = "button";
    presenceCloseButton.textContent = "×";
    presenceCloseButton.setAttribute("aria-label", "关闭弹窗");
    presenceHeading.append(presenceTitleRow, presenceCloseButton);
    const presenceBody = document.createElement("div");
    presenceBody.className = "hb-presence-details-body";
    const presenceVisual = document.createElement("section");
    presenceVisual.className = "hb-presence-details-visual";
    let presenceSensorVisual = null;
    if (presenceSensorKind === "presence") {
      const presenceSpaceElement = document.createElement("span");
      presenceSpaceElement.className = "hb-presence-sensor-space";
      for (let spaceLayerIndex = 0; spaceLayerIndex < 3; spaceLayerIndex += 1) {
        presenceSpaceElement.append(document.createElement("i"));
      }
      const presenceFloorElement = document.createElement("span");
      presenceFloorElement.className = "hb-presence-sensor-floor";
      const presencePersonElement = document.createElement("span");
      presencePersonElement.className = "hb-presence-sensor-person";
      const personHeadElement = document.createElement("i");
      const personBodyElement = document.createElement("b");
      const personLeftArmElement = document.createElement("span");
      personLeftArmElement.className = "arm left";
      const personRightArmElement = document.createElement("span");
      personRightArmElement.className = "arm right";
      const personLeftLegElement = document.createElement("span");
      personLeftLegElement.className = "leg left";
      const personRightLegElement = document.createElement("span");
      personRightLegElement.className = "leg right";
      presencePersonElement.append(
        personHeadElement,
        personBodyElement,
        personLeftArmElement,
        personRightArmElement,
        personLeftLegElement,
        personRightLegElement
      );
      presenceVisual.append(presenceSpaceElement, presenceFloorElement, presencePersonElement);
    } else {
      presenceSensorVisual = renderRegisteredComponent(
        {
          ...presenceComponent,
          position: {
            ...(presenceComponent.position || {}),
            width: 100,
            height: 100
          }
        },
        {
          states: new Map([[presenceEntityId, presenceState]]),
          entityMetadata: this.entityMetadata,
          editable: false,
          previewState: "auto",
          document: this.document
        }
      );
      presenceSensorVisual.classList.add("hb-presence-details-sensor");
      presenceVisual.append(presenceSensorVisual);
    }
    const presenceStateHeadline = document.createElement("strong");
    const presenceStateHint = document.createElement("small");
    presenceVisual.append(presenceStateHeadline, presenceStateHint);
    const presenceMetrics = document.createElement("section");
    presenceMetrics.className = "hb-presence-details-metrics";
    const createPresenceMetric = metricLabel => {
      const metricElement = document.createElement("div");
      const presenceMetricLabelElement = document.createElement("small");
      presenceMetricLabelElement.textContent = metricLabel;
      const presenceMetricValueElement = document.createElement("strong");
      metricElement.append(presenceMetricLabelElement, presenceMetricValueElement);
      presenceMetrics.append(metricElement);
      return presenceMetricValueElement;
    };
    const presenceCurrentDurationValue = createPresenceMetric("当前状态持续");
    const presenceLastDetectedValue = createPresenceMetric("最近检测到人");
    const presenceOccupiedHoursValue = createPresenceMetric(presenceHistoryHours + " 小时有人时长");
    const presenceTimelineSection = document.createElement("section");
    presenceTimelineSection.className = "hb-presence-details-timeline";
    const presenceTimelineHeader = document.createElement("div");
    const presenceTimelineTitle = document.createElement("strong");
    presenceTimelineTitle.textContent = presenceHistoryHours + " 小时在家时间轴";
    const presenceTimelineLegend = document.createElement("span");
    presenceTimelineLegend.textContent = "亮色为有人";
    presenceTimelineHeader.append(presenceTimelineTitle, presenceTimelineLegend);
    const presenceTimelineTrack = document.createElement("div");
    const presenceTimelineAxis = document.createElement("div");
    presenceTimelineAxis.innerHTML =
      "<span>" + presenceHistoryHours + " 小时前</span><span>现在</span>";
    presenceTimelineSection.append(
      presenceTimelineHeader,
      presenceTimelineTrack,
      presenceTimelineAxis
    );
    presenceBody.append(presenceVisual, presenceMetrics, presenceTimelineSection);
    presenceCard.append(presenceHeading, presenceBody);
    presenceDialog.append(presenceCard);
    const formatPresenceTimestamp = timestampMs => {
      if (!Number.isFinite(timestampMs)) {
        return "--";
      }
      const eventDate = new Date(timestampMs);
      const referenceDate = new Date();
      const isSameDay =
        eventDate.getFullYear() === referenceDate.getFullYear() &&
        eventDate.getMonth() === referenceDate.getMonth() &&
        eventDate.getDate() === referenceDate.getDate();
      const formattedTime = new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(eventDate);
      if (isSameDay) {
        return "今天 " + formattedTime;
      } else {
        return new Intl.DateTimeFormat("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        })
          .format(eventDate)
          .replace(/\//g, "-");
      }
    };
    const renderPresenceTimeline = () => {
      const historyBuckets = presenceHistoryBuckets(
        presenceHistoryPoints,
        presenceState,
        Date.now(),
        presenceHistoryHours,
        48,
        presenceMotionEventConfig(
          presenceEntityId,
          presenceState,
          this.entityMetadata,
          this.states,
          presenceComponent.properties
        )
      );
      presenceTimelineTrack.replaceChildren(
        ...historyBuckets.map((bucketKey, bucketIndex) => {
          const bucketElement = document.createElement("i");
          bucketElement.className = "is-" + bucketKey;
          const minutesAgo = Math.round(
            (presenceHistoryHours * 60 * (historyBuckets.length - bucketIndex - 1)) /
              historyBuckets.length
          );
          bucketElement.title =
            (minutesAgo ? minutesAgo + " 分钟前" : "现在") +
            "：" +
            {
              occupied: "有人",
              clear: "无人",
              unavailable: "离线",
              unknown: "未知"
            }[bucketKey];
          return bucketElement;
        })
      );
      const occupiedBucketCount = historyBuckets.filter(
        bucketState => bucketState === "occupied"
      ).length;
      const occupiedMinutes = Math.round(
        (presenceHistoryHours * 60 * occupiedBucketCount) / Math.max(1, historyBuckets.length)
      );
      presenceOccupiedHoursValue.textContent =
        occupiedMinutes >= 60
          ? Math.floor(occupiedMinutes / 60) + " 小时 " + (occupiedMinutes % 60) + " 分钟"
          : occupiedMinutes + " 分钟";
    };
    const lastPresenceTimestamp = () => {
      const presenceMotionConfig = presenceMotionEventConfig(
        presenceEntityId,
        presenceState,
        this.entityMetadata,
        this.states,
        presenceComponent.properties
      );
      const motionTimestamps = presenceHistoryPoints
        .map(historyPoint => ({
          timestamp: Date.parse(historyPoint?.timestamp),
          state: {
            state: historyPoint?.value
          }
        }))
        .filter(
          candidateMotionPoint =>
            Number.isFinite(candidateMotionPoint.timestamp) &&
            presenceSensorPresentation(
              {
                state: candidateMotionPoint?.state?.state,
                lastChanged: new Date(candidateMotionPoint.timestamp).toISOString()
              },
              "auto",
              {
                ...presenceMotionConfig,
                now: candidateMotionPoint.timestamp,
                noMotionSeconds: null,
                noMotionStateTimestamp: null
              }
            ).key === "occupied"
        );
      const stateChangedAt = presenceStateTimestamp(presenceState);
      if (
        resolvePresencePresentation(presenceState).key === "occupied" &&
        Number.isFinite(stateChangedAt)
      ) {
        motionTimestamps.push({
          timestamp: stateChangedAt
        });
      }
      if (motionTimestamps.length) {
        return Math.max(...motionTimestamps.map(motionPoint => motionPoint.timestamp));
      } else {
        return null;
      }
    };
    const renderPresenceState = nextPresenceState => {
      presenceState = nextPresenceState || presenceState;
      const presencePresentation = resolvePresencePresentation(presenceState);
      const presenceStateChangedAt = presenceStateTimestamp(presenceState);
      presenceDialog.dataset.presenceState = presencePresentation.key;
      presenceVisual.className = "hb-presence-details-visual is-" + presencePresentation.key;
      const presenceStatusLabel = presenceCopy[presencePresentation.key] || presenceCopy.unknown;
      presenceStatusText.textContent = presenceStatusLabel;
      presenceStatusText.classList.toggle("is-on", presencePresentation.key === "occupied");
      presenceStateHeadline.textContent = presenceStatusLabel;
      presenceStateHint.textContent =
        presencePresentation.key === "occupied"
          ? presenceCopy.hintOccupied
          : presencePresentation.key === "clear"
            ? presenceCopy.hintClear
            : presencePresentation.key === "unavailable"
              ? "设备当前不可用"
              : "正在等待状态";
      if (presenceSensorVisual) {
        const presenceVisualClass = {
          "door-window":
            "hb-door-window-sensor is-" +
            (presencePresentation.key === "occupied" ? "open" : presencePresentation.key),
          "water-leak":
            "hb-water-leak-sensor is-" +
            (presencePresentation.key === "occupied" ? "wet" : presencePresentation.key),
          smoke:
            "hb-smoke-sensor is-" +
            (presencePresentation.key === "occupied" ? "alert" : presencePresentation.key),
          "natural-gas":
            "hb-natural-gas-sensor is-" +
            (presencePresentation.key === "occupied" ? "alert" : presencePresentation.key)
        }[presenceSensorKind];
        presenceSensorVisual.className = presenceVisualClass + " hb-presence-details-sensor";
        presenceSensorVisual.dataset.sensorState = presencePresentation.key;
        presenceSensorVisual.setAttribute(
          "aria-label",
          presenceCopy.title + "：" + presenceStatusLabel
        );
      }
      presenceCurrentDurationValue.textContent = ["unknown", "unavailable"].includes(
        presencePresentation.key
      )
        ? "--"
        : formatPresenceDuration(presenceStateChangedAt);
      presenceLastDetectedValue.textContent = formatPresenceTimestamp(lastPresenceTimestamp());
      renderPresenceTimeline();
    };
    renderPresenceState(presenceState);
    const presenceEventConfig = presenceMotionEventConfig(
      presenceEntityId,
      presenceState,
      this.entityMetadata,
      this.states,
      presenceComponent.properties
    );
    const presenceStateHandlers = new Map([[presenceEntityId, [renderPresenceState]]]);
    for (const companionEntityId of presenceEventConfig.companionEntityIds) {
      presenceStateHandlers.set(companionEntityId, [() => renderPresenceState(presenceState)]);
    }
    const presenceRefreshTimer = presenceEventConfig.motionEvent
      ? window.setInterval(() => renderPresenceState(presenceState), 1000)
      : null;
    const presenceDialogLayer = document.createElement("div");
    presenceDialogLayer.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    presenceDialogLayer.tabIndex = -1;
    presenceDialogLayer.append(presenceDialog);
    this.container.append(presenceDialogLayer);
    this.detailsDialog = presenceDialog;
    this.detailsStateSync = {
      dialog: presenceDialog,
      handlers: presenceStateHandlers
    };
    this.registerRuntimeDialogScale(presenceDialogLayer, presenceDialog, 760, 560);
    presenceCloseButton.addEventListener("click", () => presenceDialog.close());
    this.bindRuntimeDialogOutsideDismiss(presenceDialogLayer, presenceDialog, presenceCard);
    presenceDialogLayer.addEventListener("keydown", presenceLayerKeyEvent => {
      if (presenceLayerKeyEvent.key === "Escape") {
        presenceDialog.close();
      }
    });
    presenceDialog.addEventListener(
      "close",
      () => {
        if (presenceRefreshTimer) {
          window.clearInterval(presenceRefreshTimer);
        }
        this.clearRuntimeDialogScale(presenceDialog);
        if (this.detailsDialog === presenceDialog) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === presenceDialog) {
          this.detailsStateSync = null;
        }
        presenceDialogLayer.remove();
      },
      {
        once: true
      }
    );
    presenceDialog.show();
  }
  showEntityDetails(detailsComponent, { preview: detailsPreview = false } = {}) {
    const detailsEntityId = detailsComponent.bindings?.entity?.entityId;
    if (!detailsEntityId) {
      throw new Error("该控件没有关联实体。");
    }
    const resolvedDetailsEntityId = String(detailsEntityId);
    const deviceProfile = this.deviceProfile(resolvedDetailsEntityId);
    detailsComponent = applyXiaomiDeviceProfile(detailsComponent, deviceProfile);
    const detailsEntityDomain = resolvedDetailsEntityId.split(".", 1)[0];
    const isElectricBedDevice =
      detailsComponent.properties?.deviceType === "electric-bed" ||
      deviceProfile?.deviceType === "electric-bed";
    if (!this.entityCatalogReady) {
      this.deferEntityDetailsUntilReady(
        {
          ...detailsComponent,
          properties: {
            ...(detailsComponent.properties || {}),
            __catalogRetry: true
          }
        },
        detailsPreview,
        isElectricBedDevice ? "electric-bed-catalog" : "catalog"
      );
      if (isElectricBedDevice) {
        this.showElectricBedLoadingDetails(detailsComponent, {
          preview: detailsPreview
        });
      }
      return;
    }
    if (
      !deviceProfile &&
      detailsEntityDomain === "number" &&
      !detailsComponent.properties?.__catalogRetry
    ) {
      this.deferEntityDetailsUntilReady(
        {
          ...detailsComponent,
          properties: {
            ...(detailsComponent.properties || {}),
            __catalogRetry: true
          }
        },
        detailsPreview,
        isElectricBedDevice ? "electric-bed-catalog" : "catalog"
      );
      if (isElectricBedDevice) {
        this.showElectricBedLoadingDetails(detailsComponent, {
          preview: detailsPreview
        });
      }
      return;
    }
    if (
      detailsEntityDomain === "water_heater" &&
      !this.waterHeaterDetailsReady(resolvedDetailsEntityId)
    ) {
      this.deferEntityDetailsUntilReady(detailsComponent, detailsPreview);
      return;
    }
    window.clearTimeout(this.pendingEntityDetails?.timer);
    this.pendingEntityDetails = null;
    if (detailsComponent.type === "presence-sensor") {
      this.showPresenceDetails(detailsComponent, {
        preview: detailsPreview
      });
      return;
    }
    if (deviceProfile?.deviceType === "electric-bed") {
      this.showElectricBedDetails(detailsComponent, {
        preview: detailsPreview
      });
      return;
    }
    if (
      deviceProfile?.deviceType === "air-purifier" &&
      detailsEntityDomain === "fan" &&
      ["icon-button", "device-button", "icon-button-effect"].includes(detailsComponent.type)
    ) {
      detailsComponent = {
        ...detailsComponent,
        type: "air-purifier",
        properties: {
          ...(detailsComponent.properties || {}),
          deviceType: "air-purifier"
        }
      };
    }
    const isDedicatedDetailsType = new Set([
      "line-chart",
      "media-player",
      "air-purifier",
      "air-conditioner",
      "water-heater",
      "vacuum-control",
      "electric-bed"
    ]).has(detailsComponent.type);
    if (
      detailsComponent.type === "media-player" ||
      (!isDedicatedDetailsType && detailsEntityDomain === "media_player")
    ) {
      this.showMediaPlayerDetails(detailsComponent, {
        preview: detailsPreview
      });
      return;
    }
    if (detailsComponent.type === "air-purifier") {
      this.showAirPurifierDetails(detailsComponent, {
        preview: detailsPreview
      });
      return;
    }
    if (
      ["air-conditioner", "bath-heater"].includes(deviceProfile?.deviceType) &&
      ["climate", "fan"].includes(detailsEntityDomain) &&
      !isDedicatedDetailsType &&
      detailsComponent.type !== "air-conditioner"
    ) {
      detailsComponent = {
        ...detailsComponent,
        type: "air-conditioner"
      };
    }
    if (
      detailsComponent.type === "vacuum-control" ||
      (!isDedicatedDetailsType && resolvedDetailsEntityId.startsWith("vacuum."))
    ) {
      this.showVacuumDetails(detailsComponent, {
        preview: detailsPreview
      });
      return;
    }
    const entityCatalogState = this.states.get(resolvedDetailsEntityId);
    const detailsEntityState = entityCatalogState?.newState || entityCatalogState;
    const entityAttributes = detailsEntityState?.attributes || {};
    const isLineChart = detailsComponent.type === "line-chart";
    const isCover = !isLineChart && detailsEntityDomain === "cover";
    const coverKindSetting = ["standard", "dream", "airer"].includes(
      detailsComponent.properties?.coverKind
    )
      ? detailsComponent.properties.coverKind
      : "auto";
    const isAirerDevice =
      isCover &&
      coverComponentIsAirer(
        detailsComponent,
        resolvedDetailsEntityId,
        detailsEntityState,
        this.entityMetadata,
        this.deviceMetadata
      );
    const supportedFeatures = Number(entityAttributes.supported_features || 0);
    const coverSearchText =
      resolvedDetailsEntityId +
      " " +
      (entityAttributes.friendly_name || "") +
      " " +
      (detailsComponent.properties?.label || "");
    const supportsTiltPosition =
      Number.isFinite(Number(entityAttributes.current_tilt_position)) ||
      !!(supportedFeatures & 240);
    const isDreamCoverName = /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(coverSearchText);
    const isDreamCover =
      isCover &&
      !isAirerDevice &&
      (coverKindSetting === "dream" ||
        (coverKindSetting === "auto" && (supportsTiltPosition || isDreamCoverName)));
    const isTiltCover = isDreamCover && supportsTiltPosition;
    const airerLightRelatedEntityId =
      (isAirerDevice ? relatedAirerLightEntity(this.entityMetadata, resolvedDetailsEntityId) : null)
        ?.entityId || "";
    const airerLightRelatedState = airerLightRelatedEntityId
      ? this.states.get(airerLightRelatedEntityId)
      : null;
    let airerLightCurrentState = airerLightRelatedState?.newState || airerLightRelatedState || null;
    const airerPositionNumberEntityId =
      (isAirerDevice
        ? relatedAirerPositionNumberEntity(this.entityMetadata, resolvedDetailsEntityId)
        : null
      )?.entityId || "";
    const airerPositionNumberState = this.states.get(airerPositionNumberEntityId);
    const airerPositionCurrentState =
      airerPositionNumberState?.newState || airerPositionNumberState || null;
    const airerPositionSensorEntityId =
      (isAirerDevice
        ? relatedAirerCurrentPositionSensor(this.entityMetadata, resolvedDetailsEntityId)
        : null
      )?.entityId || "";
    const airerMotorSpeedSensorId =
      (isAirerDevice
        ? relatedAirerMotorSpeedSensor(this.entityMetadata, resolvedDetailsEntityId)
        : null
      )?.entityId || "";
    const airerMotorSpeedSensorState = this.states.get(airerMotorSpeedSensorId);
    const airerMotorSpeedCurrentState =
      airerMotorSpeedSensorState?.newState || airerMotorSpeedSensorState || null;
    const airerActionEntities = isAirerDevice
      ? relatedAirerMotorActionEntities(this.entityMetadata, resolvedDetailsEntityId)
      : {};
    const airerActionEntityIdMap = Object.fromEntries(
      Object.entries(airerActionEntities).map(([actionRoleName, actionRoleEntity]) => [
        actionRoleName,
        actionRoleEntity?.entityId || ""
      ])
    );
    const airerPositionSensorState = this.states.get(
      airerPositionSensorEntityId || airerPositionNumberEntityId
    );
    const airerPositionSensorCurrentState =
      airerPositionSensorState?.newState || airerPositionSensorState || null;
    const isCoverMotorPolarityReversed =
      isCover &&
      coverMotorIsReversedForComponent(
        detailsComponent,
        this.entityMetadata,
        this.states,
        resolvedDetailsEntityId
      );
    const coverPrimaryService = isCoverMotorPolarityReversed ? "open_cover" : "close_cover";
    const coverSecondaryService = isCoverMotorPolarityReversed ? "close_cover" : "open_cover";
    const coverSplitDirection = ["left", "right"].includes(
      detailsComponent.properties?.coverDirection
    )
      ? detailsComponent.properties.coverDirection
      : "split";
    const isMomentaryButton = !isLineChart && detailsEntityDomain === "button";
    const isSwitchLike =
      !isLineChart &&
      (isMomentaryButton || ["switch", "input_boolean"].includes(detailsEntityDomain));
    const isLightDetails =
      detailsComponent.type === "icon-button" && detailsEntityDomain === "light";
    const isClimateDetails =
      !isLineChart &&
      (detailsComponent.type === "air-conditioner" ||
        detailsComponent.type === "water-heater" ||
        ["climate", "water_heater"].includes(detailsEntityDomain));
    const resolvedClimateDeviceType = isClimateDetails
      ? detailsEntityDomain === "water_heater" || detailsComponent.type === "water-heater"
        ? "water-heater"
        : resolveClimateDeviceType(detailsComponent, detailsEntityState, resolvedDetailsEntityId)
      : "air-conditioner";
    const climateTypeLabel = climateDeviceLabel(resolvedClimateDeviceType);
    const climateDialogTitle = componentDialogTitle(
      detailsComponent,
      String(entityAttributes.friendly_name || "").trim() || climateTypeLabel
    ).replace(/(浴霸)(?:\s+浴霸)+$/i, "$1");
    const switchDialogTitle = componentDialogTitle(
      detailsComponent,
      String(entityAttributes.friendly_name || "").trim() || (isMomentaryButton ? "按钮" : "开关")
    );
    const hasPowerToggle = isLightDetails || isClimateDetails || isSwitchLike;
    this.closeRuntimeDialog();
    const resolvePowerOn = (powerStateText, powerStateAttributes = entityAttributes) =>
      isMomentaryButton
        ? false
        : isLightDetails || isSwitchLike
          ? powerStateText === "on"
          : climateIsPoweredOn(
              {
                state: powerStateText,
                attributes: powerStateAttributes
              },
              resolvedClimateDeviceType
            );
    const entityDialog = document.createElement("dialog");
    entityDialog.className = "hb-entity-details-dialog";
    entityDialog.tabIndex = -1;
    entityDialog.classList.toggle("line-chart-details", isLineChart);
    entityDialog.classList.toggle("light-details", isLightDetails);
    entityDialog.classList.toggle("cover-details", isCover);
    entityDialog.classList.toggle("dream-cover-details", isDreamCover);
    entityDialog.classList.toggle("airer-cover-details", isAirerDevice);
    entityDialog.classList.toggle("climate-details", isClimateDetails);
    entityDialog.classList.toggle(
      "bath-heater-details",
      resolvedClimateDeviceType === "bath-heater"
    );
    entityDialog.classList.toggle(
      "water-heater-details",
      resolvedClimateDeviceType === "water-heater"
    );
    entityDialog.classList.toggle("switch-details", isSwitchLike);
    entityDialog.classList.toggle("momentary-button-details", isMomentaryButton);
    const entityDialogCard = document.createElement("div");
    entityDialogCard.className = "hb-entity-details-card";
    const entityDialogHeading = document.createElement("div");
    entityDialogHeading.className = "hb-entity-details-heading";
    const entityTitleRow = document.createElement("div");
    const entityTitleText = document.createElement("strong");
    entityTitleText.textContent = isLightDetails
      ? componentDialogTitle(detailsComponent, "灯光")
      : isCover
        ? componentDialogTitle(detailsComponent, isAirerDevice ? "晾衣机" : "窗帘")
        : isClimateDetails
          ? climateDialogTitle
          : isSwitchLike
            ? switchDialogTitle
            : componentDialogTitle(detailsComponent, "设备详情");
    entityTitleRow.append(entityTitleText);
    let lightStatusText = null;
    let coverStatusText = null;
    let coverPhysicalStateText = String(detailsEntityState?.state || "");
    let climateStatusText = null;
    let switchStatusText = null;
    let chartStatusText = null;
    if (isLightDetails) {
      const lightStatusElement = document.createElement("span");
      lightStatusElement.textContent = detailsEntityState?.state === "on" ? "已开启" : "已关闭";
      lightStatusElement.classList.toggle("is-on", detailsEntityState?.state === "on");
      lightStatusText = lightStatusElement;
      entityTitleRow.append(lightStatusElement);
    } else if (isCover) {
      const coverStatusElement = document.createElement("span");
      const physicalState = physicalCoverState(
        detailsEntityState?.state,
        isCoverMotorPolarityReversed
      );
      const currentPositionValue = Number(
        entityAttributes[isTiltCover ? "current_tilt_position" : "current_position"]
      );
      const coverStateLabels = {
        open: "已打开",
        closed: "已关闭",
        opening: "正在打开",
        closing: "正在关闭"
      };
      coverStatusElement.textContent = isAirerDevice
        ? airerPositionLabel(physicalState) || physicalState || "状态未知"
        : isDreamCover
          ? dreamCurtainStatusText(
              detailsEntityState?.state,
              currentPositionValue,
              isCoverMotorPolarityReversed
            )
          : coverStateLabels[physicalState] || physicalState || "状态未知";
      coverStatusElement.classList.toggle(
        "is-on",
        physicalState === "open" || physicalState === "opening"
      );
      coverStatusText = coverStatusElement;
      entityTitleRow.append(coverStatusElement);
    } else if (isClimateDetails || isSwitchLike) {
      const powerStatusElement = document.createElement("span");
      const isPowerOn = resolvePowerOn(detailsEntityState?.state);
      powerStatusElement.textContent = isMomentaryButton
        ? ["unknown", "unavailable"].includes(detailsEntityState?.state)
          ? "当前不可用"
          : "按下执行"
        : resolvedClimateDeviceType === "water-heater"
          ? waterHeaterStatusLabel(detailsEntityState)
          : ["unknown", "unavailable"].includes(detailsEntityState?.state)
            ? "当前不可用"
            : isPowerOn
              ? "已开启"
              : "已关闭";
      powerStatusElement.classList.toggle("is-on", isPowerOn);
      if (isClimateDetails) {
        climateStatusText = powerStatusElement;
      } else {
        switchStatusText = powerStatusElement;
      }
      entityTitleRow.append(powerStatusElement);
    } else if (detailsComponent.type === "line-chart") {
      const chartStatusElement = document.createElement("span");
      chartStatusElement.textContent =
        detailsEntityState?.state == null ||
        ["unknown", "unavailable"].includes(detailsEntityState.state)
          ? "暂无数据"
          : "实时数据";
      chartStatusText = chartStatusElement;
      entityTitleRow.append(chartStatusElement);
    }
    const entityCloseButton = document.createElement("button");
    entityCloseButton.type = "button";
    entityCloseButton.setAttribute("aria-label", "关闭实体详情");
    entityCloseButton.textContent = "×";
    entityDialogHeading.append(entityTitleRow, entityCloseButton);
    let latestEntityState = detailsEntityState;
    let detailsControls = null;
    let renderPowerState = null;
    let entityLightVisual = null;
    let applyLightVisualState = null;
    let entityCoverVisual = null;
    let renderCoverPosition = null;
    let renderAirerLight = null;
    let coverOpenPosition = 0;
    const airerLiftCalibration = airerPositionCalibration(
      this.entityMetadata,
      this.deviceMetadata,
      resolvedDetailsEntityId
    );
    let isCoverCommandPending = false;
    let entityClimateVisual = null;
    let renderClimateVisual = null;
    let switchVisualElement = null;
    let syncSwitchVisual = null;
    let toggleEntityPower = null;
    let isEntityTogglePending = false;
    let climatePollTimer = null;
    let buttonActionStatus = "idle";
    let bathHeaterLightEntityId = "";
    let bathHeaterLightController = null;
    let relatedExtensionsControl = null;
    let relatedExtensionEntityIds = new Set();
    const selectedRelatedIds = selectedRelatedEntityIds(detailsComponent);
    const selectedRelatedIdSet = new Set(selectedRelatedIds || []);
    if (isLightDetails) {
      entityLightVisual = document.createElement("button");
      entityLightVisual.type = "button";
      entityLightVisual.className = "hb-light-visual";
      entityLightVisual.inert = detailsPreview;
      entityLightVisual.setAttribute("aria-disabled", String(detailsPreview));
      const lightVisualAura = document.createElement("div");
      lightVisualAura.className = "hb-light-visual-aura";
      const lightVisualLamp = document.createElement("div");
      lightVisualLamp.className = "hb-light-visual-lamp";
      for (const lightShapeName of ["cord", "shade", "bulb", "filament"]) {
        const lightShaperElement = document.createElement("i");
        lightShaperElement.className = "hb-light-visual-" + lightShapeName;
        lightShaperElement.setAttribute("aria-hidden", "true");
        lightVisualLamp.append(lightShaperElement);
      }
      const lightVisualStatus = document.createElement("span");
      lightVisualStatus.className = "hb-light-visual-status";
      entityLightVisual.append(lightVisualAura, lightVisualLamp, lightVisualStatus);
      const lightKelvinMin =
        Number(entityAttributes.min_color_temp_kelvin) ||
        (Number.isFinite(Number(entityAttributes.max_mireds))
          ? 1000000 / Number(entityAttributes.max_mireds)
          : 2000);
      const lightKelvinMax =
        Number(entityAttributes.max_color_temp_kelvin) ||
        (Number.isFinite(Number(entityAttributes.min_mireds))
          ? 1000000 / Number(entityAttributes.min_mireds)
          : 6500);
      const lightKelvinCurrent =
        Number(entityAttributes.color_temp_kelvin) ||
        (Number.isFinite(Number(entityAttributes.color_temp))
          ? 1000000 / Number(entityAttributes.color_temp)
          : NaN);
      const lightKelvinResolved = Number.isFinite(lightKelvinCurrent)
        ? lightKelvinCurrent
        : (lightKelvinMin + lightKelvinMax) / 2;
      const supportsLightColor = lightSupportsColor(entityAttributes);
      const lightVisualSnapshot = {
        isOn: detailsEntityState?.state === "on",
        brightnessPercent: Number.isFinite(Number(entityAttributes.brightness))
          ? (Number(entityAttributes.brightness) / 255) * 100
          : 100,
        colorTemperatureKelvin: lightKelvinResolved,
        colorRgb:
          supportsLightColor && Array.isArray(entityAttributes.rgb_color)
            ? entityAttributes.rgb_color
                .slice(0, 3)
                .map(lightRgbChannel => Number(lightRgbChannel) || 0)
            : supportsLightColor && Array.isArray(entityAttributes.hs_color)
              ? hsToRgbColor(entityAttributes.hs_color)
              : null
      };
      const renderEntityLightVisual = () => {
        const lightVisualBrightness = Math.max(
          1,
          Math.min(100, Number(lightVisualSnapshot.brightnessPercent) || 1)
        );
        const lightVisualKelvin = Math.max(
          2000,
          Math.min(6500, Number(lightVisualSnapshot.colorTemperatureKelvin) || 3000)
        );
        const lightWarmthRatio = (lightVisualKelvin - 2000) / 4500;
        const lightWarmRgb = [255, 132, 42];
        const lightCoolRgb = [172, 225, 255];
        const lightRgbCss =
          "rgb(" +
          (
            lightVisualSnapshot.colorRgb ||
            lightWarmRgb.map((lightRgbChannelValue, lightRgbChannelIndex) =>
              Math.round(
                lightRgbChannelValue +
                  (lightCoolRgb[lightRgbChannelIndex] - lightRgbChannelValue) * lightWarmthRatio
              )
            )
          ).join(",") +
          ")";
        entityLightVisual.classList.toggle("is-on", lightVisualSnapshot.isOn);
        entityLightVisual.style.setProperty("--hb-light-visual-color", lightRgbCss);
        entityLightVisual.style.setProperty(
          "--hb-light-visual-opacity",
          lightVisualSnapshot.isOn ? String(0.08 + (lightVisualBrightness / 100) * 0.92) : "0"
        );
        entityLightVisual.style.setProperty(
          "--hb-light-visual-blur",
          Math.round(15 + lightVisualBrightness * 1.14) + "px"
        );
        entityLightVisual.style.setProperty(
          "--hb-light-visual-scale",
          String(0.62 + (lightVisualBrightness / 100) * 1.05)
        );
        lightVisualStatus.textContent = lightVisualSnapshot.isOn
          ? Math.round(lightVisualBrightness) + "%  ·  " + Math.round(lightVisualKelvin) + "K"
          : "灯光已关闭";
        entityLightVisual.setAttribute("aria-label", lightVisualStatus.textContent);
      };
      applyLightVisualState = (lightStateInput = {}) => {
        const lightUpdateAttributes = lightStateInput.attributes || {};
        if (typeof lightStateInput.isOn == "boolean") {
          lightVisualSnapshot.isOn = lightStateInput.isOn;
        } else if (typeof lightStateInput.state == "string") {
          lightVisualSnapshot.isOn = lightStateInput.state === "on";
        }
        if (Number.isFinite(Number(lightStateInput.brightnessPercent))) {
          lightVisualSnapshot.brightnessPercent = Number(lightStateInput.brightnessPercent);
        } else if (Number.isFinite(Number(lightUpdateAttributes.brightness))) {
          lightVisualSnapshot.brightnessPercent =
            (Number(lightUpdateAttributes.brightness) / 255) * 100;
        }
        if (Number.isFinite(Number(lightStateInput.colorTemperatureKelvin))) {
          lightVisualSnapshot.colorTemperatureKelvin = Number(
            lightStateInput.colorTemperatureKelvin
          );
        } else if (Number.isFinite(Number(lightUpdateAttributes.color_temp_kelvin))) {
          lightVisualSnapshot.colorTemperatureKelvin = Number(
            lightUpdateAttributes.color_temp_kelvin
          );
        } else if (Number.isFinite(Number(lightUpdateAttributes.color_temp))) {
          lightVisualSnapshot.colorTemperatureKelvin =
            1000000 / Number(lightUpdateAttributes.color_temp);
        }
        if (supportsLightColor && Array.isArray(lightStateInput.colorRgb)) {
          lightVisualSnapshot.colorRgb = lightStateInput.colorRgb
            .slice(0, 3)
            .map(updateRgbChannel => Number(updateRgbChannel) || 0);
        } else if (supportsLightColor && Array.isArray(lightUpdateAttributes.rgb_color)) {
          lightVisualSnapshot.colorRgb = lightUpdateAttributes.rgb_color
            .slice(0, 3)
            .map(attributeRgbChannel => Number(attributeRgbChannel) || 0);
        } else if (supportsLightColor && Array.isArray(lightUpdateAttributes.hs_color)) {
          lightVisualSnapshot.colorRgb = hsToRgbColor(lightUpdateAttributes.hs_color);
        }
        renderEntityLightVisual();
      };
      renderEntityLightVisual();
    }
    if (isCover) {
      entityCoverVisual = document.createElement("button");
      entityCoverVisual.type = "button";
      entityCoverVisual.className = "hb-cover-visual";
      entityCoverVisual.inert = detailsPreview;
      entityCoverVisual.setAttribute("aria-disabled", String(detailsPreview));
      const coverRailVisual = document.createElement("i");
      coverRailVisual.className = "hb-cover-visual-rail";
      const coverLeftPanelVisual = document.createElement("i");
      coverLeftPanelVisual.className = "hb-cover-visual-panel left";
      const coverRightPanelVisual = document.createElement("i");
      coverRightPanelVisual.className = "hb-cover-visual-panel right";
      const coverSlatContainer = document.createElement("span");
      coverSlatContainer.className = "hb-cover-visual-slats";
      const coverSlatTotal = 13;
      for (let slatOrdinal = 0; slatOrdinal < coverSlatTotal; slatOrdinal += 1) {
        const slatElement = document.createElement("span");
        slatElement.className = "hb-cover-visual-slat";
        const slatInnerElement = document.createElement("i");
        slatElement.style.setProperty("--hb-cover-slat-index", String(slatOrdinal));
        const slatDelayOrder =
          coverSplitDirection === "right"
            ? coverSlatTotal - 1 - slatOrdinal
            : coverSplitDirection === "split"
              ? Math.abs((coverSlatTotal - 1) / 2 - slatOrdinal)
              : slatOrdinal;
        slatElement.style.setProperty("--hb-cover-slat-delay-index", String(slatDelayOrder));
        const slatRetractedShiftPx =
          coverSplitDirection === "left"
            ? -slatOrdinal * 14.5
            : coverSplitDirection === "right"
              ? (coverSlatTotal - 1 - slatOrdinal) * 14.5
              : slatOrdinal <= (coverSlatTotal - 1) / 2
                ? -slatOrdinal * 14.5
                : (coverSlatTotal - 1 - slatOrdinal) * 14.5;
        slatElement.style.setProperty("--hb-cover-retracted-shift", slatRetractedShiftPx + "px");
        slatElement.append(slatInnerElement);
        coverSlatContainer.append(slatElement);
      }
      const coverWindowVisual = document.createElement("i");
      coverWindowVisual.className = "hb-cover-visual-window";
      entityCoverVisual.classList.toggle("is-dream", isDreamCover);
      entityCoverVisual.classList.toggle("is-airer", isAirerDevice);
      entityCoverVisual.classList.add("direction-" + coverSplitDirection);
      entityCoverVisual.append(
        coverWindowVisual,
        coverRailVisual,
        coverLeftPanelVisual,
        coverRightPanelVisual,
        coverSlatContainer
      );
      if (isAirerDevice) {
        appendAirerVisual(entityCoverVisual);
      }
      renderAirerLight = (nextAirerLightState = airerLightCurrentState) => {
        if (!isAirerDevice) {
          return;
        }
        airerLightCurrentState = nextAirerLightState || airerLightCurrentState;
        const isAirerLightOffline =
          !airerLightRelatedEntityId ||
          ["unknown", "unavailable"].includes(String(airerLightCurrentState?.state || "unknown"));
        const airerLightIsOn = airerLightCurrentState?.state === "on";
        entityCoverVisual.classList.toggle("is-light-on", airerLightIsOn && !isAirerLightOffline);
        entityCoverVisual.classList.toggle("is-light-unavailable", isAirerLightOffline);
        entityCoverVisual.disabled = detailsPreview || isAirerLightOffline;
        entityCoverVisual.setAttribute(
          "aria-pressed",
          String(airerLightIsOn && !isAirerLightOffline)
        );
        entityCoverVisual.setAttribute(
          "aria-label",
          isAirerLightOffline
            ? "晾衣机灯光实体不可用"
            : "晾衣机灯光" + (airerLightIsOn ? "已开启，点击关闭" : "已关闭，点击开启")
        );
      };
      renderAirerLight();
      renderCoverPosition = ({
        position: coverPosition = 0,
        state: coverCommandPositionState = ""
      } = {}) => {
        const normalizedCoverPosition = Math.max(0, Math.min(100, Number(coverPosition) || 0));
        const coverPresentation = coverPresentationState(
          {
            state: coverCommandPositionState,
            attributes: {
              current_position: normalizedCoverPosition
            }
          },
          isCoverMotorPolarityReversed
        );
        const currentPhysicalState = physicalCoverState(
          coverCommandPositionState || coverPhysicalStateText,
          isCoverMotorPolarityReversed
        );
        const isCoverOpen = currentPhysicalState === "open" || currentPhysicalState === "opening";
        coverOpenPosition = normalizedCoverPosition;
        entityCoverVisual.style.setProperty(
          "--hb-cover-open-position",
          normalizedCoverPosition + "%"
        );
        entityCoverVisual.style.setProperty(
          "--hb-airer-drop",
          airerVisualDrop(normalizedCoverPosition) + "px"
        );
        entityCoverVisual.style.setProperty(
          "--hb-cover-panel-width",
          45.9 - normalizedCoverPosition * 0.331 + "%"
        );
        entityCoverVisual.style.setProperty(
          "--hb-cover-single-panel-width",
          91.8 - normalizedCoverPosition * 0.79 + "%"
        );
        entityCoverVisual.style.setProperty(
          "--hb-cover-slat-angle",
          normalizedCoverPosition * 1.8 + "deg"
        );
        entityCoverVisual.classList.toggle("is-tilt-reversed", normalizedCoverPosition > 50);
        entityCoverVisual.classList.toggle(
          "is-tilt-center",
          Math.abs(normalizedCoverPosition - 50) <= 2
        );
        entityCoverVisual.classList.toggle(
          "is-open",
          isDreamCover
            ? isCoverOpen
            : coverPresentation === "open" || coverPresentation === "opening"
        );
        entityCoverVisual.classList.toggle(
          "is-moving",
          coverCommandPositionState === "opening" || coverCommandPositionState === "closing"
        );
        entityCoverVisual.setAttribute(
          "aria-pressed",
          String(
            isDreamCover
              ? isCoverOpen
              : coverPresentation === "open" || coverPresentation === "opening"
          )
        );
        if (!isAirerDevice) {
          entityCoverVisual.setAttribute(
            "aria-label",
            isDreamCover
              ? "" +
                  componentDialogTitle(detailsComponent, "梦幻帘") +
                  dreamCurtainStatusText(
                    coverCommandPositionState || coverPhysicalStateText,
                    normalizedCoverPosition,
                    isCoverMotorPolarityReversed
                  )
              : "" +
                  componentDialogTitle(detailsComponent, "窗帘") +
                  (coverPresentation === "open" || coverPresentation === "opening"
                    ? "已打开，点击关闭"
                    : "已关闭，点击打开")
          );
        }
      };
      renderCoverPosition({
        position: Number.isFinite(
          Number(entityAttributes[isTiltCover ? "current_tilt_position" : "current_position"])
        )
          ? Number(entityAttributes[isTiltCover ? "current_tilt_position" : "current_position"])
          : detailsEntityState?.state === "open"
            ? 100
            : 0,
        state: detailsEntityState?.state
      });
      entityCoverVisual.addEventListener("click", async () => {
        if (detailsPreview || isCoverCommandPending) {
          return;
        }
        isCoverCommandPending = true;
        entityCoverVisual.setAttribute("aria-busy", "true");
        if (isAirerDevice) {
          const previousAirerLightSnapshot = airerLightCurrentState;
          renderAirerLight({
            ...(airerLightCurrentState || {}),
            state: airerLightCurrentState?.state === "on" ? "off" : "on"
          });
          try {
            await this.callEntityService("homeassistant", "toggle", airerLightRelatedEntityId);
          } catch (airerLightError) {
            renderAirerLight(previousAirerLightSnapshot);
            this.options.onError?.(airerLightError);
          } finally {
            isCoverCommandPending = false;
            entityCoverVisual.removeAttribute("aria-busy");
          }
          return;
        }
        const previousCoverPositionValue = coverOpenPosition;
        const dreamCurtainRetractedState =
          detailsControls?.isDreamCurtainRetracted?.() ??
          entityCoverVisual.dataset.curtainRetracted === "true";
        const isCoverOffClosedPosition = previousCoverPositionValue > COVER_CLOSED_POSITION_EPSILON;
        if (isDreamCover) {
          detailsControls?.beginDreamCurtainMotion?.(!dreamCurtainRetractedState);
        }
        if (!isDreamCover) {
          detailsControls?.beginCoverMotion?.(
            isCoverOffClosedPosition ? 0 : 100,
            isCoverOffClosedPosition ? "closing" : "opening"
          );
        }
        try {
          await this.callEntityService(
            "cover",
            isDreamCover
              ? dreamCurtainToggleService(
                  dreamCurtainRetractedState,
                  coverSecondaryService,
                  coverPrimaryService
                )
              : isCoverOffClosedPosition
                ? coverPrimaryService
                : coverSecondaryService,
            resolvedDetailsEntityId
          );
        } catch (coverCommandError) {
          if (isDreamCover) {
            detailsControls?.cancelDreamCurtainMotion?.();
            detailsControls?.setDreamCurtainRetracted?.(dreamCurtainRetractedState, false);
          } else {
            detailsControls?.cancelCoverMotion?.();
          }
          detailsControls?.syncCoverState?.(detailsEntityState);
          renderCoverPosition({
            position: previousCoverPositionValue,
            state: detailsEntityState?.state
          });
          this.options.onError?.(coverCommandError);
        } finally {
          isCoverCommandPending = false;
          entityCoverVisual.removeAttribute("aria-busy");
        }
      });
    }
    if (isClimateDetails) {
      const climateVisualContext = {
        entityId: resolvedDetailsEntityId,
        entityMetadata: this.entityMetadata,
        entityTranslations: this.entityTranslations
      };
      entityClimateVisual = document.createElement("button");
      entityClimateVisual.type = "button";
      entityClimateVisual.className = "hb-climate-visual";
      entityClimateVisual.classList.toggle(
        "is-bath-heater",
        resolvedClimateDeviceType === "bath-heater"
      );
      entityClimateVisual.classList.toggle(
        "is-water-heater",
        resolvedClimateDeviceType === "water-heater"
      );
      entityClimateVisual.inert = detailsPreview;
      entityClimateVisual.setAttribute("aria-disabled", String(detailsPreview));
      const climateBodyElement = document.createElement("div");
      climateBodyElement.className = "hb-climate-visual-unit";
      const climateBrandLabel = document.createElement("span");
      climateBrandLabel.className = "hb-climate-visual-brand";
      climateBrandLabel.textContent =
        resolvedClimateDeviceType === "bath-heater"
          ? "BATH HEATER"
          : resolvedClimateDeviceType === "water-heater"
            ? "SMART WATER"
            : "SMART AIR";
      const climateDisplayText = document.createElement("strong");
      climateDisplayText.className = "hb-climate-visual-display";
      const climateVentRow = document.createElement("div");
      climateVentRow.className = "hb-climate-visual-vent";
      for (let ventSlotIndex = 0; ventSlotIndex < 5; ventSlotIndex += 1) {
        climateVentRow.append(document.createElement("i"));
      }
      climateBodyElement.append(climateBrandLabel, climateDisplayText, climateVentRow);
      const climateAirflowRow = document.createElement("div");
      climateAirflowRow.className = "hb-climate-visual-airflow";
      for (let airflowSlotIndex = 0; airflowSlotIndex < 3; airflowSlotIndex += 1) {
        climateAirflowRow.append(document.createElement("i"));
      }
      entityClimateVisual.append(climateBodyElement, climateAirflowRow);
      renderClimateVisual = ({
        mode: climateModeName = "off",
        visualMode: climateVisualModeName = "off",
        running: isClimateUnitRunning = false,
        accentColor: climateAccentColorRgb = "#65717a",
        targetTemperature: targetTemperatureCelsius
      } = {}) => {
        const isClimateUnitOn = climateVisualModeName !== "off";
        entityClimateVisual.classList.toggle("is-on", isClimateUnitOn);
        entityClimateVisual.classList.toggle("is-running", isClimateUnitRunning);
        entityClimateVisual.classList.toggle(
          "is-airflow-mode",
          resolvedClimateDeviceType === "bath-heater" &&
            isClimateUnitOn &&
            bathHeaterModeUsesAirflow(climateModeName)
        );
        entityClimateVisual.dataset.visualMode = climateVisualModeName;
        entityClimateVisual.style.setProperty("--hb-climate-visual-accent", climateAccentColorRgb);
        const hasTemperatureReading =
          targetTemperatureCelsius != null &&
          targetTemperatureCelsius !== "" &&
          Number.isFinite(Number(targetTemperatureCelsius));
        climateDisplayText.textContent = isClimateUnitOn
          ? hasTemperatureReading
            ? Number(targetTemperatureCelsius) + "°"
            : climateModeLabel(climateModeName, resolvedClimateDeviceType, climateVisualContext)
          : "OFF";
      };
    }
    if (isSwitchLike) {
      const switchVisualParts = createSwitchVisual({
        label: switchDialogTitle,
        interactive: !detailsPreview,
        momentary: isMomentaryButton,
        onToggle: () => toggleEntityPower?.()
      });
      switchVisualElement = switchVisualParts.visual;
      syncSwitchVisual = switchVisualParts.sync;
      syncSwitchVisual(resolvePowerOn(detailsEntityState?.state), {
        unavailable: ["unknown", "unavailable"].includes(detailsEntityState?.state)
      });
    }
    const powerToggleElement = document.createElement(hasPowerToggle ? "button" : "div");
    powerToggleElement.className = "hb-entity-details-state";
    if (hasPowerToggle) {
      powerToggleElement.type = "button";
    }
    const powerIconElement = document.createElement("span");
    powerIconElement.textContent = hasPowerToggle ? "⏻" : "当前状态";
    const powerStateTextElement = document.createElement("strong");
    const hvacModeLabels = {
      off: "关闭",
      auto: "自动",
      cool: "制冷",
      dry: "除湿",
      heat: "制热",
      fan_only: "送风",
      heat_cool: "冷暖自动"
    };
    powerStateTextElement.textContent = hasPowerToggle
      ? detailsEntityState?.state
        ? resolvePowerOn(detailsEntityState.state)
          ? "已开启"
          : "已关闭"
        : "状态未知"
      : detailsEntityDomain === "climate"
        ? hvacModeLabels[detailsEntityState?.state] || detailsEntityState?.state || "暂无状态"
        : (detailsEntityState?.state ?? "暂无状态");
    powerToggleElement.classList.toggle("hb-light-details-power", isLightDetails);
    powerToggleElement.classList.toggle("hb-climate-details-power", isClimateDetails);
    powerToggleElement.classList.toggle("hb-switch-details-power", isSwitchLike);
    powerToggleElement.classList.toggle(
      "is-on",
      hasPowerToggle && resolvePowerOn(detailsEntityState?.state)
    );
    powerToggleElement.append(powerIconElement, powerStateTextElement);
    if (hasPowerToggle) {
      powerToggleElement.inert = detailsPreview;
      powerToggleElement.setAttribute("aria-disabled", String(detailsPreview));
      renderPowerState = (
        powerIsOn,
        { unavailable: powerIsUnavailable = false, syncClimate: shouldSyncClimate = true } = {}
      ) => {
        powerToggleElement.classList.toggle("is-on", powerIsOn);
        powerToggleElement.classList.toggle("is-unavailable", powerIsUnavailable);
        powerToggleElement.setAttribute("aria-pressed", String(powerIsOn));
        powerToggleElement.disabled = powerIsUnavailable || detailsPreview;
        powerStateTextElement.textContent = powerIsUnavailable
          ? "当前不可用"
          : isMomentaryButton
            ? buttonActionStatus === "success"
              ? "执行成功"
              : isEntityTogglePending
                ? "执行中"
                : "等待执行"
            : powerIsOn
              ? "已开启"
              : "已关闭";
        powerToggleElement.setAttribute(
          "aria-label",
          powerIsUnavailable
            ? (isLightDetails
                ? componentDialogTitle(detailsComponent, "灯光")
                : isClimateDetails
                  ? climateDialogTitle
                  : switchDialogTitle) + "当前不可用"
            : isMomentaryButton
              ? "" +
                switchDialogTitle +
                (buttonActionStatus === "success"
                  ? "执行成功"
                  : isEntityTogglePending
                    ? "正在执行"
                    : "，点击执行")
              : "" +
                componentDialogTitle(
                  detailsComponent,
                  isLightDetails ? "灯光" : isClimateDetails ? climateTypeLabel : "开关"
                ) +
                (powerIsOn ? "已开启，点击关闭" : "已关闭，点击开启")
        );
        if (isLightDetails) {
          applyLightVisualState?.({
            isOn: powerIsOn
          });
          lightStatusText.textContent = powerIsOn ? "已开启" : "已关闭";
          lightStatusText.classList.toggle("is-on", powerIsOn);
          entityLightVisual.setAttribute("aria-pressed", String(powerIsOn));
          entityLightVisual.setAttribute(
            "aria-label",
            "" +
              componentDialogTitle(detailsComponent, "灯光") +
              (powerIsOn ? "已开启，点击关闭" : "已关闭，点击开启")
          );
        }
        if (isClimateDetails && detailsControls?.syncClimateState && shouldSyncClimate) {
          const climateCapabilitySet = normalizeClimateCapabilities(
            latestEntityState || detailsEntityState
          );
          const defaultClimateMode =
            resolvedClimateDeviceType === "water-heater"
              ? climateCapabilitySet.operationModes.find(
                  operationModeName =>
                    !["off", "空"].includes(String(operationModeName).trim().toLowerCase())
                ) || "普通"
              : climateCapabilitySet.hvacModes.find(hvacModeName => hvacModeName !== "off") ||
                (resolvedClimateDeviceType === "bath-heater" ? "heat" : "auto");
          const currentClimateMode =
            detailsControls.dataset.lastClimateMode ||
            (detailsEntityState?.state && detailsEntityState.state !== "off"
              ? detailsEntityState.state
              : defaultClimateMode);
          detailsControls.syncClimateState({
            state: powerIsOn
              ? resolvedClimateDeviceType === "water-heater"
                ? "on"
                : currentClimateMode
              : "off",
            attributes: {
              ...(latestEntityState?.attributes || detailsEntityState?.attributes || {}),
              operation_mode:
                resolvedClimateDeviceType === "water-heater"
                  ? powerIsOn
                    ? latestEntityState?.attributes?.operation_mode || defaultClimateMode
                    : "off"
                  : undefined,
              hvac_action:
                resolvedClimateDeviceType === "water-heater"
                  ? undefined
                  : powerIsOn
                    ? detailsEntityState?.attributes?.hvac_action || currentClimateMode
                    : "off"
            }
          });
        }
        if (isClimateDetails) {
          climateStatusText.textContent =
            resolvedClimateDeviceType === "water-heater"
              ? waterHeaterStatusLabel({
                  ...(latestEntityState || detailsEntityState || {}),
                  state: powerIsOn ? "on" : "off"
                })
              : powerIsOn
                ? "已开启"
                : "已关闭";
          climateStatusText.classList.toggle("is-on", powerIsOn);
          if (resolvedClimateDeviceType === "bath-heater") {
            if (!bathHeaterLightController) {
              entityClimateVisual.setAttribute("aria-pressed", "false");
            }
            entityClimateVisual.setAttribute("aria-label", climateDialogTitle + "，点击切换浴霸灯");
          } else {
            entityClimateVisual.setAttribute("aria-pressed", String(powerIsOn));
            entityClimateVisual.setAttribute(
              "aria-label",
              "" + climateDialogTitle + (powerIsOn ? "已开启，点击关闭" : "已关闭，点击开启")
            );
          }
        }
        if (isSwitchLike) {
          syncSwitchVisual?.(powerIsOn, {
            pending: isEntityTogglePending && buttonActionStatus !== "success",
            success: buttonActionStatus === "success",
            unavailable: powerIsUnavailable
          });
          switchStatusText.textContent = powerIsUnavailable
            ? "当前不可用"
            : isMomentaryButton
              ? buttonActionStatus === "success"
                ? "执行成功"
                : isEntityTogglePending
                  ? "正在执行"
                  : "按下执行"
              : powerIsOn
                ? "已开启"
                : "已关闭";
          switchStatusText.classList.toggle(
            "is-on",
            (isMomentaryButton
              ? isEntityTogglePending || buttonActionStatus === "success"
              : powerIsOn) && !powerIsUnavailable
          );
        }
      };
      if (detailsEntityState?.state) {
        renderPowerState(resolvePowerOn(detailsEntityState.state), {
          unavailable: ["unknown", "unavailable"].includes(detailsEntityState.state)
        });
      }
      toggleEntityPower = async () => {
        if (detailsPreview || isEntityTogglePending || !latestEntityState?.state) {
          return;
        }
        isEntityTogglePending = true;
        const pendingVisualElement = isLightDetails
          ? entityLightVisual
          : isClimateDetails
            ? entityClimateVisual
            : switchVisualElement;
        pendingVisualElement?.setAttribute("aria-busy", "true");
        const isPowerCurrentlyOn = powerToggleElement.classList.contains("is-on");
        const nextPowerState = isMomentaryButton || !isPowerCurrentlyOn;
        renderPowerState(nextPowerState);
        try {
          if (isMomentaryButton) {
            await this.callEntityService("button", "press", resolvedDetailsEntityId);
            buttonActionStatus = "success";
            renderPowerState(false);
            await new Promise(resolveTimeout => window.setTimeout(resolveTimeout, 900));
          } else if (isClimateDetails) {
            if (!nextPowerState && resolvedClimateDeviceType === "bath-heater") {
              const bathHeaterIdlePreset = normalizeClimateCapabilities(
                latestEntityState
              ).presetModes.find(presetModeName =>
                ["idle", "standby", "待机", "关闭"].includes(
                  String(presetModeName).trim().toLowerCase()
                )
              );
              if (bathHeaterIdlePreset) {
                await this.callEntityService(
                  detailsEntityDomain === "fan" ? "fan" : "climate",
                  "set_preset_mode",
                  resolvedDetailsEntityId,
                  {
                    preset_mode: bathHeaterIdlePreset
                  }
                );
              }
            }
            const climatePowerServiceRequest = climatePowerCommand(
              resolvedDetailsEntityId,
              latestEntityState,
              nextPowerState,
              resolvedClimateDeviceType,
              detailsControls?.dataset.lastClimateMode || ""
            );
            await this.callEntityService(
              climatePowerServiceRequest.domain,
              climatePowerServiceRequest.service,
              resolvedDetailsEntityId,
              climatePowerServiceRequest.data
            );
          } else {
            await this.callEntityService("homeassistant", "toggle", resolvedDetailsEntityId);
          }
        } catch (powerToggleFailure) {
          buttonActionStatus = "idle";
          renderPowerState(isPowerCurrentlyOn);
          this.options.onError?.(powerToggleFailure);
        } finally {
          isEntityTogglePending = false;
          if (isMomentaryButton) {
            buttonActionStatus = "idle";
            renderPowerState(false);
          } else if (isSwitchLike) {
            syncSwitchVisual?.(powerToggleElement.classList.contains("is-on"));
          }
          pendingVisualElement?.removeAttribute("aria-busy");
        }
      };
      powerToggleElement.addEventListener("click", toggleEntityPower);
      if (isLightDetails) {
        entityLightVisual.addEventListener("click", toggleEntityPower);
      }
      if (isClimateDetails) {
        entityClimateVisual.addEventListener("click", () => {
          if (resolvedClimateDeviceType === "bath-heater") {
            if (bathHeaterLightController?.toggleBathLight) {
              bathHeaterLightController.toggleBathLight();
            } else {
              this.options.onError?.(new Error("未找到与浴霸同设备的灯光实体。"));
            }
            return;
          }
          toggleEntityPower();
        });
      }
    }
    const createClimateControls = isClimateDetails
      ? climateState =>
          this.createClimateDetailsControls(resolvedDetailsEntityId, climateState, {
            interactive: !detailsPreview,
            deviceType: resolvedClimateDeviceType,
            onPowerChange: powerChangeValue =>
              renderPowerState?.(powerChangeValue, {
                syncClimate: false
              }),
            onVisualChange: ({
              mode: updatedMode,
              visualMode: updatedVisualMode,
              running: updatedRunning,
              accentColor: updatedAccentColor,
              accentSoft: updatedAccentSoftColor,
              targetTemperature: updatedTargetTemperature
            }) => {
              powerToggleElement.classList.toggle("is-running", updatedRunning);
              powerToggleElement.style.setProperty("--hb-climate-accent", updatedAccentColor);
              powerToggleElement.style.setProperty(
                "--hb-climate-accent-soft",
                updatedAccentSoftColor
              );
              climateStatusText.style.setProperty("--hb-climate-accent", updatedAccentColor);
              if (resolvedClimateDeviceType === "water-heater") {
                climateStatusText.textContent =
                  updatedVisualMode === "off" ? "已关闭" : updatedRunning ? "正在加热" : "保温中";
              }
              renderClimateVisual?.({
                mode: updatedMode,
                visualMode: updatedVisualMode,
                running: updatedRunning,
                accentColor: updatedAccentColor,
                targetTemperature: updatedTargetTemperature
              });
            },
            modeColors: {
              cool: detailsComponent.properties?.airflowCoolColor || "#73c8ff",
              heat: detailsComponent.properties?.airflowHeatColor || "#ff8a65",
              other: detailsComponent.properties?.airflowOtherColor || "#dce2e6"
            }
          })
      : null;
    detailsControls = isLightDetails
      ? this.createLightDetailsControls(resolvedDetailsEntityId, detailsEntityState, {
          interactive: !detailsPreview,
          onTurnOn: () => renderPowerState?.(true),
          onVisualChange: lightVisualUpdate => applyLightVisualState?.(lightVisualUpdate)
        })
      : isClimateDetails
        ? createClimateControls(detailsEntityState)
        : isCover
          ? this.createCoverDetailsControls(resolvedDetailsEntityId, detailsEntityState, {
              interactive: !detailsPreview,
              dream: isDreamCover,
              airer: isAirerDevice,
              tilt: isTiltCover,
              motorReversed: isCoverMotorPolarityReversed,
              positionState: airerPositionSensorCurrentState,
              positionCommandEntityId: airerPositionNumberEntityId,
              positionCommandState: airerPositionCurrentState,
              motorState: airerMotorSpeedCurrentState,
              airerActionEntityIds: airerActionEntityIdMap,
              positionCalibration: airerLiftCalibration,
              onVisualChange: ({ position: updatedPosition, state: updatedPositionState }) => {
                if (updatedPositionState) {
                  coverPhysicalStateText = updatedPositionState;
                }
                renderCoverPosition?.({
                  position: updatedPosition,
                  state: updatedPositionState
                });
                const updatedCoverPresentation = coverPresentationState(
                  {
                    state: updatedPositionState,
                    attributes: {
                      current_position: updatedPosition
                    }
                  },
                  isCoverMotorPolarityReversed
                );
                const coverMovementLabels = {
                  open: "已打开",
                  closed: "已关闭",
                  opening: "正在打开",
                  closing: "正在关闭"
                };
                const updatedPhysicalState = physicalCoverState(
                  coverPhysicalStateText,
                  isCoverMotorPolarityReversed
                );
                coverStatusText.textContent = isAirerDevice
                  ? airerPositionLabel(updatedCoverPresentation) ||
                    Math.round(updatedPosition) + "%"
                  : isDreamCover
                    ? dreamCurtainStatusText(
                        coverPhysicalStateText,
                        updatedPosition,
                        isCoverMotorPolarityReversed
                      )
                    : coverMovementLabels[updatedCoverPresentation] ||
                      Math.round(updatedPosition) + "%";
                coverStatusText.classList.toggle(
                  "is-on",
                  isDreamCover
                    ? updatedPhysicalState === "open" || updatedPhysicalState === "opening"
                    : updatedCoverPresentation === "open" || updatedCoverPresentation === "opening"
                );
              },
              onCurtainPositionChange: ({ retracted: curtainRetracted, moving: curtainMoving }) => {
                entityCoverVisual.classList.toggle("is-curtain-retracted", curtainRetracted);
                entityCoverVisual.classList.toggle("is-curtain-moving", curtainMoving);
                entityCoverVisual.dataset.curtainRetracted = String(curtainRetracted);
                if (isDreamCover) {
                  coverStatusText.textContent = dreamCurtainStatusFromRetraction(
                    curtainRetracted,
                    curtainMoving,
                    coverOpenPosition
                  );
                  coverStatusText.classList.toggle("is-on", curtainRetracted);
                }
              }
            })
          : null;
    if (isLightDetails && detailsControls?.classList.contains("has-color-picker")) {
      entityDialog.classList.add("color-picker-details");
    }
    if (
      isClimateDetails &&
      resolvedClimateDeviceType === "water-heater" &&
      detailsControls &&
      entityClimateVisual
    ) {
      detailsControls.prepend(entityClimateVisual);
      detailsControls.syncClimateGrid?.();
    }
    const bathHeaterLightRoleEntityId =
      (isClimateDetails &&
        resolvedClimateDeviceType === "bath-heater" &&
        deviceProfile?.roles?.light) ||
      "";
    bathHeaterLightEntityId =
      (bathHeaterLightRoleEntityId
        ? this.entityMetadata.get(bathHeaterLightRoleEntityId)
        : isClimateDetails && resolvedClimateDeviceType === "bath-heater"
          ? relatedDeviceDomainEntity(this.entityMetadata, resolvedDetailsEntityId, "light")
          : null
      )?.entityId || "";
    if (bathHeaterLightEntityId && detailsControls) {
      const bathLightStateSnapshot = this.states.get(bathHeaterLightEntityId);
      const bathLightResolvedState = bathLightStateSnapshot?.newState ||
        bathLightStateSnapshot || {
          state: "unknown",
          attributes: {}
        };
      bathHeaterLightController = this.createBathHeaterLightControl(
        bathHeaterLightEntityId,
        bathLightResolvedState,
        {
          interactive: !detailsPreview,
          onStateChange: ({ isOn: bathLightIsOn, unavailable: bathLightIsUnavailable }) => {
            entityClimateVisual?.classList.toggle(
              "is-light-on",
              bathLightIsOn && !bathLightIsUnavailable
            );
            entityClimateVisual?.setAttribute(
              "aria-pressed",
              String(bathLightIsOn && !bathLightIsUnavailable)
            );
          }
        }
      );
      detailsControls.append(bathHeaterLightController);
      detailsControls.syncClimateGrid?.();
    }
    const refreshRelatedExtensions =
      isClimateDetails &&
      (resolvedClimateDeviceType === "water-heater" || selectedRelatedIds !== null)
        ? () => {
            const previousExtensionIds = relatedExtensionEntityIds;
            const extensionControls = this.createWaterHeaterExtensionControls(
              resolvedDetailsEntityId,
              {
                component: detailsComponent,
                interactive: !detailsPreview,
                excludedEntityIds: bathHeaterLightEntityId ? [bathHeaterLightEntityId] : []
              }
            );
            relatedExtensionsControl?.remove();
            relatedExtensionsControl = extensionControls;
            relatedExtensionEntityIds = new Set(extensionControls?.relatedEntityIds || []);
            detailsControls?.classList.toggle(
              "has-multiline-water-heater-extensions",
              resolvedClimateDeviceType === "water-heater" &&
                Number(extensionControls?.dataset?.controlCount || 0) > 2
            );
            if (resolvedClimateDeviceType !== "water-heater" && entityDialogCard.isConnected) {
              entityDialog.classList.toggle("has-related-extensions", !!extensionControls);
            }
            if (extensionControls && detailsControls) {
              if (resolvedClimateDeviceType === "water-heater") {
                (detailsControls.waterHeaterControlPanel || detailsControls).append(
                  extensionControls
                );
                detailsControls.syncClimateGrid?.();
              } else if (entityDialogCard.isConnected) {
                entityDialogCard.append(extensionControls);
                entityDialog.classList.add("has-related-extensions");
              }
            }
            const runtimeStateHandlers = this.detailsStateSync?.handlers;
            if (runtimeStateHandlers) {
              for (const staleExtensionId of previousExtensionIds) {
                runtimeStateHandlers.delete(staleExtensionId);
              }
              for (const [
                extensionHandlerEntityId,
                extensionHandlerList
              ] of extensionControls?.stateHandlers || []) {
                runtimeStateHandlers.set(extensionHandlerEntityId, extensionHandlerList);
                const extensionEntityState = this.states.get(extensionHandlerEntityId);
                if (extensionEntityState) {
                  for (const extensionStateHandler of extensionHandlerList) {
                    extensionStateHandler(extensionEntityState.newState || extensionEntityState);
                  }
                }
              }
            }
          }
        : null;
    refreshRelatedExtensions?.();
    let lineChartCurrentVisual =
      detailsComponent.type === "line-chart"
        ? renderLineChartDetails(detailsComponent, {
            states: this.states,
            history: this.historySeries,
            renderNamespace: this.renderNamespace
          })
        : null;
    let chartVisualSection = null;
    let chartCurrentValue = null;
    let chartCurrentUnit = null;
    const attributesListElement = document.createElement("dl");
    attributesListElement.className = "hb-entity-details-attributes";
    for (const [entityAttributeName, attributeValue] of Object.entries(entityAttributes).filter(
      ([entityAttributeKey]) => entityAttributeKey !== "friendly_name"
    )) {
      const attributeRow = document.createElement("div");
      const attributeTerm = document.createElement("dt");
      attributeTerm.textContent = entityAttributeName;
      const attributeDescription = document.createElement("dd");
      attributeDescription.textContent =
        typeof attributeValue == "string" ? attributeValue : JSON.stringify(attributeValue);
      attributeRow.append(attributeTerm, attributeDescription);
      attributesListElement.append(attributeRow);
    }
    if (lineChartCurrentVisual) {
      chartVisualSection = document.createElement("section");
      chartVisualSection.className = "hb-line-chart-current-visual";
      chartVisualSection.style.setProperty(
        "--hb-chart-current-color",
        lineChartCurrentVisual.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e"
      );
      chartCurrentValue = document.createElement("strong");
      const chartNumericValue = Number.parseFloat(detailsEntityState?.state);
      chartCurrentValue.textContent = Number.isFinite(chartNumericValue)
        ? formatLineChartValue(chartNumericValue, detailsComponent.properties?.statePrecision)
        : detailsEntityState?.state || "--";
      chartCurrentUnit = document.createElement("small");
      chartCurrentUnit.textContent = String(entityAttributes.unit_of_measurement || "实时数值");
      chartVisualSection.append(chartCurrentValue, chartCurrentUnit);
      powerToggleElement.style.setProperty(
        "--hb-chart-current-color",
        lineChartCurrentVisual.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e"
      );
      powerIconElement.textContent = "●";
      powerStateTextElement.textContent = "实时数据";
      entityDialogCard.append(entityDialogHeading, chartVisualSection, lineChartCurrentVisual);
    } else if (isClimateDetails) {
      entityDialogCard.append(
        entityDialogHeading,
        ...(resolvedClimateDeviceType === "water-heater"
          ? [detailsControls]
          : [entityClimateVisual, detailsControls]),
        ...(resolvedClimateDeviceType !== "water-heater" && relatedExtensionsControl
          ? [relatedExtensionsControl]
          : [])
      );
      entityDialog.classList.toggle(
        "has-related-extensions",
        resolvedClimateDeviceType !== "water-heater" && !!relatedExtensionsControl
      );
    } else if (isLightDetails) {
      const lightLayoutElement = document.createElement("div");
      lightLayoutElement.className = "hb-light-details-layout";
      const lightPanelElement = document.createElement("section");
      lightPanelElement.className = "hb-light-details-panel";
      lightPanelElement.append(...(detailsControls ? [detailsControls] : []));
      lightLayoutElement.append(lightPanelElement, entityLightVisual);
      entityDialogCard.append(entityDialogHeading, lightLayoutElement);
    } else if (isSwitchLike) {
      const switchLayoutElement = document.createElement("div");
      switchLayoutElement.className = "hb-switch-details-layout";
      switchLayoutElement.append(switchVisualElement);
      entityDialogCard.append(entityDialogHeading, switchLayoutElement);
    } else if (isCover) {
      const coverDetailsLayout = document.createElement("div");
      coverDetailsLayout.className = "hb-cover-details-layout";
      const coverPanelElement = document.createElement("section");
      coverPanelElement.className = "hb-cover-details-panel";
      coverPanelElement.append(...(detailsControls ? [detailsControls] : []));
      coverDetailsLayout.append(coverPanelElement, entityCoverVisual);
      entityDialogCard.append(entityDialogHeading, coverDetailsLayout);
    } else if (attributesListElement.childElementCount) {
      entityDialogCard.append(
        entityDialogHeading,
        powerToggleElement,
        ...(detailsControls ? [detailsControls] : []),
        attributesListElement
      );
    } else {
      const emptyAttributesElement = document.createElement("p");
      emptyAttributesElement.className = "hb-entity-details-empty";
      emptyAttributesElement.textContent = "该实体暂无附加属性。";
      attributesListElement.replaceWith(emptyAttributesElement);
      entityDialogCard.append(
        entityDialogHeading,
        powerToggleElement,
        ...(detailsControls ? [detailsControls] : []),
        emptyAttributesElement
      );
    }
    entityDialog.append(entityDialogCard);
    const entityDialogLayer = document.createElement("div");
    entityDialogLayer.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    entityDialogLayer.tabIndex = -1;
    entityDialogLayer.append(entityDialog);
    this.container.append(entityDialogLayer);
    this.detailsDialog = entityDialog;
    const dialogWidth = isClimateDetails
      ? 840
      : detailsComponent.type === "line-chart"
        ? 780
        : isLightDetails || isCover
          ? 760
          : isSwitchLike
            ? 620
            : 460;
    const dialogHeight = isClimateDetails
      ? resolvedClimateDeviceType !== "water-heater" && relatedExtensionsControl
        ? 620
        : 540
      : isLightDetails || isCover
        ? 620
        : isSwitchLike
          ? 500
          : 680;
    this.registerRuntimeDialogScale(entityDialogLayer, entityDialog, dialogWidth, dialogHeight);
    let chartRefreshTimer = 0;
    if (detailsComponent.type === "line-chart" && lineChartCurrentVisual) {
      const refreshLineChartVisual = () => {
        chartRefreshTimer = 0;
        if (
          !lineChartCurrentVisual?.isConnected ||
          this.detailsStateSync?.dialog !== entityDialog
        ) {
          return;
        }
        const nextChartVisual = renderLineChartDetails(detailsComponent, {
          states: this.states,
          history: this.historySeries,
          renderNamespace: this.renderNamespace
        });
        lineChartCurrentVisual.cleanupLineChartHover?.();
        lineChartCurrentVisual.replaceWith(nextChartVisual);
        lineChartCurrentVisual = nextChartVisual;
        chartVisualSection.style.setProperty(
          "--hb-chart-current-color",
          lineChartCurrentVisual.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e"
        );
      };
      const scheduleChartRefresh = (delayMs = 700) => {
        chartRefreshTimer ||= window.setTimeout(
          refreshLineChartVisual,
          Math.max(0, Number(delayMs) || 0)
        );
      };
      this.detailsStateSync = {
        dialog: entityDialog,
        entityId: resolvedDetailsEntityId,
        refreshHistory: () => scheduleChartRefresh(0),
        apply: nextEntityState => {
          const nextChartValue = Number.parseFloat(nextEntityState?.state);
          chartCurrentValue.textContent = Number.isFinite(nextChartValue)
            ? formatLineChartValue(nextChartValue, detailsComponent.properties?.statePrecision)
            : nextEntityState?.state || "--";
          chartCurrentUnit.textContent = String(
            nextEntityState?.attributes?.unit_of_measurement || "实时数值"
          );
          chartStatusText.textContent =
            nextEntityState?.state == null ||
            ["unknown", "unavailable"].includes(nextEntityState.state)
              ? "暂无数据"
              : "实时数据";
          lineChartCurrentVisual.syncLineChartState?.(nextEntityState);
          chartVisualSection.style.setProperty(
            "--hb-chart-current-color",
            lineChartCurrentVisual.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e"
          );
        }
      };
    } else if (hasPowerToggle && renderPowerState) {
      const applyEntityDetailsState = updatedEntityState => {
        latestEntityState = updatedEntityState;
        if (isClimateDetails && createClimateControls && detailsControls) {
          const climateStructureKey = climateControlStructureKey(
            resolvedDetailsEntityId,
            updatedEntityState,
            resolvedClimateDeviceType
          );
          if (detailsControls.dataset.climateStructureKey !== climateStructureKey) {
            const nextClimateControls = createClimateControls(updatedEntityState);
            nextClimateControls.classList.toggle(
              "has-multiline-water-heater-extensions",
              detailsControls.classList.contains("has-multiline-water-heater-extensions")
            );
            nextClimateControls.classList.add("is-runtime-hydrated");
            if (resolvedClimateDeviceType === "water-heater" && entityClimateVisual) {
              nextClimateControls.prepend(entityClimateVisual);
            }
            if (bathHeaterLightController) {
              nextClimateControls.append(bathHeaterLightController);
              nextClimateControls.syncClimateGrid?.();
            }
            if (relatedExtensionsControl && resolvedClimateDeviceType === "water-heater") {
              (nextClimateControls.waterHeaterControlPanel || nextClimateControls).append(
                relatedExtensionsControl
              );
              nextClimateControls.syncClimateGrid?.();
            }
            detailsControls.replaceWith(nextClimateControls);
            detailsControls = nextClimateControls;
          }
        }
        if (updatedEntityState?.state) {
          renderPowerState(
            resolvePowerOn(updatedEntityState.state, updatedEntityState.attributes),
            {
              unavailable: ["unknown", "unavailable"].includes(updatedEntityState.state)
            }
          );
        }
        detailsControls?.syncLightState?.(updatedEntityState);
        detailsControls?.syncClimateState?.(updatedEntityState);
      };
      const detailsStateHandlers = new Map([[resolvedDetailsEntityId, [applyEntityDetailsState]]]);
      if (bathHeaterLightEntityId && bathHeaterLightController) {
        detailsStateHandlers.set(bathHeaterLightEntityId, [
          bathLightState => bathHeaterLightController.syncBathLightState?.(bathLightState)
        ]);
      }
      if (relatedExtensionsControl?.stateHandlers) {
        for (const [
          extensionHandlerKey,
          extensionHandlerGroup
        ] of relatedExtensionsControl.stateHandlers) {
          detailsStateHandlers.set(extensionHandlerKey, extensionHandlerGroup);
        }
      }
      this.detailsStateSync = {
        dialog: entityDialog,
        handlers: detailsStateHandlers,
        refreshEntityCatalog: refreshRelatedExtensions
      };
      if (isClimateDetails && detailsControls?.querySelector(".hb-climate-details-loading")) {
        const climateLoadingStartedAt = Date.now();
        climatePollTimer = window.setInterval(() => {
          const polledEntityState = this.states.get(resolvedDetailsEntityId);
          const polledResolvedState = polledEntityState?.newState || polledEntityState;
          if (polledResolvedState) {
            applyEntityDetailsState(polledResolvedState);
          }
          if (
            !detailsControls?.querySelector(".hb-climate-details-loading") ||
            Date.now() - climateLoadingStartedAt >= 30000
          ) {
            window.clearInterval(climatePollTimer);
            climatePollTimer = null;
          }
        }, 120);
      }
    } else if (isCover) {
      const coverStateHandlers = new Map([
        [
          resolvedDetailsEntityId,
          [coverStateChangeUpdate => detailsControls?.syncCoverState?.(coverStateChangeUpdate)]
        ]
      ]);
      if (airerLightRelatedEntityId) {
        coverStateHandlers.set(airerLightRelatedEntityId, [renderAirerLight]);
      }
      if (airerPositionSensorEntityId) {
        coverStateHandlers.set(airerPositionSensorEntityId, [
          coverPositionUpdate => detailsControls?.syncCoverPositionState?.(coverPositionUpdate)
        ]);
      }
      if (airerPositionNumberEntityId) {
        coverStateHandlers.set(airerPositionNumberEntityId, [
          coverPositionCommandUpdate => {
            detailsControls?.syncCoverPositionCommandState?.(coverPositionCommandUpdate);
            if (!airerPositionSensorEntityId) {
              detailsControls?.syncCoverPositionState?.(coverPositionCommandUpdate);
            }
          }
        ]);
      }
      if (airerMotorSpeedSensorId) {
        coverStateHandlers.set(airerMotorSpeedSensorId, [
          airerMotorUpdate => detailsControls?.syncAirerMotorState?.(airerMotorUpdate)
        ]);
      }
      this.detailsStateSync = {
        dialog: entityDialog,
        handlers: coverStateHandlers
      };
    }
    entityCloseButton.addEventListener("click", () => entityDialog.close());
    this.bindRuntimeDialogOutsideDismiss(entityDialogLayer, entityDialog, entityDialogCard);
    entityDialogLayer.addEventListener("keydown", entityLayerKeyEvent => {
      if (entityLayerKeyEvent.key === "Escape") {
        entityDialog.close();
      }
    });
    entityDialog.addEventListener(
      "close",
      () => {
        window.clearTimeout(chartRefreshTimer);
        window.clearInterval(climatePollTimer);
        climatePollTimer = null;
        detailsControls?.cleanupLightDetails?.();
        detailsControls?.cleanupClimateDetails?.();
        detailsControls?.cleanupCoverDetails?.();
        lineChartCurrentVisual?.cleanupLineChartHover?.();
        this.clearRuntimeDialogScale(entityDialog);
        if (this.detailsDialog === entityDialog) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === entityDialog) {
          this.detailsStateSync = null;
        }
        entityDialogLayer.remove();
      },
      {
        once: true
      }
    );
    entityDialog.show();
    entityDialog.focus({
      preventScroll: true
    });
  }
  resize() {
    if (!this.viewport || !this.document) {
      return;
    }
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    if (!containerWidth || !containerHeight) {
      return;
    }
    const widthRatio = containerWidth / this.document.canvas.width;
    const heightRatio = containerHeight / this.document.canvas.height;
    const scaleMode = this.options.scaleMode || this.document.canvas.scaleMode || "contain";
    const containScale =
      scaleMode === "cover" ? Math.max(widthRatio, heightRatio) : Math.min(widthRatio, heightRatio);
    const appliedScaleXValue = scaleMode === "stretch" ? widthRatio : containScale;
    const appliedScaleYValue = scaleMode === "stretch" ? heightRatio : containScale;
    this.appliedScaleX = appliedScaleXValue;
    this.appliedScaleY = appliedScaleYValue;
    this.canvas.style.transform = "scale(" + appliedScaleXValue + ", " + appliedScaleYValue + ")";
    this.viewport.style.width = this.document.canvas.width * appliedScaleXValue + "px";
    this.viewport.style.height = this.document.canvas.height * appliedScaleYValue + "px";
    this.container.dataset.viewportAspect = (containerWidth / containerHeight).toFixed(3);
    this.container.dataset.renderScale = Math.min(appliedScaleXValue, appliedScaleYValue).toFixed(
      4
    );
    for (const [hostRecordId, componentHost] of this.componentHosts) {
      this.updateTransformHandleScale(componentHost, this.componentRecords.get(hostRecordId));
    }
    this.updateMultiSelectionHandleScale(
      this.canvas.querySelector(":scope > .hb-multi-selection-bounds")
    );
    this.updateRuntimeDialogScale();
  }
  disconnectRuntime() {
    this.socketGeneration += 1;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    window.clearTimeout(this.runtimeHydrationRetryTimer);
    this.runtimeHydrationRetryTimer = null;
    const staleSocket = this.socket;
    this.socket = null;
    this.runtimeSubscription = null;
    if (!staleSocket || staleSocket.readyState >= WebSocket.CLOSING) {
      return;
    }
    if (staleSocket.readyState !== WebSocket.CONNECTING) {
      staleSocket.close();
      return;
    }
    let socketCloseTimer;
    const cancelSocketCloseWait = () => {
      window.clearTimeout(socketCloseTimer);
      staleSocket.removeEventListener("open", closePendingSocket);
      staleSocket.removeEventListener("close", cancelSocketCloseWait);
    };
    const closePendingSocket = () => {
      cancelSocketCloseWait();
      if (staleSocket.readyState < WebSocket.CLOSING) {
        staleSocket.close();
      }
    };
    staleSocket.addEventListener("open", closePendingSocket, {
      once: true
    });
    staleSocket.addEventListener("close", cancelSocketCloseWait, {
      once: true
    });
    socketCloseTimer = window.setTimeout(closePendingSocket, 12000);
  }
  connectRuntime({ force: forceReconnect = false } = {}) {
    if (!this.document || this.destroyed) {
      this.disconnectRuntime();
      return;
    }
    const activePageDefinition = this.page || this.document.pages?.[0];
    const sharedComponentByIdMap = new Map(
      (this.document.sharedComponents || []).map(sharedComponentRecord => [
        sharedComponentRecord.id,
        sharedComponentRecord
      ])
    );
    const runtimeComponents = [
      ...(activePageDefinition?.sharedComponentIds || [])
        .map(sharedComponentIdentifier => sharedComponentByIdMap.get(sharedComponentIdentifier))
        .filter(Boolean),
      ...(activePageDefinition?.components || [])
    ];
    const subscriptionEntityIds = collectEntityIds(runtimeComponents);
    const activePopupDefinition = this.activePopupId
      ? (this.document.customPopups || []).find(
          customPopupDefinition => String(customPopupDefinition.id || "") === this.activePopupId
        )
      : null;
    for (const activePopupModule of activePopupDefinition?.modules || []) {
      if (activePopupModule.entityId && !isVirtualEntityId(activePopupModule.entityId)) {
        subscriptionEntityIds.add(activePopupModule.entityId);
      }
    }
    for (const eventEntityId of [...subscriptionEntityIds]) {
      if (this.entityMetadata.get(eventEntityId)?.domain !== "event") {
        continue;
      }
      const presenceComponentDefinition = collectComponents(
        runtimeComponents,
        componentDefinition =>
          componentDefinition.type === "presence-sensor" &&
          componentDefinition.bindings?.entity?.entityId === eventEntityId
      )[0];
      if (!presenceComponentDefinition) {
        continue;
      }
      const presenceCompanionConfig = presenceMotionEventConfig(
        eventEntityId,
        this.states.get(eventEntityId),
        this.entityMetadata,
        this.states,
        presenceComponentDefinition.properties
      );
      for (const companionPresenceEntityId of presenceCompanionConfig.companionEntityIds) {
        subscriptionEntityIds.add(companionPresenceEntityId);
      }
    }
    for (const sensorEntityId of [...subscriptionEntityIds]) {
      const sensorMetadata = this.entityMetadata.get(sensorEntityId);
      if (
        sensorMetadata?.domain !== "sensor" ||
        !sensorMetadata.deviceId ||
        !["state", "status", "task_status"].includes(sensorMetadata.translationKey)
      ) {
        continue;
      }
      const vacuumMetadata = [...this.entityMetadata.values()].find(
        metadataEntry =>
          metadataEntry.deviceId === sensorMetadata.deviceId &&
          metadataEntry.domain === "vacuum" &&
          entityMetadataIsAvailable(metadataEntry)
      );
      if (vacuumMetadata?.entityId) {
        subscriptionEntityIds.add(vacuumMetadata.entityId);
      }
    }
    for (const vacuumEntity of [...subscriptionEntityIds]) {
      if (this.entityMetadata.get(vacuumEntity)?.domain !== "vacuum") {
        continue;
      }
      const vacuumObjectId = vacuumEntity.slice(vacuumEntity.indexOf(".") + 1);
      const vacuumModeEntity = relatedDeviceEntity(
        this.entityMetadata,
        vacuumEntity,
        "select",
        "cleaning_mode",
        "select." + vacuumObjectId + "_cleaning_mode"
      );
      if (vacuumModeEntity?.entityId) {
        subscriptionEntityIds.add(vacuumModeEntity.entityId);
      }
      const vacuumBatteryRelatedEntity = relatedVacuumBatteryEntity(
        this.entityMetadata,
        this.states,
        vacuumEntity
      );
      if (vacuumBatteryRelatedEntity?.entityId) {
        subscriptionEntityIds.add(vacuumBatteryRelatedEntity.entityId);
      }
    }
    for (const coverEntityId of [...subscriptionEntityIds]) {
      if (
        (this.entityMetadata.get(coverEntityId)?.domain ||
          String(coverEntityId || "").split(".", 1)[0]) !== "cover"
      ) {
        continue;
      }
      const coverMotorReverseEntity = relatedCoverMotorReverseEntity(
        this.entityMetadata,
        coverEntityId
      );
      if (coverMotorReverseEntity?.entityId) {
        subscriptionEntityIds.add(coverMotorReverseEntity.entityId);
      }
      const airerLightRelatedEntity = relatedAirerLightEntity(this.entityMetadata, coverEntityId);
      if (airerLightRelatedEntity?.entityId) {
        subscriptionEntityIds.add(airerLightRelatedEntity.entityId);
      }
      const airerPositionRelatedEntity = relatedAirerPositionNumberEntity(
        this.entityMetadata,
        coverEntityId
      );
      if (airerPositionRelatedEntity?.entityId) {
        subscriptionEntityIds.add(airerPositionRelatedEntity.entityId);
      }
      const airerPositionSensorEntity = relatedAirerCurrentPositionSensor(
        this.entityMetadata,
        coverEntityId
      );
      if (airerPositionSensorEntity?.entityId) {
        subscriptionEntityIds.add(airerPositionSensorEntity.entityId);
      }
      const airerMotorSpeedEntity = relatedAirerMotorSpeedSensor(
        this.entityMetadata,
        coverEntityId
      );
      if (airerMotorSpeedEntity?.entityId) {
        subscriptionEntityIds.add(airerMotorSpeedEntity.entityId);
      }
      const airerActionEntityMap = relatedAirerMotorActionEntities(
        this.entityMetadata,
        coverEntityId
      );
      for (const airerActionEntity of Object.values(airerActionEntityMap)) {
        if (airerActionEntity?.entityId) {
          subscriptionEntityIds.add(airerActionEntity.entityId);
        }
      }
    }
    for (const climateEntityId of [...subscriptionEntityIds]) {
      const climateMetadata = this.entityMetadata.get(climateEntityId);
      if (!["climate", "fan"].includes(String(climateMetadata?.domain || ""))) {
        continue;
      }
      const climateLightEntity = relatedDeviceDomainEntity(
        this.entityMetadata,
        climateEntityId,
        "light"
      );
      if (climateLightEntity?.entityId) {
        subscriptionEntityIds.add(climateLightEntity.entityId);
      }
    }
    for (const waterHeaterRelatedId of [...subscriptionEntityIds]) {
      if (this.entityMetadata.get(waterHeaterRelatedId)?.domain === "water_heater") {
        for (const waterHeaterRelatedEntity of relatedWaterHeaterEntities(
          this.entityMetadata,
          waterHeaterRelatedId
        )) {
          subscriptionEntityIds.add(waterHeaterRelatedEntity.entityId);
        }
      }
    }
    for (const profiledEntityId of [...subscriptionEntityIds]) {
      const profileEntry = this.deviceProfile(profiledEntityId);
      if (profileEntry) {
        for (const profileRoleName of [
          "climate",
          "cover",
          "fan",
          "light",
          "power",
          "mode",
          "temperature",
          "humidity",
          "pm25",
          "hcho",
          "pm10",
          "filterLife",
          "filterLeftTime",
          "airQuality",
          "backrest",
          "leg",
          "waist",
          "memory1",
          "memory2"
        ]) {
          const profileRoleEntityId = profileEntry.roles?.[profileRoleName];
          if (profileRoleEntityId) {
            subscriptionEntityIds.add(profileRoleEntityId);
          }
        }
      }
    }
    const subscriptionEntityList = [...subscriptionEntityIds];
    if (!subscriptionEntityList.length) {
      this.disconnectRuntime();
      this.runtimeHydrationRetryAttempt = 0;
      return;
    }
    if (subscriptionEntityList.length > RUNTIME_SUBSCRIPTION_ENTITY_LIMIT) {
      this.disconnectRuntime();
      const entityCountText = String(subscriptionEntityList.length);
      if (this.runtimeEntityLimitSignature !== entityCountText) {
        this.runtimeEntityLimitSignature = entityCountText;
        this.options.onError?.(
          new Error(
            "当前项目需要实时订阅 " +
              subscriptionEntityList.length +
              " 个实体，已超过 " +
              RUNTIME_SUBSCRIPTION_ENTITY_LIMIT +
              " 个上限。请减少统计或控件中绑定的实体。"
          )
        );
      }
      return;
    }
    this.runtimeEntityLimitSignature = "";
    const subscriptionSignature = JSON.stringify([...subscriptionEntityList].sort());
    const existingSubscription = this.runtimeSubscription;
    const isSocketConnecting = this.socket?.readyState === WebSocket.CONNECTING;
    const isSocketOpen = this.socket?.readyState === WebSocket.OPEN;
    if (
      !forceReconnect &&
      existingSubscription &&
      (isSocketConnecting ||
        (isSocketOpen && existingSubscription.signature === subscriptionSignature))
    ) {
      existingSubscription.entityIds = subscriptionEntityList;
      existingSubscription.runtimeComponents = runtimeComponents;
      existingSubscription.signature = subscriptionSignature;
      if (isSocketOpen) {
        this.scheduleRuntimeHydrationRetry(existingSubscription, this.socketGeneration);
      }
      return;
    }
    if (existingSubscription?.signature !== subscriptionSignature) {
      this.runtimeHydrationRetryAttempt = 0;
    }
    this.disconnectRuntime();
    const socketGenerationId = this.socketGeneration;
    const runtimeSubscription = {
      entityIds: subscriptionEntityList,
      runtimeComponents: runtimeComponents,
      signature: subscriptionSignature
    };
    this.runtimeSubscription = runtimeSubscription;
    const webSocketProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const runtimeSocket = new WebSocket(
      webSocketProtocol + "://" + window.location.host + "/api/v1/ws/runtime"
    );
    this.socket = runtimeSocket;
    runtimeSocket.addEventListener("open", () => {
      if (socketGenerationId === this.socketGeneration) {
        if (this.reconnectAttempt > 0) {
          window.HABridgeLog?.report("success", "实时连接", "实时状态连接已恢复", {
            phase: "websocket-reconnected",
            path: "/api/v1/ws/runtime"
          });
        }
        this.reconnectAttempt = 0;
        runtimeSocket.send(
          JSON.stringify({
            type: "subscribe",
            entityIds: runtimeSubscription.entityIds
          })
        );
      }
    });
    runtimeSocket.addEventListener("message", socketMessageEvent => {
      if (socketGenerationId !== this.socketGeneration) {
        return;
      }
      const { entityIds: subscribedEntityIds } = runtimeSubscription;
      let socketMessage;
      try {
        socketMessage = JSON.parse(socketMessageEvent.data);
      } catch (socketMessageError) {
        window.HABridgeLog?.error(
          socketMessageError,
          {
            phase: "websocket-message",
            path: "/api/v1/ws/runtime"
          },
          "实时状态消息格式异常"
        );
        return;
      }
      if (socketMessage.type === "snapshot") {
        const snapshotStates = socketMessage.states || [];
        const snapshotEntityIds = new Set(
          snapshotStates.map(snapshotState => String(snapshotState?.entityId || "")).filter(Boolean)
        );
        for (const staleEntityId of subscribedEntityIds) {
          if (!snapshotEntityIds.has(staleEntityId)) {
            if (this.states.has(staleEntityId)) {
              this.removedRuntimeEntityIds.add(staleEntityId);
            }
            this.states.delete(staleEntityId);
          }
        }
        for (const snapshotEntityState of snapshotStates) {
          if (this.optimisticStateIsConfirmed(snapshotEntityState.entityId, snapshotEntityState)) {
            this.rememberLightVisualState(snapshotEntityState.entityId, snapshotEntityState);
            this.removedRuntimeEntityIds.delete(snapshotEntityState.entityId);
            this.states.set(snapshotEntityState.entityId, snapshotEntityState);
            this.applyRuntimeStateHandlers(
              snapshotEntityState.entityId,
              snapshotEntityState.newState || snapshotEntityState
            );
          }
        }
        this.options.onRuntimeStateChange?.(snapshotStates);
        this.tryOpenPendingEntityDetails();
        for (const refreshedState of snapshotStates) {
          this.refreshVacuumMapEntity(refreshedState.entityId);
        }
        if (this.detailsStateSync?.handlers) {
          for (const [detailsHandlerEntityId, handlerCallbacks] of this.detailsStateSync.handlers) {
            const handlerEntityState = this.states.get(detailsHandlerEntityId);
            if (handlerEntityState) {
              for (const stateHandlerCallback of handlerCallbacks) {
                stateHandlerCallback(handlerEntityState.newState || handlerEntityState);
              }
            }
          }
        } else {
          const dialogEntityState = this.detailsStateSync
            ? this.states.get(this.detailsStateSync.entityId)
            : null;
          if (this.detailsStateSync && dialogEntityState) {
            this.detailsStateSync.apply(dialogEntityState.newState || dialogEntityState);
          }
        }
        this.refreshRuntimeComponents([...snapshotEntityIds, ...this.removedRuntimeEntityIds]);
        this.scheduleRuntimeHydrationRetry(runtimeSubscription, socketGenerationId);
      } else if (socketMessage.type === "state_removed") {
        const removedEntityId = String(socketMessage.entityId || "");
        if (!removedEntityId) {
          return;
        }
        const removedStateUpdate = {
          type: "state_changed",
          entityId: removedEntityId,
          domain: removedEntityId.split(".", 1)[0],
          state: "unavailable",
          attributes: {},
          available: false
        };
        this.removedRuntimeEntityIds.add(removedEntityId);
        this.states.delete(removedEntityId);
        this.options.onRuntimeStateChange?.([]);
        this.tryOpenPendingEntityDetails();
        if (this.detailsStateSync?.handlers?.has(removedEntityId)) {
          for (const removedStateHandler of this.detailsStateSync.handlers.get(removedEntityId)) {
            removedStateHandler(removedStateUpdate);
          }
        } else if (this.detailsStateSync?.entityId === removedEntityId) {
          this.detailsStateSync.apply(removedStateUpdate);
        }
        this.applyRuntimeStateHandlers(removedEntityId, removedStateUpdate);
        this.refreshRuntimeComponents([removedEntityId]);
        for (const affectedRuntimeComponentId of this.runtimeEntityComponentIndex.get(
          removedEntityId
        ) || []) {
          const affectedComponentEntry = this.componentRecords.get(affectedRuntimeComponentId);
          if (["line-chart", "camera", "vacuum-map"].includes(affectedComponentEntry?.type)) {
            this.refreshRuntimeComponent(affectedRuntimeComponentId);
          }
        }
        this.refreshVacuumMapEntity(removedEntityId);
      } else if (socketMessage.type === "resync_required") {
        if (socketGenerationId === this.socketGeneration && !this.destroyed) {
          this.connectRuntime({
            force: true
          });
        }
      } else if (socketMessage.type === "state_changed") {
        if (!this.optimisticStateIsConfirmed(socketMessage.entityId, socketMessage)) {
          return;
        }
        this.rememberLightVisualState(socketMessage.entityId, socketMessage);
        this.removedRuntimeEntityIds.delete(socketMessage.entityId);
        this.states.set(socketMessage.entityId, socketMessage);
        this.options.onRuntimeStateChange?.([socketMessage]);
        this.tryOpenPendingEntityDetails();
        this.refreshVacuumMapEntity(socketMessage.entityId);
        if (this.detailsStateSync?.handlers?.has(socketMessage.entityId)) {
          for (const changedStateHandler of this.detailsStateSync.handlers.get(
            socketMessage.entityId
          )) {
            changedStateHandler(socketMessage.newState || socketMessage);
          }
        } else if (this.detailsStateSync?.entityId === socketMessage.entityId) {
          this.detailsStateSync.apply(socketMessage.newState || socketMessage);
        }
        this.applyRuntimeStateHandlers(
          socketMessage.entityId,
          socketMessage.newState || socketMessage
        );
        this.scheduleRuntimeRender(socketMessage.entityId);
      }
    });
    runtimeSocket.addEventListener("close", socketCloseEvent => {
      if (socketGenerationId !== this.socketGeneration || this.destroyed) {
        return;
      }
      this.socket = null;
      this.runtimeSubscription = null;
      window.clearTimeout(this.runtimeHydrationRetryTimer);
      this.runtimeHydrationRetryTimer = null;
      window.HABridgeLog?.report(
        "warning",
        "实时连接",
        "实时状态连接已断开（" +
          socketCloseEvent.code +
          "）" +
          ([4400, 4401, 4403].includes(socketCloseEvent.code) ? "" : "，正在重连"),
        {
          code: socketCloseEvent.code,
          phase: "websocket-disconnected",
          path: "/api/v1/ws/runtime"
        }
      );
      if (socketCloseEvent.code === 4401) {
        const isDisplayPath = window.location.pathname.startsWith("/display/");
        window.location.assign(
          isDisplayPath
            ? "/pair?next=" +
                encodeURIComponent("" + window.location.pathname + window.location.search)
            : "/login"
        );
        return;
      }
      if (socketCloseEvent.code === 4403) {
        window.location.replace("/license");
        return;
      }
      if (socketCloseEvent.code === 4400) {
        const closeReasonMessage =
          socketCloseEvent.reason === "too many entities"
            ? "当前项目的实时订阅实体超过 " +
              RUNTIME_SUBSCRIPTION_ENTITY_LIMIT +
              " 个，已停止重连。请减少统计或控件中绑定的实体。"
            : "实时状态订阅请求无效，已停止自动重连。";
        this.options.onError?.(new Error(closeReasonMessage));
        return;
      }
      const reconnectDelayMs = Math.min(2 ** this.reconnectAttempt * 1000, 15000);
      this.reconnectAttempt += 1;
      this.reconnectTimer = window.setTimeout(() => this.connectRuntime(), reconnectDelayMs);
    });
    runtimeSocket.addEventListener("error", () => {
      if (runtimeSocket.readyState === WebSocket.OPEN) {
        runtimeSocket.close();
      }
    });
  }
  scheduleRuntimeHydrationRetry(subscription, generationId) {
    const needsHydration = () => {
      const { entityIds: hydrationEntityIds, runtimeComponents: hydrationComponents } =
        subscription;
      const chartEntityIds = new Set(
        collectComponents(
          hydrationComponents,
          hydrationComponent => hydrationComponent.type === "line-chart"
        )
          .map(chartComponent => String(chartComponent.bindings?.entity?.entityId || ""))
          .filter(Boolean)
      );
      return (
        hydrationEntityIds.filter(
          hydrationEntityId =>
            chartEntityIds.has(hydrationEntityId) &&
            lineChartRuntimeStateNeedsHydration(this.states.get(hydrationEntityId))
        ).length > 0
      );
    };
    if (!needsHydration()) {
      window.clearTimeout(this.runtimeHydrationRetryTimer);
      this.runtimeHydrationRetryTimer = null;
      this.runtimeHydrationRetryAttempt = 0;
      return;
    }
    if (this.runtimeHydrationRetryTimer || !(this.runtimeHydrationRetryAttempt < 5)) {
      return;
    }
    this.runtimeHydrationRetryAttempt += 1;
    const hydrationRetryDelayMs = Math.min(
      10000,
      2 ** (this.runtimeHydrationRetryAttempt - 1) * 500
    );
    this.runtimeHydrationRetryTimer = window.setTimeout(() => {
      this.runtimeHydrationRetryTimer = null;
      if (generationId === this.socketGeneration && !this.destroyed) {
        if (needsHydration()) {
          this.connectRuntime({
            force: true
          });
        } else {
          this.runtimeHydrationRetryAttempt = 0;
        }
      }
    }, hydrationRetryDelayMs);
  }
  refreshHistorySeries() {
    if (!this.document || this.destroyed || document.visibilityState === "hidden") {
      return;
    }
    const historyRequestKey = [
      this.historyDocumentGeneration,
      this.page?.path || "",
      this.activePopupId || "",
      this.historyPopupGeneration
    ].join(":");
    return this.historyRefreshCoordinator.request(historyRequestKey, () =>
      this.refreshHistorySeriesPass()
    );
  }
  scheduleHistoryRetry() {
    if (
      this.destroyed ||
      document.visibilityState === "hidden" ||
      this.historyRetryTimer ||
      this.historyRetryAttempt >= 4
    ) {
      return;
    }
    const retryAttempt = this.historyRetryAttempt;
    const retryDelayMs = Math.min(8000, 2 ** retryAttempt * 1000);
    this.historyRetryAttempt += 1;
    this.historyRetryTimer = window.setTimeout(() => {
      this.historyRetryTimer = 0;
      this.refreshHistorySeries();
    }, retryDelayMs);
  }
  async refreshHistorySeriesPass() {
    if (!this.document || this.destroyed || document.visibilityState === "hidden") {
      return;
    }
    const documentGeneration = this.historyDocumentGeneration;
    const popupGeneration = this.historyPopupGeneration;
    const historyPagePath = this.page?.path || "";
    const historyRequestsByEntityId = new Map();
    const collectHistoryRequests = (historySourceComponents, requestContext) => {
      const historyComponents = collectComponents(
        historySourceComponents,
        historyComponent =>
          historyComponent.type === "line-chart" || historyComponent.type === "presence-sensor"
      );
      for (const historyComponentEntry of historyComponents) {
        const historyEntityId = historyComponentEntry.bindings?.entity?.entityId;
        if (!historyEntityId) {
          continue;
        }
        const isPresenceHistory = historyComponentEntry.type === "presence-sensor";
        const componentIntervalSeconds = Math.max(
          30,
          Math.min(
            86400,
            Number(
              isPresenceHistory ? 300 : historyComponentEntry.properties?.updateInterval || 600
            )
          )
        );
        const componentHistoryHours = Math.max(
          1,
          Math.min(
            168,
            Number(
              isPresenceHistory
                ? historyComponentEntry.properties?.historyHours || 24
                : historyComponentEntry.properties?.hours || 24
            )
          )
        );
        const existingHistoryRequest = historyRequestsByEntityId.get(historyEntityId);
        historyRequestsByEntityId.set(historyEntityId, {
          interval: Math.min(
            existingHistoryRequest?.interval ?? componentIntervalSeconds,
            componentIntervalSeconds
          ),
          hours: Math.max(
            existingHistoryRequest?.hours ?? componentHistoryHours,
            componentHistoryHours
          ),
          documentGeneration: documentGeneration,
          shared: !!existingHistoryRequest?.shared || !!requestContext.shared,
          pagePath: existingHistoryRequest?.pagePath ?? requestContext.pagePath ?? null,
          popupId: existingHistoryRequest?.popupId ?? requestContext.popupId ?? null,
          popupGeneration: popupGeneration
        });
      }
    };
    collectHistoryRequests(this.document.sharedComponents || [], {
      shared: true
    });
    collectHistoryRequests(this.page?.components || [], {
      pagePath: historyPagePath
    });
    const activePopup = this.activePopupId
      ? (this.document.customPopups || []).find(
          popupCandidate => String(popupCandidate.id || "") === this.activePopupId
        )
      : null;
    const popupChartComponents = [];
    for (const popupChartModuleEntry of activePopup?.modules || []) {
      if (popupChartModuleEntry.type === "line-chart" && popupChartModuleEntry.entityId) {
        popupChartComponents.push({
          type: "line-chart",
          bindings: {
            entity: {
              entityId: popupChartModuleEntry.entityId
            }
          },
          properties: syncedLineChartProperties(
            this.document,
            this.page,
            popupChartModuleEntry.entityId,
            popupChartModuleEntry.properties
          )
        });
      }
    }
    collectHistoryRequests(popupChartComponents, {
      popupId: this.activePopupId || null
    });
    const requestStartedAt = Date.now();
    let didUpdateSeries = false;
    let didFailHistory = false;
    const pendingHistoryRequests = [...historyRequestsByEntityId];
    const currentHistoryContext = () => ({
      documentGeneration: this.historyDocumentGeneration,
      pagePath: this.page?.path || "",
      popupId: this.activePopupId || null,
      popupGeneration: this.historyPopupGeneration
    });
    const fetchHistoryRequest = async () => {
      while (pendingHistoryRequests.length) {
        const [requestEntityId, requestOptions] = pendingHistoryRequests.shift();
        if (
          this.destroyed ||
          !historyRequestStillRelevant(requestOptions, currentHistoryContext())
        ) {
          continue;
        }
        const cachedSeries = this.historySeries.get(requestEntityId);
        const persistedSeries = this.historySeriesCache.get(
          historySeriesCacheKey(requestEntityId, requestOptions.hours)
        );
        const bestSeries = [cachedSeries, persistedSeries]
          .filter(
            seriesCandidate =>
              seriesCandidate &&
              seriesCandidate.hours === requestOptions.hours &&
              Array.isArray(seriesCandidate.points) &&
              seriesCandidate.points.length > 0
          )
          .sort((leftSeries, rightSeries) => rightSeries.fetchedAt - leftSeries.fetchedAt)[0];
        if (
          bestSeries &&
          requestStartedAt - bestSeries.fetchedAt < requestOptions.interval * 1000
        ) {
          if (cachedSeries !== bestSeries) {
            this.historySeries.set(requestEntityId, bestSeries);
            didUpdateSeries = true;
          }
          continue;
        }
        if (this.historyFetches.has(requestEntityId)) {
          continue;
        }
        this.historyFetches.add(requestEntityId);
        const historyAbortController =
          typeof AbortController == "function" ? new AbortController() : null;
        const historyTimeoutTimer = window.setTimeout(
          () => historyAbortController?.abort(),
          HISTORY_FETCH_TIMEOUT_MS
        );
        try {
          const historyResponse = await fetch(
            "/api/v1/ha/history?entityId=" +
              encodeURIComponent(requestEntityId) +
              "&hours=" +
              requestOptions.hours,
            {
              credentials: "same-origin",
              headers: {
                Accept: "application/json"
              },
              ...(historyAbortController
                ? {
                    signal: historyAbortController.signal
                  }
                : {})
            }
          );
          if (!historyResponse.ok) {
            didFailHistory = true;
            continue;
          }
          const historyPayload = await historyResponse.json();
          if (!historyRequestStillRelevant(requestOptions, currentHistoryContext())) {
            continue;
          }
          const historySeriesEntry = {
            points: Array.isArray(historyPayload.points) ? historyPayload.points : [],
            hours: requestOptions.hours,
            fetchedAt: Date.now()
          };
          this.historySeries.set(requestEntityId, historySeriesEntry);
          cacheHistorySeries(this.historySeriesCache, requestEntityId, historySeriesEntry);
          didUpdateSeries = true;
          if (!historySeriesEntry.points.length) {
            didFailHistory = true;
          }
        } catch (historyFetchError) {
          if (historyFetchError?.name === "AbortError") {
            window.HABridgeLog?.report("warning", "网络请求", "历史曲线请求超时", {
              entityId: requestEntityId,
              phase: "history-timeout",
              path: "/api/v1/ha/history",
              durationMs: HISTORY_FETCH_TIMEOUT_MS
            });
          }
          didFailHistory = true;
        } finally {
          window.clearTimeout(historyTimeoutTimer);
          this.historyFetches.delete(requestEntityId);
        }
      }
    };
    await Promise.all(
      Array.from(
        {
          length: Math.min(2, pendingHistoryRequests.length)
        },
        () => fetchHistoryRequest()
      )
    );
    if (didFailHistory && !this.destroyed) {
      this.scheduleHistoryRetry();
    } else {
      this.historyRetryAttempt = 0;
    }
    if (didUpdateSeries && !this.destroyed) {
      this.detailsStateSync?.refreshHistory?.();
      for (const refreshChart of this.historyChartRefreshers) {
        refreshChart();
      }
    }
  }
  destroy() {
    this.destroyed = true;
    this.activePopupId = null;
    this.historyDocumentGeneration += 1;
    this.historyPopupGeneration += 1;
    this.disconnectRuntime();
    window.clearTimeout(this.reconnectTimer);
    window.clearTimeout(this.runtimeRenderTimer);
    window.clearTimeout(this.historyRetryTimer);
    window.clearTimeout(this.runtimeHydrationRetryTimer);
    window.clearTimeout(this.pendingEntityDetails?.timer);
    window.clearInterval(this.historyPollTimer);
    this.runtimeStaticImageCache.stop();
    this.runtimeEffectImageLoader.stop();
    this.runtimeVacuumMapImagePreloader.stop();
    this.reconnectTimer = null;
    this.historyRetryTimer = 0;
    this.runtimeHydrationRetryTimer = null;
    this.runtimeHydrationRetryAttempt = 0;
    this.cleanupComponents();
    this.closeRuntimeDialog();
    this.pendingEntityDetails = null;
    this.runtimeDialogScaleContext = null;
    this.resizeObserver.disconnect();
    window.visualViewport?.removeEventListener("resize", this.boundResize);
    window.removeEventListener("orientationchange", this.boundResize);
    window.removeEventListener("online", this.boundReconnect);
    document.removeEventListener("visibilitychange", this.boundVisibilityChange);
    this.container.removeEventListener("click", this.boundRuntimeButtonSound, true);
    this.container.replaceChildren();
  }
}
