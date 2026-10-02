import { vacuumMapAvailable as vacuumMapAvailable2 } from "./vacuum-map-state";
import { syncInteraction3dUiScale as syncInteraction3dUiScale2 } from "../../bridge/bridge";
import { popupPlacement as popupPlacement2 } from "../../bridge/popup-placement";
import {
  cameraPopupLayout as cameraPopupLayout2,
  cameraPreviewRatio as cameraPreviewRatio2,
} from "../../bridge/camera-popup-layout";
import {
  coverComponentIsDream as coverComponentIsDream2,
  doorWindowPerspectiveCorners as doorWindowPerspectiveCorners2,
  doorWindowPerspectiveMatrix as doorWindowPerspectiveMatrix2,
  formatLineChartValue as formatLineChartValue2,
  formatPresenceDuration as formatPresenceDuration2,
  iconButtonEffectLightVisualAwaiting as iconButtonEffectLightVisualAwaiting2,
  iconButtonEffectLightVisualState as iconButtonEffectLightVisualState2,
  mountCameraMedia as mountCameraMedia2,
  prewarmCameraMedia as prewarmCameraMedia2,
  presenceHistoryBuckets as presenceHistoryBuckets2,
  presenceMotionEventConfig as presenceMotionEventConfig2,
  presenceSensorPresentation as presenceSensorPresentation2,
  presenceStateTimestamp as presenceStateTimestamp2,
  renderAirConditionerAirflowLayer as renderAirConditionerAirflowLayer2,
  renderIconButtonEffectLayer as renderIconButtonEffectLayer2,
  renderLineChartDetails as renderLineChartDetails2,
  renderRegisteredComponent as renderRegisteredComponent2,
  setBuiltinAssetVersions as setBuiltinAssetVersions2,
  staticAssetImageSource as staticAssetImageSource2,
  vacuumMapImageSource as vacuumMapImageSource2,
} from "./registry";
import { randomUuid as randomUuid2 } from "../../utils/random-id";
import { popupLayoutMetrics as popupLayoutMetrics2 } from "../../shared/popup-layout";
import {
  bathHeaterModeUsesAirflow as bathHeaterModeUsesAirflow2,
  climateControlStructureKey as climateControlStructureKey2,
  climateDeviceLabel as climateDeviceLabel2,
  climateEffectMode as climateEffectMode2,
  climateIsPoweredOn as climateIsPoweredOn2,
  climateIsRunning as climateIsRunning2,
  climateModeIcon as climateModeIcon2,
  climateModeLabel as climateModeLabel2,
  climateOperationModeValues as climateOperationModeValues2,
  climateOptionPresentation as climateOptionPresentation2,
  climatePowerCommand as climatePowerCommand2,
  climatePresentationMode as climatePresentationMode2,
  climateSwingModeLabel as climateSwingModeLabel2,
  normalizeClimateCapabilities as normalizeClimateCapabilities2,
  reconcileClimateTargetTemperature as reconcileClimateTargetTemperature2,
  resolveClimateDeviceType as resolveClimateDeviceType2,
  waterHeaterStatusLabel as waterHeaterStatusLabel2,
} from "../controls/climate";
import {
  applyXiaomiDeviceProfile as applyXiaomiDeviceProfile2,
  resolveXiaomiDeviceProfile as resolveXiaomiDeviceProfile2,
} from "./device-profiles";
import {
  relatedEntityLabel as relatedEntityLabel2,
  relatedEntityNeedsConfirmation as relatedEntityNeedsConfirmation2,
  relatedEntityOptions as relatedEntityOptions2,
  relatedEntitySelectService as relatedEntitySelectService2,
  relatedPopupContext as relatedPopupContext2,
  selectedRelatedEntities as selectedRelatedEntities2,
  selectedRelatedEntityIds as selectedRelatedEntityIds2,
} from "../../shared/related-entities";
import {
  entityPowerIsOn as entityPowerIsOn2,
  entityPowerTarget as entityPowerTarget2,
  entityToggleCommand as entityToggleCommand2,
  optimisticToggleState as optimisticToggleState2,
} from "./entity-power";
import {
  ICON_VISIBILITY_VIRTUAL_KIND as ICON_VISIBILITY_VIRTUAL_KIND2,
  isVirtualEntityId as isVirtualEntityId2,
  parseVirtualEntityId as parseVirtualEntityId2,
} from "../../shared/virtual-entities";
import { componentActionIsSupported as componentActionIsSupported2 } from "../../shared/action-rules";
import {
  airflowCanvasOffsetBounds as airflowCanvasOffsetBounds2,
  airflowLayerGeometry as airflowLayerGeometry2,
  groupedComponentLocalDelta as groupedComponentLocalDelta2,
  rotateMultiSelectionTransforms as rotateMultiSelectionTransforms2,
} from "../geometry/transform-geometry";
import {
  componentHostZIndex as componentHostZIndex2,
  effectCropRectangle as effectCropRectangle2,
  effectCroppedLayerGeometry as effectCroppedLayerGeometry2,
  effectFadeDuration as effectFadeDuration2,
  effectLayerDimensions as effectLayerDimensions2,
  effectReferenceImageTransform as effectReferenceImageTransform2,
  effectSourceDimensions as effectSourceDimensions2,
  normalizeIconButtonEffectComponent as normalizeIconButtonEffectComponent2,
} from "../geometry/effect-geometry";
import {
  LIGHT_DETAIL_PRESET_DEFINITIONS as LIGHT_DETAIL_PRESET_DEFINITIONS2,
  LIGHT_PRESET_MAXIMUM_HOLD_MS as LIGHT_PRESET_MAXIMUM_HOLD_MS2,
  LIGHT_PRESET_MINIMUM_HOLD_MS as LIGHT_PRESET_MINIMUM_HOLD_MS2,
  LIGHT_PRESET_STABLE_CONFIRMATION_MS as LIGHT_PRESET_STABLE_CONFIRMATION_MS2,
  UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT as UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT2,
  UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN as UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN2,
  hsToRgbColor as hsToRgbColor2,
  lightColorRgb as lightColorRgb2,
  lightColorHs as lightColorHs2,
  lightControlModes as lightControlModes2,
  lightControlMode as lightControlMode2,
  lightColorPickerHsFromPoint as lightColorPickerHsFromPoint2,
  lightColorPickerPointFromHs as lightColorPickerPointFromHs2,
  lightColorServiceData as lightColorServiceData2,
  lightPresetBrightnessServiceData as lightPresetBrightnessServiceData2,
  lightPresetPendingDecision as lightPresetPendingDecision2,
  lightRealtimeCapabilities as lightRealtimeCapabilities2,
  lightSupportsColor as lightSupportsColor2,
  lightVisualValueForCapability as lightVisualValueForCapability2,
  relativeLightColorTemperature as relativeLightColorTemperature2,
  rgbToHsColor as rgbToHsColor2,
} from "../controls/light-runtime";
import { entityMetadataIsAvailable as entityMetadataIsAvailable2 } from "./entity-metadata";
import {
  relatedVacuumStatusEntities as relatedVacuumStatusEntities2,
  vacuumStatus as vacuumStatus2,
  relatedVacuumBatteryEntity as relatedVacuumBatteryEntity2,
  vacuumActionService as vacuumActionService2,
  vacuumBatteryPercent as vacuumBatteryPercent2,
  vacuumSupportedActions as vacuumSupportedActions2,
} from "../controls/vacuum-runtime";
import {
  airerDevicePosition as airerDevicePosition2,
  airerPositionCalibration as airerPositionCalibration2,
  airerPresentationPosition as airerPresentationPosition2,
  airerPresentationPositionForState as airerPresentationPositionForState2,
  airerReportedPosition as airerReportedPosition2,
  airerVisualDrop as airerVisualDrop2,
  coverComponentIsAirer as coverComponentIsAirer2,
  coverMotorIsReversedForComponent as coverMotorIsReversedForComponent2,
  coverPendingDisplayPosition as coverPendingDisplayPosition2,
  coverPositionReachedTarget as coverPositionReachedTarget2,
  coverPresentationState as coverPresentationState2,
  coverToggleServiceForComponent as coverToggleServiceForComponent2,
  dreamCurtainBladeLabel as dreamCurtainBladeLabel2,
  dreamCurtainIsRetracted as dreamCurtainIsRetracted2,
  dreamCurtainStatusFromRetraction as dreamCurtainStatusFromRetraction2,
  dreamCurtainStatusText as dreamCurtainStatusText2,
  dreamCurtainToggleService as dreamCurtainToggleService2,
  learnAirerPositionCalibration as learnAirerPositionCalibration2,
  physicalCoverState as physicalCoverState2,
  relatedAirerCurrentPositionSensor as relatedAirerCurrentPositionSensor2,
  relatedAirerLightEntity as relatedAirerLightEntity2,
  relatedAirerMotorActionEntities as relatedAirerMotorActionEntities2,
  relatedAirerMotorSpeedSensor as relatedAirerMotorSpeedSensor2,
  relatedAirerPositionNumberEntity as relatedAirerPositionNumberEntity2,
  relatedCoverMotorReverseEntity as relatedCoverMotorReverseEntity2,
  relatedDeviceDomainEntity as relatedDeviceDomainEntity2,
  relatedDeviceEntity as relatedDeviceEntity2,
  relatedWaterHeaterEntities as relatedWaterHeaterEntities2,
  runtimeCoverStateIsActive as runtimeCoverStateIsActive2,
  runtimeEntityStateIsActive as runtimeEntityStateIsActive2,
  waterHeaterRelatedEntityLabel as waterHeaterRelatedEntityLabel2,
} from "../controls/cover-runtime";
import {
  playFixedDeviceDropEntrance as playFixedDeviceDropEntrance2,
  playMediaSpeakerEntrance as playMediaSpeakerEntrance2,
  playStableRuntimeDialogEntrance as playStableRuntimeDialogEntrance2,
  runtimeDialogUsesStableMotion as runtimeDialogUsesStableMotion2,
} from "./runtime-dialog-motion";
import {
  EntityRequestPolicy as EntityRequestPolicy2,
  HISTORY_FETCH_TIMEOUT_MS as HISTORY_FETCH_TIMEOUT_MS2,
  HistoryRefreshCoordinator as HistoryRefreshCoordinator2,
  RuntimeEffectImageLoader as RuntimeEffectImageLoader2,
  RuntimeStaticImageCache as RuntimeStaticImageCache2,
  RuntimeVacuumMapImagePreloader as RuntimeVacuumMapImagePreloader2,
  cacheHistorySeries as cacheHistorySeries2,
  historyRequestStillRelevant as historyRequestStillRelevant2,
  historySeriesCacheKey as historySeriesCacheKey2,
} from "./runtime-caches";
import {
  collectComponents as collectComponents2,
  collectEntityIds as collectEntityIds2,
  lineChartRuntimeStateNeedsHydration as lineChartRuntimeStateNeedsHydration2,
  syncedLineChartProperties as syncedLineChartProperties2,
} from "./runtime-document";
export { setBuiltinAssetVersions2 as setBuiltinAssetVersions };
export {
  airflowCanvasOffsetBounds2 as airflowCanvasOffsetBounds,
  airflowLayerGeometry2 as airflowLayerGeometry,
  groupedComponentLocalDelta2 as groupedComponentLocalDelta,
  rotateMultiSelectionTransforms2 as rotateMultiSelectionTransforms,
};
export {
  componentHostZIndex2 as componentHostZIndex,
  effectCroppedLayerGeometry2 as effectCroppedLayerGeometry,
  effectLayerDimensions2 as effectLayerDimensions,
  effectReferenceImageTransform2 as effectReferenceImageTransform,
  normalizeIconButtonEffectComponent2 as normalizeIconButtonEffectComponent,
};
export {
  LIGHT_DETAIL_PRESET_DEFINITIONS2 as LIGHT_DETAIL_PRESET_DEFINITIONS,
  LIGHT_PRESET_MAXIMUM_HOLD_MS2 as LIGHT_PRESET_MAXIMUM_HOLD_MS,
  LIGHT_PRESET_MINIMUM_HOLD_MS2 as LIGHT_PRESET_MINIMUM_HOLD_MS,
  LIGHT_PRESET_STABLE_CONFIRMATION_MS2 as LIGHT_PRESET_STABLE_CONFIRMATION_MS,
  UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT2 as UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT,
  UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN2 as UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN,
  hsToRgbColor2 as hsToRgbColor,
  lightColorRgb2 as lightColorRgb,
  lightColorHs2 as lightColorHs,
  lightControlModes2 as lightControlModes,
  lightControlMode2 as lightControlMode,
  lightColorPickerHsFromPoint2 as lightColorPickerHsFromPoint,
  lightColorPickerPointFromHs2 as lightColorPickerPointFromHs,
  lightColorServiceData2 as lightColorServiceData,
  lightPresetBrightnessServiceData2 as lightPresetBrightnessServiceData,
  lightPresetPendingDecision2 as lightPresetPendingDecision,
  lightRealtimeCapabilities2 as lightRealtimeCapabilities,
  lightSupportsColor2 as lightSupportsColor,
  lightVisualValueForCapability2 as lightVisualValueForCapability,
  relativeLightColorTemperature2 as relativeLightColorTemperature,
  rgbToHsColor2 as rgbToHsColor,
};
export {
  relatedVacuumBatteryEntity2 as relatedVacuumBatteryEntity,
  vacuumActionService2 as vacuumActionService,
  vacuumBatteryPercent2 as vacuumBatteryPercent,
  vacuumSupportedActions2 as vacuumSupportedActions,
};
export {
  airerDevicePosition2 as airerDevicePosition,
  airerPositionCalibration2 as airerPositionCalibration,
  airerPresentationPosition2 as airerPresentationPosition,
  airerPresentationPositionForState2 as airerPresentationPositionForState,
  airerReportedPosition2 as airerReportedPosition,
  airerVisualDrop2 as airerVisualDrop,
  coverComponentIsAirer2 as coverComponentIsAirer,
  coverMotorIsReversedForComponent2 as coverMotorIsReversedForComponent,
  coverPendingDisplayPosition2 as coverPendingDisplayPosition,
  coverPositionReachedTarget2 as coverPositionReachedTarget,
  coverToggleServiceForComponent2 as coverToggleServiceForComponent,
  dreamCurtainBladeLabel2 as dreamCurtainBladeLabel,
  dreamCurtainIsRetracted2 as dreamCurtainIsRetracted,
  dreamCurtainStatusText2 as dreamCurtainStatusText,
  dreamCurtainToggleService2 as dreamCurtainToggleService,
  learnAirerPositionCalibration2 as learnAirerPositionCalibration,
  relatedAirerCurrentPositionSensor2 as relatedAirerCurrentPositionSensor,
  relatedAirerLightEntity2 as relatedAirerLightEntity,
  relatedAirerMotorActionEntities2 as relatedAirerMotorActionEntities,
  relatedAirerMotorSpeedSensor2 as relatedAirerMotorSpeedSensor,
  relatedAirerPositionNumberEntity2 as relatedAirerPositionNumberEntity,
  relatedWaterHeaterEntities2 as relatedWaterHeaterEntities,
  waterHeaterRelatedEntityLabel2 as waterHeaterRelatedEntityLabel,
};
export { runtimeDialogUsesStableMotion2 as runtimeDialogUsesStableMotion };
export {
  HistoryRefreshCoordinator2 as HistoryRefreshCoordinator,
  RuntimeEffectImageLoader2 as RuntimeEffectImageLoader,
  RuntimeStaticImageCache2 as RuntimeStaticImageCache,
  RuntimeVacuumMapImagePreloader2 as RuntimeVacuumMapImagePreloader,
  historyRequestStillRelevant2 as historyRequestStillRelevant,
};
export {
  lineChartRuntimeStateNeedsHydration2 as lineChartRuntimeStateNeedsHydration,
  syncedLineChartProperties2 as syncedLineChartProperties,
};
const maxRuntimeEntitySubscriptions = 1000,
  defaultTargetOccupancy = 0.76,
  compactTargetOccupancy = 0.7,
  maxPreferredScale = 1.6,
  fillMaxScale = 2,
  tightFillMaxScale = 2.12;

/**
 * 门帘位置死区：位置值大于该阈值即视为「已张开」，否则视为停在闭合端（0）。
 * 0.6.7 基线引用过该常量但从未定义，运行到相关分支会抛 ReferenceError。
 */
const COVER_CLOSED_POSITION_EPSILON = 0.01;
export function runtimeDialogLayout({
  layerWidth: layoutLayerWidth,
  layerHeight: layoutLayerHeight,
  layoutWidth: layoutWidth,
  layoutHeight: layoutHeight,
  fillAvailable: isFillAvailable = false,
  tightFill: isTightFill = false,
  targetOccupancy: targetOccupancy = defaultTargetOccupancy,
}) {
  const max = Math.max(1, Number(layoutLayerWidth) || 1),
    dialogLayerHeight = Math.max(1, Number(layoutLayerHeight) || 1),
    dialogLayoutWidth = Math.max(1, Number(layoutWidth) || 1),
    dialogLayoutHeight = Math.max(1, Number(layoutHeight) || 1),
    min = isTightFill
      ? Math.min(40, Math.max(24, Math.min(max, dialogLayerHeight) * 0.03))
      : isFillAvailable
        ? Math.min(80, Math.max(32, Math.min(max, dialogLayerHeight) * 0.075))
        : Math.min(64, Math.max(24, Math.min(max, dialogLayerHeight) * 0.05)),
    dialogAvailableWidth = Math.max(1, max - min * 2),
    dialogAvailableHeight = Math.max(1, dialogLayerHeight - min * 2),
    dialogFitScale = Math.min(
      dialogAvailableWidth / dialogLayoutWidth,
      dialogAvailableHeight / dialogLayoutHeight,
    ),
    clampedTargetOccupancy = Math.max(
      0.2,
      Math.min(1, Number(targetOccupancy) || defaultTargetOccupancy),
    ),
    requestedOccupancyScale = Math.min(
      (max * clampedTargetOccupancy) / dialogLayoutWidth,
      (dialogLayerHeight * clampedTargetOccupancy) / dialogLayoutHeight,
    ),
    cappedPreferredScale = Math.min(maxPreferredScale, requestedOccupancyScale),
    dialogFinalScale = Math.min(
      isFillAvailable ? (isTightFill ? tightFillMaxScale : fillMaxScale) : cappedPreferredScale,
      dialogFitScale,
    );
  return {
    availableWidth: dialogAvailableWidth,
    availableHeight: dialogAvailableHeight,
    fitScale: dialogFitScale,
    preferredScale: cappedPreferredScale,
    safeInset: min,
    scale: Math.max(0.08, dialogFinalScale),
  };
}
export function runtimeDialogViewport({
  layerLeft: viewportLayerLeft = 0,
  layerTop: viewportLayerTop = 0,
  layerWidth: viewportLayerWidth,
  layerHeight: viewportLayerHeight,
  dashboardLeft: dashboardLeft,
  dashboardTop: dashboardTop,
  dashboardWidth: dashboardWidth,
  dashboardHeight: dashboardHeight,
}) {
  const num = Number(viewportLayerLeft) || 0,
    viewportLayerTopPx = Number(viewportLayerTop) || 0,
    viewportLayerWidthPx = Math.max(1, Number(viewportLayerWidth) || 1),
    viewportLayerHeightPx = Math.max(1, Number(viewportLayerHeight) || 1),
    viewportLayerRightPx = num + viewportLayerWidthPx,
    viewportLayerBottomPx = viewportLayerTopPx + viewportLayerHeightPx,
    dashboardLeftPx = Number.isFinite(Number(dashboardLeft)) ? Number(dashboardLeft) : num,
    dashboardTopPx = Number.isFinite(Number(dashboardTop))
      ? Number(dashboardTop)
      : viewportLayerTopPx,
    dashboardWidthPx = Math.max(1, Number(dashboardWidth) || viewportLayerWidthPx),
    dashboardHeightPx = Math.max(1, Number(dashboardHeight) || viewportLayerHeightPx),
    dashboardLeftLimitPx = Math.max(num, dashboardLeftPx),
    dashboardTopLimitPx = Math.max(viewportLayerTopPx, dashboardTopPx),
    dashboardRightLimitPx = Math.min(viewportLayerRightPx, dashboardLeftPx + dashboardWidthPx),
    dashboardBottomLimitPx = Math.min(viewportLayerBottomPx, dashboardTopPx + dashboardHeightPx),
    viewportBodyWidthPx = Math.max(1, dashboardRightLimitPx - dashboardLeftLimitPx),
    viewportBodyHeightPx = Math.max(1, dashboardBottomLimitPx - dashboardTopLimitPx);
  return {
    width: viewportBodyWidthPx,
    height: viewportBodyHeightPx,
    centerX: dashboardLeftLimitPx - num + viewportBodyWidthPx / 2,
    centerY: dashboardTopLimitPx - viewportLayerTopPx + viewportBodyHeightPx / 2,
  };
}
function assignComponentIdentifiers(componentNodeRecord) {
  componentNodeRecord.id = "component-" + randomUuid2();
  for (const childNodeRecord of componentNodeRecord.children || [])
    assignComponentIdentifiers(childNodeRecord);
  return componentNodeRecord;
}
function isPrimaryModifierPressed(keyboardEvent) {
  const platformName = navigator.userAgentData?.platform || navigator.platform || "",
    test = /mac|iphone|ipad|ipod/i.test(platformName);
  return keyboardEvent.altKey || keyboardEvent.ctrlKey || (test && keyboardEvent.metaKey);
}
function componentSupportsAction(actionComponentRecord, actionSpec) {
  return componentActionIsSupported2(actionComponentRecord, actionSpec);
}
export function componentDialogTitle(titleComponentRecord, fallbackTitleText) {
  const options = titleComponentRecord?.properties || {};
  return String(options.label || "").trim() || fallbackTitleText;
}
export function popupModuleDialogTitle(
  popupModuleRecord,
  popupEntityRecord,
  fallbackTitleLabel = "",
) {
  return (
    String(popupModuleRecord?.title || "").trim() ||
    String(fallbackTitleLabel || "").trim() ||
    String(popupEntityRecord?.attributes?.friendly_name || "").trim() ||
    String(popupModuleRecord?.entityId || "").trim()
  );
}
function createAirerVisual(airerHostElement) {
  const ownerDocument = airerHostElement.ownerDocument,
    element = ownerDocument.createElement("span");
  element.className = "hb-airer-visual";
  const airerGlowElement = ownerDocument.createElement("i");
  airerGlowElement.className = "hb-airer-visual-glow";
  const airerBodyElement = ownerDocument.createElement("span");
  airerBodyElement.className = "hb-airer-visual-body";
  const airerLampElement = ownerDocument.createElement("i");
  ((airerLampElement.className = "hb-airer-visual-lamp"),
    airerBodyElement.append(airerLampElement));
  const airerLiftsElement = ownerDocument.createElement("span");
  ((airerLiftsElement.className = "hb-airer-visual-lifts"),
    airerLiftsElement.append(ownerDocument.createElement("i"), ownerDocument.createElement("i")));
  const airerRackElement = ownerDocument.createElement("span");
  airerRackElement.className = "hb-airer-visual-rack";
  for (let rackShelfIndex = 0; rackShelfIndex < 4; rackShelfIndex += 1)
    airerRackElement.append(ownerDocument.createElement("i"));
  (element.append(airerGlowElement, airerBodyElement, airerLiftsElement, airerRackElement),
    airerHostElement.append(element));
}
function entityStateText(stateKey) {
  return (
    {
      open: "已升起",
      closed: "已下降",
      opening: "正在升起",
      closing: "正在下降",
    }[stateKey] || ""
  );
}
function createSwitchVisual({
  label: switchLabelText = "开关",
  interactive: isInteractive = true,
  onToggle: toggleHandler = null,
  compact: isCompact = false,
  momentary: isMomentary = false,
} = {}) {
  const switchButtonElement = document.createElement("button");
  ((switchButtonElement.type = "button"),
    (switchButtonElement.className = "hb-switch-visual"),
    switchButtonElement.classList.toggle("is-momentary", isMomentary),
    (switchButtonElement.inert = !isInteractive),
    switchButtonElement.setAttribute("aria-disabled", String(!isInteractive)));
  const switchAuraElement = document.createElement("i");
  switchAuraElement.className = "hb-switch-visual-aura";
  const switchPlateElement = document.createElement("span");
  switchPlateElement.className = "hb-switch-visual-plate";
  const switchIndicatorElement = document.createElement("i");
  switchIndicatorElement.className = "hb-switch-visual-indicator";
  const switchRockerElement = document.createElement("span");
  switchRockerElement.className = "hb-switch-visual-rocker";
  const switchOffMarkElement = document.createElement("i");
  ((switchOffMarkElement.className = "hb-switch-visual-mark off"),
    (switchOffMarkElement.textContent = "○"));
  const switchOnMarkElement = document.createElement("i");
  ((switchOnMarkElement.className = "hb-switch-visual-mark on"),
    (switchOnMarkElement.textContent = "┃"),
    switchRockerElement.append(switchOffMarkElement, switchOnMarkElement),
    switchPlateElement.append(switchIndicatorElement, switchRockerElement),
    switchButtonElement.append(switchAuraElement, switchPlateElement));
  const switchCopyElement = isCompact ? document.createElement("span") : null,
    switchCopyLabelElement = isCompact ? document.createElement("strong") : null,
    switchCopyStateElement = isCompact ? document.createElement("output") : null;
  isCompact &&
    ((switchCopyElement.className = "hb-switch-visual-copy"),
    (switchCopyLabelElement.className = "hb-switch-visual-copy-label"),
    (switchCopyStateElement.className = "hb-switch-visual-copy-state"),
    (switchCopyLabelElement.textContent = switchLabelText),
    switchCopyElement.append(switchCopyLabelElement, switchCopyStateElement),
    switchButtonElement.append(switchCopyElement),
    switchButtonElement.classList.add("is-compact"));
  const syncSwitchVisual = (
    isSwitchOn,
    {
      unavailable: isUnavailable = false,
      pending: isPending = false,
      success: isSuccess = false,
    } = {},
  ) => {
    const isSwitchPressed = (isMomentary ? isPending : !!isSwitchOn) && !isUnavailable;
    (switchButtonElement.classList.toggle("is-on", isSwitchPressed),
      switchButtonElement.classList.toggle("is-unavailable", isUnavailable),
      switchButtonElement.classList.toggle("is-pending", isPending),
      switchButtonElement.classList.toggle("is-success", isSuccess),
      switchButtonElement.setAttribute("aria-pressed", String(isSwitchPressed)),
      switchButtonElement.setAttribute("aria-busy", String(isPending)),
      switchButtonElement.setAttribute(
        "aria-label",
        isUnavailable
          ? switchLabelText + "当前不可用"
          : isMomentary
            ? "" +
              switchLabelText +
              (isSuccess ? "执行成功" : isPending ? "正在执行" : "，点击执行")
            : "" + switchLabelText + (isSwitchPressed ? "已开启，点击关闭" : "已关闭，点击开启"),
      ),
      switchCopyStateElement &&
        (switchCopyStateElement.textContent = isUnavailable
          ? "当前不可用"
          : isMomentary
            ? isSuccess
              ? "执行成功"
              : isPending
                ? "执行中"
                : "点击执行"
            : isSwitchPressed
              ? "运行中"
              : "已关闭"));
  };
  return (
    switchButtonElement.addEventListener("click", () => {
      isInteractive &&
        !switchButtonElement.classList.contains("is-pending") &&
        !switchButtonElement.classList.contains("is-unavailable") &&
        toggleHandler?.();
    }),
    {
      visual: switchButtonElement,
      sync: syncSwitchVisual,
    }
  );
}
function mixHexColor(fromHexColor, toHexColor, blendAmount = 0) {
  const normalizeHexColor = (rawColor) => {
      const trim = String(rawColor || "").trim(),
        expandedHexColor = /^#[0-9a-f]{3}$/i.test(trim)
          ? "#" +
            trim
              .slice(1)
              .split("")
              .map((doubledHexDigit) => "" + doubledHexDigit + doubledHexDigit)
              .join("")
          : trim;
      return /^#[0-9a-f]{6}$/i.test(expandedHexColor) ? expandedHexColor : null;
    },
    sourceHexColor = normalizeHexColor(fromHexColor),
    targetHexColor = normalizeHexColor(toHexColor);
  if (!sourceHexColor || !targetHexColor) return fromHexColor;
  const clampedBlendAmount = Math.max(0, Math.min(1, Number(blendAmount) || 0)),
    parseHexChannel = (hexColorText, channelOffset) =>
      Number.parseInt(hexColorText.slice(channelOffset, channelOffset + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((channelOffsetIndex) =>
        Math.round(
          parseHexChannel(sourceHexColor, channelOffsetIndex) +
            (parseHexChannel(targetHexColor, channelOffsetIndex) -
              parseHexChannel(sourceHexColor, channelOffsetIndex)) *
              clampedBlendAmount,
        ),
      )
      .map((channelByteValue) => channelByteValue.toString(16).padStart(2, "0"))
      .join("")
  );
}
/** renderer 构造选项：0.6.7 起就是开放结构，只有少数几个字段有固定语义。 */
type PanelRendererOptions = {
  editable?: boolean;
  onError?: (error: any) => void;
  onRuntimeButtonPress?: (element: Element) => void;
  [key: string]: any;
};

/** 详情对话框的状态同步句柄（对话框形态随组件类型而变）。 */
type RendererDetailsStateSync = {
  dialog?: any;
  [key: string]: any;
};

/**
 * 组件详情 / 可视化控制器元素。
 * 0.6.7 起就把每个组件的状态同步钩子直接挂在 DOM 元素上（组件类型不同、挂的钩子也不同），
 * 这里把这组运行期钩子声明成「全部可选」——因此普通 HTMLElement 可以直接赋值给它。
 */
type ComponentControllerHooks = {
  syncCapabilityState?: (...args: any[]) => any;
  cleanupCapabilityDetails?: () => void;
  resizeInteraction3d?: (...args: any[]) => any;
  stateHandlers?: any;
  relatedEntityIds?: any;
  syncClimateState?: (...args: any[]) => any;
  syncClimateGrid?: (...args: any[]) => any;
  cleanupClimateDetails?: () => void;
  syncLightState?: (...args: any[]) => any;
  cleanupLightDetails?: () => void;
  syncBathLightState?: (...args: any[]) => any;
  toggleBathLight?: (...args: any[]) => any;
  syncLineChartState?: (...args: any[]) => any;
  cleanupLineChartHover?: () => void;
  setDreamCurtainRetracted?: (...args: any[]) => any;
  isDreamCurtainRetracted?: () => boolean;
  beginCoverMotion?: (...args: any[]) => any;
  cancelCoverMotion?: (...args: any[]) => any;
  stopCoverMotion?: () => void;
  holdCoverPosition?: (...args: any[]) => any;
  syncCoverState?: (...args: any[]) => any;
  syncCoverPositionState?: (...args: any[]) => any;
  syncCoverPositionCommandState?: (...args: any[]) => any;
  syncAirerMotorState?: (...args: any[]) => any;
  beginDreamCurtainMotion?: (...args: any[]) => any;
  cancelDreamCurtainMotion?: (...args: any[]) => any;
  cleanupCoverDetails?: () => void;
  waterHeaterControlPanel?: any;
}

/** 普通容器元素（section/div 等）承载组件控制钩子。 */
type ComponentControllerElement = HTMLElement & ComponentControllerHooks;

/** 对话框元素（dialog）承载组件控制钩子。 */
type ComponentDialogElement = HTMLDialogElement & ComponentControllerHooks;

/**
 * 组件属性 / 状态载荷。Home Assistant 侧字段随集成而变，
 * 渲染器只做透传与按需读取，因此按开放式载荷声明。
 */
type ComponentPayload = Record<string, any>;

/** 键盘 Enter/Space 触发时，模拟点击当前聚焦的控件（非 HTMLElement 时忽略）。 */
function clickFocusedElement(): void {
  const focusedElement = document.activeElement;
  focusedElement instanceof HTMLElement && focusedElement.click();
}

/** 页面是否处于后台。用函数封装，避免 TS 对 document.visibilityState 做字面量收窄。 */
function isDocumentHidden(): boolean {
  return document.visibilityState === "hidden";
}

/** 气候可视化同步载荷（视觉模式 / 运行态 / 强调色 / 目标温度）。 */
type ClimateVisualSyncPayload = {
  mode?: string;
  visualMode?: string;
  running?: boolean;
  accentColor?: string;
  targetTemperature?: number | string;
};

/** 拖拽条目：首次手势复用宿主条目，复制手势时使用复制出来的条目。 */
type DraggedComponentEntry = {
  component: any;
  host?: HTMLElement;
  initialX: number;
  initialY: number;
  width: number;
  height: number;
  parentId?: any;
  parentTransform: any;
  worldCenter?: { x: number; y: number };
};

/**
 * 实体状态控件：可点击时创建 button、只读时创建 div，
 * 这里用两者的交集描述「同一位置在不同分支下的两种形态」。
 */
type EntityStateControlElement = HTMLButtonElement & HTMLDivElement;

export class PanelRenderer {
  // ──────────────────────────────────────────────────────────────────────
  // 0.6.7 的 JS 原文在构造函数里用 `this.x = ...` 逐个赋值，TS 6 不再据此
  // 推断实例属性，导致 78 个成员名的每次访问都报 TS2339（共 1,162 个错误）。
  // 这里集中声明；`declare` 保证零产码，运行期行为与迁移前完全一致。
  // ──────────────────────────────────────────────────────────────────────
  declare container: HTMLElement;
  declare viewport: HTMLElement;
  declare canvas: HTMLElement;
  declare options: PanelRendererOptions;
  declare boundRuntimeButtonSound: (event: Event) => void;
  declare renderNamespace: string;
  /** 仪表盘文档（页面集合的业务对象），不是 window.document。 */
  declare document: any;
  declare page: any;
  declare states: Map<any, any>;
  declare virtualEntityStates: Map<any, any>;
  declare entityMetadata: Map<any, any>;
  declare deviceMetadata: Map<any, any>;
  declare entityCatalogReady: boolean;
  declare entityTranslations: Record<string, any>;
  declare historySeries: Map<any, any>;
  declare historySeriesCache: Map<any, any>;
  declare historyFetches: Set<any>;
  declare historyRefreshCoordinator: HistoryRefreshCoordinator2;
  declare historyRequestPolicy: EntityRequestPolicy2;
  declare historyAbortControllers: Set<AbortController>;
  declare historyRetryTimer: number;
  declare historyRetryAttempt: number;
  declare historyDocumentGeneration: number;
  declare historyPopupGeneration: number;
  declare historyChartRefreshers: Set<any>;
  declare historyPollTimer: number;
  declare runtimeStateHandlers: Map<any, any>;
  declare runtimeRenderEntityIds: Set<string>;
  declare runtimeRenderTimer: number;
  declare runtimeStaticImageCache: RuntimeStaticImageCache2;
  declare runtimeEffectImageLoader: RuntimeEffectImageLoader2;
  declare runtimeVacuumMapImagePreloader: RuntimeVacuumMapImagePreloader2;
  declare vacuumMapEntityIds: Set<string>;
  declare cleanups: (() => void)[];
  declare componentCleanups: Map<any, any>;
  declare cameraCleanups: Map<any, any>;
  declare runtimeEntityComponentIndex: Map<any, any>;
  declare componentParentIds: Map<any, any>;
  declare componentHosts: Map<any, any>;
  declare componentRecords: Map<any, any>;
  declare componentAirflowLayers: Map<any, any>;
  declare componentEffectLayers: Map<any, any>;
  declare componentSelectionOverlays: Map<any, any>;
  declare componentSelectionLayers: Map<any, any>;
  declare componentPreviewStates: Map<any, any>;
  declare themeVariableNames: Set<string>;
  declare detailsStateSync: RendererDetailsStateSync | null;
  declare detailsDialog: any;
  declare activePopupId: string | null;
  declare activeGroupId: string | null;
  declare selectedComponentId: string | null;
  declare selectedComponentIds: Set<string>;
  declare replacingDocument: boolean;
  declare pendingEntityDetails: any;
  declare runtimeDialogScaleContext: any;
  declare socket: WebSocket | null;
  declare runtimeSubscription: any;
  declare socketGeneration: number;
  declare reconnectTimer: number | null;
  declare reconnectAttempt: number;
  declare runtimeHydrationRetryTimer: number | null;
  declare runtimeHydrationRetryAttempt: number;
  declare lastRuntimeResumeAt: number;
  declare runtimeEntityLimitSignature: string;
  declare removedRuntimeEntityIds: Set<string>;
  declare pendingOptimisticStates: Map<any, any>;
  declare confirmedLightVisualStates: Map<any, any>;
  declare destroyed: boolean;
  declare runtimeSnapshotReady: boolean;
  declare resizeObserver: ResizeObserver;
  declare boundResize: () => void;
  declare boundReconnect: () => void;
  declare boundVisibilityChange: () => void;
  declare appliedScaleX: number;
  declare appliedScaleY: number;
  declare stagePrewarmTimer: ReturnType<typeof setTimeout>;
  declare retainedInteraction3d: any;
  declare prewarmingStageId: string | null;

  constructor(rootContainerElement: HTMLElement, rendererOptions: PanelRendererOptions = {}) {
    ((this.container = rootContainerElement),
      (this.options = {
        ...rendererOptions,
        onError: (errorObject) => {
          (window.HomeOSLog?.error(errorObject, {
            phase: "runtime-operation",
          }),
            rendererOptions.onError?.(errorObject));
        },
      }),
      (this.boundRuntimeButtonSound = (clickEvent) => {
        if (this.options.editable) return;
        const closest =
          typeof Element < "u" && clickEvent.target instanceof Element
            ? clickEvent.target.closest('button, [role="button"]')
            : null;
        !closest ||
          !this.container.contains(closest) ||
          this.options.onRuntimeButtonPress?.(closest);
      }),
      this.container.addEventListener("click", this.boundRuntimeButtonSound, true),
      (this.renderNamespace = "renderer-" + randomUuid2().replace(/[^a-z0-9]/gi, "")),
      (this.document = null),
      (this.page = null),
      (this.states =
        rendererOptions.runtimeStateCache instanceof Map
          ? rendererOptions.runtimeStateCache
          : new Map()),
      (this.virtualEntityStates =
        rendererOptions.virtualEntityStateCache instanceof Map
          ? rendererOptions.virtualEntityStateCache
          : new Map()),
      (this.entityMetadata = new Map()),
      (this.deviceMetadata = new Map()),
      (this.entityCatalogReady = false),
      (this.entityTranslations = {}),
      (this.historySeries = new Map()),
      (this.historySeriesCache =
        rendererOptions.historySeriesCache instanceof Map
          ? rendererOptions.historySeriesCache
          : new Map()),
      (this.historyFetches = new Set()),
      (this.historyRefreshCoordinator = new HistoryRefreshCoordinator2()),
      (this.historyRequestPolicy = new EntityRequestPolicy2()),
      (this.historyAbortControllers = new Set()),
      (this.historyRetryTimer = 0),
      (this.historyRetryAttempt = 0),
      (this.historyDocumentGeneration = 0),
      (this.historyPopupGeneration = 0),
      (this.historyChartRefreshers = new Set()),
      (this.runtimeStateHandlers = new Map()),
      (this.runtimeRenderEntityIds = new Set()),
      (this.runtimeRenderTimer = 0),
      (this.runtimeStaticImageCache = new RuntimeStaticImageCache2({
        maxConcurrent: 2,
        maxDecoded: 32,
        idleDelay: 120,
      })),
      (this.runtimeEffectImageLoader = new RuntimeEffectImageLoader2({
        maxConcurrent: 4,
        idleDelay: 160,
      })),
      (this.runtimeVacuumMapImagePreloader = new RuntimeVacuumMapImagePreloader2({
        maxConcurrent: 1,
      })),
      (this.vacuumMapEntityIds = new Set()),
      (this.cleanups = []),
      (this.componentCleanups = new Map()),
      (this.cameraCleanups = new Map()),
      (this.runtimeEntityComponentIndex = new Map()),
      (this.componentParentIds = new Map()),
      (this.componentHosts = new Map()),
      (this.componentRecords = new Map()),
      (this.componentAirflowLayers = new Map()),
      (this.componentEffectLayers = new Map()),
      (this.componentSelectionOverlays = new Map()),
      (this.componentSelectionLayers = new Map()),
      (this.componentPreviewStates = new Map()),
      (this.themeVariableNames = new Set()),
      (this.detailsStateSync = null),
      (this.activePopupId = null),
      (this.replacingDocument = false),
      (this.pendingEntityDetails = null),
      (this.runtimeDialogScaleContext = null),
      (this.selectedComponentId = null),
      (this.selectedComponentIds = new Set()),
      (this.activeGroupId = null),
      (this.socket = null),
      (this.runtimeSubscription = null),
      (this.socketGeneration = 0),
      (this.reconnectTimer = null),
      (this.reconnectAttempt = 0),
      (this.runtimeHydrationRetryTimer = null),
      (this.runtimeHydrationRetryAttempt = 0),
      (this.lastRuntimeResumeAt = 0),
      (this.runtimeEntityLimitSignature = ""),
      (this.removedRuntimeEntityIds = new Set()),
      (this.pendingOptimisticStates = new Map()),
      (this.confirmedLightVisualStates = new Map()),
      (this.destroyed = false),
      (this.resizeObserver = new ResizeObserver(() => this.resize())),
      this.resizeObserver.observe(rootContainerElement),
      (this.boundResize = () => this.resize()),
      (this.boundReconnect = () => {
        (this.historyRequestPolicy.resume(),
          this.refreshHistorySeries(),
          !this.destroyed &&
            (!this.socket || this.socket.readyState >= WebSocket.CLOSING) &&
            this.connectRuntime());
      }),
      (this.boundVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          for (const runtimeAbortController of this.historyAbortControllers)
            runtimeAbortController.abort("lifecycle");
          (window.clearTimeout(this.historyRetryTimer), (this.historyRetryTimer = 0));
        }
        if (document.visibilityState === "visible") {
          const now = Date.now();
          (this.document &&
            now - this.lastRuntimeResumeAt >= 1500 &&
            ((this.lastRuntimeResumeAt = now),
            this.connectRuntime({
              force: true,
            })),
            this.refreshHistorySeries());
        }
      }),
      (this.historyPollTimer = window.setInterval(() => this.refreshHistorySeries(), 30000)),
      window.visualViewport?.addEventListener("resize", this.boundResize),
      window.addEventListener("orientationchange", this.boundResize),
      window.addEventListener("online", this.boundReconnect),
      document.addEventListener("visibilitychange", this.boundVisibilityChange));
  }
  ["setDocument"](documentPayload, requestedPagePath = null) {
    this.destroyed = false;
    const map = this.options.editable
        ? new Map(
            [...this.componentHosts].filter(
              ([componentIdKey, componentHostNode]) =>
                (this.componentRecords.get(componentIdKey)?.type === "floorplan-auto-diagram" &&
                  componentHostNode.querySelector(".hb-floorplan-auto-diagram-preview")) ||
                (this.document?.projectId === documentPayload.projectId &&
                  this.componentRecords.get(componentIdKey)?.type === "interaction3d" &&
                  componentHostNode.parentElement === this.canvas),
            ),
          )
        : null,
      replacingDocument = this.replacingDocument;
    this.replacingDocument = true;
    try {
      (window.clearTimeout(this.historyRetryTimer),
        (this.historyRetryTimer = 0),
        (this.historyRetryAttempt = 0),
        window.clearTimeout(this.runtimeHydrationRetryTimer),
        (this.runtimeHydrationRetryTimer = null),
        (this.runtimeHydrationRetryAttempt = 0),
        this.closeRuntimeDialog(),
        this.runtimeStaticImageCache.stopped && this.runtimeStaticImageCache.reset(),
        this.runtimeEffectImageLoader.stopped && this.runtimeEffectImageLoader.reset(),
        this.runtimeVacuumMapImagePreloader.stopped && this.runtimeVacuumMapImagePreloader.reset(),
        (this.activePopupId = null));
      for (const historyAbortController of this.historyAbortControllers)
        historyAbortController.abort("lifecycle");
      (this.historyRequestPolicy.resume(),
        this.historySeries.clear(),
        this.historyFetches.clear(),
        (this.historyDocumentGeneration += 1),
        (this.historyPopupGeneration += 1),
        this.removedRuntimeEntityIds.clear(),
        (this.document = this.options.editable
          ? structuredClone(documentPayload)
          : documentPayload),
        (this.vacuumMapEntityIds = new Set(
          collectComponents2(
            [
              ...(this.document.sharedComponents || []),
              ...this.document.pages.flatMap(
                (documentPageRecord) => documentPageRecord.components || [],
              ),
            ],
            (vacuumMapComponent) => vacuumMapComponent.type === "vacuum-map",
          )
            .map((imageEntityComponent) =>
              String(imageEntityComponent.bindings?.entity?.entityId || ""),
            )
            .filter((entityIdText) => entityIdText.startsWith("image.")),
        )));
      const matchedPageRecord = this.document.pages.find(
          (searchedPageRecord) => searchedPageRecord.path === requestedPagePath,
        ),
        defaultPageRecord = this.document.pages.find(
          (defaultPathPageRecord) => defaultPathPageRecord.path === this.document.defaultPagePath,
        );
      if (
        ((this.page = matchedPageRecord || defaultPageRecord || this.document.pages[0]),
        this.render(map),
        this.preloadStaticImages(),
        !this.options.editable)
      ) {
        const filter = collectComponents2(
          [
            ...(this.document.sharedComponents || []),
            ...this.document.pages.flatMap((cameraPageRecord) => cameraPageRecord.components || []),
          ],
          (cameraComponentRecord) =>
            cameraComponentRecord.type === "camera" &&
            cameraComponentRecord.properties?.mediaVisible !== false &&
            cameraComponentRecord.properties?.displayMode !== "snapshot",
        )
          .map((cameraImageComponent) =>
            String(cameraImageComponent.bindings?.entity?.entityId || ""),
          )
          .filter(Boolean);
        prewarmCameraMedia2(filter);
      }
      (this.connectRuntime(), this.refreshHistorySeries());
    } finally {
      this.replacingDocument = replacingDocument;
    }
  }
  ["refreshBuiltinAssets"](assetVersions = []) {
    const assetsChanged = setBuiltinAssetVersions2(assetVersions);
    return (
      assetsChanged && this.document && (this.renderComponents(true), this.preloadStaticImages()),
      assetsChanged
    );
  }
  ["preloadStaticImages"]() {
    if (!this.document || !this.page) return;
    const collectPageImageSources = (pageRecord) =>
        collectComponents2(
          pageRecord,
          (assetImageComponent) =>
            assetImageComponent.type === "image" && assetImageComponent.properties?.assetId,
        )
          .map((assetImageRecord) => staticAssetImageSource2(assetImageRecord.properties.assetId))
          .filter(Boolean),
      sharedComponentById = new Map(
        (this.document.sharedComponents || []).map((sharedComponentRecord) => [
          sharedComponentRecord.id,
          sharedComponentRecord,
        ]),
      ),
      pageSharedComponents = (this.page.sharedComponentIds || [])
        .map((sharedComponentId) => sharedComponentById.get(sharedComponentId))
        .filter(Boolean),
      pageImageSources = collectPageImageSources([
        ...(this.page.components || []),
        ...pageSharedComponents,
      ]),
      sharedImageSources = collectPageImageSources([
        ...(this.document.sharedComponents || []),
        ...this.document.pages.flatMap((documentPageEntry) => documentPageEntry.components || []),
      ]);
    this.runtimeStaticImageCache.setSources(sharedImageSources, pageImageSources);
  }
  ["setEntityCatalog"](
    entityCatalogEntries = [],
    entityTranslations = {},
    deviceCatalogEntries = [],
  ) {
    ((this.entityMetadata = new Map(
      (entityCatalogEntries || [])
        .map((entityCatalogEntry): [string, any] => [
          String(entityCatalogEntry.entityId || ""),
          entityCatalogEntry,
        ])
        .filter(([entityCatalogId]) => entityCatalogId),
    )),
      (this.deviceMetadata = new Map(
        (deviceCatalogEntries || [])
          .map((deviceCatalogEntry): [string, any] => [
            String(deviceCatalogEntry.deviceId || ""),
            deviceCatalogEntry,
          ])
          .filter(([deviceCatalogId]) => deviceCatalogId),
      )),
      (this.entityTranslations =
        entityTranslations && typeof entityTranslations == "object" ? entityTranslations : {}),
      (this.entityCatalogReady = true),
      this.tryOpenPendingEntityDetails(),
      this.document &&
        (this.detailsStateSync?.refreshEntityCatalog?.(),
        this.renderComponents(true),
        this.connectRuntime()));
  }
  ["deviceProfile"](runtimeEntityKey) {
    return resolveXiaomiDeviceProfile2(
      runtimeEntityKey,
      this.entityMetadata,
      this.deviceMetadata,
      this.states,
    );
  }
  ["runtimeEntityId"](entityIdValue) {
    return String(entityIdValue || "");
  }
  ["iconVisibilityPageKey"]() {
    return String(this.page?.path || this.page?.id || "current-page");
  }
  /** 图标可视化是否可见；形参只是为了让 isIconVisible 回调签名保持一致。 */
  ["iconVisibilityState"](_iconVisibilityComponent = null) {
    return this.virtualEntityStates.get(this.iconVisibilityPageKey()) !== false;
  }
  ["toggleVirtualEntity"](virtualEntityId) {
    const parsedVirtualEntity = parseVirtualEntityId2(virtualEntityId);
    if (!parsedVirtualEntity || parsedVirtualEntity.kind !== ICON_VISIBILITY_VIRTUAL_KIND2)
      throw new Error("虚拟实体不存在。");
    if (
      ![...this.componentRecords.values()].some(
        (iconEffectComponent) => iconEffectComponent.type === "icon-button-effect",
      )
    )
      throw new Error("当前页面没有图标按钮（效果）。");
    const iconVisibilityPageKey = this.iconVisibilityPageKey(),
      isNextIconVisible = !this.iconVisibilityState();
    (this.virtualEntityStates.set(iconVisibilityPageKey, isNextIconVisible),
      this.states.set(virtualEntityId, {
        entityId: virtualEntityId,
        state: isNextIconVisible ? "on" : "off",
        attributes: {},
      }),
      this.renderComponents(true));
  }
  ["waterHeaterDetailsReady"](waterHeaterEntityId) {
    if (!this.entityCatalogReady) return false;
    const waterHeaterState = this.states.get(waterHeaterEntityId),
      waterHeaterAttributes = (waterHeaterState?.newState || waterHeaterState)?.attributes || {},
      measuredTemperature = Number(waterHeaterAttributes.temperature),
      minTemperature = Number(waterHeaterAttributes.min_temp),
      maxTemperature = Number(waterHeaterAttributes.max_temp);
    return (
      Number.isFinite(measuredTemperature) &&
      Number.isFinite(minTemperature) &&
      Number.isFinite(maxTemperature) &&
      maxTemperature > minTemperature
    );
  }
  ["cancelPendingEntityDetails"]() {
    (window.clearTimeout(this.pendingEntityDetails?.timer),
      window.clearTimeout(this.pendingEntityDetails?.retryTimer),
      (this.pendingEntityDetails = null));
  }
  ["deferEntityDetailsUntilReady"](
    detailsComponentRecord,
    detailsPreviewEntry,
    deferReasonText = "water-heater",
  ) {
    this.cancelPendingEntityDetails();
    const pendingDetailsRequest = {
        component: structuredClone(detailsComponentRecord),
        preview: detailsPreviewEntry,
        reason: deferReasonText,
        retryTimer: null,
        timer: null,
      },
      isCatalogDeferReason =
        deferReasonText === "catalog" || deferReasonText === "electric-bed-catalog";
    if (isCatalogDeferReason) {
      const retryPendingDetails = () => {
        if (this.pendingEntityDetails !== pendingDetailsRequest) return;
        const runtimeEntityId = this.runtimeEntityId(
          pendingDetailsRequest.component?.bindings?.entity?.entityId,
        );
        if (
          !this.entityCatalogReady ||
          (deferReasonText === "electric-bed-catalog" &&
            this.deviceProfile(runtimeEntityId)?.deviceType !== "electric-bed")
        ) {
          pendingDetailsRequest.retryTimer = window.setTimeout(retryPendingDetails, 260);
          return;
        }
        (this.cancelPendingEntityDetails(),
          this.showEntityDetails(pendingDetailsRequest.component, {
            preview: pendingDetailsRequest.preview,
          }));
      };
      pendingDetailsRequest.retryTimer = window.setTimeout(retryPendingDetails, 260);
    }
    ((pendingDetailsRequest.timer = window.setTimeout(
      () => {
        this.pendingEntityDetails === pendingDetailsRequest &&
          (this.cancelPendingEntityDetails(),
          isCatalogDeferReason &&
            this.detailsDialog?.classList.contains("electric-bed-loading-details") &&
            this.detailsDialog.close(),
          isCatalogDeferReason
            ? this.options.onError?.(new Error("设备信息正在加载，请稍后重试。"))
            : this.options.onError?.(new Error("热水器状态正在加载，请稍后重试。")));
      },
      isCatalogDeferReason ? 10000 : 3000,
    )),
      (this.pendingEntityDetails = pendingDetailsRequest));
  }
  ["tryOpenPendingEntityDetails"]() {
    const pendingEntityDetails = this.pendingEntityDetails;
    if (!pendingEntityDetails) return false;
    const runtimeEntityId2 = this.runtimeEntityId(
      pendingEntityDetails.component?.bindings?.entity?.entityId,
    );
    return !this.entityCatalogReady ||
      (pendingEntityDetails.reason === "water-heater" &&
        !this.waterHeaterDetailsReady(runtimeEntityId2)) ||
      (pendingEntityDetails.reason === "electric-bed-catalog" &&
        this.deviceProfile(runtimeEntityId2)?.deviceType !== "electric-bed")
      ? false
      : (this.cancelPendingEntityDetails(),
        this.showEntityDetails(pendingEntityDetails.component, {
          preview: pendingEntityDetails.preview,
        }),
        true);
  }
  ["profiledComponent"](
    profiledEntityComponent,
    profiledEntityId = profiledEntityComponent?.bindings?.entity?.entityId || "",
  ) {
    return applyXiaomiDeviceProfile2(
      profiledEntityComponent,
      this.deviceProfile(this.runtimeEntityId(profiledEntityId)) ||
        this.deviceProfile(profiledEntityId),
    );
  }
  ["powerEntityId"](
    powerTargetComponent,
    powerTargetEntityId = powerTargetComponent?.bindings?.entity?.entityId || "",
  ) {
    const runtimeEntityId3 = this.runtimeEntityId(powerTargetEntityId),
      deviceProfile =
        this.deviceProfile(runtimeEntityId3) || this.deviceProfile(powerTargetEntityId),
      resolvedPowerEntityId = entityPowerTarget2(
        runtimeEntityId3,
        powerTargetComponent,
        deviceProfile,
      );
    if (resolvedPowerEntityId !== runtimeEntityId3)
      return this.runtimeEntityId(resolvedPowerEntityId);
    const relatedPopupRelation = relatedPopupContext2(
      powerTargetComponent,
      this.entityMetadata,
      this.deviceMetadata,
      this.states,
    );
    if (
      powerTargetComponent?.type !== "air-conditioner" &&
      relatedPopupRelation?.deviceType === "bath-heater"
    ) {
      const siblingEntityRecord = relatedPopupRelation.siblings?.find(
        (lightEntityRecord) =>
          lightEntityRecord.domain === "light" && entityMetadataIsAvailable2(lightEntityRecord),
      );
      if (siblingEntityRecord?.entityId) return this.runtimeEntityId(siblingEntityRecord.entityId);
    }
    return runtimeEntityId3;
  }
  ["runtimePowerComponent"](
    runtimePowerSourceComponent,
    runtimePowerEntityId = runtimePowerSourceComponent?.bindings?.entity?.entityId || "",
  ) {
    const profiledComponent = this.profiledComponent(
        runtimePowerSourceComponent,
        runtimePowerEntityId,
      ),
      runtimeEntityId4 = this.runtimeEntityId(runtimePowerEntityId),
      powerEntityId = this.powerEntityId(profiledComponent, runtimePowerEntityId);
    return !powerEntityId ||
      (powerEntityId === runtimeEntityId4 && runtimeEntityId4 === runtimePowerEntityId)
      ? profiledComponent
      : {
          ...profiledComponent,
          bindings: {
            ...(profiledComponent.bindings || {}),
            entity: {
              entityId: powerEntityId,
            },
          },
          properties: {
            ...(profiledComponent.properties || {}),
            runtimePowerEntityId: powerEntityId,
          },
        };
  }
  ["navigate"](targetPagePath) {
    const targetPageRecord = this.document?.pages.find(
      (pageCandidate) => pageCandidate.path === targetPagePath,
    );
    targetPageRecord &&
      (targetPageRecord !== this.page && this.closeRuntimeDialog(),
      (this.page = targetPageRecord),
      window.clearTimeout(this.runtimeHydrationRetryTimer),
      (this.runtimeHydrationRetryTimer = null),
      (this.runtimeHydrationRetryAttempt = 0),
      this.preloadStaticImages(),
      this.renderComponents(),
      this.connectRuntime(),
      this.refreshHistorySeries(),
      this.options.onPageChange?.(targetPageRecord));
  }
  ["setSelectedComponent"](selectedComponentIdValue) {
    this.setSelectedComponents(
      selectedComponentIdValue ? [selectedComponentIdValue] : [],
      selectedComponentIdValue,
    );
  }
  ["setSelectedComponents"](nextSelectedIds, primarySelectedId = null) {
    ((this.selectedComponentIds = new Set(
      (nextSelectedIds || []).filter(
        (existingSelectedId) => !!this.componentRecords.get(existingSelectedId),
      ),
    )),
      (this.selectedComponentId = this.selectedComponentIds.has(primarySelectedId)
        ? primarySelectedId
        : this.selectedComponentIds.values().next().value || null),
      this.syncSelection());
  }
  ["setActiveGroup"](activeGroupIdValue = null) {
    ((this.activeGroupId =
      activeGroupIdValue && this.componentRecords.get(activeGroupIdValue)?.type === "group"
        ? activeGroupIdValue
        : null),
      this.syncActiveGroup());
  }
  ["syncActiveGroup"]() {
    if (this.canvas) {
      this.canvas.classList.toggle("hb-editing-group", !!this.activeGroupId);
      for (const [groupComponentId, groupHostElement] of this.componentHosts)
        groupHostElement.classList.toggle(
          "hb-active-edit-group",
          groupComponentId === this.activeGroupId && groupHostElement.parentElement === this.canvas,
        );
    }
  }
  ["setComponentSelectionLayer"](layerComponentId, selectionLayerName = "button") {
    layerComponentId &&
      (selectionLayerName === "airflow"
        ? this.componentSelectionLayers.set(layerComponentId, "airflow")
        : selectionLayerName === "effect"
          ? this.componentSelectionLayers.set(layerComponentId, "effect")
          : selectionLayerName === "perspective"
            ? this.componentSelectionLayers.set(layerComponentId, "perspective")
            : this.componentSelectionLayers.delete(layerComponentId),
      this.syncSelection());
  }
  ["setComponentPreviewState"](previewComponentId, previewStateValue = "auto") {
    (previewStateValue === "on" || previewStateValue === "off"
      ? this.componentPreviewStates.set(previewComponentId, previewStateValue)
      : this.componentPreviewStates.delete(previewComponentId),
      this.previewComponentProperties(previewComponentId));
  }
  ["previewComponentTransform"](transformComponentId, transformInput: Record<string, number> = {}) {
    const transformComponentRecord = this.componentRecords.get(transformComponentId),
      transformHostElement = this.componentHosts.get(transformComponentId);
    !transformComponentRecord ||
      !transformHostElement ||
      ((transformComponentRecord.position = {
        ...(transformComponentRecord.position || {}),
      }),
      (transformComponentRecord.style = {
        ...(transformComponentRecord.style || {}),
      }),
      Number.isFinite(transformInput.x) &&
        ((transformComponentRecord.position.x = transformInput.x),
        (transformHostElement.style.left = transformInput.x + "px")),
      Number.isFinite(transformInput.y) &&
        ((transformComponentRecord.position.y = transformInput.y),
        (transformHostElement.style.top = transformInput.y + "px")),
      Number.isFinite(transformInput.width) &&
        ((transformComponentRecord.position.width = transformInput.width),
        (transformHostElement.style.width = transformInput.width + "px")),
      Number.isFinite(transformInput.height) &&
        ((transformComponentRecord.position.height = transformInput.height),
        (transformHostElement.style.height = transformInput.height + "px")),
      Number.isFinite(transformInput.rotation) &&
        (transformComponentRecord.position.rotation = transformInput.rotation),
      Number.isFinite(transformInput.scale) &&
        (transformComponentRecord.style.scale = transformInput.scale),
      (Number.isFinite(transformInput.rotation) || Number.isFinite(transformInput.scale)) &&
        (transformHostElement.style.transform =
          "rotate(" +
          Number(transformComponentRecord.position.rotation || 0) +
          "deg) scale(" +
          Number(transformComponentRecord.style.scale || 1) +
          ")"),
      this.syncComponentSelectionOverlay(transformComponentId),
      this.updateTransformHandleScale(transformHostElement, transformComponentRecord));
  }
  ["previewComponentProperties"](propertyComponentId, propertyOverrides: ComponentPayload = {}) {
    const propertyComponentRecord = this.componentRecords.get(propertyComponentId),
      propertyHostElement = this.componentHosts.get(propertyComponentId);
    if (!propertyComponentRecord || !propertyHostElement) return;
    if (
      ((propertyComponentRecord.properties = {
        ...(propertyComponentRecord.properties || {}),
        ...propertyOverrides,
      }),
      propertyComponentRecord.type === "camera" &&
        Object.hasOwn(propertyOverrides, "label") &&
        this.detailsDialog?.dataset?.componentId === propertyComponentId)
    ) {
      const selector = this.detailsDialog.querySelector(".hb-camera-preview-heading strong");
      selector &&
        (selector.textContent = componentDialogTitle(propertyComponentRecord, "摄像头实时预览"));
    }
    if (Number.isFinite(propertyOverrides.opacity)) {
      const imageComponentElement = propertyHostElement.querySelector(".hb-image-component");
      imageComponentElement &&
        (imageComponentElement.style.opacity = String(
          Math.max(0, Math.min(1, propertyOverrides.opacity)),
        ));
      const vacuumMapComponentElement = propertyHostElement.querySelector(
        ".hb-vacuum-map-component",
      );
      vacuumMapComponentElement &&
        (vacuumMapComponentElement.style.opacity = String(
          Math.max(0, Math.min(1, propertyOverrides.opacity)),
        ));
    }
    if (propertyComponentRecord.type === "light-statistics") {
      this.refreshRuntimeComponent(propertyComponentId);
      return;
    }
    const list = [
      "flow-line",
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
      "line-chart",
      "percentage-bar",
      "scene-mode",
    ];
    if (this.options.editable && list.includes(propertyComponentRecord.type)) {
      this.refreshEditorComponent(propertyComponentId);
      return;
    }
    if (
      [
        "flow-line",
        "time",
        "date",
        "weather",
        "line-chart",
        "percentage-bar",
        "panel-frame",
        "icon-button-effect",
        "title-button",
        "icon-button",
        "device-button",
        "presence-sensor",
        "air-conditioner",
        "camera",
        "vacuum-map",
      ].includes(propertyComponentRecord.type)
    ) {
      this.renderComponents();
      return;
    }
    if (propertyComponentRecord.type === "navigation-button") {
      const existingHostElement = [...propertyHostElement.children].find(
          (canvasChildElement) => !canvasChildElement.classList.contains("hb-selection-bounds"),
        ),
        componentRenderOptions = {
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
          isIconVisible: (iconVisibilityComponent) =>
            this.iconVisibilityState(iconVisibilityComponent),
          navigate: (navigationPath) => this.navigate(navigationPath),
          cleanup: (cleanupCallback) => this.cleanups.push(cleanupCallback),
        },
        renderedComponentElement = renderRegisteredComponent2(
          this.profiledComponent(propertyComponentRecord),
          componentRenderOptions,
        ),
        canvasComponentScale = Number(this.document.canvas.componentScale || 1);
      (canvasComponentScale !== 1 &&
        ((renderedComponentElement.style.width = 100 / canvasComponentScale + "%"),
        (renderedComponentElement.style.height = 100 / canvasComponentScale + "%"),
        (renderedComponentElement.style.transform = "scale(" + canvasComponentScale + ")"),
        (renderedComponentElement.style.transformOrigin = "top left")),
        existingHostElement
          ? existingHostElement.replaceWith(renderedComponentElement)
          : propertyHostElement.prepend(renderedComponentElement));
    }
  }
  ["syncSelection"]() {
    (this.canvas
      ?.querySelectorAll(".hb-multi-selection-bounds")
      .forEach((multiBoundsElement) => multiBoundsElement.remove()),
      this.canvas
        ?.querySelectorAll(".hb-component-selection-overlay")
        .forEach((multiBoundsLayerElement) => multiBoundsLayerElement.remove()),
      this.componentSelectionOverlays.clear());
    for (const groupedAirflowLayerElement of this.componentAirflowLayers.values())
      groupedAirflowLayerElement
        .querySelectorAll(":scope > .hb-selection-bounds")
        .forEach((staleAirflowElement) => staleAirflowElement.remove());
    for (const [hostedComponentId, hostedComponentElement] of this.componentHosts) {
      const hostedComponentRecord = this.componentRecords.get(hostedComponentId),
        editable = this.options.editable && this.selectedComponentIds.has(hostedComponentId),
        isGeneratedFloorplan =
          hostedComponentRecord?.type === "floorplan-auto-diagram" &&
          hostedComponentRecord.properties?.generated !== true;
      if (
        ((hostedComponentElement.hidden = isGeneratedFloorplan
          ? !editable
          : hostedComponentRecord?.style?.visible === false),
        hostedComponentElement.classList.toggle("selected", editable),
        hostedComponentElement.classList.toggle(
          "selection-primary",
          editable && hostedComponentId === this.selectedComponentId,
        ),
        hostedComponentElement.classList.toggle(
          "hb-light-statistics-selection-host",
          editable &&
            this.selectedComponentIds.size === 1 &&
            hostedComponentRecord?.type === "light-statistics",
        ),
        hostedComponentElement
          .querySelectorAll(":scope > .hb-selection-bounds, :scope > .hb-transform-handle")
          .forEach((staleOverlayElement) => staleOverlayElement.remove()),
        !editable)
      )
        continue;
      const isAirflowSelectionActive =
          this.selectedComponentIds.size === 1 &&
          hostedComponentId === this.selectedComponentId &&
          hostedComponentRecord?.type === "air-conditioner" &&
          this.componentSelectionLayers.get(hostedComponentId) === "airflow",
        isEffectSelectionActive =
          this.selectedComponentIds.size === 1 &&
          hostedComponentId === this.selectedComponentId &&
          hostedComponentRecord?.type === "icon-button-effect" &&
          this.componentSelectionLayers.get(hostedComponentId) === "effect",
        isDoorWindowSelectionActive =
          this.selectedComponentIds.size === 1 &&
          hostedComponentId === this.selectedComponentId &&
          hostedComponentRecord?.type === "presence-sensor" &&
          hostedComponentRecord?.properties?.sensorKind === "door-window" &&
          this.componentSelectionLayers.get(hostedComponentId) === "perspective";
      if (isAirflowSelectionActive)
        this.appendAirflowTransformHandles(
          this.componentAirflowLayers.get(hostedComponentId),
          hostedComponentRecord,
        );
      else {
        if (
          isEffectSelectionActive &&
          this.componentEffectLayers.get(hostedComponentId) &&
          !this.componentEffectLayers.get(hostedComponentId).hidden
        )
          this.appendEffectSelectionBounds(
            this.componentEffectLayers.get(hostedComponentId),
            hostedComponentRecord,
          );
        else {
          if (isDoorWindowSelectionActive) {
            const componentSelectionOverlay =
              this.createComponentSelectionOverlay(hostedComponentElement, hostedComponentRecord) ||
              hostedComponentElement;
            this.appendDoorWindowPerspectiveHandles(
              hostedComponentElement,
              hostedComponentRecord,
              componentSelectionOverlay,
            );
          } else {
            const hasSingleSelection = this.selectedComponentIds.size === 1,
              componentSelectionOverlay2 = hasSingleSelection
                ? this.createComponentSelectionOverlay(
                    hostedComponentElement,
                    hostedComponentRecord,
                  )
                : hostedComponentElement;
            this.appendTransformHandles(
              hostedComponentElement,
              hostedComponentRecord,
              hasSingleSelection,
              componentSelectionOverlay2 || hostedComponentElement,
            );
          }
        }
      }
    }
    this.selectedComponentIds.size > 1 && this.appendMultiSelectionBounds();
  }
  ["selectedScaleRecords"]() {
    const selectionEntries = [...this.selectedComponentIds].map((selectionComponentId) => ({
        component: this.componentRecords.get(selectionComponentId),
        host: this.componentHosts.get(selectionComponentId),
      })),
      sharedParentElement = selectionEntries[0]?.host?.parentElement || null;
    return selectionEntries.length < 2 ||
      selectionEntries.some(
        (selectionEntry) =>
          !selectionEntry.component ||
          !selectionEntry.host ||
          selectionEntry.host.parentElement !== sharedParentElement ||
          selectionEntry.component.properties?.layoutMode === "fill",
      )
      ? []
      : selectionEntries;
  }
  ["componentParentTransform"](transformChainComponentId) {
    let ancestorComponentId = this.componentParentIds?.get(transformChainComponentId) || null,
      accumulatedRotation = 0,
      accumulatedScale = 1;
    const set = new Set();
    for (; ancestorComponentId && !set.has(ancestorComponentId);) {
      set.add(ancestorComponentId);
      const ancestorComponentRecord = this.componentRecords.get(ancestorComponentId);
      if (!ancestorComponentRecord) break;
      ((accumulatedRotation += Number(ancestorComponentRecord.position?.rotation || 0)),
        (accumulatedScale *= Math.max(
          0.01,
          Math.min(5, Number(ancestorComponentRecord.style?.scale || 1)),
        )),
        (ancestorComponentId = this.componentParentIds?.get(ancestorComponentId) || null));
    }
    return {
      rotation: accumulatedRotation,
      scale: accumulatedScale,
    };
  }
  ["componentTransformChain"](chainStartComponentId) {
    const transformChainRecords = [];
    let chainComponentId = chainStartComponentId;
    const visitedChainComponentIdSet = new Set();
    for (; chainComponentId && !visitedChainComponentIdSet.has(chainComponentId);) {
      visitedChainComponentIdSet.add(chainComponentId);
      const chainComponentRecord = this.componentRecords.get(chainComponentId);
      if (!chainComponentRecord) break;
      (transformChainRecords.push(chainComponentRecord),
        (chainComponentId = this.componentParentIds?.get(chainComponentId) || null));
    }
    return transformChainRecords;
  }
  ["componentWorldTransform"](worldTransformComponentId) {
    return this.componentTransformChain(worldTransformComponentId).reduce(
      (accumulatedTransform, chainEntryRecord) => ({
        rotation: accumulatedTransform.rotation + Number(chainEntryRecord.position?.rotation || 0),
        scale:
          accumulatedTransform.scale *
          Math.max(0.01, Math.min(5, Number(chainEntryRecord.style?.scale || 1))),
      }),
      {
        rotation: 0,
        scale: 1,
      },
    );
  }
  ["worldPointToComponentLocal"](localPointComponentId, worldPointX, worldPointY) {
    let localPoint = {
      x: Number(worldPointX || 0),
      y: Number(worldPointY || 0),
    };
    const reverse = this.componentTransformChain(localPointComponentId).reverse();
    for (const reverseChainEntry of reverse) {
      const entryPosition = reverseChainEntry.position || {},
        entryWidth = Number(entryPosition.width || 100),
        entryHeight = Number(entryPosition.height || 100),
        entryScale = Math.max(0.01, Math.min(5, Number(reverseChainEntry.style?.scale || 1))),
        entryRotationRad = (Number(entryPosition.rotation || 0) * Math.PI) / 180,
        cos = Math.cos(entryRotationRad),
        sin = Math.sin(entryRotationRad),
        entryCenterX = Number(entryPosition.x || 0) + entryWidth / 2,
        entryCenterY = Number(entryPosition.y || 0) + entryHeight / 2,
        offsetAlongX = (localPoint.x - entryCenterX) / entryScale,
        offsetAlongY = (localPoint.y - entryCenterY) / entryScale;
      localPoint = {
        x: entryWidth / 2 + offsetAlongX * cos + offsetAlongY * sin,
        y: entryHeight / 2 - offsetAlongX * sin + offsetAlongY * cos,
      };
    }
    return localPoint;
  }
  ["componentLocalPointToWorld"](worldPointComponentKey, localPointX, localPointY) {
    let worldPoint = {
      x: Number(localPointX || 0),
      y: Number(localPointY || 0),
    };
    for (const forwardChainEntry of this.componentTransformChain(worldPointComponentKey)) {
      const forwardEntryPosition = forwardChainEntry.position || {},
        forwardEntryWidth = Number(forwardEntryPosition.width || 100),
        forwardEntryHeight = Number(forwardEntryPosition.height || 100),
        forwardEntryScale = Math.max(
          0.01,
          Math.min(5, Number(forwardChainEntry.style?.scale || 1)),
        ),
        forwardEntryRotationRad = (Number(forwardEntryPosition.rotation || 0) * Math.PI) / 180,
        forwardOffsetX = (worldPoint.x - forwardEntryWidth / 2) * forwardEntryScale,
        forwardOffsetY = (worldPoint.y - forwardEntryHeight / 2) * forwardEntryScale;
      worldPoint = {
        x:
          Number(forwardEntryPosition.x || 0) +
          forwardEntryWidth / 2 +
          forwardOffsetX * Math.cos(forwardEntryRotationRad) -
          forwardOffsetY * Math.sin(forwardEntryRotationRad),
        y:
          Number(forwardEntryPosition.y || 0) +
          forwardEntryHeight / 2 +
          forwardOffsetX * Math.sin(forwardEntryRotationRad) +
          forwardOffsetY * Math.cos(forwardEntryRotationRad),
      };
    }
    return worldPoint;
  }
  ["componentVisualBounds"](boundsComponentRecord, boundsHostElement = null) {
    const boundsPosition = boundsComponentRecord.position || {},
      boundsWidth = Math.max(0.01, Number(boundsPosition.width || 100)),
      boundsHeight = Math.max(0.01, Number(boundsPosition.height || 100));
    let layerWidth = boundsWidth,
      layerHeight = boundsHeight,
      layerOffsetX = 0,
      layerOffsetY = 0;
    if (boundsComponentRecord.type === "light-statistics" && boundsHostElement) {
      const selectionBoundsElement = boundsHostElement.querySelector(
          ":scope > .hb-selection-bounds",
        ),
        boundsInsetValues = selectionBoundsElement
          ? [
              Number.parseFloat(selectionBoundsElement.style.left),
              Number.parseFloat(selectionBoundsElement.style.top),
              Number.parseFloat(selectionBoundsElement.style.width),
              Number.parseFloat(selectionBoundsElement.style.height),
            ]
          : [];
      boundsInsetValues.every(Number.isFinite) &&
        boundsInsetValues[2] > 0 &&
        boundsInsetValues[3] > 0 &&
        ([layerOffsetX, layerOffsetY, layerWidth, layerHeight] = boundsInsetValues);
    }
    const boundsScale = Math.max(
        0.01,
        Math.min(5, Number(boundsComponentRecord.style?.scale || 1)),
      ),
      boundsRotationRad = (Number(boundsPosition.rotation || 0) * Math.PI) / 180,
      scaledWidth = layerWidth * boundsScale,
      scaledHeight = layerHeight * boundsScale,
      rotatedHalfWidth =
        (Math.abs(Math.cos(boundsRotationRad)) * scaledWidth +
          Math.abs(Math.sin(boundsRotationRad)) * scaledHeight) /
        2,
      rotatedHalfHeight =
        (Math.abs(Math.sin(boundsRotationRad)) * scaledWidth +
          Math.abs(Math.cos(boundsRotationRad)) * scaledHeight) /
        2,
      boundsCenterX = Number(boundsPosition.x || 0) + boundsWidth / 2,
      boundsCenterY = Number(boundsPosition.y || 0) + boundsHeight / 2,
      layerCenterX = Number(boundsPosition.x || 0) + layerOffsetX + layerWidth / 2,
      layerCenterY = Number(boundsPosition.y || 0) + layerOffsetY + layerHeight / 2,
      centerDeltaX = (layerCenterX - boundsCenterX) * boundsScale,
      centerDeltaY = (layerCenterY - boundsCenterY) * boundsScale,
      rotatedCenterX =
        boundsCenterX +
        centerDeltaX * Math.cos(boundsRotationRad) -
        centerDeltaY * Math.sin(boundsRotationRad),
      rotatedCenterY =
        boundsCenterY +
        centerDeltaX * Math.sin(boundsRotationRad) +
        centerDeltaY * Math.cos(boundsRotationRad);
    return {
      left: rotatedCenterX - rotatedHalfWidth,
      top: rotatedCenterY - rotatedHalfHeight,
      right: rotatedCenterX + rotatedHalfWidth,
      bottom: rotatedCenterY + rotatedHalfHeight,
    };
  }
  ["scaleRecordsBounds"](componentSelectionEntries) {
    const boundsEntries = componentSelectionEntries.map((selectionEntryRecord) =>
      this.componentVisualBounds(selectionEntryRecord.component, selectionEntryRecord.host),
    );
    return {
      left: Math.min(...boundsEntries.map((leftBoundEntry) => leftBoundEntry.left)),
      top: Math.min(...boundsEntries.map((topBoundEntry) => topBoundEntry.top)),
      right: Math.max(...boundsEntries.map((rightBoundEntry) => rightBoundEntry.right)),
      bottom: Math.max(...boundsEntries.map((bottomBoundEntry) => bottomBoundEntry.bottom)),
    };
  }
  ["refreshMultiSelectionBounds"]() {
    const existingMultiBoundsElement =
      this.canvas?.querySelector<HTMLElement>(".hb-multi-selection-bounds");
    if (
      !existingMultiBoundsElement ||
      !this.selectedComponentIds ||
      this.selectedComponentIds.size < 2
    )
      return;
    const edScaleRecords = this.selectedScaleRecords();
    if (!edScaleRecords.length) {
      existingMultiBoundsElement.remove();
      return;
    }
    const scaleRecordsBounds = this.scaleRecordsBounds(edScaleRecords);
    (Object.assign(existingMultiBoundsElement.style, {
      left: scaleRecordsBounds.left + "px",
      top: scaleRecordsBounds.top + "px",
      width: Math.max(1, scaleRecordsBounds.right - scaleRecordsBounds.left) + "px",
      height: Math.max(1, scaleRecordsBounds.bottom - scaleRecordsBounds.top) + "px",
    }),
      this.updateMultiSelectionHandleScale(existingMultiBoundsElement));
  }
  ["updateMultiSelectionHandleScale"](multiSelectionHandleElement) {
    if (!multiSelectionHandleElement) return;
    const appliedMinScale = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1),
      handleComponentId = multiSelectionHandleElement.parentElement?.dataset?.componentId || null,
      scale = handleComponentId ? this.componentWorldTransform(handleComponentId).scale : 1,
      multiHandleUiScale = 1 / Math.max(0.001, appliedMinScale * scale);
    (multiSelectionHandleElement.style.setProperty("--hb-ui-scale", String(multiHandleUiScale)),
      multiSelectionHandleElement.style.setProperty(
        "--hb-handle-outset",
        30 * multiHandleUiScale + "px",
      ));
    const boundingClientRect = multiSelectionHandleElement.getBoundingClientRect();
    multiSelectionHandleElement.classList.toggle(
      "handles-outside",
      boundingClientRect.width < 132 || boundingClientRect.height < 112,
    );
  }
  ["appendMultiSelectionBounds"]() {
    const edScaleRecords2 = this.selectedScaleRecords();
    if (!edScaleRecords2.length) return;
    const scaleRecordsBounds2 = this.scaleRecordsBounds(edScaleRecords2),
      multiSelectionBoundsElement = document.createElement("div");
    ((multiSelectionBoundsElement.className = "hb-selection-bounds hb-multi-selection-bounds"),
      Object.assign(multiSelectionBoundsElement.style, {
        left: scaleRecordsBounds2.left + "px",
        top: scaleRecordsBounds2.top + "px",
        width: Math.max(1, scaleRecordsBounds2.right - scaleRecordsBounds2.left) + "px",
        height: Math.max(1, scaleRecordsBounds2.bottom - scaleRecordsBounds2.top) + "px",
      }));
    for (const cornerName of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const cornerMarkerElement = document.createElement("i");
      ((cornerMarkerElement.className = "hb-corner-marker hb-corner-" + cornerName),
        cornerMarkerElement.setAttribute("aria-hidden", "true"),
        multiSelectionBoundsElement.append(cornerMarkerElement));
    }
    const multiResizeHandleElement = document.createElement("button");
    ((multiResizeHandleElement.type = "button"),
      (multiResizeHandleElement.className = "hb-transform-handle hb-resize-handle"),
      (multiResizeHandleElement.title = "拖动整体缩放"),
      multiResizeHandleElement.addEventListener("pointerdown", (resizePointerEvent) =>
        this.startComponentsScale(
          resizePointerEvent,
          edScaleRecords2,
          scaleRecordsBounds2,
          multiSelectionBoundsElement,
        ),
      ));
    const multiRotateHandleElement = document.createElement("button");
    ((multiRotateHandleElement.type = "button"),
      (multiRotateHandleElement.className = "hb-transform-handle hb-rotate-handle"),
      (multiRotateHandleElement.title = "拖动整体旋转"),
      multiRotateHandleElement.addEventListener("pointerdown", (rotatePointerEvent) =>
        this.startComponentsRotate(
          rotatePointerEvent,
          edScaleRecords2,
          scaleRecordsBounds2,
          multiSelectionBoundsElement,
        ),
      ),
      multiSelectionBoundsElement.append(multiResizeHandleElement, multiRotateHandleElement),
      (edScaleRecords2[0]?.host?.parentElement || this.canvas).append(multiSelectionBoundsElement),
      this.updateMultiSelectionHandleScale(multiSelectionBoundsElement));
  }
  ["previewComponentsTransform"](
    componentTransforms,
    primaryComponentId = this.selectedComponentId,
  ) {
    for (const vector of componentTransforms || []) {
      const previewComponentRecord = this.componentRecords.get(vector.componentId),
        previewHostElement = this.componentHosts.get(vector.componentId);
      !previewComponentRecord ||
        !previewHostElement ||
        ((previewComponentRecord.position = {
          ...(previewComponentRecord.position || {}),
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
        }),
        Number.isFinite(vector.scale) &&
          (previewComponentRecord.style = {
            ...(previewComponentRecord.style || {}),
            scale: vector.scale,
          }),
        Number.isFinite(vector.rotation) &&
          (previewComponentRecord.position.rotation = vector.rotation),
        Number.isFinite(vector.x) && (previewHostElement.style.left = vector.x + "px"),
        Number.isFinite(vector.y) && (previewHostElement.style.top = vector.y + "px"),
        (Number.isFinite(vector.scale) || Number.isFinite(vector.rotation)) &&
          (previewHostElement.style.transform =
            "rotate(" +
            Number(previewComponentRecord.position?.rotation || 0) +
            "deg) scale(" +
            Number(previewComponentRecord.style?.scale || 1) +
            ")"));
    }
    (this.syncSelection(),
      this.options.onComponentsTransformPreview?.(componentTransforms, primaryComponentId));
  }
  ["startComponentsScale"](
    scalePointerEvent,
    scaleEntries,
    selectionBounds,
    measurementHostElement,
  ) {
    (scalePointerEvent.preventDefault(), scalePointerEvent.stopPropagation());
    const hostBoundingRect = measurementHostElement.getBoundingClientRect(),
      hostCenterX = hostBoundingRect.left + hostBoundingRect.width / 2,
      hostCenterY = hostBoundingRect.top + hostBoundingRect.height / 2,
      initialPointerDistance = Math.max(
        1,
        Math.hypot(
          scalePointerEvent.clientX - hostCenterX,
          scalePointerEvent.clientY - hostCenterY,
        ),
      ),
      groupCenterX = (selectionBounds.left + selectionBounds.right) / 2,
      groupCenterY = (selectionBounds.top + selectionBounds.bottom) / 2,
      scaledEntries = scaleEntries.map((entryRecord) => {
        const scaledEntryPosition = entryRecord.component.position || {},
          scaledEntryWidth = Number(scaledEntryPosition.width || 100),
          scaledEntryHeight = Number(scaledEntryPosition.height || 100);
        return {
          ...entryRecord,
          width: scaledEntryWidth,
          height: scaledEntryHeight,
          centerX: Number(scaledEntryPosition.x || 0) + scaledEntryWidth / 2,
          centerY: Number(scaledEntryPosition.y || 0) + scaledEntryHeight / 2,
          scale: Math.max(0.01, Math.min(5, Number(entryRecord.component.style?.scale || 1))),
        };
      }),
      minScaleFactor = Math.max(...scaledEntries.map((scaleEntry) => 0.01 / scaleEntry.scale)),
      maxScaleFactor = Math.min(
        ...scaledEntries.map((scaleEntryLimit) => 5 / scaleEntryLimit.scale),
      );
    let appliedScaleFactor = 1,
      transformPreviewEntries = [],
      hasStartedScaling = false;
    const pointerId = scalePointerEvent.pointerId;
    scalePointerEvent.currentTarget.setPointerCapture(pointerId);
    const scaleMoveHandler = (scaleMoveEvent) => {
        if (scaleMoveEvent.pointerId !== pointerId) return;
        const hypot = Math.hypot(
          scaleMoveEvent.clientX - hostCenterX,
          scaleMoveEvent.clientY - hostCenterY,
        );
        ((appliedScaleFactor = Math.max(
          minScaleFactor,
          Math.min(maxScaleFactor, hypot / initialPointerDistance),
        )),
          (transformPreviewEntries = scaledEntries.map((scaledEntry) => {
            const previewCenterX =
                groupCenterX + (scaledEntry.centerX - groupCenterX) * appliedScaleFactor,
              previewCenterY =
                groupCenterY + (scaledEntry.centerY - groupCenterY) * appliedScaleFactor,
              previewScale = scaledEntry.scale * appliedScaleFactor,
              previewX = previewCenterX - scaledEntry.width / 2,
              previewY = previewCenterY - scaledEntry.height / 2;
            return (
              (scaledEntry.component.position = {
                ...(scaledEntry.component.position || {}),
                x: previewX,
                y: previewY,
              }),
              (scaledEntry.component.style = {
                ...(scaledEntry.component.style || {}),
                scale: previewScale,
              }),
              (scaledEntry.host.style.left = previewX + "px"),
              (scaledEntry.host.style.top = previewY + "px"),
              (scaledEntry.host.style.transform =
                "rotate(" +
                Number(scaledEntry.component.position?.rotation || 0) +
                "deg) scale(" +
                previewScale +
                ")"),
              {
                componentId: scaledEntry.component.id,
                x: previewX,
                y: previewY,
                scale: previewScale,
              }
            );
          })),
          Object.assign(measurementHostElement.style, {
            left: groupCenterX + (selectionBounds.left - groupCenterX) * appliedScaleFactor + "px",
            top: groupCenterY + (selectionBounds.top - groupCenterY) * appliedScaleFactor + "px",
            width:
              Math.max(1, (selectionBounds.right - selectionBounds.left) * appliedScaleFactor) +
              "px",
            height:
              Math.max(1, (selectionBounds.bottom - selectionBounds.top) * appliedScaleFactor) +
              "px",
          }),
          this.updateMultiSelectionHandleScale(measurementHostElement),
          this.options.onComponentsTransformPreview?.(
            transformPreviewEntries,
            this.selectedComponentId,
          ));
      },
      scaleEndHandler = (scaleEndEvent = null) => {
        hasStartedScaling ||
          (scaleEndEvent?.pointerId != null && scaleEndEvent.pointerId !== pointerId) ||
          ((hasStartedScaling = true),
          window.removeEventListener("pointermove", scaleMoveHandler, true),
          window.removeEventListener("pointerup", scaleEndHandler, true),
          window.removeEventListener("pointercancel", scaleEndHandler, true),
          window.removeEventListener("blur", scaleEndHandler),
          appliedScaleFactor !== 1 &&
            transformPreviewEntries.length &&
            this.options.onComponentsTransform?.(
              transformPreviewEntries,
              this.selectedComponentId,
            ));
      };
    (window.addEventListener("pointermove", scaleMoveHandler, true),
      window.addEventListener("pointerup", scaleEndHandler, true),
      window.addEventListener("pointercancel", scaleEndHandler, true),
      window.addEventListener("blur", scaleEndHandler));
  }
  ["startComponentsRotate"](
    airflowComponentRotateEvent,
    rotateEntries,
    rotationBounds,
    rotationHostElement,
  ) {
    (airflowComponentRotateEvent.preventDefault(), airflowComponentRotateEvent.stopPropagation());
    const rotationHostRect = rotationHostElement.getBoundingClientRect(),
      rotationCenterX = rotationHostRect.left + rotationHostRect.width / 2,
      rotationCenterY = rotationHostRect.top + rotationHostRect.height / 2,
      rotationBoundsCenterX = (rotationBounds.left + rotationBounds.right) / 2,
      rotationBoundsCenterY = (rotationBounds.top + rotationBounds.bottom) / 2,
      rotatableEntries = rotateEntries.map((rotatableEntry) => {
        const rotatableEntryPosition = rotatableEntry.component.position || {},
          rotatableEntryWidth = Number(rotatableEntryPosition.width || 100),
          rotatableEntryHeight = Number(rotatableEntryPosition.height || 100);
        return {
          ...rotatableEntry,
          componentId: rotatableEntry.component.id,
          width: rotatableEntryWidth,
          height: rotatableEntryHeight,
          centerX: Number(rotatableEntryPosition.x || 0) + rotatableEntryWidth / 2,
          centerY: Number(rotatableEntryPosition.y || 0) + rotatableEntryHeight / 2,
          rotation: Number(rotatableEntryPosition.rotation || 0),
        };
      });
    let startAngle = Math.atan2(
        airflowComponentRotateEvent.clientY - rotationCenterY,
        airflowComponentRotateEvent.clientX - rotationCenterX,
      ),
      totalRotationDeg = 0,
      rotatedPreviewEntries = [],
      hasRotated = false;
    const pointerId2 = airflowComponentRotateEvent.pointerId;
    airflowComponentRotateEvent.currentTarget.setPointerCapture(pointerId2);
    const rotateMoveHandler = (rotateMoveEvent) => {
        if (rotateMoveEvent.pointerId !== pointerId2) return;
        const currentAngle = Math.atan2(
          rotateMoveEvent.clientY - rotationCenterY,
          rotateMoveEvent.clientX - rotationCenterX,
        );
        let angleDelta = currentAngle - startAngle;
        (angleDelta > Math.PI
          ? (angleDelta -= Math.PI * 2)
          : angleDelta < -Math.PI && (angleDelta += Math.PI * 2),
          (totalRotationDeg += (angleDelta * 180) / Math.PI),
          (startAngle = currentAngle),
          (rotatedPreviewEntries = rotateMultiSelectionTransforms2(
            rotatableEntries,
            rotationBoundsCenterX,
            rotationBoundsCenterY,
            totalRotationDeg,
          )));
        for (const rotatedPreviewEntry of rotatedPreviewEntries) {
          const rotatedComponentRecord = rotatableEntries.find(
            (rotationMatchEntry) =>
              rotationMatchEntry.componentId === rotatedPreviewEntry.componentId,
          );
          rotatedComponentRecord &&
            ((rotatedComponentRecord.component.position = {
              ...(rotatedComponentRecord.component.position || {}),
              x: rotatedPreviewEntry.x,
              y: rotatedPreviewEntry.y,
              rotation: rotatedPreviewEntry.rotation,
            }),
            (rotatedComponentRecord.host.style.left = rotatedPreviewEntry.x + "px"),
            (rotatedComponentRecord.host.style.top = rotatedPreviewEntry.y + "px"),
            (rotatedComponentRecord.host.style.transform =
              "rotate(" +
              rotatedPreviewEntry.rotation +
              "deg) scale(" +
              Number(rotatedComponentRecord.component.style?.scale || 1) +
              ")"));
        }
        ((rotationHostElement.style.transform = "rotate(" + totalRotationDeg + "deg)"),
          (rotationHostElement.style.transformOrigin = "center center"),
          this.options.onComponentsTransformPreview?.(
            rotatedPreviewEntries,
            this.selectedComponentId,
          ));
      },
      rotateEndHandler = (rotateEndEvent = null) => {
        hasRotated ||
          (rotateEndEvent?.pointerId != null && rotateEndEvent.pointerId !== pointerId2) ||
          ((hasRotated = true),
          window.removeEventListener("pointermove", rotateMoveHandler, true),
          window.removeEventListener("pointerup", rotateEndHandler, true),
          window.removeEventListener("pointercancel", rotateEndHandler, true),
          window.removeEventListener("blur", rotateEndHandler),
          totalRotationDeg !== 0 &&
            rotatedPreviewEntries.length &&
            this.options.onComponentsTransform?.(rotatedPreviewEntries, this.selectedComponentId));
      };
    (window.addEventListener("pointermove", rotateMoveHandler, true),
      window.addEventListener("pointerup", rotateEndHandler, true),
      window.addEventListener("pointercancel", rotateEndHandler, true),
      window.addEventListener("blur", rotateEndHandler));
  }
  ["cleanupComponents"](shouldPreserveSelection = false, retainedComponentIds = new Set()) {
    (clearTimeout(this.stagePrewarmTimer),
      this.retainedInteraction3d &&
        !retainedComponentIds.has(this.retainedInteraction3d.component.id) &&
        this.releaseRetainedInteraction3d());
    for (const pendingCleanupCallback of this.cleanups.splice(0)) pendingCleanupCallback();
    for (const registeredComponentId of [...this.componentCleanups.keys()])
      retainedComponentIds.has(registeredComponentId) ||
        this.cleanupRenderedComponent(registeredComponentId);
    if (!shouldPreserveSelection) {
      for (const cameraCleanupList of this.cameraCleanups.values())
        for (const cameraCleanupCallback of cameraCleanupList.splice(0)) cameraCleanupCallback();
      this.cameraCleanups.clear();
    }
  }
  ["registerComponentCleanup"](cleanupComponentId, componentCleanupFunction) {
    !cleanupComponentId ||
      typeof componentCleanupFunction != "function" ||
      (this.componentCleanups.has(cleanupComponentId) ||
        this.componentCleanups.set(cleanupComponentId, []),
      this.componentCleanups.get(cleanupComponentId).push(componentCleanupFunction));
  }
  ["scheduleInteraction3dPrewarm"]() {
    (clearTimeout(this.stagePrewarmTimer),
      !(this.options?.editable || this.destroyed || !this.document?.pages) &&
        (this.stagePrewarmTimer = setTimeout(() => {
          if (
            ((this.stagePrewarmTimer = null),
            this.destroyed || this.retainedInteraction3d || !this.canvas?.isConnected)
          )
            return;
          if (window.HomeOSDisplayBoot?.pending || document.hidden) {
            this.scheduleInteraction3dPrewarm();
            return;
          }
          const sharedComponentMapById = new Map(
              (this.document.sharedComponents || []).map((sharedComponentDefinition) => [
                sharedComponentDefinition.id,
                sharedComponentDefinition,
              ]),
            ),
            pageComponentsWithShared = (sourcePageRecord) => [
              ...(sourcePageRecord.components || []),
              ...(sourcePageRecord.sharedComponentIds || [])
                .map((sharedComponentKey) => sharedComponentMapById.get(sharedComponentKey))
                .filter(Boolean),
            ];
          if (
            collectComponents2(
              pageComponentsWithShared(this.page),
              (interaction3dComponent) => interaction3dComponent.type === "interaction3d",
            ).length
          )
            return;
          const prewarmPageRecord = this.document.pages
            .filter((candidatePageRecord) => candidatePageRecord !== this.page)
            .flatMap(pageComponentsWithShared)
            .find(
              (interaction3dPageComponent) =>
                interaction3dPageComponent.type === "interaction3d" &&
                interaction3dPageComponent.style?.visible !== false &&
                interaction3dPageComponent.properties?.sceneId,
            );
          if (!prewarmPageRecord) return;
          this.prewarmingStageId = prewarmPageRecord.id;
          try {
            this.renderComponent(prewarmPageRecord, this.canvas);
          } finally {
            this.prewarmingStageId = null;
          }
          const prewarmHostElement = this.componentHosts.get(prewarmPageRecord.id);
          ((prewarmHostElement.inert = true),
            (prewarmHostElement.style.opacity = "0"),
            (prewarmHostElement.style.pointerEvents = "none"),
            prewarmHostElement.setAttribute("aria-hidden", "true"),
            (this.retainedInteraction3d = {
              component: structuredClone(prewarmPageRecord),
              host: prewarmHostElement,
              timer: null,
              prewarmed: true,
            }));
        }, 200)));
  }
  ["releaseRetainedInteraction3d"]() {
    const retainedInteraction3d = this.retainedInteraction3d;
    retainedInteraction3d &&
      ((this.retainedInteraction3d = null),
      clearTimeout(retainedInteraction3d.timer),
      this.cleanupRenderedComponent(retainedInteraction3d.component.id),
      retainedInteraction3d.host.remove());
  }
  ["cleanupRenderedComponent"](cleanupTargetComponentId) {
    const componentCleanupCallbacks = this.componentCleanups.get(cleanupTargetComponentId) || [];
    this.componentCleanups.delete(cleanupTargetComponentId);
    for (const cleanupRunnable of componentCleanupCallbacks.splice(0)) cleanupRunnable();
  }
  ["render"](dirtyComponentIds = null) {
    const shouldFullRender = !!(
      dirtyComponentIds?.size &&
      this.canvas?.isConnected &&
      this.viewport?.isConnected &&
      [...dirtyComponentIds.values()].some(
        (orphanHostElement) => orphanHostElement.parentElement === this.canvas,
      )
    );
    (shouldFullRender || (this.cleanupComponents(), this.container.replaceChildren()),
      (this.container.dataset.uiTheme = this.document?.theme?.name || ""));
    for (const themeVariableName of this.themeVariableNames)
      this.container.style.removeProperty(themeVariableName);
    this.themeVariableNames.clear();
    for (const [variableName, variableValue] of Object.entries(
      this.document?.theme?.variables || {},
    )) {
      const normalizedVariableName = String(variableName).startsWith("--")
        ? String(variableName)
        : "--" + variableName;
      /^--[a-zA-Z0-9_-]+$/.test(normalizedVariableName) &&
        (this.container.style.setProperty(normalizedVariableName, String(variableValue)),
        this.themeVariableNames.add(normalizedVariableName));
    }
    if (!shouldFullRender) {
      const rendererRootElement = document.createElement("div");
      rendererRootElement.className =
        "hb-renderer-viewport" + (this.options.editable ? "" : " hb-runtime-no-select");
      const rendererCanvasElement = document.createElement("div");
      ((rendererCanvasElement.className = "hb-renderer-canvas"),
        rendererRootElement.append(rendererCanvasElement),
        this.container.append(rendererRootElement),
        (this.viewport = rendererRootElement),
        (this.canvas = rendererCanvasElement));
    }
    ((this.viewport.className =
      "hb-renderer-viewport" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (this.canvas.style.width = this.document.canvas.width + "px"),
      (this.canvas.style.height = this.document.canvas.height + "px"),
      (this.canvas.style.background =
        this.document.canvas.background?.type === "color"
          ? this.document.canvas.background.color || "#0b1116"
          : ""),
      this.renderComponents(shouldFullRender, dirtyComponentIds),
      this.resize());
  }
  ["renderComponents"](isForcedRender = false, retainedInteractionIds = null) {
    if (!this.canvas || !this.page) return;
    const sharedComponentLookupMap = new Map(
        (this.document.sharedComponents || []).map((sharedComponentEntry) => [
          sharedComponentEntry.id,
          sharedComponentEntry,
        ]),
      ),
      sharedComponentList = (this.page.sharedComponentIds || [])
        .map((sharedComponentKeyId) => sharedComponentLookupMap.get(sharedComponentKeyId))
        .filter(Boolean),
      renderedComponentIdSet = new Set(
        collectComponents2(
          [...(this.page.components || []), ...sharedComponentList],
          () => true,
        ).map((renderedComponentRecord) => renderedComponentRecord.id),
      );
    this.states.set("virtual.icon_visibility.current", {
      entityId: "virtual.icon_visibility.current",
      state: this.iconVisibilityState() ? "on" : "off",
      attributes: {},
    });
    const hostByComponentId = new Map<string, HTMLElement>([
        ...(isForcedRender
          ? [...this.componentHosts].filter(([hostedComponentKey]) =>
              ["camera", "vacuum-map", "floorplan-auto-diagram"].includes(
                this.componentRecords.get(hostedComponentKey)?.type,
              ),
            )
          : []),
        ...(retainedInteractionIds && typeof retainedInteractionIds[Symbol.iterator] == "function"
          ? retainedInteractionIds
          : []),
      ]),
      componentRecordById = new Map(
        collectComponents2(
          [...(this.page.components || []), ...sharedComponentList],
          () => true,
        ).map((componentDefinitionRecord) => [
          componentDefinitionRecord.id,
          componentDefinitionRecord,
        ]),
      ),
      interaction3dComponents = [...componentRecordById.values()].filter(
        (interaction3dEntry) => interaction3dEntry.type === "interaction3d",
      ),
      array =
        !this.options?.editable && !this.replacingDocument && Array.isArray(this.document.pages),
      interaction3dComponentMap = array
        ? new Map(
            collectComponents2(
              [
                ...(this.document.sharedComponents || []),
                ...this.document.pages.flatMap(
                  (documentPageComponent) => documentPageComponent.components || [],
                ),
              ],
              (interaction3dPageEntry) => interaction3dPageEntry.type === "interaction3d",
            ).map((interaction3dPageDefinition) => [
              interaction3dPageDefinition.id,
              interaction3dPageDefinition,
            ]),
          )
        : new Map(),
      interaction3dMatches = (expectedInteractionComponent, actualInteractionComponent) =>
        actualInteractionComponent?.type === "interaction3d" &&
        expectedInteractionComponent.properties?.sceneId ===
          actualInteractionComponent.properties?.sceneId &&
        expectedInteractionComponent.properties?.lightingMode ===
          actualInteractionComponent.properties?.lightingMode;
    let retainedInteraction3d2 = this.retainedInteraction3d;
    if (
      (retainedInteraction3d2 &&
        (!array ||
          retainedInteraction3d2.host.parentElement !== this.canvas ||
          !interaction3dMatches(
            retainedInteraction3d2.component,
            interaction3dComponentMap.get(retainedInteraction3d2.component.id),
          ) ||
          interaction3dComponents.some(
            (remainingInteractionComponent) =>
              remainingInteractionComponent.id !== retainedInteraction3d2.component.id,
          )) &&
        (this.releaseRetainedInteraction3d(), (retainedInteraction3d2 = null)),
      array && !retainedInteraction3d2 && !interaction3dComponents.length)
    )
      for (const [staleComponentId, staleHostElement] of this.componentHosts) {
        const staleComponentRecord = this.componentRecords.get(staleComponentId);
        if (!(
          staleComponentRecord?.type !== "interaction3d" ||
          staleHostElement.parentElement !== this.canvas ||
          !interaction3dMatches(
            staleComponentRecord,
            interaction3dComponentMap.get(staleComponentId),
          )
        )) {
          ((retainedInteraction3d2 = {
            component: structuredClone(staleComponentRecord),
            host: staleHostElement,
            timer: null,
          }),
            (this.retainedInteraction3d = retainedInteraction3d2),
            (staleHostElement.hidden = true),
            (staleHostElement.inert = true),
            staleHostElement
              .querySelector(".hb-interaction3d-host")
              ?.setInteraction3dPageVisible?.(false),
            (retainedInteraction3d2.timer = setTimeout(() => {
              this.retainedInteraction3d === retainedInteraction3d2 &&
                this.releaseRetainedInteraction3d();
            }, 120000)));
          break;
        }
      }
    retainedInteraction3d2 &&
      hostByComponentId.set(retainedInteraction3d2.component.id, retainedInteraction3d2.host);
    for (const [existingInteractionId, existingInteractionHostElement] of this.componentHosts)
      (isForcedRender || array) &&
        this.componentRecords.get(existingInteractionId)?.type === "interaction3d" &&
        existingInteractionHostElement.parentElement === this.canvas &&
        renderedComponentIdSet.has(existingInteractionId) &&
        hostByComponentId.set(existingInteractionId, existingInteractionHostElement);
    const retainedHostIdSet = new Set();
    for (const [hostComponentId] of hostByComponentId) {
      if (retainedInteraction3d2?.component.id === hostComponentId) {
        retainedHostIdSet.add(hostComponentId);
        continue;
      }
      this.componentRecords.get(hostComponentId)?.type === "interaction3d" &&
        (componentRecordById.get(hostComponentId)?.type === "interaction3d"
          ? retainedHostIdSet.add(hostComponentId)
          : hostByComponentId.delete(hostComponentId));
    }
    const effectLayerByComponentId = new Map(
      [...this.canvas.querySelectorAll<HTMLElement>(".hb-icon-button-effect-layer[data-effect-for]")].map(
        (effectLayerHostElement) => [
          effectLayerHostElement.dataset.effectFor,
          effectLayerHostElement,
        ],
      ),
    );
    this.cleanupComponents(isForcedRender, retainedHostIdSet);
    const activeEffectForIdSet = new Set(
      [...hostByComponentId.values()].filter(
        (canvasHostElement) =>
          canvasHostElement.parentElement === this.canvas &&
          (renderedComponentIdSet.has(canvasHostElement.dataset.componentId) ||
            canvasHostElement === retainedInteraction3d2?.host) &&
          (canvasHostElement.querySelector(".hb-floorplan-auto-diagram-preview") ||
            retainedHostIdSet.has(canvasHostElement.dataset.componentId)),
      ),
    );
    if (activeEffectForIdSet.size) {
      for (const canvasChildNode of [...this.canvas.children] as HTMLElement[])
        activeEffectForIdSet.has(canvasChildNode) || canvasChildNode.remove();
    } else this.canvas.replaceChildren();
    (this.componentHosts.clear(),
      this.componentRecords.clear(),
      this.componentAirflowLayers.clear(),
      this.componentEffectLayers.clear(),
      this.componentSelectionOverlays.clear(),
      this.runtimeEntityComponentIndex.clear(),
      this.componentParentIds.clear());
    for (const pageComponentRecord of this.page.components || [])
      this.renderComponent(
        pageComponentRecord,
        this.canvas,
        0,
        hostByComponentId,
        effectLayerByComponentId,
      );
    for (const pageSharedComponentRecord of sharedComponentList)
      this.renderComponent(
        pageSharedComponentRecord,
        this.canvas,
        100000,
        hostByComponentId,
        effectLayerByComponentId,
      );
    (retainedInteraction3d2 &&
      componentRecordById.has(retainedInteraction3d2.component.id) &&
      ((retainedInteraction3d2.host.inert = false),
      retainedInteraction3d2.prewarmed &&
        ((retainedInteraction3d2.host.style.opacity = ""),
        (retainedInteraction3d2.host.style.pointerEvents = ""),
        retainedInteraction3d2.host.removeAttribute("aria-hidden")),
      clearTimeout(retainedInteraction3d2.timer),
      (this.retainedInteraction3d = null),
      retainedInteraction3d2.host
        .querySelector(".hb-interaction3d-host")
        ?.setInteraction3dPageVisible?.(true)),
      this.syncActiveGroup(),
      this.syncSelection(),
      this.runtimeEffectImageLoader.pruneDisconnected(),
      this.scheduleInteraction3dPrewarm());
  }
  ["registerRuntimeStateHandler"](
    stateHandlerEntityId,
    stateHandlerFunction,
    stateHandlerComponentId = null,
  ) {
    const normalizedEntityId = String(stateHandlerEntityId || "");
    if (!normalizedEntityId || typeof stateHandlerFunction != "function") return;
    (this.runtimeStateHandlers.has(normalizedEntityId) ||
      this.runtimeStateHandlers.set(normalizedEntityId, new Set()),
      this.runtimeStateHandlers.get(normalizedEntityId).add(stateHandlerFunction));
    const unregisterStateHandler = () => {
      const entityStateHandlerSet = this.runtimeStateHandlers.get(normalizedEntityId);
      (entityStateHandlerSet?.delete(stateHandlerFunction),
        entityStateHandlerSet?.size === 0 && this.runtimeStateHandlers.delete(normalizedEntityId));
    };
    stateHandlerComponentId
      ? this.registerComponentCleanup(stateHandlerComponentId, unregisterStateHandler)
      : this.cleanups.push(unregisterStateHandler);
  }
  ["registerHistoryChartRefresher"](historyRefresherFunction, historyRefresherComponentId = null) {
    if (typeof historyRefresherFunction != "function") return;
    this.historyChartRefreshers.add(historyRefresherFunction);
    const deregisterHistoryRefresher = () =>
      this.historyChartRefreshers.delete(historyRefresherFunction);
    historyRefresherComponentId
      ? this.registerComponentCleanup(historyRefresherComponentId, deregisterHistoryRefresher)
      : this.cleanups.push(deregisterHistoryRefresher);
  }
  ["applyRuntimeStateHandlers"](handledEntityId, entityStateSnapshot) {
    for (const entityStateHandler of this.runtimeStateHandlers.get(String(handledEntityId || "")) ||
      [])
      entityStateHandler(entityStateSnapshot);
  }
  ["runtimeEntityIdsForComponent"](runtimeEntityComponent) {
    const runtimeEntityIdCollection = collectEntityIds2([
        {
          ...runtimeEntityComponent,
          children: [],
        },
      ]),
      boundEntityId = runtimeEntityComponent?.bindings?.entity?.entityId || "";
    if (boundEntityId) {
      runtimeEntityIdCollection.add(boundEntityId);
      const powerEntityId2 = this.powerEntityId(runtimeEntityComponent, boundEntityId);
      powerEntityId2 && runtimeEntityIdCollection.add(powerEntityId2);
      const resolvedDeviceProfile = this.deviceProfile(boundEntityId);
      for (const roleBindingEntityId of Object.values(
        resolvedDeviceProfile?.roles || {},
      ) as string[])
        roleBindingEntityId && runtimeEntityIdCollection.add(roleBindingEntityId);
    }
    return [...runtimeEntityIdCollection]
      .map((collectedEntityId) => String(collectedEntityId || ""))
      .filter(Boolean);
  }
  ["indexRuntimeComponent"](indexedComponent) {
    for (const indexedEntityId of this.runtimeEntityIdsForComponent(indexedComponent))
      (this.runtimeEntityComponentIndex.has(indexedEntityId) ||
        this.runtimeEntityComponentIndex.set(indexedEntityId, new Set()),
        this.runtimeEntityComponentIndex.get(indexedEntityId).add(indexedComponent.id));
  }
  ["unindexRuntimeComponent"](unindexedComponent) {
    for (const [indexedEntityKey, componentIndexSet] of this.runtimeEntityComponentIndex)
      (componentIndexSet.delete(unindexedComponent),
        componentIndexSet.size || this.runtimeEntityComponentIndex.delete(indexedEntityKey));
  }
  ["runtimeComponentContent"](renderHostElement) {
    return (
      [...(renderHostElement?.children || [])].find(
        (componentChildElement) =>
          !componentChildElement.classList.contains("hb-component") &&
          !componentChildElement.classList.contains("hb-runtime-action-hitbox") &&
          !componentChildElement.classList.contains("hb-selection-bounds") &&
          !componentChildElement.classList.contains("hb-transform-handle"),
      ) || null
    );
  }
  ["refreshRuntimeComponent"](refreshComponentId) {
    const refreshComponentRecord = this.componentRecords.get(refreshComponentId),
      refreshHostElement = this.componentHosts.get(refreshComponentId);
    if (!refreshComponentRecord || !refreshHostElement || !refreshHostElement.isConnected) return;
    if (refreshComponentRecord.type === "interaction3d") {
      refreshHostElement
        .querySelector(".hb-interaction3d-host")
        ?.updateInteraction3d?.(refreshComponentRecord, this.document);
      return;
    }
    this.cleanupRenderedComponent(refreshComponentId);
    const refreshRenderOptions = {
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
        previewState: this.componentPreviewStates.get(refreshComponentId) || "auto",
        isIconVisible: (iconVisibilityEntityId) => this.iconVisibilityState(iconVisibilityEntityId),
        navigate: (navigationTargetPath) => this.navigate(navigationTargetPath),
        callEntityService: (...serviceCallArgs: [any, any, any, any?]) =>
          this.callEntityService(...serviceCallArgs),
        openCameraPreview: (interaction3dCameraRecord, cameraOptions, cameraCallback) =>
          this.openInteraction3dCameraPreview(
            interaction3dCameraRecord,
            cameraOptions,
            cameraCallback,
          ),
        openVacuumDetails: (vacuumComponentRecord, vacuumOptions, vacuumCallback) =>
          this.openInteraction3dVacuumDetails(vacuumComponentRecord, vacuumOptions, vacuumCallback),
        runVacuumRoom: (vacuumRoomRecord) =>
          this.dispatchAction(
            {
              id: refreshComponentRecord.id + ":room:" + vacuumRoomRecord.id,
              type: "device-button",
              properties: {
                label: vacuumRoomRecord.label,
              },
              bindings: {
                entity: {
                  entityId: vacuumRoomRecord.entityId,
                },
              },
            },
            {
              type: "toggle",
              data: {},
            },
          ),
        onError: (renderErrorObject) => this.options.onError?.(renderErrorObject),
        registerRuntimeStateHandler: (stateHandlerEntityKey, stateHandlerCallback) =>
          this.registerRuntimeStateHandler(
            stateHandlerEntityKey,
            stateHandlerCallback,
            refreshComponentId,
          ),
        runtimeStateReady: () => this.runtimeSnapshotReady === true,
        invalidate: () => this.refreshRuntimeComponent(refreshComponentId),
        cleanup: (refreshCleanupCallback) =>
          this.registerComponentCleanup(refreshComponentId, refreshCleanupCallback),
      },
      refreshedComponentElement = renderRegisteredComponent2(
        this.runtimePowerComponent(refreshComponentRecord),
        refreshRenderOptions,
      ),
      refreshCanvasScale = Number(this.document.canvas.componentScale || 1);
    refreshCanvasScale !== 1 &&
      ((refreshedComponentElement.style.width = 100 / refreshCanvasScale + "%"),
      (refreshedComponentElement.style.height = 100 / refreshCanvasScale + "%"),
      (refreshedComponentElement.style.transform = "scale(" + refreshCanvasScale + ")"),
      (refreshedComponentElement.style.transformOrigin = "top left"));
    const runtimeComponentContent = this.runtimeComponentContent(refreshHostElement);
    if (
      (runtimeComponentContent
        ? runtimeComponentContent.replaceWith(refreshedComponentElement)
        : refreshHostElement.prepend(refreshedComponentElement),
      refreshComponentRecord.type === "title-button" ||
        refreshComponentRecord.type === "light-statistics")
    ) {
      const actionHitboxElement = refreshHostElement.querySelector(
        ":scope > .hb-runtime-action-hitbox",
      );
      if (actionHitboxElement) {
        const lightStatisticsSelectionBounds =
          refreshComponentRecord.type === "light-statistics"
            ? this.updateLightStatisticsSelectionBounds(
                refreshHostElement,
                refreshComponentRecord,
                actionHitboxElement,
              )
            : this.updateTitleButtonSelectionBounds(
                refreshHostElement,
                refreshComponentRecord,
                actionHitboxElement,
              );
        actionHitboxElement.hidden = !lightStatisticsSelectionBounds;
      }
    }
    if (refreshComponentRecord.type === "light-statistics") {
      const refreshActionHitboxElement =
        this.componentSelectionOverlays
          .get(refreshComponentId)
          ?.querySelector(":scope > .hb-selection-bounds") ||
        refreshHostElement.querySelector(":scope > .hb-selection-bounds");
      (refreshActionHitboxElement &&
        (this.updateLightStatisticsSelectionBounds(
          refreshHostElement,
          refreshComponentRecord,
          refreshActionHitboxElement,
        ) ||
          Object.assign(refreshActionHitboxElement.style, {
            left: "0",
            top: "0",
            width: "100%",
            height: "100%",
          }),
        this.updateTransformHandleScale(
          refreshHostElement,
          refreshComponentRecord,
          refreshActionHitboxElement,
        )),
        this.refreshMultiSelectionBounds());
    }
  }
  ["refreshEditorComponent"](editorComponentId) {
    if (!this.options.editable) return false;
    const editorComponentRecord = this.componentRecords.get(editorComponentId),
      editorHostElement = this.componentHosts.get(editorComponentId);
    if (!editorComponentRecord || !editorHostElement?.isConnected) return false;
    const parentElement = editorHostElement.parentElement;
    if (!parentElement) return false;
    const baseZIndex =
      parentElement === this.canvas &&
      (this.page.sharedComponentIds || []).includes(editorComponentRecord.id)
        ? 100000
        : 0;
    if (editorComponentRecord.type === "interaction3d" || editorComponentRecord.type === "group")
      return (
        this.renderComponent(
          editorComponentRecord,
          parentElement,
          baseZIndex,
          new Map([[editorComponentRecord.id, editorHostElement]]),
        ),
        this.syncSelection(),
        true
      );
    if (editorComponentRecord.type === "floorplan-auto-diagram") {
      const wantsPreviewElement =
          editorComponentRecord.properties?.previewReady === true &&
          (editorComponentRecord.properties?.generated !== true ||
            editorComponentRecord.properties?.previewing === true),
        floorplanPreviewElement = editorHostElement.querySelector(
          ".hb-floorplan-auto-diagram-preview",
        );
      if (!!floorplanPreviewElement === wantsPreviewElement) {
        const editorPosition = editorComponentRecord.position || {},
          isFillLayout =
            parentElement === this.canvas &&
            editorComponentRecord.properties?.layoutMode === "fill",
          editorLayoutPosition = isFillLayout
            ? {
                ...editorPosition,
                x: 0,
                y: 0,
                width: Number(this.document.canvas?.width || 2778),
                height: Number(this.document.canvas?.height || 1940),
                rotation: 0,
              }
            : editorPosition,
          editorComponentScale = Math.max(
            0.01,
            Math.min(5, Number(editorComponentRecord.style?.scale || 1)),
          ),
          rawZIndex = baseZIndex + Number(editorLayoutPosition.zIndex || 1),
          componentZIndex = componentHostZIndex2(
            editorComponentRecord,
            rawZIndex,
            parentElement === this.canvas,
          );
        (Object.assign(editorHostElement.style, {
          left: (editorLayoutPosition.x || 0) + "px",
          top: (editorLayoutPosition.y || 0) + "px",
          width: (editorLayoutPosition.width || 100) + "px",
          height: (editorLayoutPosition.height || 100) + "px",
          zIndex: String(componentZIndex),
          transform:
            "rotate(" +
            (editorLayoutPosition.rotation || 0) +
            "deg) scale(" +
            (isFillLayout ? 1 : editorComponentScale) +
            ")",
        }),
          editorHostElement.style.setProperty("--hb-component-z", String(componentZIndex)),
          editorHostElement.classList.toggle("layout-fill", isFillLayout));
        const floorplanHintElement = editorHostElement.querySelector(
            ".hb-floorplan-auto-diagram-preview-hint",
          ),
          isViewMode = editorComponentRecord.properties?.interactionMode === "view";
        return (
          floorplanPreviewElement?.classList.toggle("is-view-mode", isViewMode),
          floorplanPreviewElement?.classList.toggle("is-position-mode", !isViewMode),
          floorplanHintElement &&
            (floorplanHintElement.textContent = isViewMode
              ? "拖动旋转 · 右键平移 · 滚轮缩放"
              : "拖动控件调整位置，右下角调整大小"),
          this.syncSelection(),
          this.updateTransformHandleScale(editorHostElement, editorComponentRecord),
          true
        );
      }
    }
    const nextSibling = editorHostElement.nextSibling;
    this.cleanupRenderedComponent(editorComponentId);
    for (const cameraCleanupFunction of this.cameraCleanups.get(editorComponentId)?.splice(0) || [])
      cameraCleanupFunction();
    (this.cameraCleanups.delete(editorComponentId),
      this.componentEffectLayers.get(editorComponentId)?.remove(),
      this.componentEffectLayers.delete(editorComponentId),
      this.componentAirflowLayers.get(editorComponentId)?.remove(),
      this.componentAirflowLayers.delete(editorComponentId),
      editorHostElement.remove(),
      this.renderComponent(editorComponentRecord, parentElement, baseZIndex));
    const relocatedHostElement = this.componentHosts.get(editorComponentId);
    return (
      relocatedHostElement &&
        nextSibling?.parentElement === parentElement &&
        parentElement.insertBefore(relocatedHostElement, nextSibling),
      this.syncSelection(),
      true
    );
  }
  ["refreshRuntimeComponents"](dirtyEntityIds) {
    const affectedComponentIdSet = new Set();
    for (const dirtyEntityId of dirtyEntityIds || [])
      for (const affectedComponentId of this.runtimeEntityComponentIndex.get(
        String(dirtyEntityId || ""),
      ) || [])
        affectedComponentIdSet.add(affectedComponentId);
    if (!affectedComponentIdSet.size) return;
    const runtimeRenderableTypeSet = new Set([
        "icon-button-effect",
        "icon-button",
        "device-button",
        "navigation-button",
        "air-conditioner",
        "scene-mode",
      ]),
      affectedEntityIdSet = new Set(
        [...affectedComponentIdSet].filter((renderableTypeComponentId) =>
          runtimeRenderableTypeSet.has(this.componentRecords.get(renderableTypeComponentId)?.type),
        ),
      );
    affectedEntityIdSet.size && this.updateOptimisticToggleVisuals("", affectedEntityIdSet);
    for (const renderableComponentKey of affectedComponentIdSet) {
      const renderableComponentRecord = this.componentRecords.get(renderableComponentKey);
      if (!(
        !renderableComponentRecord ||
        runtimeRenderableTypeSet.has(renderableComponentRecord.type) ||
        ["line-chart", "camera", "vacuum-map"].includes(renderableComponentRecord.type)
      )) {
        if (renderableComponentRecord.type === "flow-line") {
          this.componentHosts
            .get(renderableComponentKey)
            ?.querySelector(".hb-flow-line")
            ?.syncFlowLineState?.(
              this.states.get(renderableComponentRecord.bindings?.entity?.entityId),
            );
          continue;
        }
        this.refreshRuntimeComponent(renderableComponentKey);
      }
    }
  }
  ["applyEditorComponentUpdates"](updatedDocument, updatedPagePath, componentUpdates = []) {
    if (!this.options.editable || !this.document || !Array.isArray(componentUpdates)) return false;
    const validComponentUpdates = componentUpdates
      .map((componentUpdateEntry) => ({
        componentId: String(componentUpdateEntry?.componentId || ""),
        component: componentUpdateEntry?.component,
      }))
      .filter(
        (validComponentUpdate) =>
          validComponentUpdate.componentId && validComponentUpdate.component,
      );
    if (
      validComponentUpdates.length !== componentUpdates.length ||
      validComponentUpdates.some(
        ({ componentId: updatedComponentId, component: updatedComponentPayload }) => {
          const existingComponentRecord = this.componentRecords.get(updatedComponentId);
          return (
            !existingComponentRecord ||
            !this.componentHosts.get(updatedComponentId)?.isConnected ||
            existingComponentRecord.type !== updatedComponentPayload.type
          );
        },
      )
    )
      return false;
    const previousEntityIdSet = new Set();
    for (const { componentId: updatedComponentKey } of validComponentUpdates) {
      const updatedComponentRecord = this.componentRecords.get(updatedComponentKey);
      for (const componentEntityId of this.runtimeEntityIdsForComponent(updatedComponentRecord))
        previousEntityIdSet.add(componentEntityId);
    }
    ((this.document = updatedDocument),
      (this.page =
        this.document.pages?.find(
          (resolvedTargetPage) => resolvedTargetPage.path === updatedPagePath,
        ) ||
        this.document.pages?.find(
          (fallbackPageRecord) => fallbackPageRecord.path === this.document.defaultPagePath,
        ) ||
        this.document.pages?.[0] ||
        null));
    for (const {
      componentId: replacedComponentId,
      component: replacedComponentPayload,
    } of validComponentUpdates) {
      const replacedComponentRecord = this.componentRecords.get(replacedComponentId);
      this.unindexRuntimeComponent(replacedComponentId);
      const { children: childComponentList, ...componentRestPayload } = replacedComponentPayload;
      for (const staleComponentKey of Object.keys(replacedComponentRecord))
        delete replacedComponentRecord[staleComponentKey];
      (Object.assign(replacedComponentRecord, structuredClone(componentRestPayload)),
        childComponentList &&
          (replacedComponentRecord.children = childComponentList.map((childComponentDefinition) =>
            this.componentRecords.get(childComponentDefinition.id),
          )),
        this.indexRuntimeComponent(replacedComponentRecord));
    }
    const refreshedComponentIdSet = new Set(
      validComponentUpdates.map(({ componentId: refreshedComponentId }) => refreshedComponentId),
    );
    for (const { componentId: groupRefreshComponentId } of validComponentUpdates) {
      const groupComponentRecord = this.componentRecords.get(groupRefreshComponentId);
      if (groupComponentRecord.type === "group") {
        for (const nestedComponentRecord of collectComponents2(
          groupComponentRecord.children || [],
          (nestedComponentCandidate) =>
            ["icon-button-effect", "interaction3d", "floorplan-auto-diagram"].includes(
              nestedComponentCandidate.type,
            ),
        ))
          refreshedComponentIdSet.add(nestedComponentRecord.id);
      }
    }
    for (const refreshableComponentId of refreshedComponentIdSet)
      this.refreshEditorComponent(refreshableComponentId);
    this.syncSelection();
    const nextEntityIdSet = new Set();
    for (const { componentId: entityRefreshComponentId } of validComponentUpdates)
      for (const refreshedEntityId of this.runtimeEntityIdsForComponent(
        this.componentRecords.get(entityRefreshComponentId),
      ))
        nextEntityIdSet.add(refreshedEntityId);
    return (
      (previousEntityIdSet.size !== nextEntityIdSet.size ||
        [...previousEntityIdSet].some(
          (missingEntityId) => !nextEntityIdSet.has(missingEntityId),
        )) &&
        this.connectRuntime(),
      true
    );
  }
  ["scheduleRuntimeRender"](scheduledEntityId, renderDelayMs = 120) {
    this.destroyed ||
      !this.document ||
      !scheduledEntityId ||
      (this.runtimeRenderEntityIds.add(String(scheduledEntityId)),
      window.clearTimeout(this.runtimeRenderTimer),
      (this.runtimeRenderTimer = window.setTimeout(
        () => {
          this.runtimeRenderTimer = 0;
          const scheduledEntityIds = [...this.runtimeRenderEntityIds];
          (this.runtimeRenderEntityIds.clear(),
            this.destroyed || this.refreshRuntimeComponents(scheduledEntityIds));
        },
        Math.max(0, Number(renderDelayMs) || 0),
      )));
  }
  ["setEffectLayerActive"](effectLayerElement, isEffectLayerActive, effectFadeDurationSec = 0) {
    if (!effectLayerElement) return;
    isEffectLayerActive &&
      this.runtimeEffectImageLoader.promote(
        effectLayerElement.querySelector(":scope > img[data-effect-source]"),
      );
    const hasActiveStateChanged =
      effectLayerElement.classList.contains("active") !== isEffectLayerActive;
    (window.clearTimeout(effectLayerElement.hbTransitionTimer),
      effectLayerElement.classList.remove("is-transitioning"),
      hasActiveStateChanged &&
        effectFadeDurationSec > 0 &&
        (effectLayerElement.classList.add("is-transitioning"), effectLayerElement.offsetWidth),
      effectLayerElement.classList.toggle("active", isEffectLayerActive),
      hasActiveStateChanged &&
        effectFadeDurationSec > 0 &&
        (effectLayerElement.hbTransitionTimer = window.setTimeout(
          () => {
            (effectLayerElement.classList.remove("is-transitioning"),
              (effectLayerElement.hbTransitionTimer = null));
          },
          effectFadeDurationSec * 1000 + 80,
        )));
  }
  ["syncEffectLayerLightVisual"](lightEffectComponent, lightEffectLayerElement) {
    if (!lightEffectLayerElement || lightEffectComponent?.type !== "icon-button-effect") return;
    const lightEffectProperties = lightEffectComponent.properties || {},
      lightEffectEntityId = String(lightEffectComponent?.bindings?.entity?.entityId || "");
    lightEffectLayerElement.classList.toggle(
      "awaiting-light-visual",
      iconButtonEffectLightVisualAwaiting2(lightEffectComponent, {
        editable: this.options.editable,
        states: this.states,
        pendingOptimisticState: this.pendingOptimisticStates.get(lightEffectEntityId),
      }),
    );
    const lightVisualState = iconButtonEffectLightVisualState2(lightEffectComponent, {
        states: this.states,
      }),
      effectOpacityValue = Number(lightEffectProperties.effectOpacity ?? 1),
      clampedEffectOpacity = Number.isFinite(effectOpacityValue)
        ? Math.max(0, Math.min(1, effectOpacityValue))
        : 1;
    lightEffectLayerElement.style.setProperty(
      "--hb-effect-image-opacity",
      String(clampedEffectOpacity * lightVisualState.opacity),
    );
    const effectImageElement = lightEffectLayerElement.querySelector(":scope > img");
    effectImageElement && (effectImageElement.style.filter = lightVisualState.filter);
  }
  ["cachedLightVisualState"](cachedLightEntityId) {
    const lightEntityIdText = String(cachedLightEntityId || "");
    if (!lightEntityIdText.startsWith("light.")) return null;
    const cachedLightVisual = this.confirmedLightVisualStates.get(lightEntityIdText);
    if (cachedLightVisual) return cachedLightVisual;
    try {
      const storedLightVisual = JSON.parse(
        window.localStorage?.getItem("homeos:light-visual:" + lightEntityIdText) || "null",
      );
      if (
        !storedLightVisual?.attributes ||
        Date.now() - Number(storedLightVisual.at || 0) > 720 * 60 * 60 * 1000
      )
        return null;
      const lightVisualRecord = {
        entityId: lightEntityIdText,
        state: "on",
        attributes: storedLightVisual.attributes,
      };
      return (
        this.confirmedLightVisualStates.set(lightEntityIdText, lightVisualRecord),
        lightVisualRecord
      );
    } catch {
      return null;
    }
  }
  ["rememberLightVisualState"](rememberedLightEntityId, rememberedLightState) {
    const lightEntityIdKey = String(rememberedLightEntityId || ""),
      lightStatePayload = rememberedLightState?.newState || rememberedLightState;
    if (!lightEntityIdKey.startsWith("light.") || !lightStatePayload?.attributes) return;
    const attributes = lightStatePayload.attributes,
      hasAttributeValue = (attributeName) =>
        attributes[attributeName] !== null &&
        attributes[attributeName] !== undefined &&
        attributes[attributeName] !== "" &&
        Number.isFinite(Number(attributes[attributeName]));
    if (
      !hasAttributeValue("brightness") &&
      !hasAttributeValue("color_temp_kelvin") &&
      !hasAttributeValue("color_temp")
    )
      return;
    const lightAttributesRecord = {
      ...(this.cachedLightVisualState(lightEntityIdKey)?.attributes || {}),
    };
    for (const lightAttributeName of [
      "brightness",
      "color_temp_kelvin",
      "color_temp",
      "color_mode",
      "supported_color_modes",
    ])
      attributes[lightAttributeName] !== null &&
        attributes[lightAttributeName] !== undefined &&
        attributes[lightAttributeName] !== "" &&
        (lightAttributesRecord[lightAttributeName] = Array.isArray(attributes[lightAttributeName])
          ? [...attributes[lightAttributeName]]
          : attributes[lightAttributeName]);
    const confirmedLightRecord = {
      entityId: lightEntityIdKey,
      state: "on",
      attributes: lightAttributesRecord,
    };
    this.confirmedLightVisualStates.set(lightEntityIdKey, confirmedLightRecord);
    try {
      window.localStorage?.setItem(
        "homeos:light-visual:" + lightEntityIdKey,
        JSON.stringify({
          at: Date.now(),
          attributes: lightAttributesRecord,
        }),
      );
    } catch {}
  }
  ["optimisticStateIsConfirmed"](optimisticEntityId, optimisticInputPayload) {
    const pendingOptimisticState = this.pendingOptimisticStates.get(
      String(optimisticEntityId || ""),
    );
    if (!pendingOptimisticState) return true;
    if (Date.now() >= pendingOptimisticState.expiresAt)
      return (this.pendingOptimisticStates.delete(String(optimisticEntityId || "")), true);
    const matchingEffectComponent = [...this.componentRecords.values()].find(
      (effectComponentRecord) => {
        const componentEntityIdValue = effectComponentRecord.bindings?.entity?.entityId;
        return (
          componentEntityIdValue &&
          this.powerEntityId(effectComponentRecord, componentEntityIdValue) ===
            String(optimisticEntityId)
        );
      },
    );
    return entityPowerIsOn2(
      String(optimisticEntityId || ""),
      optimisticInputPayload?.newState || optimisticInputPayload,
      matchingEffectComponent || {},
    ) === pendingOptimisticState.desiredActive
      ? pendingOptimisticState.desiredActive === true &&
        matchingEffectComponent?.type === "icon-button-effect" &&
        iconButtonEffectLightVisualAwaiting2(matchingEffectComponent, {
          states: new Map([
            [
              String(optimisticEntityId || ""),
              optimisticInputPayload?.newState || optimisticInputPayload,
            ],
          ]),
        })
        ? false
        : (this.rememberLightVisualState?.(optimisticEntityId, optimisticInputPayload),
          this.pendingOptimisticStates.delete(String(optimisticEntityId || "")),
          true)
      : false;
  }
  ["updateOptimisticToggleVisuals"](optimisticToggleEntityId, componentIdFilterSet = null) {
    for (const [optimisticComponentId, optimisticComponentRecord] of this.componentRecords) {
      const optimisticEntityIdValue = optimisticComponentRecord.bindings?.entity?.entityId,
        powerEntityId3 = optimisticEntityIdValue
          ? this.powerEntityId(optimisticComponentRecord, optimisticEntityIdValue)
          : "";
      if (
        !optimisticEntityIdValue ||
        (componentIdFilterSet
          ? !componentIdFilterSet.has(optimisticComponentId)
          : powerEntityId3 !== optimisticToggleEntityId)
      )
        continue;
      if (optimisticComponentRecord.type === "scene-mode") {
        this.componentHosts
          .get(optimisticComponentId)
          ?.querySelector(".hb-scene-mode")
          ?.sceneModeController?.update(
            this.states.get(optimisticEntityIdValue),
            this.componentPreviewStates.get(optimisticComponentId) || "auto",
          );
        continue;
      }
      if (
        ![
          "icon-button-effect",
          "icon-button",
          "device-button",
          "navigation-button",
          "air-conditioner",
        ].includes(optimisticComponentRecord.type)
      )
        continue;
      const optimisticEntityState = this.states.get(powerEntityId3),
        startsWith = String(powerEntityId3 || "").startsWith("cover."),
        isCoverDream =
          startsWith &&
          coverComponentIsDream2(
            optimisticComponentRecord,
            powerEntityId3,
            optimisticEntityState,
            this.entityMetadata,
          ),
        runtimePowerComponent = this.runtimePowerComponent(
          optimisticComponentRecord,
          optimisticEntityIdValue,
        ),
        isActiveStateDesired = startsWith
          ? isCoverDream
            ? runtimeEntityStateIsActive2(optimisticEntityState)
            : runtimeCoverStateIsActive2(optimisticEntityState)
          : entityPowerIsOn2(powerEntityId3, optimisticEntityState, runtimePowerComponent),
        previewStateText = this.componentPreviewStates.get(optimisticComponentId) || "auto",
        isStateOptimistic =
          previewStateText === "on"
            ? true
            : previewStateText === "off"
              ? false
              : startsWith &&
                  coverMotorIsReversedForComponent2(
                    optimisticComponentRecord,
                    this.entityMetadata,
                    this.states,
                    powerEntityId3,
                  )
                ? !isActiveStateDesired
                : isActiveStateDesired,
        optimisticHostElement = this.componentHosts.get(optimisticComponentId);
      if (
        (this.cleanupRenderedComponent(optimisticComponentId),
        optimisticHostElement && optimisticComponentRecord.type === "icon-button-effect")
      ) {
        const existingEffectLayerElement = optimisticHostElement.querySelector(
            ":scope > .hb-icon-button-effect",
          ),
          effectLayerRenderOptions = {
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
            previewState: this.componentPreviewStates.get(optimisticComponentId) || "auto",
            isIconVisible: (iconVisibilityEntityKey) =>
              this.iconVisibilityState(iconVisibilityEntityKey),
            navigate: (navigationPathValue) => this.navigate(navigationPathValue),
            invalidate: () =>
              this.updateOptimisticToggleVisuals("", new Set([optimisticComponentId])),
            cleanup: (effectCleanupCallback) =>
              this.registerComponentCleanup(optimisticComponentId, effectCleanupCallback),
          },
          newEffectLayerElement = renderRegisteredComponent2(
            runtimePowerComponent,
            effectLayerRenderOptions,
          ),
          effectCanvasScale = Number(this.document.canvas.componentScale || 1);
        (effectCanvasScale !== 1 &&
          ((newEffectLayerElement.style.width = 100 / effectCanvasScale + "%"),
          (newEffectLayerElement.style.height = 100 / effectCanvasScale + "%"),
          (newEffectLayerElement.style.transform = "scale(" + effectCanvasScale + ")"),
          (newEffectLayerElement.style.transformOrigin = "top left")),
          existingEffectLayerElement
            ? existingEffectLayerElement.replaceWith(newEffectLayerElement)
            : optimisticHostElement.prepend(newEffectLayerElement));
      }
      if (
        optimisticHostElement &&
        ["icon-button", "device-button", "navigation-button"].includes(
          optimisticComponentRecord.type,
        )
      ) {
        const existingConditionerElement =
            optimisticComponentRecord.type === "navigation-button"
              ? optimisticHostElement.querySelector(":scope > .hb-navigation-button")
              : optimisticHostElement.querySelector(":scope > .hb-icon-button"),
          conditionerRenderOptions = {
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
            previewState: this.componentPreviewStates.get(optimisticComponentId) || "auto",
            isIconVisible: (conditionerIconEntityId) =>
              this.iconVisibilityState(conditionerIconEntityId),
            navigate: (conditionerNavigationPath) => this.navigate(conditionerNavigationPath),
            invalidate: () =>
              this.updateOptimisticToggleVisuals("", new Set([optimisticComponentId])),
            cleanup: (conditionerCleanupCallback) =>
              this.registerComponentCleanup(optimisticComponentId, conditionerCleanupCallback),
          },
          newConditionerElement = renderRegisteredComponent2(
            runtimePowerComponent,
            conditionerRenderOptions,
          ),
          conditionerCanvasScale = Number(this.document.canvas.componentScale || 1);
        if (
          (conditionerCanvasScale !== 1 &&
            ((newConditionerElement.style.width = 100 / conditionerCanvasScale + "%"),
            (newConditionerElement.style.height = 100 / conditionerCanvasScale + "%"),
            (newConditionerElement.style.transform = "scale(" + conditionerCanvasScale + ")"),
            (newConditionerElement.style.transformOrigin = "top left")),
          existingConditionerElement
            ? existingConditionerElement.replaceWith(newConditionerElement)
            : optimisticHostElement.prepend(newConditionerElement),
          optimisticComponentRecord.type === "device-button")
        ) {
          const conditionerActionHitboxElement = optimisticHostElement.querySelector(
            ":scope > .hb-runtime-action-hitbox",
          );
          conditionerActionHitboxElement &&
            (conditionerActionHitboxElement.hidden = !this.updateDeviceButtonSelectionBounds(
              optimisticHostElement,
              optimisticComponentRecord,
              conditionerActionHitboxElement,
            ));
        }
      }
      if (optimisticHostElement && optimisticComponentRecord.type === "air-conditioner") {
        const airflowRenderOptions = {
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
            previewState: this.componentPreviewStates.get(optimisticComponentId) || "auto",
            isIconVisible: (airflowIconEntityId) => this.iconVisibilityState(airflowIconEntityId),
            navigate: (airflowNavigationPath) => this.navigate(airflowNavigationPath),
            invalidate: () =>
              this.updateOptimisticToggleVisuals("", new Set([optimisticComponentId])),
            cleanup: (airflowCleanupCallback) =>
              this.registerComponentCleanup(optimisticComponentId, airflowCleanupCallback),
          },
          existingAirflowElement = optimisticHostElement.querySelector(
            ":scope > .hb-air-conditioner",
          ),
          newAirflowElement = renderRegisteredComponent2(
            runtimePowerComponent,
            airflowRenderOptions,
          ),
          airflowCanvasScale = Number(this.document.canvas.componentScale || 1);
        (airflowCanvasScale !== 1 &&
          ((newAirflowElement.style.width = 100 / airflowCanvasScale + "%"),
          (newAirflowElement.style.height = 100 / airflowCanvasScale + "%"),
          (newAirflowElement.style.transform = "scale(" + airflowCanvasScale + ")"),
          (newAirflowElement.style.transformOrigin = "top left")),
          existingAirflowElement
            ? existingAirflowElement.replaceWith(newAirflowElement)
            : optimisticHostElement.prepend(newAirflowElement),
          this.componentAirflowLayers.get(optimisticComponentId)?.remove(),
          this.componentAirflowLayers.delete(optimisticComponentId));
        const airflowLayerElement = renderAirConditionerAirflowLayer2(
          runtimePowerComponent,
          airflowRenderOptions,
        );
        if (airflowLayerElement) {
          const isAirflowGrouped = optimisticHostElement.parentElement !== this.canvas,
            airflowGeometry = airflowLayerGeometry2(optimisticComponentRecord, {
              grouped: isAirflowGrouped,
            }),
            airflowZIndex = Number(
              optimisticHostElement.style.getPropertyValue("--hb-component-z") ||
                optimisticComponentRecord.position?.zIndex ||
                1,
            );
          ((airflowLayerElement.dataset.airflowFor = optimisticComponentId),
            (airflowLayerElement.hidden = optimisticComponentRecord.style?.visible === false),
            Object.assign(airflowLayerElement.style, {
              left: airflowGeometry.left + "px",
              top: airflowGeometry.top + "px",
              width: airflowGeometry.width + "px",
              height: airflowGeometry.height + "px",
              zIndex: String(airflowZIndex),
              transform:
                "rotate(" + airflowGeometry.rotation + "deg) scale(" + airflowGeometry.scale + ")",
            }),
            isAirflowGrouped
              ? optimisticHostElement.append(airflowLayerElement)
              : this.canvas.insertBefore(airflowLayerElement, optimisticHostElement),
            this.componentAirflowLayers.set(optimisticComponentId, airflowLayerElement),
            this.options.editable &&
              this.selectedComponentIds.size === 1 &&
              this.selectedComponentId === optimisticComponentId &&
              this.componentSelectionLayers.get(optimisticComponentId) === "airflow" &&
              this.syncSelection());
        }
      }
      if (optimisticComponentRecord.type !== "icon-button-effect") continue;
      const componentEffectLayerElement = this.componentEffectLayers.get(optimisticComponentId);
      (this.syncEffectLayerLightVisual(optimisticComponentRecord, componentEffectLayerElement),
        this.setEffectLayerActive(
          componentEffectLayerElement,
          isStateOptimistic,
          effectFadeDuration2(optimisticComponentRecord),
        ));
    }
  }
  ["refreshVacuumMapEntity"](vacuumImageEntityId) {
    if (
      this.options.liveMedia === false ||
      !/^(image|camera)\./.test(String(vacuumImageEntityId || ""))
    )
      return;
    const vacuumImageState = this.states.get(vacuumImageEntityId),
      vacuumImageSource = vacuumMapImageSource2(vacuumImageEntityId, vacuumImageState);
    let hasHandledVacuumImage = false;
    for (const [vacuumComponentId, vacuumRuntimeComponentRecord] of this.componentRecords) {
      if (
        vacuumRuntimeComponentRecord.type !== "vacuum-map" ||
        vacuumRuntimeComponentRecord.bindings?.entity?.entityId !== vacuumImageEntityId
      )
        continue;
      const vacuumImageElement = this.componentHosts
        .get(vacuumComponentId)
        ?.querySelector(".hb-vacuum-map-image");
      vacuumImageElement &&
        ((hasHandledVacuumImage = true), vacuumImageElement.hbSyncVacuumMap?.());
    }
    !hasHandledVacuumImage &&
      vacuumImageEntityId.startsWith("image.") &&
      vacuumMapAvailable2(vacuumImageState) &&
      this.options.liveMedia !== false &&
      this.vacuumMapEntityIds.has(vacuumImageEntityId) &&
      this.runtimeVacuumMapImagePreloader.enqueue(vacuumImageSource);
  }
  ["applyOptimisticToggle"](optimisticToggleTarget, optimisticComponent = null) {
    const optimisticEntityIdString = optimisticToggleTarget,
      powerEntityId4 = this.powerEntityId(optimisticComponent, optimisticEntityIdString),
      optimisticStateRecord = this.states.get(powerEntityId4),
      optimisticStatePayload = optimisticStateRecord?.newState ||
        optimisticStateRecord || {
          entityId: powerEntityId4,
          attributes: {},
        },
      startsWith2 = String(powerEntityId4 || "").startsWith("cover."),
      isDreamCover =
        startsWith2 &&
        coverComponentIsDream2(
          optimisticComponent,
          powerEntityId4,
          optimisticStateRecord,
          this.entityMetadata,
        ),
      runtimePowerComponent2 = this.runtimePowerComponent(
        optimisticComponent,
        optimisticEntityIdString,
      ),
      isCoverOpen = !(startsWith2
        ? isDreamCover
          ? runtimeEntityStateIsActive2(optimisticStateRecord)
          : runtimeCoverStateIsActive2(optimisticStateRecord)
        : entityPowerIsOn2(powerEntityId4, optimisticStateRecord, runtimePowerComponent2)),
      coverTogglePayload = startsWith2
        ? {
            ...optimisticStatePayload,
            state: isCoverOpen ? "open" : "closed",
            ...(isDreamCover
              ? {}
              : {
                  attributes: {
                    ...(optimisticStatePayload.attributes || {}),
                    current_position: isCoverOpen ? 100 : 0,
                  },
                }),
          }
        : optimisticToggleState2(powerEntityId4, optimisticStatePayload, runtimePowerComponent2);
    if (isCoverOpen && String(powerEntityId4 || "").startsWith("light.")) {
      const cachedLightVisualState = this.cachedLightVisualState(powerEntityId4);
      cachedLightVisualState?.attributes &&
        (coverTogglePayload.attributes = {
          ...(coverTogglePayload.attributes || {}),
          ...cachedLightVisualState.attributes,
        });
    }
    const confirmedOptimisticState = optimisticStateRecord?.newState
        ? {
            ...optimisticStateRecord,
            newState: coverTogglePayload,
          }
        : coverTogglePayload,
      optimisticEntityKey = String(powerEntityId4 || ""),
      optimisticPendingRecord = {
        desiredActive: isCoverOpen,
        expiresAt: Date.now() + 8000,
      };
    this.pendingOptimisticStates.set(optimisticEntityKey, optimisticPendingRecord);
    const optimisticTimeoutId = window.setTimeout(() => {
      this.pendingOptimisticStates.get(optimisticEntityKey) === optimisticPendingRecord &&
        (this.pendingOptimisticStates.delete(optimisticEntityKey),
        this.states.get(powerEntityId4) === confirmedOptimisticState &&
          (optimisticStateRecord === undefined
            ? this.states.delete(powerEntityId4)
            : this.states.set(powerEntityId4, optimisticStateRecord),
          this.updateOptimisticToggleVisuals(powerEntityId4)));
    }, 8000);
    return (
      this.states.set(powerEntityId4, confirmedOptimisticState),
      this.updateOptimisticToggleVisuals(powerEntityId4),
      () => {
        (window.clearTimeout(optimisticTimeoutId),
          this.pendingOptimisticStates.get(optimisticEntityKey) === optimisticPendingRecord &&
            this.pendingOptimisticStates.delete(optimisticEntityKey),
          this.states.get(powerEntityId4) === confirmedOptimisticState &&
            (optimisticStateRecord === undefined
              ? this.states.delete(powerEntityId4)
              : this.states.set(powerEntityId4, optimisticStateRecord),
            this.updateOptimisticToggleVisuals(powerEntityId4)));
      }
    );
  }
  ["renderComponent"](
    renderComponentRecord,
    renderParentElement = this.canvas,
    baseRenderZIndex = 0,
    componentIdToHostMap = null,
    componentIdToEffectHostMap = null,
  ) {
    const normalizedEffectComponent = normalizeIconButtonEffectComponent2(renderComponentRecord),
      runtimePowerComponent3 = this.runtimePowerComponent(normalizedEffectComponent),
      floorplanDiagramHostElement = [
        "camera",
        "vacuum-map",
        "floorplan-auto-diagram",
        "interaction3d",
        "group",
      ].includes(renderComponentRecord.type)
        ? componentIdToHostMap?.get(renderComponentRecord.id)
        : null;
    if (floorplanDiagramHostElement) {
      const autoDiagramPosition = renderComponentRecord.position || {},
        includes =
          renderParentElement === this.canvas &&
          ["floorplan-auto-diagram", "interaction3d"].includes(renderComponentRecord.type) &&
          renderComponentRecord.properties?.layoutMode === "fill",
        autoDiagramLayout = includes
          ? {
              ...autoDiagramPosition,
              x: 0,
              y: 0,
              width: Number(this.document.canvas?.width || 2778),
              height: Number(this.document.canvas?.height || 1940),
              rotation: 0,
            }
          : autoDiagramPosition,
        autoDiagramScale = Math.max(
          0.01,
          Math.min(5, Number(renderComponentRecord.style?.scale || 1)),
        ),
        autoDiagramZIndex = baseRenderZIndex + Number(autoDiagramLayout.zIndex || 1);
      if (
        (Object.assign(floorplanDiagramHostElement.style, {
          left: (autoDiagramLayout.x || 0) + "px",
          top: (autoDiagramLayout.y || 0) + "px",
          width: (autoDiagramLayout.width || 100) + "px",
          height: (autoDiagramLayout.height || 100) + "px",
          zIndex: String(autoDiagramZIndex),
          transform:
            "rotate(" +
            (autoDiagramLayout.rotation || 0) +
            "deg) scale(" +
            (includes ? 1 : autoDiagramScale) +
            ")",
        }),
        floorplanDiagramHostElement.style.setProperty(
          "--hb-component-z",
          String(autoDiagramZIndex),
        ),
        (floorplanDiagramHostElement.hidden = renderComponentRecord.style?.visible === false),
        floorplanDiagramHostElement.classList.toggle("layout-fill", includes),
        renderComponentRecord.type === "interaction3d" &&
          floorplanDiagramHostElement
            .querySelector(".hb-interaction3d-host")
            ?.updateInteraction3d?.(renderComponentRecord, this.document),
        renderComponentRecord.type === "floorplan-auto-diagram")
      ) {
        const isDiagramViewMode = renderComponentRecord.properties?.interactionMode === "view",
          diagramPreviewElement = floorplanDiagramHostElement.querySelector(
            ".hb-floorplan-auto-diagram-preview",
          ),
          diagramPreviewHintElement = floorplanDiagramHostElement.querySelector(
            ".hb-floorplan-auto-diagram-preview-hint",
          );
        (diagramPreviewElement?.classList.toggle("is-view-mode", isDiagramViewMode),
          diagramPreviewElement?.classList.toggle("is-position-mode", !isDiagramViewMode),
          diagramPreviewHintElement &&
            (diagramPreviewHintElement.textContent = isDiagramViewMode
              ? "拖动旋转 · 右键平移 · 滚轮缩放"
              : "拖动控件调整位置，右下角调整大小"));
      }
      (this.componentHosts.set(renderComponentRecord.id, floorplanDiagramHostElement),
        this.componentRecords.set(renderComponentRecord.id, renderComponentRecord));
      const hostParentComponentId = renderParentElement?.dataset?.componentId;
      (hostParentComponentId &&
        this.componentParentIds.set(renderComponentRecord.id, hostParentComponentId),
        this.indexRuntimeComponent(renderComponentRecord),
        floorplanDiagramHostElement.parentElement !== renderParentElement &&
          renderParentElement.append(floorplanDiagramHostElement));
      return;
    }
    const componentHostElement = document.createElement("div");
    ((componentHostElement.className =
      "hb-component hb-component-" + renderComponentRecord.type.replace(/[^a-z0-9_-]/gi, "-")),
      (componentHostElement.dataset.componentId = renderComponentRecord.id));
    const componentPosition = renderComponentRecord.position || {},
      isFillLayoutMode =
        renderParentElement === this.canvas &&
        ["image", "floorplan-auto-diagram", "interaction3d"].includes(renderComponentRecord.type) &&
        renderComponentRecord.properties?.layoutMode === "fill",
      componentLayout = isFillLayoutMode
        ? {
            ...componentPosition,
            x: 0,
            y: 0,
            width: Number(this.document.canvas?.width || 2778),
            height: Number(this.document.canvas?.height || 1940),
            rotation: 0,
          }
        : componentPosition,
      componentScaleValue = Math.max(
        0.01,
        Math.min(5, Number(renderComponentRecord.style?.scale || 1)),
      ),
      componentHostZIndex = baseRenderZIndex + Number(componentLayout.zIndex || 1),
      resolvedHostZIndex = componentHostZIndex2(
        renderComponentRecord,
        componentHostZIndex,
        renderParentElement === this.canvas,
      );
    (Object.assign(componentHostElement.style, {
      left: (componentLayout.x || 0) + "px",
      top: (componentLayout.y || 0) + "px",
      width: (componentLayout.width || 100) + "px",
      height: (componentLayout.height || 100) + "px",
      zIndex: String(resolvedHostZIndex),
      transform:
        "rotate(" +
        (componentLayout.rotation || 0) +
        "deg) scale(" +
        (isFillLayoutMode ? 1 : componentScaleValue) +
        ")",
    }),
      componentHostElement.style.setProperty("--hb-component-z", String(resolvedHostZIndex)),
      (componentHostElement.hidden = renderComponentRecord.style?.visible === false),
      renderComponentRecord.type === "flow-line" &&
        !this.options.editable &&
        (componentHostElement.style.pointerEvents = "none"),
      renderComponentRecord.type === "icon-button-effect" &&
        renderComponentRecord.properties?.buttonVisible === false &&
        renderComponentRecord.properties?.hiddenContentClickable !== true &&
        !this.options.editable &&
        (componentHostElement.style.pointerEvents = "none"),
      componentHostElement.classList.toggle("layout-fill", isFillLayoutMode),
      this.componentHosts.set(renderComponentRecord.id, componentHostElement),
      this.componentRecords.set(renderComponentRecord.id, renderComponentRecord));
    const nestedParentComponentId = renderParentElement?.dataset?.componentId;
    (nestedParentComponentId &&
      this.componentParentIds.set(renderComponentRecord.id, nestedParentComponentId),
      this.indexRuntimeComponent(renderComponentRecord));
    const componentLayerOptions = {
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
      previewState: this.componentPreviewStates.get(renderComponentRecord.id) || "auto",
      prewarmStage: this.prewarmingStageId === renderComponentRecord.id,
      isIconVisible: (visibilityEntityId) => this.iconVisibilityState(visibilityEntityId),
      navigate: (componentNavigationPath) => this.navigate(componentNavigationPath),
      callEntityService: (...serviceCallParameters: [any, any, any, any?]) =>
        this.callEntityService(...serviceCallParameters),
      openCameraPreview: (cameraPreviewComponent, cameraPreviewWidth, cameraPreviewHeight) =>
        this.openInteraction3dCameraPreview(
          cameraPreviewComponent,
          cameraPreviewWidth,
          cameraPreviewHeight,
        ),
      openVacuumDetails: (vacuumDetailsComponent, vacuumDetailsWidth, vacuumDetailsHeight) =>
        this.openInteraction3dVacuumDetails(
          vacuumDetailsComponent,
          vacuumDetailsWidth,
          vacuumDetailsHeight,
        ),
      runVacuumRoom: (vacuumRoomEntry) =>
        this.dispatchAction(
          {
            id: renderComponentRecord.id + ":room:" + vacuumRoomEntry.id,
            type: "device-button",
            properties: {
              label: vacuumRoomEntry.label,
            },
            bindings: {
              entity: {
                entityId: vacuumRoomEntry.entityId,
              },
            },
          },
          {
            type: "toggle",
            data: {},
          },
        ),
      onError: (actionErrorObject) => this.options.onError?.(actionErrorObject),
      registerRuntimeStateHandler: (componentStateEntityId, componentStateHandler) =>
        this.registerRuntimeStateHandler(
          componentStateEntityId,
          componentStateHandler,
          renderComponentRecord.id,
        ),
      runtimeStateReady: () => this.runtimeSnapshotReady === true,
      invalidate: () => this.renderComponents(true),
      cleanup: (cleanupFunction) => {
        ["camera", "vacuum-map"].includes(renderComponentRecord.type)
          ? (this.cameraCleanups.has(renderComponentRecord.id) ||
              this.cameraCleanups.set(renderComponentRecord.id, []),
            this.cameraCleanups.get(renderComponentRecord.id).push(cleanupFunction))
          : this.registerComponentCleanup(renderComponentRecord.id, cleanupFunction);
      },
    };
    if (renderComponentRecord.type === "icon-button-effect") {
      const renderedEffectLayerElement = renderIconButtonEffectLayer2(
        runtimePowerComponent3,
        componentLayerOptions,
      );
      if (renderedEffectLayerElement) {
        const cachedEffectLayerElement =
            componentIdToEffectHostMap?.get(renderComponentRecord.id) || null,
          activeEffectStageElement = cachedEffectLayerElement || renderedEffectLayerElement,
          effectSourceImageElement = renderedEffectLayerElement.querySelector("img"),
          effectTargetImageElement = activeEffectStageElement.querySelector("img"),
          contains = renderedEffectLayerElement.classList.contains("active");
        if (cachedEffectLayerElement && effectTargetImageElement && effectSourceImageElement) {
          activeEffectStageElement.classList.toggle(
            "awaiting-light-visual",
            renderedEffectLayerElement.classList.contains("awaiting-light-visual"),
          );
          const effectSourceName = effectSourceImageElement.dataset.effectSource || "";
          if (effectSourceName) effectTargetImageElement.dataset.effectSource = effectSourceName;
          else {
            delete effectTargetImageElement.dataset.effectSource;
            const attribute = effectSourceImageElement.getAttribute("src");
            attribute && (effectTargetImageElement.src = attribute);
          }
          ((effectTargetImageElement.alt = effectSourceImageElement.alt),
            (effectTargetImageElement.draggable = false),
            (effectTargetImageElement.decoding = "async"),
            (effectTargetImageElement.style.objectFit = effectSourceImageElement.style.objectFit),
            (effectTargetImageElement.style.mixBlendMode =
              effectSourceImageElement.style.mixBlendMode));
          for (const datasetKeyName of [
            "effectOriginalWidth",
            "effectOriginalHeight",
            "effectCropX",
            "effectCropY",
            "effectCropWidth",
            "effectCropHeight",
          ])
            effectSourceImageElement.dataset[datasetKeyName] !== undefined
              ? (effectTargetImageElement.dataset[datasetKeyName] =
                  effectSourceImageElement.dataset[datasetKeyName])
              : delete effectTargetImageElement.dataset[datasetKeyName];
        }
        const effectProperties = runtimePowerComponent3.properties || {},
          effectCanvasWidth = Number(this.document.canvas?.width || 2778),
          effectCanvasHeight = Number(this.document.canvas?.height || 1940),
          isEffectFillLayout = effectProperties.effectLayoutMode === "fill",
          isGroupedComponent = renderParentElement !== this.canvas;
        ((activeEffectStageElement.dataset.effectFor = renderComponentRecord.id),
          (activeEffectStageElement.hidden = renderComponentRecord.style?.visible === false));
        const measureNaturalSize = () => {
          const effectSourceSize = effectSourceDimensions2(
              effectProperties,
              effectTargetImageElement,
              effectCanvasWidth,
              effectCanvasHeight,
            ),
            effectCropRect = effectCropRectangle2(effectTargetImageElement, effectSourceSize),
            effectScaleRecord =
              !isEffectFillLayout && !effectSourceSize.pendingNaturalSize
                ? effectReferenceImageTransform2(
                    this.page,
                    renderComponentRecord,
                    effectSourceSize.width,
                    effectSourceSize.height,
                    effectCanvasWidth,
                    effectCanvasHeight,
                  )
                : null,
            effectScaleValue = Math.max(
              0.01,
              Math.min(5, Number(effectProperties.effectScale || 1)),
            ),
            effectLayerScale = isEffectFillLayout
              ? Math.min(
                  effectCanvasWidth / effectSourceSize.width,
                  effectCanvasHeight / effectSourceSize.height,
                )
              : (effectScaleRecord?.scale || 1) * effectScaleValue,
            effectRotationDeg = isEffectFillLayout
              ? 0
              : Number(effectProperties.effectRotation || 0),
            effectLeftRatio = Number(effectProperties.effectLeft ?? 50) / 100,
            effectTopRatio = Number(effectProperties.effectTop ?? 50) / 100,
            effectCenterX = isEffectFillLayout
              ? effectCanvasWidth / 2
              : effectCanvasWidth * effectLeftRatio,
            effectCenterY = isEffectFillLayout
              ? effectCanvasHeight / 2
              : effectCanvasHeight * effectTopRatio,
            effectLayerGeometry = effectCroppedLayerGeometry2({
              centerX: effectCenterX,
              centerY: effectCenterY,
              originalWidth: effectSourceSize.width,
              originalHeight: effectSourceSize.height,
              cropX: effectCropRect.x,
              cropY: effectCropRect.y,
              cropWidth: effectCropRect.width,
              cropHeight: effectCropRect.height,
              scale: effectLayerScale,
              rotation: effectRotationDeg,
            });
          let effectLayerRect = effectLayerGeometry;
          if (isGroupedComponent) {
            const effectLayerCenterX = effectLayerGeometry.left + effectLayerGeometry.width / 2,
              effectLayerCenterY = effectLayerGeometry.top + effectLayerGeometry.height / 2,
              effectParentComponentId = renderParentElement?.dataset?.componentId,
              worldPointToComponentLocal = effectParentComponentId
                ? this.worldPointToComponentLocal(
                    effectParentComponentId,
                    effectLayerCenterX,
                    effectLayerCenterY,
                  )
                : {
                    x: effectLayerCenterX,
                    y: effectLayerCenterY,
                  },
              componentWorldTransform = effectParentComponentId
                ? this.componentWorldTransform(effectParentComponentId)
                : {
                    scale: 1,
                    rotation: 0,
                  };
            effectLayerRect = {
              ...effectLayerGeometry,
              left: worldPointToComponentLocal.x - effectLayerGeometry.width / 2,
              top: worldPointToComponentLocal.y - effectLayerGeometry.height / 2,
              scale: effectLayerGeometry.scale / Math.max(0.0001, componentWorldTransform.scale),
              rotation: effectLayerGeometry.rotation - componentWorldTransform.rotation,
            };
          }
          return (
            Object.assign(activeEffectStageElement.style, {
              left: effectLayerRect.left + "px",
              top: effectLayerRect.top + "px",
              width: effectLayerGeometry.width + "px",
              height: effectLayerGeometry.height + "px",
              visibility: effectSourceSize.pendingNaturalSize ? "hidden" : "",
              zIndex: String(isGroupedComponent ? componentHostZIndex - 0.1 : componentHostZIndex),
              transform:
                "rotate(" + effectLayerRect.rotation + "deg) scale(" + effectLayerRect.scale + ")",
            }),
            effectSourceSize
          );
        };
        (measureNaturalSize().pendingNaturalSize &&
          effectTargetImageElement &&
          effectTargetImageElement.addEventListener(
            "load",
            () => {
              activeEffectStageElement.isConnected && measureNaturalSize();
            },
            {
              once: true,
            },
          ),
          (isGroupedComponent
            ? renderParentElement
            : isEffectFillLayout
              ? this.canvas
              : renderParentElement
          ).append(activeEffectStageElement),
          this.componentEffectLayers.set(renderComponentRecord.id, activeEffectStageElement));
        const effectSourceValue = effectTargetImageElement?.dataset.effectSource || "";
        if (
          (effectSourceValue &&
            this.runtimeEffectImageLoader.enqueue(effectTargetImageElement, effectSourceValue, {
              active: contains,
            }),
          cachedEffectLayerElement)
        ) {
          const effectFilterStyle = effectSourceImageElement?.style.filter || "none",
            propertyValue = renderedEffectLayerElement.style.getPropertyValue(
              "--hb-effect-image-opacity",
            ),
            propertyValue2 = renderedEffectLayerElement.style.getPropertyValue(
              "--hb-effect-fade-duration",
            ),
            propertyValue3 = renderedEffectLayerElement.style.getPropertyValue(
              "--hb-effect-visual-transition-duration",
            ),
            opacity = renderedEffectLayerElement.style.opacity,
            transition = renderedEffectLayerElement.style.transition;
          (effectTargetImageElement?.offsetWidth,
            effectTargetImageElement && (effectTargetImageElement.style.filter = effectFilterStyle),
            (activeEffectStageElement.style.opacity = opacity),
            (activeEffectStageElement.style.transition = transition),
            activeEffectStageElement.style.setProperty("--hb-effect-image-opacity", propertyValue),
            activeEffectStageElement.style.setProperty("--hb-effect-fade-duration", propertyValue2),
            activeEffectStageElement.style.setProperty(
              "--hb-effect-visual-transition-duration",
              propertyValue3,
            ),
            this.setEffectLayerActive(
              activeEffectStageElement,
              contains,
              effectFadeDuration2(renderComponentRecord),
            ));
        }
      }
    }
    if (renderComponentRecord.type === "air-conditioner") {
      const airflowRenderLayerElement = renderAirConditionerAirflowLayer2(
        runtimePowerComponent3,
        componentLayerOptions,
      );
      if (airflowRenderLayerElement) {
        ((airflowRenderLayerElement.dataset.airflowFor = renderComponentRecord.id),
          (airflowRenderLayerElement.hidden = renderComponentRecord.style?.visible === false));
        const isAirflowLayerGrouped = renderParentElement !== this.canvas,
          airflowLayerRect = airflowLayerGeometry2(renderComponentRecord, {
            grouped: isAirflowLayerGrouped,
          });
        (Object.assign(airflowRenderLayerElement.style, {
          left: airflowLayerRect.left + "px",
          top: airflowLayerRect.top + "px",
          width: airflowLayerRect.width + "px",
          height: airflowLayerRect.height + "px",
          zIndex: String(componentHostZIndex),
          transform:
            "rotate(" + airflowLayerRect.rotation + "deg) scale(" + airflowLayerRect.scale + ")",
        }),
          (isAirflowLayerGrouped ? componentHostElement : renderParentElement).append(
            airflowRenderLayerElement,
          ),
          this.componentAirflowLayers.set(renderComponentRecord.id, airflowRenderLayerElement));
      }
    }
    const previousChartElement =
        renderComponentRecord.type === "group"
          ? (() => {
              const groupContainerElement = document.createElement("div");
              return (
                (groupContainerElement.className = "hb-group-container"),
                groupContainerElement
              );
            })()
          : renderRegisteredComponent2(runtimePowerComponent3, componentLayerOptions),
      chartCanvasComponentScale = Number(this.document.canvas.componentScale || 1);
    if (
      (chartCanvasComponentScale !== 1 &&
        ((previousChartElement.style.width = 100 / chartCanvasComponentScale + "%"),
        (previousChartElement.style.height = 100 / chartCanvasComponentScale + "%"),
        (previousChartElement.style.transform = "scale(" + chartCanvasComponentScale + ")"),
        (previousChartElement.style.transformOrigin = "top left")),
      componentHostElement.append(previousChartElement),
      renderComponentRecord.type === "line-chart")
    ) {
      let chartElement = previousChartElement;
      const refreshChartState = () => {
        if (!chartElement?.isConnected) return;
        const refreshedChartElement = renderRegisteredComponent2(
          runtimePowerComponent3,
          componentLayerOptions,
        );
        (chartCanvasComponentScale !== 1 &&
          ((refreshedChartElement.style.width = 100 / chartCanvasComponentScale + "%"),
          (refreshedChartElement.style.height = 100 / chartCanvasComponentScale + "%"),
          (refreshedChartElement.style.transform = "scale(" + chartCanvasComponentScale + ")"),
          (refreshedChartElement.style.transformOrigin = "top left")),
          chartElement.cleanupLineChartHover?.(),
          chartElement.replaceWith(refreshedChartElement),
          (chartElement = refreshedChartElement));
      };
      (this.registerRuntimeStateHandler(
        renderComponentRecord.bindings?.entity?.entityId,
        (chartStatePayload) => {
          (chartElement.syncLineChartState?.(chartStatePayload),
            chartElement.classList.contains("history-loading") && refreshChartState());
        },
        renderComponentRecord.id,
      ),
        this.registerHistoryChartRefresher(refreshChartState, renderComponentRecord.id));
    }
    if (this.options.editable)
      (componentHostElement.classList.add("editable"),
        componentHostElement.addEventListener("pointerdown", (componentMoveEvent) =>
          this.startComponentMove(componentMoveEvent, renderComponentRecord, componentHostElement),
        ));
    else {
      const call = Object.prototype.hasOwnProperty.call(renderComponentRecord.actions || {}, "tap"),
        runtimeActionOptions =
          renderComponentRecord.type === "camera" &&
          renderComponentRecord.bindings?.entity?.entityId &&
          !call
            ? {
                ...renderComponentRecord,
                actions: {
                  tap: {
                    type: "more-info",
                    data: {
                      popupSource: "current",
                    },
                  },
                  ...(renderComponentRecord.actions || {}),
                },
              }
            : renderComponentRecord;
      if (
        (renderComponentRecord.type === "light-statistics" &&
          componentHostElement.classList.add("hb-runtime-fitted-hit-area"),
        renderComponentRecord.type !== "scene-mode" &&
          Object.values(runtimeActionOptions.actions || {}).some((runtimeActionDefinition) =>
            componentSupportsAction(runtimeActionOptions, runtimeActionDefinition),
          ))
      ) {
        componentHostElement.classList.add("interactive");
        let runtimeActionHitboxElement: HTMLElement = componentHostElement;
        (["title-button", "device-button", "light-statistics"].includes(
          renderComponentRecord.type,
        ) &&
          ((runtimeActionHitboxElement = document.createElement("span")),
          (runtimeActionHitboxElement.className = "hb-runtime-action-hitbox"),
          runtimeActionHitboxElement.setAttribute("aria-hidden", "true"),
          componentHostElement.classList.add("hb-runtime-fitted-hit-area"),
          componentHostElement.append(runtimeActionHitboxElement)),
          this.bindRuntimeActions(runtimeActionHitboxElement, runtimeActionOptions));
      }
    }
    renderParentElement.append(componentHostElement);
    const runtimeHitboxElement = componentHostElement.querySelector<HTMLElement>(
      ":scope > .hb-runtime-action-hitbox",
    );
    if (runtimeHitboxElement) {
      const titleButtonSelectionBounds =
        renderComponentRecord.type === "title-button"
          ? this.updateTitleButtonSelectionBounds(
              componentHostElement,
              renderComponentRecord,
              runtimeHitboxElement,
            )
          : renderComponentRecord.type === "light-statistics"
            ? this.updateLightStatisticsSelectionBounds(
                componentHostElement,
                renderComponentRecord,
                runtimeHitboxElement,
              )
            : this.updateDeviceButtonSelectionBounds(
                componentHostElement,
                renderComponentRecord,
                runtimeHitboxElement,
              );
      runtimeHitboxElement.hidden = !titleButtonSelectionBounds;
    }
    for (const childComponentRecord of renderComponentRecord.children || [])
      this.renderComponent(
        childComponentRecord,
        componentHostElement,
        0,
        componentIdToHostMap,
        componentIdToEffectHostMap,
      );
  }
  ["startComponentMove"](
    movePointerEvent,
    moveComponentRecord,
    moveHostElement,
    pointerTargetElement = moveHostElement,
  ) {
    if (
      !this.options.editable ||
      !this.selectedComponentIds.has(moveComponentRecord.id) ||
      moveComponentRecord.properties?.layoutMode === "fill" ||
      movePointerEvent.button !== 0 ||
      movePointerEvent.target.closest(".hb-transform-handle")
    )
      return;
    (movePointerEvent.preventDefault(), movePointerEvent.stopPropagation());
    const clientX = movePointerEvent.clientX,
      clientY = movePointerEvent.clientY,
      draggableEntries = [...this.selectedComponentIds]
        .map((draggableComponentId) => ({
          component: this.componentRecords.get(draggableComponentId),
          host: this.componentHosts.get(draggableComponentId),
        }))
        .filter((draggableEntry) => draggableEntry.component && draggableEntry.host)
        .map((draggableEntryRecord) => ({
          ...draggableEntryRecord,
          initialX: Number(draggableEntryRecord.component.position?.x || 0),
          initialY: Number(draggableEntryRecord.component.position?.y || 0),
          width: Number(draggableEntryRecord.component.position?.width || 100),
          height: Number(draggableEntryRecord.component.position?.height || 100),
          parentId: this.componentParentIds.get(draggableEntryRecord.component.id) || null,
          parentTransform: this.componentParentTransform(draggableEntryRecord.component.id),
          worldCenter: this.componentLocalPointToWorld(
            draggableEntryRecord.component.id,
            Number(draggableEntryRecord.component.position?.width || 100) / 2,
            Number(draggableEntryRecord.component.position?.height || 100) / 2,
          ),
        }));
    if (
      !draggableEntries.some(
        (draggableEntryItem) => draggableEntryItem.component.id === moveComponentRecord.id,
      ) ||
      draggableEntries.some(
        (fillLayoutEntry) => fillLayoutEntry.component.properties?.layoutMode === "fill",
      )
    )
      return;
    let hasGestureStarted = isPrimaryModifierPressed(movePointerEvent),
      isOptimisticToggled =
        !hasGestureStarted &&
        draggableEntries.length === 1 &&
        moveComponentRecord.type === "air-conditioner" &&
        this.componentSelectionLayers.get(moveComponentRecord.id) !== "airflow";
    const airflowOffsetX = Number(moveComponentRecord.properties?.airflowOffsetX ?? -75),
      airflowOffsetY = Number(moveComponentRecord.properties?.airflowOffsetY ?? 34);
    let nextAirflowOffsetX = airflowOffsetX,
      nextAirflowOffsetY = airflowOffsetY;
    const moveCanvasWidth = Number(this.document?.canvas?.width || 2778),
      moveCanvasHeight = Number(this.document?.canvas?.height || 1940),
      reduce = draggableEntries.reduce(
        (dragBounds, dragEntryRecord) => ({
          minX: Math.max(dragBounds.minX, Math.min(0, -dragEntryRecord.worldCenter.x)),
          maxX: Math.min(
            dragBounds.maxX,
            Math.max(0, moveCanvasWidth - dragEntryRecord.worldCenter.x),
          ),
          minY: Math.max(dragBounds.minY, Math.min(0, -dragEntryRecord.worldCenter.y)),
          maxY: Math.min(
            dragBounds.maxY,
            Math.max(0, moveCanvasHeight - dragEntryRecord.worldCenter.y),
          ),
        }),
        {
          minX: -Infinity,
          maxX: Infinity,
          minY: -Infinity,
          maxY: Infinity,
        },
      ),
      initialPositionX = Number(moveComponentRecord.position?.x || 0),
      initialPositionY = Number(moveComponentRecord.position?.y || 0);
    let nextPositionX = initialPositionX,
      nextPositionY = initialPositionY,
      draggedEntries: DraggedComponentEntry[] = draggableEntries,
      duplicatedEntries = [],
      dragTransforms = draggableEntries.map((dragEntrySource) => ({
        componentId: dragEntrySource.component.id,
        x: dragEntrySource.initialX,
        y: dragEntrySource.initialY,
      })),
      primaryDraggedComponentId = moveComponentRecord.id,
      hasDuplicatedComponents = false,
      dragDirection = "",
      hasDragCommitted = false;
    const pointerId3 = movePointerEvent.pointerId;
    (pointerTargetElement.setPointerCapture(pointerId3),
      draggableEntries.forEach((movingHostEntry) => movingHostEntry.host.classList.add("moving")));
    const dragMoveHandler = (dragMoveEvent) => {
        if (dragMoveEvent.pointerId !== pointerId3) return;
        if (
          !pointerTargetElement.hasPointerCapture?.(pointerId3) &&
          pointerTargetElement.isConnected
        )
          try {
            pointerTargetElement.setPointerCapture(pointerId3);
          } catch {}
        !hasGestureStarted &&
          isPrimaryModifierPressed(dragMoveEvent) &&
          ((hasGestureStarted = true), (isOptimisticToggled = false));
        let dragDeltaX = dragMoveEvent.clientX - clientX,
          dragDeltaY = dragMoveEvent.clientY - clientY;
        if (hasGestureStarted && !hasDuplicatedComponents) {
          if (Math.hypot(dragDeltaX, dragDeltaY) < 3) return;
          ((duplicatedEntries = draggableEntries.map((duplicateSourceEntry) => {
            const copiedComponent = assignComponentIdentifiers(
              structuredClone(duplicateSourceEntry.component),
            );
            return (
              (copiedComponent.position = {
                ...(copiedComponent.position || {}),
                zIndex: Number(copiedComponent.position?.zIndex || 1) + 1,
              }),
              this.renderComponent(copiedComponent, duplicateSourceEntry.host.parentElement),
              {
                sourceComponentId: duplicateSourceEntry.component.id,
                copiedComponent: copiedComponent,
              }
            );
          })),
            (draggedEntries = duplicatedEntries.map((duplicatedEntry, duplicatedIndex) => ({
              component: duplicatedEntry.copiedComponent,
              host: this.componentHosts.get(duplicatedEntry.copiedComponent.id),
              initialX: draggableEntries[duplicatedIndex].initialX,
              initialY: draggableEntries[duplicatedIndex].initialY,
              width: draggableEntries[duplicatedIndex].width,
              height: draggableEntries[duplicatedIndex].height,
              parentId: draggableEntries[duplicatedIndex].parentId,
              parentTransform: draggableEntries[duplicatedIndex].parentTransform,
            }))),
            (primaryDraggedComponentId =
              duplicatedEntries.find(
                (duplicateMatchEntry) =>
                  duplicateMatchEntry.sourceComponentId === moveComponentRecord.id,
              )?.copiedComponent.id || duplicatedEntries[0]?.copiedComponent.id),
            (hasDuplicatedComponents = true),
            draggableEntries.forEach((draggedSourceEntry) =>
              draggedSourceEntry.host.classList.remove("moving"),
            ),
            draggedEntries.forEach((duplicatedEntryItem) =>
              duplicatedEntryItem.host?.classList.add("moving"),
            ),
            (this.selectedComponentId = primaryDraggedComponentId),
            (this.selectedComponentIds = new Set(
              draggedEntries.map((selectedEntry) => selectedEntry.component.id),
            )));
        }
        dragMoveEvent.shiftKey
          ? (!dragDirection &&
              Math.hypot(dragDeltaX, dragDeltaY) >= 1 &&
              (dragDirection =
                Math.abs(dragDeltaX) >= Math.abs(dragDeltaY) ? "horizontal" : "vertical"),
            dragDirection === "horizontal" && (dragDeltaY = 0),
            dragDirection === "vertical" && (dragDeltaX = 0))
          : (dragDirection = "");
        const dragLocalDeltaX = Math.max(
            reduce.minX,
            Math.min(reduce.maxX, dragDeltaX / (this.appliedScaleX || 1)),
          ),
          dragLocalDeltaY = Math.max(
            reduce.minY,
            Math.min(reduce.maxY, dragDeltaY / (this.appliedScaleY || 1)),
          ),
          primaryDragEntry =
            draggableEntries.find(
              (primaryCandidateEntry) =>
                primaryCandidateEntry.component.id === moveComponentRecord.id,
            ) || draggableEntries[0],
          localDelta = groupedComponentLocalDelta2(
            dragLocalDeltaX,
            dragLocalDeltaY,
            primaryDragEntry.parentTransform,
          );
        ((nextPositionX = initialPositionX + localDelta.x),
          (nextPositionY = initialPositionY + localDelta.y),
          isOptimisticToggled &&
            ((nextAirflowOffsetX =
              airflowOffsetX -
              (localDelta.x / Math.max(1, Number(moveComponentRecord.position?.width || 100))) *
                100),
            (nextAirflowOffsetY =
              airflowOffsetY -
              (localDelta.y / Math.max(1, Number(moveComponentRecord.position?.height || 100))) *
                100),
            (moveComponentRecord.properties = {
              ...(moveComponentRecord.properties || {}),
              airflowOffsetX: nextAirflowOffsetX,
              airflowOffsetY: nextAirflowOffsetY,
            }),
            this.options.onComponentPropertiesPreview?.(moveComponentRecord.id, {
              airflowOffsetX: nextAirflowOffsetX,
              airflowOffsetY: nextAirflowOffsetY,
            })));
        const dragResultEntries = draggedEntries.map((dragResultEntry) => {
          const entryLocalDelta = groupedComponentLocalDelta2(
            dragLocalDeltaX,
            dragLocalDeltaY,
            dragResultEntry.parentTransform,
          );
          return {
            componentId: dragResultEntry.component.id,
            x: dragResultEntry.initialX + entryLocalDelta.x,
            y: dragResultEntry.initialY + entryLocalDelta.y,
          };
        });
        dragTransforms = dragResultEntries;
        for (const transformEntry of dragResultEntries) {
          const transformPreviewHostElement = this.componentHosts.get(transformEntry.componentId);
          transformPreviewHostElement &&
            ((transformPreviewHostElement.style.left = transformEntry.x + "px"),
            (transformPreviewHostElement.style.top = transformEntry.y + "px"));
          const transformOverlayElement = this.componentSelectionOverlays.get(
            transformEntry.componentId,
          );
          transformOverlayElement &&
            ((transformOverlayElement.style.left = transformEntry.x + "px"),
            (transformOverlayElement.style.top = transformEntry.y + "px"));
        }
        hasDuplicatedComponents ||
          (dragResultEntries.length > 1
            ? this.options.onComponentsTransformPreview?.(dragResultEntries, moveComponentRecord.id)
            : this.options.onComponentTransformPreview?.(moveComponentRecord.id, {
                x: nextPositionX,
                y: nextPositionY,
              }));
      },
      dragEndHandler = (dragEndEvent = null) => {
        if (
          !hasDragCommitted &&
          !(dragEndEvent?.pointerId != null && dragEndEvent.pointerId !== pointerId3) &&
          ((hasDragCommitted = true),
          draggedEntries.forEach((duplicatedCleanupEntry) =>
            duplicatedCleanupEntry.host?.classList.remove("moving"),
          ),
          draggableEntries.forEach((draggedCleanupEntry) =>
            draggedCleanupEntry.host.classList.remove("moving"),
          ),
          window.removeEventListener("pointermove", dragMoveHandler, true),
          window.removeEventListener("pointerup", dragEndHandler, true),
          window.removeEventListener("pointercancel", dragEndHandler, true),
          window.removeEventListener("blur", dragEndHandler),
          nextPositionX !== initialPositionX || nextPositionY !== initialPositionY)
        ) {
          if (hasDuplicatedComponents)
            (draggedEntries.forEach((committedEntry) => {
              const committedTransformRecord = dragTransforms.find(
                (committedMatchEntry) =>
                  committedMatchEntry.componentId === committedEntry.component.id,
              );
              committedEntry.component.position = {
                ...(committedEntry.component.position || {}),
                x: committedTransformRecord?.x ?? committedEntry.initialX,
                y: committedTransformRecord?.y ?? committedEntry.initialY,
              };
            }),
              this.options.onComponentsDuplicate?.(
                duplicatedEntries,
                moveComponentRecord.id,
                primaryDraggedComponentId,
              ));
          else {
            if (draggableEntries.length > 1) {
              const finalTransforms = dragTransforms.map((finalTransformRecord) => {
                const finalDragEntry = draggableEntries.find(
                  (finalMatchEntry) =>
                    finalMatchEntry.component.id === finalTransformRecord.componentId,
                );
                return (
                  finalDragEntry &&
                    (finalDragEntry.component.position = {
                      ...(finalDragEntry.component.position || {}),
                      x: finalTransformRecord.x,
                      y: finalTransformRecord.y,
                    }),
                  finalTransformRecord
                );
              });
              this.options.onComponentsTransform?.(finalTransforms, moveComponentRecord.id);
            } else
              ((moveComponentRecord.position = {
                ...(moveComponentRecord.position || {}),
                x: nextPositionX,
                y: nextPositionY,
              }),
                this.options.onComponentTransform?.(moveComponentRecord.id, {
                  x: nextPositionX,
                  y: nextPositionY,
                  ...(isOptimisticToggled
                    ? {
                        airflowOffsetX: nextAirflowOffsetX,
                        airflowOffsetY: nextAirflowOffsetY,
                      }
                    : {}),
                }));
          }
        }
      };
    (window.addEventListener("pointermove", dragMoveHandler, true),
      window.addEventListener("pointerup", dragEndHandler, true),
      window.addEventListener("pointercancel", dragEndHandler, true),
      window.addEventListener("blur", dragEndHandler));
  }
  ["createComponentSelectionOverlay"](overlayHostElement, overlayComponentRecord) {
    if (
      !overlayHostElement ||
      !overlayComponentRecord ||
      !overlayHostElement.parentElement ||
      (overlayHostElement.parentElement !== this.canvas && !overlayHostElement.hidden)
    )
      return null;
    const parentElement2 = overlayHostElement.parentElement,
      componentOverlayElement = document.createElement("div");
    return (
      (componentOverlayElement.className = "hb-component-selection-overlay"),
      overlayComponentRecord.type === "light-statistics" &&
        componentOverlayElement.classList.add("hb-light-statistics-selection-overlay"),
      overlayComponentRecord.type === "floorplan-auto-diagram" &&
        overlayComponentRecord.properties?.interactionMode === "view" &&
        componentOverlayElement.classList.add("hb-floorplan-auto-diagram-view-overlay"),
      (componentOverlayElement.dataset.selectionFor = overlayComponentRecord.id),
      Object.assign(componentOverlayElement.style, {
        left: overlayHostElement.style.left,
        top: overlayHostElement.style.top,
        width: overlayHostElement.style.width,
        height: overlayHostElement.style.height,
        transform: overlayHostElement.style.transform,
      }),
      overlayComponentRecord.type !== "light-statistics" &&
        componentOverlayElement.addEventListener("pointerdown", (overlayPointerEvent) =>
          this.startComponentMove(
            overlayPointerEvent,
            overlayComponentRecord,
            overlayHostElement,
            componentOverlayElement,
          ),
        ),
      parentElement2.append(componentOverlayElement),
      this.componentSelectionOverlays.set(overlayComponentRecord.id, componentOverlayElement),
      componentOverlayElement
    );
  }
  ["createAirflowSelectionOverlay"](airflowLayerHostElement, airflowComponentRecord) {
    if (
      !airflowLayerHostElement ||
      !airflowComponentRecord ||
      !airflowLayerHostElement.parentElement
    )
      return null;
    const airflowSelectionOverlayElement = document.createElement("div");
    return (
      (airflowSelectionOverlayElement.className =
        "hb-component-selection-overlay hb-airflow-selection-overlay"),
      (airflowSelectionOverlayElement.dataset.selectionFor = airflowComponentRecord.id),
      Object.assign(airflowSelectionOverlayElement.style, {
        left: airflowLayerHostElement.style.left,
        top: airflowLayerHostElement.style.top,
        width: airflowLayerHostElement.style.width,
        height: airflowLayerHostElement.style.height,
        transform: airflowLayerHostElement.style.transform,
      }),
      airflowLayerHostElement.parentElement.append(airflowSelectionOverlayElement),
      this.componentSelectionOverlays.set(
        airflowComponentRecord.id,
        airflowSelectionOverlayElement,
      ),
      airflowSelectionOverlayElement
    );
  }
  ["syncAirflowLayerGeometry"](
    airflowLayerTargetElement,
    geometryComponentRecord,
    geometryOverlayElement = null,
  ) {
    if (!airflowLayerTargetElement || !geometryComponentRecord) return;
    const airflowGroupRect = airflowLayerGeometry2(geometryComponentRecord, {
        grouped: airflowLayerTargetElement.parentElement !== this.canvas,
      }),
      airflowStyleRecord = {
        left: airflowGroupRect.left + "px",
        top: airflowGroupRect.top + "px",
        width: airflowGroupRect.width + "px",
        height: airflowGroupRect.height + "px",
        transform:
          "rotate(" + airflowGroupRect.rotation + "deg) scale(" + airflowGroupRect.scale + ")",
      };
    (Object.assign(airflowLayerTargetElement.style, airflowStyleRecord),
      geometryOverlayElement && Object.assign(geometryOverlayElement.style, airflowStyleRecord));
  }
  ["appendEffectSelectionBounds"](effectBoundsHostElement, effectBoundsComponent) {
    if (
      !effectBoundsHostElement ||
      !effectBoundsComponent ||
      !effectBoundsHostElement.parentElement
    )
      return;
    const effectSelectionOverlayElement = document.createElement("div");
    ((effectSelectionOverlayElement.className =
      "hb-component-selection-overlay hb-effect-selection-overlay"),
      (effectSelectionOverlayElement.dataset.selectionFor = effectBoundsComponent.id),
      Object.assign(effectSelectionOverlayElement.style, {
        left: effectBoundsHostElement.style.left,
        top: effectBoundsHostElement.style.top,
        width: effectBoundsHostElement.style.width,
        height: effectBoundsHostElement.style.height,
        transform: effectBoundsHostElement.style.transform,
        pointerEvents: "none",
      }));
    const effectBoundsElement = document.createElement("div");
    effectBoundsElement.className = "hb-selection-bounds hb-effect-selection-bounds";
    for (const cornerPositionName of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const effectCornerMarkerElement = document.createElement("i");
      ((effectCornerMarkerElement.className = "hb-corner-marker hb-corner-" + cornerPositionName),
        effectCornerMarkerElement.setAttribute("aria-hidden", "true"),
        effectBoundsElement.append(effectCornerMarkerElement));
    }
    (effectSelectionOverlayElement.append(effectBoundsElement),
      effectBoundsHostElement.parentElement.append(effectSelectionOverlayElement),
      this.componentSelectionOverlays.set(effectBoundsComponent.id, effectSelectionOverlayElement),
      this.updateTransformHandleScale(
        effectBoundsHostElement,
        effectBoundsComponent,
        effectBoundsElement,
      ));
  }
  ["syncComponentSelectionOverlay"](overlayComponentId) {
    const syncedOverlayElement = this.componentSelectionOverlays.get(overlayComponentId),
      syncedHostElement = this.componentHosts.get(overlayComponentId);
    !syncedOverlayElement ||
      !syncedHostElement ||
      syncedOverlayElement.classList.contains("hb-airflow-selection-overlay") ||
      syncedOverlayElement.classList.contains("hb-effect-selection-overlay") ||
      Object.assign(syncedOverlayElement.style, {
        left: syncedHostElement.style.left,
        top: syncedHostElement.style.top,
        width: syncedHostElement.style.width,
        height: syncedHostElement.style.height,
        transform: syncedHostElement.style.transform,
      });
  }
  ["appendTransformHandles"](
    handleHostElement,
    handleComponentRecord,
    shouldAddResizeHandle = true,
    handleTargetElement = handleHostElement,
  ) {
    if (!handleHostElement || !handleComponentRecord) return;
    const transformSelectionBoundsElement = document.createElement("div");
    transformSelectionBoundsElement.className = "hb-selection-bounds";
    for (const boundsCornerName of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const boundsCornerMarkerElement = document.createElement("i");
      ((boundsCornerMarkerElement.className = "hb-corner-marker hb-corner-" + boundsCornerName),
        boundsCornerMarkerElement.setAttribute("aria-hidden", "true"),
        transformSelectionBoundsElement.append(boundsCornerMarkerElement));
    }
    if (shouldAddResizeHandle && handleComponentRecord.properties?.layoutMode !== "fill") {
      const resizeHandleElement = document.createElement("button");
      ((resizeHandleElement.type = "button"),
        (resizeHandleElement.className = "hb-transform-handle hb-resize-handle"),
        (resizeHandleElement.title = "拖动缩放"),
        resizeHandleElement.addEventListener("pointerdown", (resizeHandleEvent) =>
          this.startComponentScale(
            resizeHandleEvent,
            handleComponentRecord,
            handleHostElement,
            transformSelectionBoundsElement,
          ),
        ));
      const rotateHandleElement = document.createElement("button");
      ((rotateHandleElement.type = "button"),
        (rotateHandleElement.className = "hb-transform-handle hb-rotate-handle"),
        (rotateHandleElement.title = "拖动旋转"),
        rotateHandleElement.addEventListener("pointerdown", (rotateHandleEvent) =>
          this.startComponentRotate(
            rotateHandleEvent,
            handleComponentRecord,
            handleHostElement,
            transformSelectionBoundsElement,
          ),
        ),
        transformSelectionBoundsElement.append(resizeHandleElement, rotateHandleElement));
    }
    (handleTargetElement.append(transformSelectionBoundsElement),
      handleComponentRecord.type === "light-statistics" &&
        handleTargetElement.classList?.contains("hb-light-statistics-selection-overlay") &&
        transformSelectionBoundsElement.addEventListener("pointerdown", (boundsPointerEvent) =>
          this.startComponentMove(
            boundsPointerEvent,
            handleComponentRecord,
            handleHostElement,
            transformSelectionBoundsElement,
          ),
        ),
      this.updateImageSelectionBounds(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ),
      this.updateTextSelectionBounds(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ),
      this.updateTitleButtonSelectionBounds(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ),
      this.updateDeviceButtonSelectionBounds(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ));
    const lightStatisticsSelectionBounds2 = this.updateLightStatisticsSelectionBounds(
      handleHostElement,
      handleComponentRecord,
      transformSelectionBoundsElement,
    );
    (handleComponentRecord.type === "light-statistics" &&
      !lightStatisticsSelectionBounds2 &&
      Object.assign(transformSelectionBoundsElement.style, {
        left: "0",
        top: "0",
        width: "100%",
        height: "100%",
      }),
      this.updateAirConditionerButtonSelectionBounds(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ),
      this.updateTransformHandleScale(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ));
  }
  ["withSelectionMeasurementHost"](measurementRootElement, measurementTask) {
    const hiddenElements = [];
    let walkedElement = measurementRootElement;
    for (; walkedElement && walkedElement !== this.canvas;)
      (walkedElement.hidden && (hiddenElements.push(walkedElement), (walkedElement.hidden = false)),
        (walkedElement = walkedElement.parentElement));
    try {
      return measurementTask();
    } finally {
      for (const hiddenElement of hiddenElements) hiddenElement.hidden = true;
    }
  }
  ["selectionElementIsVisible"](measuredElement) {
    if (!measuredElement || measuredElement.hidden) return false;
    const computedStyle = window.getComputedStyle?.(measuredElement);
    return computedStyle?.display === "none" || computedStyle?.visibility === "hidden"
      ? false
      : Number(
          measuredElement.offsetWidth || measuredElement.getBoundingClientRect?.().width || 0,
        ) > 0 &&
          Number(
            measuredElement.offsetHeight || measuredElement.getBoundingClientRect?.().height || 0,
          ) > 0;
  }
  ["selectionElementBox"](boxElement, boxStopElement) {
    let boxOffsetX = 0,
      boxOffsetY = 0,
      walkedBoxElement = boxElement;
    const visitedElementSet = new Set();
    for (
      ;
      walkedBoxElement &&
      walkedBoxElement !== boxStopElement &&
      !visitedElementSet.has(walkedBoxElement);
    )
      (visitedElementSet.add(walkedBoxElement),
        (boxOffsetX += Number(walkedBoxElement.offsetLeft || 0)),
        (boxOffsetY += Number(walkedBoxElement.offsetTop || 0)),
        (walkedBoxElement = walkedBoxElement.offsetParent || walkedBoxElement.parentElement));
    const elementRect = boxElement.getBoundingClientRect?.(),
      elementWidth = Number(boxElement.offsetWidth || elementRect?.width || 0),
      elementHeight = Number(boxElement.offsetHeight || elementRect?.height || 0);
    return {
      left: boxOffsetX,
      top: boxOffsetY,
      width: elementWidth,
      height: elementHeight,
    };
  }
  ["applyDoorWindowPerspective"](
    doorWindowHostElement,
    doorWindowComponentRecord,
    perspectiveCornersArray,
  ) {
    const doorWindowVisualElement = doorWindowHostElement?.querySelector(".hb-door-window-visual");
    if (!doorWindowVisualElement || !doorWindowComponentRecord) return;
    const doorWindowComponentScale = Math.max(
        0.01,
        Number(this.document?.canvas?.componentScale || 1),
      ),
      doorWindowWidthScale = Math.max(
        1,
        Number(doorWindowComponentRecord.position?.width || 100) / doorWindowComponentScale,
      ),
      doorWindowHeightScale = Math.max(
        1,
        Number(doorWindowComponentRecord.position?.height || 100) / doorWindowComponentScale,
      );
    doorWindowVisualElement.style.transform = doorWindowPerspectiveMatrix2(
      doorWindowWidthScale,
      doorWindowHeightScale,
      perspectiveCornersArray,
    );
  }
  ["updateDoorWindowPerspectiveHandles"](perspectiveBoundsElement, perspectiveCornerValues) {
    if (!perspectiveBoundsElement) return;
    const cornerCoordinates = doorWindowPerspectiveCorners2(perspectiveCornerValues);
    (perspectiveBoundsElement
      .querySelector(".hb-door-window-perspective-guide polygon")
      ?.setAttribute(
        "points",
        [0, 1, 2, 3]
          .map(
            (cornerIndex) =>
              cornerCoordinates[cornerIndex * 2] + "," + cornerCoordinates[cornerIndex * 2 + 1],
          )
          .join(" "),
      ),
      perspectiveBoundsElement
        .querySelectorAll(".hb-door-window-perspective-handle")
        .forEach((perspectiveHandleElement) => {
          const handleCornerIndex = Number(
            perspectiveHandleElement.dataset.perspectiveCornerIndex || 0,
          );
          ((perspectiveHandleElement.style.left =
            cornerCoordinates[handleCornerIndex * 2] * 100 + "%"),
            (perspectiveHandleElement.style.top =
              cornerCoordinates[handleCornerIndex * 2 + 1] * 100 + "%"));
        }));
  }
  ["appendDoorWindowPerspectiveHandles"](
    doorWindowHandleHost,
    doorWindowHandleComponent,
    doorWindowHandleTargetElement = doorWindowHandleHost,
  ) {
    if (
      !doorWindowHandleHost ||
      !doorWindowHandleComponent ||
      doorWindowHandleComponent.properties?.sensorKind !== "door-window"
    )
      return;
    const doorWindowCorners = doorWindowPerspectiveCorners2(
        doorWindowHandleComponent.properties?.perspectiveCorners,
      ),
      doorWindowPerspectiveBoundsElement = document.createElement("div");
    doorWindowPerspectiveBoundsElement.className =
      "hb-selection-bounds hb-door-window-perspective-bounds";
    const elementNS = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    (elementNS.classList.add("hb-door-window-perspective-guide"),
      elementNS.setAttribute("viewBox", "0 0 1 1"),
      elementNS.setAttribute("preserveAspectRatio", "none"),
      elementNS.append(document.createElementNS("http://www.w3.org/2000/svg", "polygon")),
      doorWindowPerspectiveBoundsElement.append(elementNS));
    const cornerLabels = ["左上角", "右上角", "右下角", "左下角"];
    for (let cornerOffsetIndex = 0; cornerOffsetIndex < 4; cornerOffsetIndex += 1) {
      const perspectiveCornerHandleElement = document.createElement("button");
      ((perspectiveCornerHandleElement.type = "button"),
        (perspectiveCornerHandleElement.className = "hb-door-window-perspective-handle"),
        (perspectiveCornerHandleElement.dataset.perspectiveCornerIndex = String(cornerOffsetIndex)),
        (perspectiveCornerHandleElement.title =
          "拖动" + cornerLabels[cornerOffsetIndex] + "调整透视"),
        perspectiveCornerHandleElement.setAttribute(
          "aria-label",
          perspectiveCornerHandleElement.title,
        ),
        perspectiveCornerHandleElement.addEventListener("pointerdown", (cornerHandleEvent) =>
          this.startDoorWindowPerspective(
            cornerHandleEvent,
            doorWindowHandleComponent,
            doorWindowHandleHost,
            doorWindowPerspectiveBoundsElement,
            cornerOffsetIndex,
          ),
        ),
        doorWindowPerspectiveBoundsElement.append(perspectiveCornerHandleElement));
    }
    (doorWindowHandleTargetElement.append(doorWindowPerspectiveBoundsElement),
      this.updateDoorWindowPerspectiveHandles(
        doorWindowPerspectiveBoundsElement,
        doorWindowCorners,
      ),
      this.updateTransformHandleScale(
        doorWindowHandleHost,
        doorWindowHandleComponent,
        doorWindowPerspectiveBoundsElement,
      ));
  }
  ["startDoorWindowPerspective"](
    perspectivePointerEvent,
    perspectiveComponentRecord,
    perspectiveLayerElement,
    perspectiveHandleBoundsElement,
    perspectiveCornerIndex,
  ) {
    if (perspectivePointerEvent.button !== 0) return;
    (perspectivePointerEvent.preventDefault(), perspectivePointerEvent.stopPropagation());
    const pointerId4 = perspectivePointerEvent.pointerId,
      clientX2 = perspectivePointerEvent.clientX,
      clientY2 = perspectivePointerEvent.clientY,
      initialCorners = doorWindowPerspectiveCorners2(
        perspectiveComponentRecord.properties?.perspectiveCorners,
      ),
      cornerX = initialCorners[perspectiveCornerIndex * 2],
      cornerY = initialCorners[perspectiveCornerIndex * 2 + 1],
      doorWindowWidth = Math.max(1, Number(perspectiveComponentRecord.position?.width || 100)),
      doorWindowHeight = Math.max(1, Number(perspectiveComponentRecord.position?.height || 100)),
      componentWorldTransform2 = this.componentWorldTransform(perspectiveComponentRecord.id),
      scale2 = componentWorldTransform2.scale,
      rotationRad = (componentWorldTransform2.rotation * Math.PI) / 180,
      cos2 = Math.cos(rotationRad),
      sin2 = Math.sin(rotationRad);
    let nextCorners = initialCorners,
      hasPerspectiveChanged = false;
    const perspectiveMoveHandler = (perspectiveMoveEvent) => {
        if (perspectiveMoveEvent.pointerId !== pointerId4) return;
        const moveDeltaX =
            (perspectiveMoveEvent.clientX - clientX2) / Math.max(0.001, this.appliedScaleX || 1),
          moveDeltaY =
            (perspectiveMoveEvent.clientY - clientY2) / Math.max(0.001, this.appliedScaleY || 1),
          localDeltaX = (cos2 * moveDeltaX + sin2 * moveDeltaY) / scale2,
          localDeltaY = (-sin2 * moveDeltaX + cos2 * moveDeltaY) / scale2,
          slice = initialCorners.slice();
        ((slice[perspectiveCornerIndex * 2] = cornerX + localDeltaX / doorWindowWidth),
          (slice[perspectiveCornerIndex * 2 + 1] = cornerY + localDeltaY / doorWindowHeight),
          (nextCorners = doorWindowPerspectiveCorners2(slice)),
          (perspectiveComponentRecord.properties = {
            ...(perspectiveComponentRecord.properties || {}),
            perspectiveCorners: nextCorners,
          }),
          this.applyDoorWindowPerspective(
            perspectiveLayerElement,
            perspectiveComponentRecord,
            nextCorners,
          ),
          this.updateDoorWindowPerspectiveHandles(perspectiveHandleBoundsElement, nextCorners),
          this.options.onComponentPropertiesPreview?.(perspectiveComponentRecord.id, {
            perspectiveCorners: nextCorners,
          }));
      },
      perspectiveEndHandler = (perspectiveEndEvent = null) => {
        hasPerspectiveChanged ||
          (perspectiveEndEvent?.pointerId != null &&
            perspectiveEndEvent.pointerId !== pointerId4) ||
          ((hasPerspectiveChanged = true),
          window.removeEventListener("pointermove", perspectiveMoveHandler, true),
          window.removeEventListener("pointerup", perspectiveEndHandler, true),
          window.removeEventListener("pointercancel", perspectiveEndHandler, true),
          window.removeEventListener("blur", perspectiveEndHandler),
          JSON.stringify(nextCorners) !== JSON.stringify(initialCorners) &&
            this.options.onComponentProperties?.(perspectiveComponentRecord.id, {
              perspectiveCorners: nextCorners,
            }));
      };
    (window.addEventListener("pointermove", perspectiveMoveHandler, true),
      window.addEventListener("pointerup", perspectiveEndHandler, true),
      window.addEventListener("pointercancel", perspectiveEndHandler, true),
      window.addEventListener("blur", perspectiveEndHandler));
  }
  ["appendAirflowTransformHandles"](airflowHandleLayerElement, airflowHandleComponent) {
    if (!airflowHandleLayerElement || !airflowHandleComponent) return;
    const airflowSelectionOverlay = this.createAirflowSelectionOverlay(
      airflowHandleLayerElement,
      airflowHandleComponent,
    );
    if (!airflowSelectionOverlay) return;
    const airflowBoundsElement = document.createElement("div");
    airflowBoundsElement.className = "hb-selection-bounds hb-airflow-selection-bounds";
    for (const airflowCornerName of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const airflowCornerElement = document.createElement("i");
      ((airflowCornerElement.className = "hb-corner-marker hb-corner-" + airflowCornerName),
        airflowCornerElement.setAttribute("aria-hidden", "true"),
        airflowBoundsElement.append(airflowCornerElement));
    }
    const airflowResizeHandleElement = document.createElement("button");
    ((airflowResizeHandleElement.type = "button"),
      (airflowResizeHandleElement.className = "hb-transform-handle hb-resize-handle"),
      (airflowResizeHandleElement.title = "拖动缩放出风效果"),
      airflowResizeHandleElement.addEventListener("pointerdown", (airflowResizeEvent) =>
        this.startAirflowScale(
          airflowResizeEvent,
          airflowHandleComponent,
          airflowHandleLayerElement,
          airflowBoundsElement,
          airflowSelectionOverlay,
        ),
      ));
    const airflowRotateHandleElement = document.createElement("button");
    ((airflowRotateHandleElement.type = "button"),
      (airflowRotateHandleElement.className = "hb-transform-handle hb-rotate-handle"),
      (airflowRotateHandleElement.title = "拖动旋转出风效果"),
      airflowRotateHandleElement.addEventListener("pointerdown", (airflowRotateEvent) =>
        this.startAirflowRotate(
          airflowRotateEvent,
          airflowHandleComponent,
          airflowHandleLayerElement,
          airflowBoundsElement,
          airflowSelectionOverlay,
        ),
      ),
      airflowBoundsElement.append(airflowResizeHandleElement, airflowRotateHandleElement),
      airflowBoundsElement.addEventListener("pointerdown", (airflowBoundsEvent) =>
        this.startAirflowMove(
          airflowBoundsEvent,
          airflowHandleComponent,
          airflowHandleLayerElement,
          airflowBoundsElement,
          airflowSelectionOverlay,
        ),
      ),
      airflowSelectionOverlay.append(airflowBoundsElement),
      this.updateAirflowHandleScale(airflowHandleComponent, airflowBoundsElement));
  }
  ["startAirflowMove"](
    airflowMovePointerEvent,
    airflowMoveComponent,
    airflowMoveLayerElement,
    airflowMoveCaptureElement,
    airflowMoveOverlayElement,
  ) {
    if (
      airflowMovePointerEvent.button !== 0 ||
      airflowMovePointerEvent.target.closest(".hb-transform-handle")
    )
      return;
    (airflowMovePointerEvent.preventDefault(), airflowMovePointerEvent.stopPropagation());
    const clientX3 = airflowMovePointerEvent.clientX,
      clientY3 = airflowMovePointerEvent.clientY,
      airflowLayerWidth = Math.max(1, Number(airflowMoveComponent.position?.width || 100)),
      airflowLayerHeight = Math.max(1, Number(airflowMoveComponent.position?.height || 100)),
      airflowStartOffsetX = Number(airflowMoveComponent.properties?.airflowOffsetX ?? -75),
      airflowStartOffsetY = Number(airflowMoveComponent.properties?.airflowOffsetY ?? 34),
      airflowOffsetBounds = airflowCanvasOffsetBounds2(airflowMoveComponent, this.document?.canvas);
    let airflowNextOffsetX = airflowStartOffsetX,
      airflowNextOffsetY = airflowStartOffsetY,
      airflowMoveDirection = "",
      hasAirflowMoved = false;
    const pointerId5 = airflowMovePointerEvent.pointerId;
    airflowMoveCaptureElement.setPointerCapture(pointerId5);
    const airflowMoveHandler = (airflowMovePointer) => {
        if (airflowMovePointer.pointerId !== pointerId5) return;
        if (
          !airflowMoveCaptureElement.hasPointerCapture?.(pointerId5) &&
          airflowMoveCaptureElement.isConnected
        )
          try {
            airflowMoveCaptureElement.setPointerCapture(pointerId5);
          } catch {}
        let airflowDeltaX = airflowMovePointer.clientX - clientX3,
          airflowDeltaY = airflowMovePointer.clientY - clientY3;
        airflowMovePointer.shiftKey
          ? (!airflowMoveDirection &&
              Math.hypot(airflowDeltaX, airflowDeltaY) >= 1 &&
              (airflowMoveDirection =
                Math.abs(airflowDeltaX) >= Math.abs(airflowDeltaY) ? "horizontal" : "vertical"),
            airflowMoveDirection === "horizontal" && (airflowDeltaY = 0),
            airflowMoveDirection === "vertical" && (airflowDeltaX = 0))
          : (airflowMoveDirection = "");
        const airflowLocalDeltaX = airflowDeltaX / Math.max(0.001, this.appliedScaleX || 1),
          airflowLocalDeltaY = airflowDeltaY / Math.max(0.001, this.appliedScaleY || 1),
          airflowLocalDelta = groupedComponentLocalDelta2(
            airflowLocalDeltaX,
            airflowLocalDeltaY,
            this.componentParentTransform(airflowMoveComponent.id),
          );
        ((airflowNextOffsetX = Math.max(
          airflowOffsetBounds.minX,
          Math.min(
            airflowOffsetBounds.maxX,
            airflowStartOffsetX + (airflowLocalDelta.x / airflowLayerWidth) * 100,
          ),
        )),
          (airflowNextOffsetY = Math.max(
            airflowOffsetBounds.minY,
            Math.min(
              airflowOffsetBounds.maxY,
              airflowStartOffsetY + (airflowLocalDelta.y / airflowLayerHeight) * 100,
            ),
          )),
          (airflowMoveComponent.properties = {
            ...(airflowMoveComponent.properties || {}),
            airflowOffsetX: airflowNextOffsetX,
            airflowOffsetY: airflowNextOffsetY,
          }),
          this.syncAirflowLayerGeometry(
            airflowMoveLayerElement,
            airflowMoveComponent,
            airflowMoveOverlayElement,
          ),
          this.options.onComponentPropertiesPreview?.(airflowMoveComponent.id, {
            airflowOffsetX: airflowNextOffsetX,
            airflowOffsetY: airflowNextOffsetY,
          }));
      },
      airflowEndHandler = (airflowEndEvent = null) => {
        hasAirflowMoved ||
          (airflowEndEvent?.pointerId != null && airflowEndEvent.pointerId !== pointerId5) ||
          ((hasAirflowMoved = true),
          window.removeEventListener("pointermove", airflowMoveHandler, true),
          window.removeEventListener("pointerup", airflowEndHandler, true),
          window.removeEventListener("pointercancel", airflowEndHandler, true),
          window.removeEventListener("blur", airflowEndHandler),
          (airflowNextOffsetX !== airflowStartOffsetX ||
            airflowNextOffsetY !== airflowStartOffsetY) &&
            this.options.onComponentProperties?.(airflowMoveComponent.id, {
              airflowOffsetX: airflowNextOffsetX,
              airflowOffsetY: airflowNextOffsetY,
            }));
      };
    (window.addEventListener("pointermove", airflowMoveHandler, true),
      window.addEventListener("pointerup", airflowEndHandler, true),
      window.addEventListener("pointercancel", airflowEndHandler, true),
      window.addEventListener("blur", airflowEndHandler));
  }
  ["updateAirflowHandleScale"](airflowScaleComponent, airflowScaleLayerElement) {
    if (!airflowScaleComponent || !airflowScaleLayerElement) return;
    const airflowAppliedMinScale = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1),
      airflowScaleValue = Math.max(
        0.01,
        Math.min(5, Number(airflowScaleComponent.properties?.airflowScale || 1)),
      ),
      scale3 = this.componentParentTransform(airflowScaleComponent.id).scale,
      airflowUiScale = 1 / Math.max(0.001, airflowAppliedMinScale * airflowScaleValue * scale3);
    (airflowScaleLayerElement.style.setProperty("--hb-ui-scale", String(airflowUiScale)),
      airflowScaleLayerElement.style.setProperty("--hb-handle-outset", 30 * airflowUiScale + "px"));
    const airflowHandleRect = airflowScaleLayerElement.getBoundingClientRect();
    airflowScaleLayerElement.classList.toggle(
      "handles-outside",
      airflowHandleRect.width < 132 || airflowHandleRect.height < 112,
    );
  }
  ["startAirflowScale"](
    airflowScalePointerEvent,
    airflowScaleComponentRecord,
    airflowScaleLayerTarget,
    airflowScaleHandleElement,
    airflowScaleOverlayElement,
  ) {
    (airflowScalePointerEvent.preventDefault(), airflowScalePointerEvent.stopPropagation());
    const airflowHandleBounds = airflowScaleHandleElement.getBoundingClientRect(),
      airflowCenterX = airflowHandleBounds.left + airflowHandleBounds.width / 2,
      airflowCenterY = airflowHandleBounds.top + airflowHandleBounds.height / 2,
      airflowInitialDistance = Math.max(
        1,
        Math.hypot(
          airflowScalePointerEvent.clientX - airflowCenterX,
          airflowScalePointerEvent.clientY - airflowCenterY,
        ),
      ),
      airflowStartScale = Math.max(
        0.01,
        Math.min(5, Number(airflowScaleComponentRecord.properties?.airflowScale || 1)),
      );
    let airflowNextScale = airflowStartScale,
      hasAirflowScaled = false;
    const currentTarget = airflowScalePointerEvent.currentTarget;
    currentTarget.setPointerCapture(airflowScalePointerEvent.pointerId);
    const airflowScaleCommit = () => {
        (this.syncAirflowLayerGeometry(
          airflowScaleLayerTarget,
          airflowScaleComponentRecord,
          airflowScaleOverlayElement,
        ),
          this.updateAirflowHandleScale(airflowScaleComponentRecord, airflowScaleHandleElement));
      },
      airflowScaleMoveHandler = (airflowScaleMoveEvent) => {
        const hypot2 = Math.hypot(
          airflowScaleMoveEvent.clientX - airflowCenterX,
          airflowScaleMoveEvent.clientY - airflowCenterY,
        );
        ((airflowNextScale = Math.max(
          0.01,
          Math.min(5, (airflowStartScale * hypot2) / airflowInitialDistance),
        )),
          (airflowScaleComponentRecord.properties = {
            ...(airflowScaleComponentRecord.properties || {}),
            airflowScale: airflowNextScale,
          }),
          airflowScaleCommit(),
          this.options.onComponentPropertiesPreview?.(airflowScaleComponentRecord.id, {
            airflowScale: airflowNextScale,
          }));
      },
      airflowScaleEndHandler = () => {
        hasAirflowScaled ||
          ((hasAirflowScaled = true),
          currentTarget.removeEventListener("pointermove", airflowScaleMoveHandler),
          currentTarget.removeEventListener("pointerup", airflowScaleEndHandler),
          currentTarget.removeEventListener("pointercancel", airflowScaleEndHandler),
          currentTarget.removeEventListener("lostpointercapture", airflowScaleEndHandler),
          airflowNextScale !== airflowStartScale &&
            this.options.onComponentProperties?.(airflowScaleComponentRecord.id, {
              airflowScale: airflowNextScale,
            }));
      };
    (currentTarget.addEventListener("pointermove", airflowScaleMoveHandler),
      currentTarget.addEventListener("pointerup", airflowScaleEndHandler),
      currentTarget.addEventListener("pointercancel", airflowScaleEndHandler),
      currentTarget.addEventListener("lostpointercapture", airflowScaleEndHandler));
  }
  ["startAirflowRotate"](
    airflowRotatePointerEvent,
    airflowRotateComponent,
    airflowRotateLayerElement,
    airflowRotateTargetElement,
    airflowRotateOverlayElement,
  ) {
    (airflowRotatePointerEvent.preventDefault(), airflowRotatePointerEvent.stopPropagation());
    const airflowRotateRect = airflowRotateTargetElement.getBoundingClientRect(),
      airflowRotateCenterX = airflowRotateRect.left + airflowRotateRect.width / 2,
      airflowRotateCenterY = airflowRotateRect.top + airflowRotateRect.height / 2,
      startRotateAngle = Math.atan2(
        airflowRotatePointerEvent.clientY - airflowRotateCenterY,
        airflowRotatePointerEvent.clientX - airflowRotateCenterX,
      ),
      airflowStartRotation = Number(airflowRotateComponent.properties?.airflowRotation || 0);
    let airflowNextRotation = airflowStartRotation,
      hasAirflowRotated = false;
    const currentTarget2 = airflowRotatePointerEvent.currentTarget;
    currentTarget2.setPointerCapture(airflowRotatePointerEvent.pointerId);
    const airflowRotateMoveHandler = (airflowRotateMoveEvent) => {
        const currentRotateAngle = Math.atan2(
          airflowRotateMoveEvent.clientY - airflowRotateCenterY,
          airflowRotateMoveEvent.clientX - airflowRotateCenterX,
        );
        ((airflowNextRotation =
          airflowStartRotation + ((currentRotateAngle - startRotateAngle) * 180) / Math.PI),
          (airflowRotateComponent.properties = {
            ...(airflowRotateComponent.properties || {}),
            airflowRotation: airflowNextRotation,
          }),
          this.syncAirflowLayerGeometry(
            airflowRotateLayerElement,
            airflowRotateComponent,
            airflowRotateOverlayElement,
          ),
          this.options.onComponentPropertiesPreview?.(airflowRotateComponent.id, {
            airflowRotation: airflowNextRotation,
          }));
      },
      airflowRotateEndHandler = () => {
        hasAirflowRotated ||
          ((hasAirflowRotated = true),
          currentTarget2.removeEventListener("pointermove", airflowRotateMoveHandler),
          currentTarget2.removeEventListener("pointerup", airflowRotateEndHandler),
          currentTarget2.removeEventListener("pointercancel", airflowRotateEndHandler),
          currentTarget2.removeEventListener("lostpointercapture", airflowRotateEndHandler),
          airflowNextRotation !== airflowStartRotation &&
            this.options.onComponentProperties?.(airflowRotateComponent.id, {
              airflowRotation: airflowNextRotation,
            }));
      };
    (currentTarget2.addEventListener("pointermove", airflowRotateMoveHandler),
      currentTarget2.addEventListener("pointerup", airflowRotateEndHandler),
      currentTarget2.addEventListener("pointercancel", airflowRotateEndHandler),
      currentTarget2.addEventListener("lostpointercapture", airflowRotateEndHandler));
  }
  ["updateAirConditionerButtonSelectionBounds"](
    acBoundsHostElement,
    acBoundsComponent,
    acBoundsElement,
  ) {
    if (!acBoundsHostElement || acBoundsComponent?.type !== "air-conditioner" || !acBoundsElement)
      return;
    const acProperties = acBoundsComponent.properties || {},
      acWidth = Math.max(1, Number(acBoundsComponent.position?.width || 100)),
      acHeight = Math.max(1, Number(acBoundsComponent.position?.height || 100)),
      acComponentScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
      acBoundsEntries = [],
      clampOptionValue = (optionRawValue, optionMinValue, optionMaxValue, optionFallbackValue) => {
        const optionNumericValue = Number(optionRawValue);
        return Math.max(
          optionMinValue,
          Math.min(
            optionMaxValue,
            Number.isFinite(optionNumericValue) ? optionNumericValue : optionFallbackValue,
          ),
        );
      },
      pushBoundsRect = (rectCenterX, rectCenterY, rectWidth, rectHeight) => {
        acBoundsEntries.push({
          left: rectCenterX - rectWidth / 2,
          top: rectCenterY - rectHeight / 2,
          right: rectCenterX + rectWidth / 2,
          bottom: rectCenterY + rectHeight / 2,
        });
      },
      measureIconBounds = (iconElement, iconLeftOption, iconTopOption, iconMinSize) => {
        const iconWidth = Math.max(
            iconMinSize,
            Number(iconElement?.offsetWidth || 0) * acComponentScale,
          ),
          iconHeight = Math.max(
            iconMinSize,
            Number(iconElement?.offsetHeight || 0) * acComponentScale,
          ),
          iconLeft = (acWidth * clampOptionValue(iconLeftOption, -100, 200, 0)) / 100,
          iconTop = (acHeight * clampOptionValue(iconTopOption, -100, 200, 50)) / 100;
        acBoundsEntries.push({
          left: iconLeft,
          top: iconTop - iconHeight / 2,
          right: iconLeft + iconWidth,
          bottom: iconTop + iconHeight / 2,
        });
      },
      badgeSize = (acHeight * clampOptionValue(acProperties.badgeSize, 1, 100, 28)) / 100;
    if (
      (acProperties.iconVisible !== false &&
        pushBoundsRect(
          (acWidth * clampOptionValue(acProperties.iconLeft, -100, 200, 20)) / 100,
          (acHeight * clampOptionValue(acProperties.iconTop, -100, 200, 50)) / 100,
          badgeSize,
          badgeSize,
        ),
      acProperties.mainTextVisible !== false &&
        measureIconBounds(
          acBoundsHostElement.querySelector(
            ":scope > .hb-air-conditioner .hb-air-conditioner-text strong",
          ),
          acProperties.mainTextLeft,
          acProperties.mainTextTop,
          (acHeight * clampOptionValue(acProperties.mainSize, 6, 120, 21)) / 100,
        ),
      acProperties.secondaryTextVisible !== false &&
        measureIconBounds(
          acBoundsHostElement.querySelector(
            ":scope > .hb-air-conditioner .hb-air-conditioner-text small",
          ),
          acProperties.secondaryTextLeft,
          acProperties.secondaryTextTop,
          (acHeight * clampOptionValue(acProperties.secondarySize, 5, 80, 12)) / 100,
        ),
      !acBoundsEntries.length)
    ) {
      Object.assign(acBoundsElement.style, {
        left: "0px",
        top: "0px",
        width: acWidth + "px",
        height: acHeight + "px",
      });
      return;
    }
    const acBoundsPadding = 4,
      acBoundsLeft = Math.min(...acBoundsEntries.map((acEntry) => acEntry.left)) - acBoundsPadding,
      acBoundsTop =
        Math.min(...acBoundsEntries.map((acEntryTop) => acEntryTop.top)) - acBoundsPadding,
      acBoundsRight =
        Math.max(...acBoundsEntries.map((acBoundsEntryRight) => acBoundsEntryRight.right)) +
        acBoundsPadding,
      acBoundsBottom =
        Math.max(...acBoundsEntries.map((acBoundsEntryBottom) => acBoundsEntryBottom.bottom)) +
        acBoundsPadding;
    Object.assign(acBoundsElement.style, {
      left: acBoundsLeft + "px",
      top: acBoundsTop + "px",
      width: Math.max(1, acBoundsRight - acBoundsLeft) + "px",
      height: Math.max(1, acBoundsBottom - acBoundsTop) + "px",
    });
  }
  ["updateDeviceButtonSelectionBounds"](
    deviceBoundsHostElement,
    deviceBoundsComponent,
    deviceBoundsElement,
  ) {
    if (
      !deviceBoundsHostElement ||
      deviceBoundsComponent?.type !== "device-button" ||
      !deviceBoundsElement
    )
      return false;
    const deviceProperties = deviceBoundsComponent.properties || {},
      isHiddenContentClickable = deviceProperties.hiddenContentClickable === true,
      deviceWidth = Math.max(1, Number(deviceBoundsComponent.position?.width || 100)),
      deviceHeight = Math.max(1, Number(deviceBoundsComponent.position?.height || 100)),
      deviceComponentScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
      deviceBoundsEntries = [],
      clampDeviceValue = (
        deviceOptionRaw,
        deviceOptionMin,
        deviceOptionMax,
        deviceOptionFallback,
      ) => {
        const deviceOptionNumber = Number(deviceOptionRaw);
        return Math.max(
          deviceOptionMin,
          Math.min(
            deviceOptionMax,
            Number.isFinite(deviceOptionNumber) ? deviceOptionNumber : deviceOptionFallback,
          ),
        );
      },
      pushDeviceBoundsRect = (
        deviceRectCenterX,
        deviceRectCenterY,
        deviceRectWidth,
        deviceRectHeight,
      ) => {
        ![deviceRectCenterX, deviceRectCenterY, deviceRectWidth, deviceRectHeight].every(
          Number.isFinite,
        ) ||
          deviceRectWidth <= 0 ||
          deviceRectHeight <= 0 ||
          deviceBoundsEntries.push({
            left: deviceRectCenterX - deviceRectWidth / 2,
            top: deviceRectCenterY - deviceRectHeight / 2,
            right: deviceRectCenterX + deviceRectWidth / 2,
            bottom: deviceRectCenterY + deviceRectHeight / 2,
          });
      },
      measureDeviceIconBounds = (
        deviceIconElement,
        deviceIconLeftOption,
        deviceIconTopOption,
        deviceIconMinSize,
      ) => {
        const deviceIconWidth = Math.max(
            deviceIconMinSize,
            Number(deviceIconElement?.offsetWidth || 0) * deviceComponentScale,
          ),
          deviceIconHeight = Math.max(
            deviceIconMinSize,
            Number(deviceIconElement?.offsetHeight || 0) * deviceComponentScale,
          ),
          deviceIconLeft =
            (deviceWidth * clampDeviceValue(deviceIconLeftOption, -100, 200, 0)) / 100,
          deviceIconTop =
            (deviceHeight * clampDeviceValue(deviceIconTopOption, -100, 200, 50)) / 100;
        deviceBoundsEntries.push({
          left: deviceIconLeft,
          top: deviceIconTop - deviceIconHeight / 2,
          right: deviceIconLeft + deviceIconWidth,
          bottom: deviceIconTop + deviceIconHeight / 2,
        });
      },
      deviceBadgeSize =
        (deviceHeight *
          clampDeviceValue(deviceProperties.badgeSize ?? deviceProperties.iconSize, 1, 100, 28)) /
        100;
    if (
      ((deviceProperties.iconVisible !== false || isHiddenContentClickable) &&
        pushDeviceBoundsRect(
          (deviceWidth * clampDeviceValue(deviceProperties.iconLeft, -100, 200, 20)) / 100,
          (deviceHeight * clampDeviceValue(deviceProperties.iconTop, -100, 200, 50)) / 100,
          deviceBadgeSize,
          deviceBadgeSize,
        ),
      (deviceProperties.mainTextVisible !== false || isHiddenContentClickable) &&
        measureDeviceIconBounds(
          deviceBoundsHostElement.querySelector(
            ":scope > .hb-icon-button .hb-icon-button-text strong",
          ),
          deviceProperties.mainTextLeft,
          deviceProperties.mainTextTop,
          (deviceHeight * clampDeviceValue(deviceProperties.mainSize, 6, 120, 21)) / 100,
        ),
      (deviceProperties.secondaryTextVisible !== false || isHiddenContentClickable) &&
        measureDeviceIconBounds(
          deviceBoundsHostElement.querySelector(
            ":scope > .hb-icon-button .hb-icon-button-text small",
          ),
          deviceProperties.secondaryTextLeft,
          deviceProperties.secondaryTextTop,
          (deviceHeight * clampDeviceValue(deviceProperties.secondarySize, 5, 80, 12)) / 100,
        ),
      !deviceBoundsEntries.length)
    )
      return false;
    const deviceBoundsPadding = 4,
      deviceBoundsLeft =
        Math.min(...deviceBoundsEntries.map((deviceEntry) => deviceEntry.left)) -
        deviceBoundsPadding,
      deviceBoundsTop =
        Math.min(...deviceBoundsEntries.map((deviceEntryTop) => deviceEntryTop.top)) -
        deviceBoundsPadding,
      deviceBoundsRight =
        Math.max(
          ...deviceBoundsEntries.map((deviceBoundsEntryRight) => deviceBoundsEntryRight.right),
        ) + deviceBoundsPadding,
      deviceBoundsBottom =
        Math.max(
          ...deviceBoundsEntries.map((deviceBoundsEntryBottom) => deviceBoundsEntryBottom.bottom),
        ) + deviceBoundsPadding;
    return (
      Object.assign(deviceBoundsElement.style, {
        left: deviceBoundsLeft + "px",
        top: deviceBoundsTop + "px",
        width: Math.max(1, deviceBoundsRight - deviceBoundsLeft) + "px",
        height: Math.max(1, deviceBoundsBottom - deviceBoundsTop) + "px",
      }),
      true
    );
  }
  ["updateTitleButtonSelectionBounds"](
    titleBoundsHostElement,
    titleBoundsComponent,
    titleBoundsElement,
  ) {
    if (
      !titleBoundsHostElement ||
      titleBoundsComponent?.type !== "title-button" ||
      !titleBoundsElement
    )
      return false;
    const titleProperties = titleBoundsComponent.properties || {},
      isTitleHiddenContentClickable = titleProperties.hiddenContentClickable === true,
      titleWidth = Math.max(1, Number(titleBoundsComponent.position?.width || 100)),
      titleHeight = Math.max(1, Number(titleBoundsComponent.position?.height || 100)),
      titleComponentScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
      titleBoundsEntries = [],
      pushTitleBoundsRect = (
        titleRectCenterX,
        titleRectCenterY,
        titleRectWidth,
        titleRectHeight,
      ) => {
        ![titleRectCenterX, titleRectCenterY, titleRectWidth, titleRectHeight].every(
          Number.isFinite,
        ) ||
          titleRectWidth <= 0 ||
          titleRectHeight <= 0 ||
          titleBoundsEntries.push({
            left: titleRectCenterX,
            top: titleRectCenterY,
            right: titleRectCenterX + titleRectWidth,
            bottom: titleRectCenterY + titleRectHeight,
          });
      },
      clampTitleValue = (titleOptionRaw, titleOptionMin, titleOptionMax, titleOptionFallback) => {
        const titleOptionNumber = Number(titleOptionRaw);
        return Math.max(
          titleOptionMin,
          Math.min(
            titleOptionMax,
            Number.isFinite(titleOptionNumber) ? titleOptionNumber : titleOptionFallback,
          ),
        );
      };
    if (titleProperties.frameVisible !== false || isTitleHiddenContentClickable) {
      const frameSizeRatio = clampTitleValue(titleProperties.frameSize, 10, 300, 100) / 100,
        frameHeight = titleHeight * 0.45 * frameSizeRatio,
        frameCenterX =
          titleWidth / 2 +
          (titleWidth * clampTitleValue(titleProperties.frameOffsetX, -100, 100, 0)) / 100,
        frameCenterY =
          titleHeight / 2 +
          (titleHeight * clampTitleValue(titleProperties.frameOffsetY, -100, 100, 0)) / 100,
        frameHalfSpacing =
          (titleWidth * clampTitleValue(titleProperties.frameSpacing, 0, 300, 100)) / 200,
        frameBarWidth = titleHeight * 0.12,
        frameStrokeWidth = clampTitleValue(titleProperties.frameWidth, 0, 12, 1.5);
      (pushTitleBoundsRect(
        frameCenterX - frameHalfSpacing - frameStrokeWidth / 2,
        frameCenterY - frameHeight / 2 - frameStrokeWidth / 2,
        frameBarWidth + frameStrokeWidth,
        frameHeight + frameStrokeWidth,
      ),
        pushTitleBoundsRect(
          frameCenterX + frameHalfSpacing - frameBarWidth - frameStrokeWidth / 2,
          frameCenterY - frameHeight / 2 - frameStrokeWidth / 2,
          frameBarWidth + frameStrokeWidth,
          frameHeight + frameStrokeWidth,
        ));
    }
    if (titleProperties.mainTextVisible !== false || isTitleHiddenContentClickable) {
      const titleMainElement = titleBoundsHostElement.querySelector(
          ":scope > .hb-title-button .hb-title-button-main",
        ),
        mainTextSize = (titleHeight * clampTitleValue(titleProperties.mainSize, 8, 200, 34)) / 100;
      pushTitleBoundsRect(
        (titleWidth * clampTitleValue(titleProperties.mainTextLeft, -100, 200, 5.5)) / 100,
        (titleHeight * clampTitleValue(titleProperties.mainTextTop, -100, 200, 45)) / 100 -
          mainTextSize / 2,
        Math.max(mainTextSize, Number(titleMainElement?.offsetWidth || 0) * titleComponentScale),
        Math.max(mainTextSize, Number(titleMainElement?.offsetHeight || 0) * titleComponentScale),
      );
    }
    if (titleProperties.secondaryTextVisible !== false || isTitleHiddenContentClickable) {
      const titleSecondaryElement = titleBoundsHostElement.querySelector(
          ":scope > .hb-title-button .hb-title-button-secondary",
        ),
        secondaryTextSize =
          (titleHeight * clampTitleValue(titleProperties.secondarySize, 6, 100, 12)) / 100,
        secondaryTextHeight = Math.max(
          secondaryTextSize,
          Number(titleSecondaryElement?.offsetHeight || 0) * titleComponentScale,
        );
      pushTitleBoundsRect(
        (titleWidth * clampTitleValue(titleProperties.secondaryTextLeft, -100, 200, 54)) / 100,
        (titleHeight * clampTitleValue(titleProperties.secondaryTextTop, -100, 200, 43)) / 100 -
          secondaryTextHeight / 2,
        Math.max(
          secondaryTextSize,
          Number(titleSecondaryElement?.offsetWidth || 0) * titleComponentScale,
        ),
        secondaryTextHeight,
      );
    }
    if (
      (titleProperties.iconVisible !== false || isTitleHiddenContentClickable) &&
      titleProperties.icon
    ) {
      const titleIconSize =
        (titleHeight * clampTitleValue(titleProperties.iconSize, 1, 100, 30)) / 100;
      pushTitleBoundsRect(
        (titleWidth * clampTitleValue(titleProperties.iconLeft, -100, 200, 50)) / 100 -
          titleIconSize / 2,
        (titleHeight * clampTitleValue(titleProperties.iconTop, -100, 200, 45)) / 100 -
          titleIconSize / 2,
        titleIconSize,
        titleIconSize,
      );
    }
    if (titleProperties.markerVisible !== false || isTitleHiddenContentClickable) {
      const titleMarkerSize =
          (titleHeight * clampTitleValue(titleProperties.markerSize, 2, 60, 10)) / 100,
        titleMarkerLeft =
          (titleWidth * clampTitleValue(titleProperties.markerLeft, -100, 200, 1.8)) / 100,
        titleMarkerTop =
          (titleHeight * clampTitleValue(titleProperties.markerTop, -100, 200, 84)) / 100;
      pushTitleBoundsRect(
        titleMarkerLeft - titleMarkerSize * 0.58,
        titleMarkerTop,
        titleMarkerSize * 1.16,
        titleMarkerSize,
      );
    }
    if (!titleBoundsEntries.length) return false;
    const titleBoundsPadding = 4,
      titleBoundsLeft =
        Math.min(...titleBoundsEntries.map((titleEntry) => titleEntry.left)) - titleBoundsPadding,
      titleBoundsTop =
        Math.min(...titleBoundsEntries.map((titleEntryTop) => titleEntryTop.top)) -
        titleBoundsPadding,
      titleBoundsRight =
        Math.max(
          ...titleBoundsEntries.map((titleBoundsEntryRight) => titleBoundsEntryRight.right),
        ) + titleBoundsPadding,
      titleBoundsBottom =
        Math.max(
          ...titleBoundsEntries.map((titleBoundsEntryBottom) => titleBoundsEntryBottom.bottom),
        ) + titleBoundsPadding;
    return (
      Object.assign(titleBoundsElement.style, {
        left: titleBoundsLeft + "px",
        top: titleBoundsTop + "px",
        width: Math.max(1, titleBoundsRight - titleBoundsLeft) + "px",
        height: Math.max(1, titleBoundsBottom - titleBoundsTop) + "px",
      }),
      true
    );
  }
  ["updateLightStatisticsSelectionBounds"](
    statsBoundsHostElement,
    statsBoundsComponent,
    statsBoundsElement,
  ) {
    if (
      !statsBoundsHostElement ||
      statsBoundsComponent?.type !== "light-statistics" ||
      !statsBoundsElement ||
      statsBoundsHostElement.hidden
    )
      return false;
    const statsRootElement = statsBoundsHostElement.querySelector(":scope > .hb-light-statistics");
    if (!statsRootElement) return false;
    const visibleStatsRows = [...statsRootElement.children].filter((statsRowElement) =>
      statsRowElement.hidden ||
      Number(statsRowElement.offsetWidth || 0) <= 0 ||
      Number(statsRowElement.offsetHeight || 0) <= 0
        ? false
        : window.getComputedStyle?.(statsRowElement).display !== "none",
    );
    if (!visibleStatsRows.length) return false;
    const statsComponentScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
      statsBoundsPadding = 4,
      statsBoundsLeft =
        (Math.min(
          ...visibleStatsRows.map((statsRowLeftElement) => statsRowLeftElement.offsetLeft),
        ) -
          statsBoundsPadding) *
        statsComponentScale,
      statsBoundsTop =
        (Math.min(...visibleStatsRows.map((statsRowTopElement) => statsRowTopElement.offsetTop)) -
          statsBoundsPadding) *
        statsComponentScale,
      statsBoundsRight =
        (Math.max(
          ...visibleStatsRows.map(
            (statsRowRightElement) =>
              statsRowRightElement.offsetLeft + statsRowRightElement.offsetWidth,
          ),
        ) +
          statsBoundsPadding) *
        statsComponentScale,
      statsBoundsBottom =
        (Math.max(
          ...visibleStatsRows.map(
            (statsRowBottomElement) =>
              statsRowBottomElement.offsetTop + statsRowBottomElement.offsetHeight,
          ),
        ) +
          statsBoundsPadding) *
        statsComponentScale;
    return (
      Object.assign(statsBoundsElement.style, {
        left: statsBoundsLeft + "px",
        top: statsBoundsTop + "px",
        width: Math.max(1, statsBoundsRight - statsBoundsLeft) + "px",
        height: Math.max(1, statsBoundsBottom - statsBoundsTop) + "px",
      }),
      true
    );
  }
  ["updateTextSelectionBounds"](textBoundsHostElement, textBoundsComponent, textBoundsElement) {
    return !textBoundsHostElement ||
      !["time", "date", "weather"].includes(textBoundsComponent?.type) ||
      !textBoundsElement
      ? false
      : this.withSelectionMeasurementHost(textBoundsHostElement, () => {
          const textRootElement = textBoundsHostElement.querySelector(
            ":scope > .hb-time-component, :scope > .hb-date-component, :scope > .hb-weather-component",
          );
          if (!textRootElement) return false;
          const visibleTextLines = (
              textBoundsComponent.type === "time"
                ? [
                    ...textRootElement.querySelectorAll(
                      ":scope > .hb-time-value, :scope > .hb-time-period",
                    ),
                  ]
                : textBoundsComponent.type === "date"
                  ? [
                      ...textRootElement.querySelectorAll(
                        ":scope > .hb-date-primary, :scope > .hb-date-lunar",
                      ),
                    ]
                  : [
                      ...textRootElement.querySelectorAll(
                        ":scope > .hb-weather-icon, :scope > .hb-weather-content > strong, :scope > .hb-weather-content > small",
                      ),
                    ]
            ).filter((textLineElement) => this.selectionElementIsVisible(textLineElement)),
            textComponentScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
            textWidth = Math.max(1, Number(textBoundsComponent.position?.width || 100)),
            textHeight = Math.max(1, Number(textBoundsComponent.position?.height || 100));
          if (!visibleTextLines.length) {
            const textMarkerSize = Math.min(
              32,
              Math.max(20, Math.min(textWidth, textHeight) * 0.2),
            );
            return (
              Object.assign(textBoundsElement.style, {
                left: (textWidth - textMarkerSize) / 2 + "px",
                top: (textHeight - textMarkerSize) / 2 + "px",
                width: textMarkerSize + "px",
                height: textMarkerSize + "px",
              }),
              false
            );
          }
          const textLineBoxes = visibleTextLines.map((textLine) =>
              this.selectionElementBox(textLine, textBoundsHostElement),
            ),
            textBoundsPadding = 3,
            textBoundsLeft =
              (Math.min(...textLineBoxes.map((textBoxEntry) => textBoxEntry.left)) -
                textBoundsPadding) *
              textComponentScale,
            textBoundsTop =
              (Math.min(...textLineBoxes.map((textBoxTop) => textBoxTop.top)) - textBoundsPadding) *
              textComponentScale,
            textBoundsRight =
              (Math.max(
                ...textLineBoxes.map((textBoxRight) => textBoxRight.left + textBoxRight.width),
              ) +
                textBoundsPadding) *
              textComponentScale,
            textBoundsBottom =
              (Math.max(
                ...textLineBoxes.map((textBoxBottom) => textBoxBottom.top + textBoxBottom.height),
              ) +
                textBoundsPadding) *
              textComponentScale;
          return (
            Object.assign(textBoundsElement.style, {
              left: textBoundsLeft + "px",
              top: textBoundsTop + "px",
              width: Math.max(1, textBoundsRight - textBoundsLeft) + "px",
              height: Math.max(1, textBoundsBottom - textBoundsTop) + "px",
            }),
            true
          );
        });
  }
  async ["updateImageSelectionBounds"](
    imageBoundsHostElement,
    imageBoundsComponent,
    imageBoundsElement,
  ) {
    const imageDisplayElement = imageBoundsHostElement.querySelector(
      ":scope > .hb-image-component",
    );
    if (
      !imageDisplayElement ||
      ((!imageDisplayElement.complete || !imageDisplayElement.naturalWidth) &&
        (await new Promise((imageLoadHandler) => {
          (imageDisplayElement.addEventListener("load", imageLoadHandler, {
            once: true,
          }),
            imageDisplayElement.addEventListener("error", imageLoadHandler, {
              once: true,
            }));
        })),
      !imageBoundsHostElement.isConnected ||
        !imageBoundsElement.isConnected ||
        !imageDisplayElement.naturalWidth ||
        !imageDisplayElement.naturalHeight)
    )
      return;
    const imageWidth = Number(imageBoundsComponent.position?.width || 100),
      imageHeight = Number(imageBoundsComponent.position?.height || 100),
      imageNaturalRatio = imageDisplayElement.naturalWidth / imageDisplayElement.naturalHeight,
      imageBoxRatio = imageWidth / imageHeight,
      fittedWidth =
        imageNaturalRatio >= imageBoxRatio ? imageWidth : imageHeight * imageNaturalRatio,
      fittedHeight =
        imageNaturalRatio >= imageBoxRatio ? imageWidth / imageNaturalRatio : imageHeight,
      fittedLeft = (imageWidth - fittedWidth) / 2,
      fittedTop = (imageHeight - fittedHeight) / 2;
    Object.assign(imageBoundsElement.style, {
      left: (fittedLeft / imageWidth) * 100 + "%",
      top: (fittedTop / imageHeight) * 100 + "%",
      width: (fittedWidth / imageWidth) * 100 + "%",
      height: (fittedHeight / imageHeight) * 100 + "%",
    });
  }
  ["updateTransformHandleScale"](
    transformHandleHostElement,
    transformHandleComponent,
    transformHandleBoundsElement = null,
  ) {
    if (!transformHandleHostElement || !transformHandleComponent) return;
    const handleAppliedMinScale = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1),
      handleComponentScale = Math.max(
        0.01,
        Math.min(5, Number(transformHandleComponent.style?.scale || 1)),
      ),
      scale4 = this.componentParentTransform(transformHandleComponent.id).scale,
      handleUiScale = 1 / Math.max(0.001, handleAppliedMinScale * handleComponentScale * scale4),
      transformBoundsElement =
        transformHandleBoundsElement ||
        this.componentSelectionOverlays
          .get(transformHandleComponent.id)
          ?.querySelector(":scope > .hb-selection-bounds") ||
        transformHandleHostElement.querySelector(":scope > .hb-selection-bounds");
    // 组件预览整体缩放后，预览内部的等待 / 载入失败文案要按实际缩放反算回来
    // （见 bridge.ts 的 syncInteraction3dUiScale）；这里保证每次布局变化都刷新一次。
    syncInteraction3dUiScale2(transformHandleHostElement);
    if (!transformBoundsElement) return;
    (transformBoundsElement.style.setProperty("--hb-ui-scale", String(handleUiScale)),
      transformBoundsElement.style.setProperty("--hb-handle-outset", 30 * handleUiScale + "px"));
    const transformBoundsRect = transformBoundsElement.getBoundingClientRect();
    transformBoundsElement.classList.toggle(
      "handles-outside",
      transformBoundsRect.width < 132 || transformBoundsRect.height < 112,
    );
  }
  ["startComponentScale"](
    scaleComponentPointerEvent,
    scalingComponentRecord,
    scalingHostElement,
    scalingBoundsElement,
  ) {
    (scaleComponentPointerEvent.preventDefault(), scaleComponentPointerEvent.stopPropagation());
    const scalingBoundsRect =
        scalingBoundsElement?.getBoundingClientRect() || scalingHostElement.getBoundingClientRect(),
      scalingCenterX = scalingBoundsRect.left + scalingBoundsRect.width / 2,
      scalingCenterY = scalingBoundsRect.top + scalingBoundsRect.height / 2,
      scaleInitialDistance = Math.max(
        1,
        Math.hypot(
          scaleComponentPointerEvent.clientX - scalingCenterX,
          scaleComponentPointerEvent.clientY - scalingCenterY,
        ),
      ),
      scaleStartValue = Math.max(
        0.01,
        Math.min(5, Number(scalingComponentRecord.style?.scale || 1)),
      );
    let scaleNextValue = scaleStartValue,
      hasScaled = false;
    const pointerId6 = scaleComponentPointerEvent.pointerId;
    scaleComponentPointerEvent.currentTarget.setPointerCapture(pointerId6);
    const componentScaleMoveHandler = (componentScaleMoveEvent) => {
        if (componentScaleMoveEvent.pointerId !== pointerId6) return;
        const hypot3 = Math.hypot(
          componentScaleMoveEvent.clientX - scalingCenterX,
          componentScaleMoveEvent.clientY - scalingCenterY,
        );
        ((scaleNextValue = Math.max(
          0.01,
          Math.min(5, (scaleStartValue * hypot3) / scaleInitialDistance),
        )),
          (scalingComponentRecord.style = {
            ...(scalingComponentRecord.style || {}),
            scale: scaleNextValue,
          }),
          (scalingHostElement.style.transform =
            "rotate(" +
            Number(scalingComponentRecord.position?.rotation || 0) +
            "deg) scale(" +
            scaleNextValue +
            ")"));
        const scaleOverlayElement = this.componentSelectionOverlays.get(scalingComponentRecord.id);
        (scaleOverlayElement &&
          (scaleOverlayElement.style.transform = scalingHostElement.style.transform),
          this.updateTransformHandleScale(
            scalingHostElement,
            scalingComponentRecord,
            scalingBoundsElement,
          ),
          this.options.onComponentTransformPreview?.(scalingComponentRecord.id, {
            scale: scaleNextValue,
          }));
      },
      componentScaleEndHandler = (componentScaleEndEvent = null) => {
        hasScaled ||
          (componentScaleEndEvent?.pointerId != null &&
            componentScaleEndEvent.pointerId !== pointerId6) ||
          ((hasScaled = true),
          window.removeEventListener("pointermove", componentScaleMoveHandler, true),
          window.removeEventListener("pointerup", componentScaleEndHandler, true),
          window.removeEventListener("pointercancel", componentScaleEndHandler, true),
          window.removeEventListener("blur", componentScaleEndHandler),
          (scalingComponentRecord.style = {
            ...(scalingComponentRecord.style || {}),
            scale: scaleNextValue,
          }),
          scaleNextValue !== scaleStartValue &&
            this.options.onComponentTransform?.(scalingComponentRecord.id, {
              scale: scaleNextValue,
            }));
      };
    (window.addEventListener("pointermove", componentScaleMoveHandler, true),
      window.addEventListener("pointerup", componentScaleEndHandler, true),
      window.addEventListener("pointercancel", componentScaleEndHandler, true),
      window.addEventListener("blur", componentScaleEndHandler));
  }
  ["startComponentRotate"](
    rotateComponentPointerEvent,
    rotatingComponentRecord,
    rotatingHostElement,
    rotatingBoundsElement,
  ) {
    (rotateComponentPointerEvent.preventDefault(), rotateComponentPointerEvent.stopPropagation());
    const rotatingBoundsRect =
        rotatingBoundsElement?.getBoundingClientRect() ||
        rotatingHostElement.getBoundingClientRect(),
      rotatingCenterX = rotatingBoundsRect.left + rotatingBoundsRect.width / 2,
      rotatingCenterY = rotatingBoundsRect.top + rotatingBoundsRect.height / 2,
      startComponentAngle = Math.atan2(
        rotateComponentPointerEvent.clientY - rotatingCenterY,
        rotateComponentPointerEvent.clientX - rotatingCenterX,
      ),
      componentStartRotation = Number(rotatingComponentRecord.position?.rotation || 0);
    let componentNextRotation = componentStartRotation,
      hasRotatedComponent = false;
    const pointerId7 = rotateComponentPointerEvent.pointerId;
    rotateComponentPointerEvent.currentTarget.setPointerCapture(pointerId7);
    const componentRotateMoveHandler = (componentRotateMoveEvent) => {
        if (componentRotateMoveEvent.pointerId !== pointerId7) return;
        const currentComponentAngle = Math.atan2(
          componentRotateMoveEvent.clientY - rotatingCenterY,
          componentRotateMoveEvent.clientX - rotatingCenterX,
        );
        ((componentNextRotation =
          componentStartRotation + ((currentComponentAngle - startComponentAngle) * 180) / Math.PI),
          (rotatingHostElement.style.transform =
            "rotate(" +
            componentNextRotation +
            "deg) scale(" +
            Number(rotatingComponentRecord.style?.scale || 1) +
            ")"));
        const rotateOverlayElement = this.componentSelectionOverlays.get(
          rotatingComponentRecord.id,
        );
        (rotateOverlayElement &&
          (rotateOverlayElement.style.transform = rotatingHostElement.style.transform),
          this.options.onComponentTransformPreview?.(rotatingComponentRecord.id, {
            rotation: componentNextRotation,
          }));
      },
      componentRotateEndHandler = (componentRotateEndEvent = null) => {
        hasRotatedComponent ||
          (componentRotateEndEvent?.pointerId != null &&
            componentRotateEndEvent.pointerId !== pointerId7) ||
          ((hasRotatedComponent = true),
          window.removeEventListener("pointermove", componentRotateMoveHandler, true),
          window.removeEventListener("pointerup", componentRotateEndHandler, true),
          window.removeEventListener("pointercancel", componentRotateEndHandler, true),
          window.removeEventListener("blur", componentRotateEndHandler),
          (rotatingComponentRecord.position = {
            ...(rotatingComponentRecord.position || {}),
            rotation: componentNextRotation,
          }),
          componentNextRotation !== componentStartRotation &&
            this.options.onComponentTransform?.(rotatingComponentRecord.id, {
              rotation: componentNextRotation,
            }));
      };
    (window.addEventListener("pointermove", componentRotateMoveHandler, true),
      window.addEventListener("pointerup", componentRotateEndHandler, true),
      window.addEventListener("pointercancel", componentRotateEndHandler, true),
      window.addEventListener("blur", componentRotateEndHandler));
  }
  ["bindRuntimeActions"](actionHostElement, actionOptions) {
    let tapTimeoutId = null,
      holdTimeoutId = null,
      moveTimeoutId = null,
      hasLongPressed = false,
      activePointerRecord = null,
      lastTapRecord = null,
      tapCooldownUntil = 0,
      optimisticRollbackHandler = null,
      optimisticPreviousState;
    const tap = componentSupportsAction(actionOptions, actionOptions.actions?.tap)
        ? actionOptions.actions.tap
        : null,
      doubleTap = componentSupportsAction(actionOptions, actionOptions.actions?.doubleTap)
        ? actionOptions.actions.doubleTap
        : null,
      hold = componentSupportsAction(actionOptions, actionOptions.actions?.hold)
        ? actionOptions.actions.hold
        : null,
      hasTapAction = !!(tap?.type && tap.type !== "none"),
      hasDoubleTapAction = !!(doubleTap?.type && doubleTap.type !== "none"),
      hasHoldAction = !!(hold?.type && hold.type !== "none"),
      cancelHoldTimer = () => {
        this.options.onRuntimeButtonPress?.(actionHostElement);
      },
      resetTapState = () => {
        if (optimisticRollbackHandler || tap?.type !== "toggle") return;
        const bindingEntityId = actionOptions.bindings?.entity?.entityId;
        bindingEntityId &&
          !isVirtualEntityId2(bindingEntityId) &&
          ((optimisticPreviousState = this.states.get(
            this.powerEntityId(actionOptions, bindingEntityId),
          )),
          (optimisticRollbackHandler = this.applyOptimisticToggle(bindingEntityId, actionOptions)));
      },
      clearTapTimers = () => {
        (optimisticRollbackHandler?.(),
          (optimisticRollbackHandler = null),
          (optimisticPreviousState = undefined));
      },
      resetPointerState = () => {
        const rollbackHandler = optimisticRollbackHandler,
          previousEntityState = optimisticPreviousState;
        ((optimisticRollbackHandler = null),
          (optimisticPreviousState = undefined),
          hasTapAction &&
            this.runAction(actionOptions, tap, {
              optimisticAlreadyApplied: !!rollbackHandler,
              optimisticRollback: rollbackHandler,
              optimisticPreviousState: previousEntityState,
            }));
      };
    ((actionHostElement.style.touchAction = "manipulation"),
      actionHostElement.addEventListener("contextmenu", (menuPointerEvent) =>
        menuPointerEvent.preventDefault(),
      ),
      actionHostElement.addEventListener("selectstart", (selectStartEvent) =>
        selectStartEvent.preventDefault(),
      ),
      actionHostElement.addEventListener("dragstart", (dragStartEvent) =>
        dragStartEvent.preventDefault(),
      ),
      actionHostElement.addEventListener("pointerdown", (pointerDownEvent) => {
        ((hasLongPressed = false),
          (activePointerRecord = {
            pointerId: pointerDownEvent.pointerId,
            pointerType: pointerDownEvent.pointerType || "mouse",
            x: pointerDownEvent.clientX,
            y: pointerDownEvent.clientY,
            moved: false,
          }),
          hasHoldAction &&
            (moveTimeoutId = window.setTimeout(() => {
              ((hasLongPressed = true),
                (lastTapRecord = null),
                window.clearTimeout(holdTimeoutId),
                cancelHoldTimer(),
                this.runAction(actionOptions, hold));
            }, 400)));
      }));
    const clearLongPressTimer = () => window.clearTimeout(moveTimeoutId);
    (actionHostElement.addEventListener("pointermove", (pointerMoveEvent) => {
      !activePointerRecord ||
        activePointerRecord.pointerId !== pointerMoveEvent.pointerId ||
        Math.hypot(
          pointerMoveEvent.clientX - activePointerRecord.x,
          pointerMoveEvent.clientY - activePointerRecord.y,
        ) <= 18 ||
        ((activePointerRecord.moved = true), clearLongPressTimer());
    }),
      actionHostElement.addEventListener("pointerup", (pointerUpEvent) => {
        clearLongPressTimer();
        const activePointerState =
          activePointerRecord?.pointerId === pointerUpEvent.pointerId ? activePointerRecord : null;
        if (
          ((activePointerRecord = null),
          !activePointerState ||
            activePointerState.pointerType === "mouse" ||
            activePointerState.moved ||
            hasLongPressed)
        )
          return;
        (pointerUpEvent.preventDefault(),
          (tapCooldownUntil = performance.now() + 700),
          (hasTapAction || hasDoubleTapAction) && cancelHoldTimer());
        const currentTimeMs = performance.now();
        if (
          hasDoubleTapAction &&
          lastTapRecord &&
          currentTimeMs - lastTapRecord.time <= 180 &&
          Math.hypot(
            pointerUpEvent.clientX - lastTapRecord.x,
            pointerUpEvent.clientY - lastTapRecord.y,
          ) <= 34
        ) {
          (window.clearTimeout(holdTimeoutId),
            clearTapTimers(),
            (lastTapRecord = null),
            this.runAction(actionOptions, doubleTap));
          return;
        }
        ((lastTapRecord = {
          time: currentTimeMs,
          x: pointerUpEvent.clientX,
          y: pointerUpEvent.clientY,
        }),
          hasDoubleTapAction
            ? (resetTapState(),
              window.clearTimeout(holdTimeoutId),
              (holdTimeoutId = window.setTimeout(() => {
                (resetPointerState(), (lastTapRecord = null));
              }, 180)))
            : (hasTapAction && this.runAction(actionOptions, tap), (lastTapRecord = null)));
      }),
      actionHostElement.addEventListener("pointercancel", () => {
        (clearLongPressTimer(), (activePointerRecord = null));
      }),
      actionHostElement.addEventListener("click", () => {
        performance.now() < tapCooldownUntil ||
          hasLongPressed ||
          ((hasTapAction || hasDoubleTapAction) && cancelHoldTimer(),
          hasDoubleTapAction
            ? (resetTapState(),
              window.clearTimeout(tapTimeoutId),
              (tapTimeoutId = window.setTimeout(() => {
                resetPointerState();
              }, 180)))
            : hasTapAction && this.runAction(actionOptions, tap));
      }),
      actionHostElement.addEventListener("dblclick", () => {
        (window.clearTimeout(tapTimeoutId),
          clearTapTimers(),
          hasDoubleTapAction && this.runAction(actionOptions, doubleTap));
      }),
      this.cleanups.push(() => {
        (window.clearTimeout(tapTimeoutId),
          window.clearTimeout(holdTimeoutId),
          window.clearTimeout(moveTimeoutId),
          clearTapTimers());
      }));
  }
  ["runAction"](runtimeActionComponent, actionPayload, actionRuntimeOptions = {}) {
    !actionPayload?.type ||
      actionPayload.type === "none" ||
      this.dispatchAction(runtimeActionComponent, actionPayload, actionRuntimeOptions).catch(
        (actionError) => {
          (window.HomeOSLog?.error(actionError, {
            componentId: runtimeActionComponent.id,
            entityId: runtimeActionComponent.bindings?.entity?.entityId || "",
            phase: "component-action",
          }),
            this.options.onError?.(actionError));
        },
      );
  }
  ["previewAction"](actionPreviewComponent, previewActionPayload) {
    previewActionPayload?.type === "more-info" &&
      this.showActionPopup(actionPreviewComponent, previewActionPayload, {
        preview: true,
      });
  }
  ["popupComponentForEntity"](popupEntityId, popupLabel = "") {
    let resolvedEntityId = String(popupEntityId || ""),
      entityDomain = resolvedEntityId.split(".")[0];
    const targetDeviceProfile = this.deviceProfile(resolvedEntityId);
    targetDeviceProfile?.deviceType === "air-purifier" &&
      targetDeviceProfile.roles?.fan &&
      entityDomain !== "fan" &&
      ((resolvedEntityId = targetDeviceProfile.roles.fan), (entityDomain = "fan"));
    const roleEntityId =
      targetDeviceProfile?.roles?.climate || targetDeviceProfile?.roles?.fan || "";
    ["air-conditioner", "bath-heater"].includes(targetDeviceProfile?.deviceType) &&
      roleEntityId &&
      !["climate", "light"].includes(entityDomain) &&
      ((resolvedEntityId = roleEntityId), (entityDomain = resolvedEntityId.split(".")[0]));
    const entityMetadataEntry = this.entityMetadata.get(resolvedEntityId);
    if (
      entityDomain === "sensor" &&
      entityMetadataEntry?.deviceId &&
      ["state", "status", "task_status"].includes(entityMetadataEntry.translationKey)
    ) {
      const vacuumMetadataEntry = [...this.entityMetadata.values()].find(
        (metadataCandidate) =>
          metadataCandidate.deviceId === entityMetadataEntry.deviceId &&
          metadataCandidate.domain === "vacuum" &&
          entityMetadataIsAvailable2(metadataCandidate),
      );
      vacuumMetadataEntry?.entityId &&
        ((resolvedEntityId = vacuumMetadataEntry.entityId), (entityDomain = "vacuum"));
    }
    const popupComponentPayload =
      targetDeviceProfile?.deviceType === "electric-bed"
        ? "electric-bed"
        : targetDeviceProfile?.deviceType === "air-purifier" && entityDomain === "fan"
          ? "air-purifier"
          : (["air-conditioner", "bath-heater"].includes(targetDeviceProfile?.deviceType) &&
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
      type: popupComponentPayload,
      bindings: {
        entity: {
          entityId: resolvedEntityId,
        },
      },
      properties: {
        label: popupLabel || "",
        ...(["air-conditioner", "bath-heater"].includes(targetDeviceProfile?.deviceType)
          ? {
              deviceType: targetDeviceProfile.deviceType,
            }
          : {}),
        ...(targetDeviceProfile?.deviceType === "air-purifier"
          ? {
              deviceType: "air-purifier",
            }
          : {}),
        ...(targetDeviceProfile?.deviceType === "electric-bed"
          ? {
              deviceType: "electric-bed",
            }
          : {}),
        ...(targetDeviceProfile?.coverKind
          ? {
              coverKind: targetDeviceProfile.coverKind,
            }
          : {}),
      },
      actions: {},
    };
  }
  ["showActionPopup"](popupComponent, popupActionRecord, { preview: isPopupPreview = false } = {}) {
    const popupSourceMode = popupActionRecord?.data?.popupSource || "current";
    if (popupSourceMode === "custom") {
      const customPopupRecord = (this.document?.customPopups || []).find(
        (customPopupCandidate) => customPopupCandidate.id === popupActionRecord.data?.popupId,
      );
      if (!customPopupRecord) throw new Error("选择的组合弹窗不存在。");
      this.showCustomPopup(customPopupRecord, {
        preview: isPopupPreview,
      });
      return;
    }
    const popupEntityIdValue = popupComponent?.bindings?.entity?.entityId,
      isPopupTypeSupported =
        String(popupEntityIdValue || "").split(".", 1)[0] === "cover" ||
        ["camera", "line-chart", "air-conditioner", "icon-button"].includes(popupComponent?.type);
    let popupComponentForEntity =
      popupSourceMode === "entity"
        ? this.popupComponentForEntity(
            popupActionRecord.data?.entityId,
            componentDialogTitle(
              popupComponent,
              popupActionRecord.data?.title || popupActionRecord.data?.entityId,
            ),
          )
        : isPopupTypeSupported
          ? popupComponent
          : this.popupComponentForEntity(
              popupEntityIdValue,
              componentDialogTitle(popupComponent, ""),
            );
    if (
      (popupSourceMode !== "entity" &&
        popupComponentForEntity !== popupComponent &&
        popupComponent?.properties?.relatedEntities &&
        (popupComponentForEntity = {
          ...popupComponentForEntity,
          properties: {
            ...(popupComponentForEntity.properties || {}),
            relatedEntities: structuredClone(popupComponent.properties.relatedEntities),
          },
        }),
      !popupComponentForEntity?.bindings?.entity?.entityId)
    )
      throw new Error("该弹窗没有可用实体。");
    popupComponentForEntity.type === "camera"
      ? this.showCameraPreview(popupComponentForEntity, {
          preview: isPopupPreview,
        })
      : this.showEntityDetails(popupComponentForEntity, {
          preview: isPopupPreview,
        });
  }
  async ["dispatchAction"](
    toggleComponentRecord,
    toggleActionRecord,
    {
      optimisticAlreadyApplied: isOptimisticAlreadyApplied = false,
      optimisticRollback: optimisticRollbackCallback = null,
      optimisticPreviousState: optimisticPreviousValue,
    }: {
      optimisticAlreadyApplied?: boolean;
      optimisticRollback?: any;
      optimisticPreviousState?: any;
    } = {},
  ) {
    if (toggleActionRecord.type === "toggle") {
      const toggleEntityId = toggleComponentRecord.bindings?.entity?.entityId;
      if (!toggleEntityId) throw new Error("该控件没有关联实体。");
      if (isVirtualEntityId2(toggleEntityId)) {
        this.toggleVirtualEntity(toggleEntityId);
        return;
      }
      const powerEntityId5 =
          typeof this.powerEntityId == "function"
            ? this.powerEntityId(toggleComponentRecord, toggleEntityId)
            : toggleEntityId,
        toggleEntityDomain = powerEntityId5.split(".", 1)[0];
      if (["button", "script"].includes(toggleEntityDomain)) {
        const toggleServiceCommand = entityToggleCommand2(
          powerEntityId5,
          this.states.get(powerEntityId5),
          toggleComponentRecord,
        );
        await this.callEntityService(
          toggleServiceCommand.domain,
          toggleServiceCommand.service,
          powerEntityId5,
          toggleServiceCommand.data,
        );
        return;
      }
      const toggleTargetState = isOptimisticAlreadyApplied
          ? optimisticPreviousValue
          : this.states.get(powerEntityId5),
        optimisticToggle = isOptimisticAlreadyApplied
          ? optimisticRollbackCallback || (() => {})
          : this.applyOptimisticToggle(powerEntityId5, toggleComponentRecord);
      try {
        if (toggleEntityDomain === "cover") {
          const optimisticStatesMap = new Map(this.states);
          (toggleTargetState === undefined
            ? optimisticStatesMap.delete(powerEntityId5)
            : optimisticStatesMap.set(powerEntityId5, toggleTargetState),
            await this.callEntityService(
              "cover",
              coverToggleServiceForComponent2(
                toggleComponentRecord,
                this.entityMetadata,
                optimisticStatesMap,
                powerEntityId5,
              ),
              powerEntityId5,
            ));
        } else {
          if (["climate", "fan", "water_heater", "media_player"].includes(toggleEntityDomain)) {
            const runtimePowerComponent4 =
                typeof this.runtimePowerComponent == "function"
                  ? this.runtimePowerComponent(toggleComponentRecord, toggleEntityId)
                  : toggleComponentRecord,
              coverServiceCommand = entityToggleCommand2(
                powerEntityId5,
                toggleTargetState,
                runtimePowerComponent4,
              );
            await this.callEntityService(
              coverServiceCommand.domain,
              coverServiceCommand.service,
              powerEntityId5,
              coverServiceCommand.data,
            );
          } else await this.callEntityService("homeassistant", "toggle", powerEntityId5);
        }
      } catch (toggleError) {
        throw (optimisticToggle(), toggleError);
      }
      return;
    }
    if (toggleActionRecord.type === "more-info") {
      this.showActionPopup(toggleComponentRecord, toggleActionRecord);
      return;
    }
    if (toggleActionRecord.type === "navigate") {
      if (
        !toggleActionRecord.target ||
        !this.document?.pages?.some(
          (pageRecordCandidate) => pageRecordCandidate.path === toggleActionRecord.target,
        )
      )
        throw new Error("跳转的页面不存在。");
      this.navigate(toggleActionRecord.target);
    }
  }
  async ["callEntityService"](serviceDomain, serviceName, serviceEntityId, servicePayload = {}) {
    const serviceRequestInit: RequestInit & { hbLogContext?: ComponentPayload } = {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        domain: serviceDomain,
        service: serviceName,
        entityId: serviceEntityId,
        data: servicePayload,
      }),
      hbLogContext: {
        entityId: serviceEntityId,
        service: serviceDomain + "." + serviceName,
        phase: "device-control",
      },
    };
    const serviceResponse = await fetch("/api/v1/ha/services/call", serviceRequestInit);
    if (!serviceResponse.ok) {
      const serviceErrorBody = await serviceResponse.json().catch(() => ({})),
        error = new Error(
          typeof serviceErrorBody.detail == "string"
            ? serviceErrorBody.detail
            : serviceErrorBody.detail?.message || "实体操作失败。",
        );
      throw window.HomeOSLog?.linkError(error, serviceResponse) || error;
    }
  }
  async ["browseMedia"](mediaEntityId, mediaContentId = "media-source://", mediaContentType = "") {
    const mediaResponse = await fetch("/api/v1/ha/media/browse", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          entityId: mediaEntityId,
          mediaContentId: mediaContentId,
          mediaContentType: mediaContentType,
        }),
      }),
      mediaResponseBody = await mediaResponse.json().catch(() => ({}));
    if (!mediaResponse.ok) throw new Error(mediaResponseBody.detail || "媒体目录读取失败。");
    return mediaResponseBody.result || {};
  }
  ["createMediaBrowserControl"](mediaBrowserEntityId, { preview: isMediaPreview = false } = {}) {
    const mediaBrowserRootElement = document.createElement("section");
    mediaBrowserRootElement.className = "hb-media-browser";
    const mediaBrowserTriggerElement = document.createElement("button");
    ((mediaBrowserTriggerElement.type = "button"),
      (mediaBrowserTriggerElement.className = "hb-media-browser-trigger"),
      (mediaBrowserTriggerElement.innerHTML = '<span aria-hidden="true"></span>'),
      mediaBrowserTriggerElement.setAttribute("aria-label", "选择本地媒体"),
      mediaBrowserTriggerElement.setAttribute("title", "选择本地媒体"),
      mediaBrowserTriggerElement.setAttribute("aria-expanded", "false"),
      (mediaBrowserTriggerElement.disabled = isMediaPreview));
    const mediaBrowserPanelElement = document.createElement("div");
    ((mediaBrowserPanelElement.className = "hb-media-browser-panel"),
      (mediaBrowserPanelElement.hidden = true));
    const mediaBrowserToolbarElement = document.createElement("div");
    mediaBrowserToolbarElement.className = "hb-media-browser-toolbar";
    const mediaBrowserBackElement = document.createElement("button");
    ((mediaBrowserBackElement.type = "button"),
      (mediaBrowserBackElement.className = "hb-media-browser-back"),
      (mediaBrowserBackElement.textContent = "返回"),
      (mediaBrowserBackElement.hidden = true));
    const mediaBrowserLocationElement = document.createElement("strong");
    ((mediaBrowserLocationElement.className = "hb-media-browser-location"),
      (mediaBrowserLocationElement.textContent = "媒体库"));
    const mediaBrowserStatusElement = document.createElement("span");
    mediaBrowserStatusElement.className = "hb-media-browser-status";
    const mediaBrowserCloseElement = document.createElement("button");
    ((mediaBrowserCloseElement.type = "button"),
      (mediaBrowserCloseElement.className = "hb-media-browser-close"),
      (mediaBrowserCloseElement.textContent = "×"),
      mediaBrowserCloseElement.setAttribute("aria-label", "关闭媒体选择"),
      mediaBrowserToolbarElement.append(
        mediaBrowserBackElement,
        mediaBrowserLocationElement,
        mediaBrowserStatusElement,
        mediaBrowserCloseElement,
      ));
    const mediaBrowserListElement = document.createElement("div");
    ((mediaBrowserListElement.className = "hb-media-browser-list"),
      mediaBrowserPanelElement.append(mediaBrowserToolbarElement, mediaBrowserListElement),
      mediaBrowserRootElement.append(mediaBrowserTriggerElement));
    let currentContentId = "media-source://",
      currentContentType = "",
      mediaHistoryEntries = [],
      isMediaBusy = false,
      isMediaAvailable = false;
    const setMediaStatus = (mediaStatusText = "") => {
        mediaBrowserStatusElement.textContent = mediaStatusText;
      },
      closeMediaBrowser = () => {
        ((mediaBrowserPanelElement.hidden = true),
          mediaBrowserTriggerElement.setAttribute("aria-expanded", "false"));
      },
      setMediaBusy = (busyFlag) => {
        ((isMediaBusy = !!busyFlag),
          (mediaBrowserTriggerElement.disabled =
            isMediaPreview || isMediaBusy || !isMediaAvailable),
          (mediaBrowserBackElement.disabled = isMediaBusy),
          mediaBrowserListElement.querySelectorAll("button").forEach((mediaButtonElement) => {
            mediaButtonElement.disabled = isMediaBusy;
          }));
      },
      mediaItemTitle = (mediaEntry) =>
        String(
          mediaEntry?.title || mediaEntry?.name || mediaEntry?.media_content_id || "未命名媒体",
        ),
      loadMediaDirectory = async (
        targetContentId,
        targetContentType = "",
        { pushHistory: shouldPushHistory = true } = {},
      ) => {
        if (!(isMediaBusy || isMediaPreview || !isMediaAvailable)) {
          (setMediaBusy(true), setMediaStatus("读取中…"));
          try {
            const browseMedia = await this.browseMedia(
              mediaBrowserEntityId,
              targetContentId,
              targetContentType,
            );
            (shouldPushHistory &&
              currentContentId !== targetContentId &&
              mediaHistoryEntries.push({
                id: currentContentId,
                type: currentContentType,
                title: mediaBrowserLocationElement.textContent,
              }),
              (currentContentId = targetContentId),
              (currentContentType = targetContentType || ""),
              (mediaBrowserLocationElement.textContent = mediaItemTitle(browseMedia) || "媒体库"),
              (mediaBrowserBackElement.hidden = mediaHistoryEntries.length === 0),
              mediaBrowserListElement.replaceChildren());
            const children2 = Array.isArray(browseMedia?.children) ? browseMedia.children : [];
            if (!children2.length) {
              const mediaEmptyElement = document.createElement("p");
              ((mediaEmptyElement.className = "hb-media-browser-empty"),
                (mediaEmptyElement.textContent = "此处没有可播放的媒体。"),
                mediaBrowserListElement.append(mediaEmptyElement));
            }
            (children2.forEach((mediaChildEntry) => {
              const mediaItemElement = document.createElement("div");
              mediaItemElement.className = "hb-media-browser-item";
              const mediaItemTitleElement = document.createElement("span");
              ((mediaItemTitleElement.className = "hb-media-browser-item-title"),
                (mediaItemTitleElement.textContent = mediaItemTitle(mediaChildEntry)));
              const mediaItemActionElement = document.createElement("button");
              mediaItemActionElement.type = "button";
              const isMediaExpandable = !!(
                  mediaChildEntry?.can_expand || mediaChildEntry?.children
                ),
                isMediaPlayable = !!mediaChildEntry?.can_play;
              ((mediaItemActionElement.textContent = isMediaExpandable ? "打开" : "播放"),
                (mediaItemActionElement.disabled = !isMediaExpandable && !isMediaPlayable),
                mediaItemActionElement.addEventListener("click", async () => {
                  if (isMediaExpandable) {
                    await loadMediaDirectory(
                      mediaChildEntry.media_content_id,
                      mediaChildEntry.media_content_type || "",
                      {
                        pushHistory: true,
                      },
                    );
                    return;
                  }
                  if (!(!isMediaPlayable || isMediaBusy)) {
                    (setMediaBusy(true), setMediaStatus("发送播放…"));
                    try {
                      (await this.callEntityService(
                        "media_player",
                        "play_media",
                        mediaBrowserEntityId,
                        {
                          media_content_id: mediaChildEntry.media_content_id,
                          media_content_type: mediaChildEntry.media_content_type || "music",
                        },
                      ),
                        setMediaStatus(""));
                    } catch (mediaPlayError) {
                      (setMediaStatus(mediaPlayError.message || "播放失败"),
                        this.options.onError?.(mediaPlayError));
                    } finally {
                      setMediaBusy(false);
                    }
                  }
                }),
                mediaItemElement.append(mediaItemTitleElement, mediaItemActionElement),
                mediaBrowserListElement.append(mediaItemElement));
            }),
              (mediaBrowserPanelElement.hidden = false),
              mediaBrowserTriggerElement.setAttribute("aria-expanded", "true"),
              setMediaStatus(children2.length ? children2.length + " 项" : ""));
          } catch (mediaLoadError) {
            const mediaErrorMessage = String(mediaLoadError?.message || "媒体目录读取失败");
            (setMediaStatus(
              mediaErrorMessage.includes("Media directory does not exist")
                ? "此目录暂无媒体"
                : mediaErrorMessage,
            ),
              mediaBrowserListElement.replaceChildren());
            const mediaErrorElement = document.createElement("p");
            ((mediaErrorElement.className = "hb-media-browser-empty"),
              (mediaErrorElement.textContent = mediaErrorMessage.includes(
                "Media directory does not exist",
              )
                ? "此目录暂无可用媒体。"
                : mediaErrorMessage),
              mediaBrowserListElement.append(mediaErrorElement),
              (mediaBrowserPanelElement.hidden = false),
              mediaBrowserTriggerElement.setAttribute("aria-expanded", "true"));
          } finally {
            setMediaBusy(false);
          }
        }
      };
    return (
      mediaBrowserTriggerElement.addEventListener("click", () => {
        if (!mediaBrowserPanelElement.hidden) {
          closeMediaBrowser();
          return;
        }
        loadMediaDirectory(currentContentId, currentContentType, {
          pushHistory: false,
        });
      }),
      mediaBrowserCloseElement.addEventListener("click", closeMediaBrowser),
      mediaBrowserBackElement.addEventListener("click", async () => {
        const pop = mediaHistoryEntries.pop();
        pop &&
          (await loadMediaDirectory(pop.id, pop.type, {
            pushHistory: false,
          }),
          (mediaBrowserLocationElement.textContent = pop.title || "媒体库"),
          (mediaBrowserBackElement.hidden = mediaHistoryEntries.length === 0));
      }),
      {
        root: mediaBrowserRootElement,
        panel: mediaBrowserPanelElement,
        sync: (mediaSyncState) => {
          ((isMediaAvailable = !!(
            Number(mediaSyncState?.attributes?.supported_features || 0) & 512
          )),
            (mediaBrowserRootElement.hidden = !isMediaAvailable),
            isMediaAvailable || closeMediaBrowser(),
            (mediaBrowserTriggerElement.disabled =
              isMediaPreview || isMediaBusy || !isMediaAvailable));
        },
        cleanup: () => {
          (mediaBrowserRootElement.remove(), mediaBrowserPanelElement.remove());
        },
      }
    );
  }
  ["registerRuntimeDialogScale"](
    dialogLayerElement,
    dialogElement,
    dialogDesignWidth,
    dialogDesignHeight,
  ) {
    const hasStableMotion = runtimeDialogUsesStableMotion2();
    (dialogLayerElement.classList.toggle("hb-runtime-stable-motion", hasStableMotion),
      dialogLayerElement.classList.toggle(
        "hb-runtime-simplified-motion",
        hasStableMotion && dialogElement.classList.contains("hb-custom-popup-dialog"),
      ));
    const dialogScaleRecord = {
      dialogLayer: dialogLayerElement,
      dialog: dialogElement,
      designWidth: Math.max(1, Number(dialogDesignWidth) || 1),
      designHeight: Math.max(1, Number(dialogDesignHeight) || 1),
      fillAvailable:
        dialogElement.dataset.runtimeDialogLayout === "fill" ||
        dialogElement.classList.contains("media-player-details"),
      tightFill: dialogElement.classList.contains("media-player-details"),
      targetOccupancy:
        dialogElement.dataset.runtimeDialogLayout === "compact"
          ? compactTargetOccupancy
          : defaultTargetOccupancy,
      measureFrame: 0,
      layoutObserver: null,
      entranceAnimations: [],
    };
    ((this.runtimeDialogScaleContext = dialogScaleRecord),
      dialogElement.classList.add("hb-runtime-scaled-dialog"),
      (dialogElement.style.width = dialogScaleRecord.designWidth + "px"),
      (dialogElement.style.minWidth = dialogScaleRecord.designWidth + "px"),
      (dialogElement.style.maxWidth = "none"),
      (dialogElement.style.height = "auto"),
      (dialogElement.style.minHeight = "0"),
      (dialogElement.style.maxHeight = "none"),
      (dialogElement.style.boxSizing = "border-box"),
      dialogElement.style.setProperty(
        "--hb-runtime-dialog-design-height",
        dialogScaleRecord.designHeight + "px",
      ));
    const dialogCardElement = dialogElement.querySelector(":scope > .hb-custom-popup-card");
    (dialogCardElement &&
      ((dialogCardElement.style.width = dialogScaleRecord.designWidth + "px"),
      (dialogCardElement.style.minWidth = dialogScaleRecord.designWidth + "px"),
      (dialogCardElement.style.maxWidth = "none")),
      this.updateRuntimeDialogScale(),
      (dialogScaleRecord.measureFrame = window.requestAnimationFrame(() => {
        ((dialogScaleRecord.measureFrame = 0),
          this.runtimeDialogScaleContext === dialogScaleRecord &&
            (this.updateRuntimeDialogScale(),
            dialogElement.open &&
              (dialogScaleRecord.entranceAnimations = playStableRuntimeDialogEntrance2(
                dialogLayerElement,
                dialogElement,
              ))));
      })),
      (dialogScaleRecord.layoutObserver = new ResizeObserver(() => {
        this.runtimeDialogScaleContext !== dialogScaleRecord ||
          dialogScaleRecord.measureFrame ||
          (dialogScaleRecord.measureFrame = window.requestAnimationFrame(() => {
            ((dialogScaleRecord.measureFrame = 0),
              this.runtimeDialogScaleContext === dialogScaleRecord &&
                this.updateRuntimeDialogScale());
          }));
      })),
      dialogScaleRecord.layoutObserver.observe(dialogElement),
      dialogCardElement && dialogScaleRecord.layoutObserver.observe(dialogCardElement));
  }
  ["updateRuntimeDialogScale"]() {
    const runtimeDialogScaleContext = this.runtimeDialogScaleContext;
    if (
      !runtimeDialogScaleContext?.dialog?.isConnected ||
      !runtimeDialogScaleContext.dialogLayer?.isConnected
    )
      return;
    const dialogLayerRect = runtimeDialogScaleContext.dialogLayer.getBoundingClientRect(),
      viewportRect = this.viewport?.getBoundingClientRect(),
      runtimeDialogViewport2 = runtimeDialogViewport({
        layerLeft: dialogLayerRect.left,
        layerTop: dialogLayerRect.top,
        layerWidth:
          dialogLayerRect.width ||
          runtimeDialogScaleContext.dialogLayer.clientWidth ||
          this.container.clientWidth,
        layerHeight:
          dialogLayerRect.height ||
          runtimeDialogScaleContext.dialogLayer.clientHeight ||
          this.container.clientHeight,
        dashboardLeft: viewportRect?.left,
        dashboardTop: viewportRect?.top,
        dashboardWidth: viewportRect?.width,
        dashboardHeight: viewportRect?.height,
      }),
      width = runtimeDialogViewport2.width,
      height = runtimeDialogViewport2.height,
      measuredDialogWidth = Math.max(
        Number(runtimeDialogScaleContext.dialog.offsetWidth || 0),
        Number(runtimeDialogScaleContext.dialog.scrollWidth || 0),
      ),
      measuredDialogHeight = Math.max(
        Number(runtimeDialogScaleContext.dialog.offsetHeight || 0),
        Number(runtimeDialogScaleContext.dialog.scrollHeight || 0),
      ),
      designWidth =
        measuredDialogWidth > 1 ? measuredDialogWidth : runtimeDialogScaleContext.designWidth,
      designHeight =
        measuredDialogHeight > 1 ? measuredDialogHeight : runtimeDialogScaleContext.designHeight,
      runtimeDialogLayout2 = runtimeDialogLayout({
        layerWidth: width,
        layerHeight: height,
        layoutWidth: designWidth,
        layoutHeight: designHeight,
        fillAvailable: runtimeDialogScaleContext.fillAvailable,
        tightFill: runtimeDialogScaleContext.tightFill,
        targetOccupancy: runtimeDialogScaleContext.targetOccupancy,
      }),
      scale5 = runtimeDialogLayout2.scale;
    ((runtimeDialogScaleContext.dialog.style.position = "absolute"),
      (runtimeDialogScaleContext.dialog.style.inset = "auto"),
      (runtimeDialogScaleContext.dialog.style.top = runtimeDialogViewport2.centerY + "px"),
      (runtimeDialogScaleContext.dialog.style.left = runtimeDialogViewport2.centerX + "px"),
      (runtimeDialogScaleContext.dialog.style.margin = "0"),
      (runtimeDialogScaleContext.dialog.style.transform =
        "translate(-50%, -50%) scale(" + scale5 + ")"),
      (runtimeDialogScaleContext.dialog.style.transformOrigin = "center"),
      runtimeDialogScaleContext.dialog.style.setProperty(
        "--hb-runtime-dialog-scale",
        String(scale5),
      ),
      (runtimeDialogScaleContext.dialogLayer.dataset.dialogScale = scale5.toFixed(4)),
      (runtimeDialogScaleContext.dialogLayer.dataset.dialogLayoutWidth = String(
        Math.round(designWidth),
      )),
      (runtimeDialogScaleContext.dialogLayer.dataset.dialogLayoutHeight = String(
        Math.round(designHeight),
      )),
      (runtimeDialogScaleContext.dialogLayer.dataset.dialogSafeInset =
        runtimeDialogLayout2.safeInset.toFixed(2)),
      (runtimeDialogScaleContext.dialogLayer.dataset.dialogViewportWidth = String(
        Math.round(runtimeDialogViewport2.width),
      )),
      (runtimeDialogScaleContext.dialogLayer.dataset.dialogViewportHeight = String(
        Math.round(runtimeDialogViewport2.height),
      )));
  }
  ["clearRuntimeDialogScale"](closingDialogElement) {
    if (this.runtimeDialogScaleContext?.dialog === closingDialogElement) {
      (window.cancelAnimationFrame(this.runtimeDialogScaleContext.measureFrame || 0),
        this.runtimeDialogScaleContext.layoutObserver?.disconnect());
      for (const entranceAnimation of this.runtimeDialogScaleContext.entranceAnimations || [])
        entranceAnimation.cancel();
      (closingDialogElement.classList.remove("hb-runtime-scaled-dialog"),
        (this.runtimeDialogScaleContext = null));
    }
  }
  ["closeRuntimeDialog"](
    targetDialogElement = this.detailsDialog,
    { preservePending: shouldPreservePending = false } = {},
  ) {
    (shouldPreservePending || this.cancelPendingEntityDetails(),
      targetDialogElement &&
        (targetDialogElement.open
          ? targetDialogElement.close()
          : targetDialogElement.dispatchEvent(new Event("close")),
        targetDialogElement.isConnected && targetDialogElement.remove(),
        this.detailsDialog === targetDialogElement && (this.detailsDialog = null),
        this.detailsStateSync?.dialog === targetDialogElement && (this.detailsStateSync = null)));
  }
  ["bindRuntimeDialogOutsideDismiss"](
    outsideDismissLayer,
    outsideClickDialog,
    outsideDismissCardElement,
  ) {
    const outsideClickGraceUntilMs = performance.now() + 320;
    outsideDismissLayer.addEventListener("click", (outsideClickEvent) => {
      outsideDismissCardElement.contains(outsideClickEvent.target) ||
        (outsideClickEvent.preventDefault(),
        outsideClickEvent.stopPropagation(),
        !(performance.now() < outsideClickGraceUntilMs) && outsideClickDialog.close());
    });
  }
  ["openInteraction3dCameraPreview"](
    cameraControlComponent,
    cameraPreviewCloseHandler,
    cameraPreviewOptions = {},
  ) {
    this.showCameraPreview(
      {
        id: "camera:" + cameraControlComponent.id,
        type: "camera",
        properties: {
          label: cameraControlComponent.label,
        },
        bindings: {
          entity: {
            entityId: cameraControlComponent.entityId,
          },
        },
      },
      {
        interaction3d: cameraPreviewOptions,
      },
    );
    const detailsDialog = this.detailsDialog;
    return (
      detailsDialog?.addEventListener("close", cameraPreviewCloseHandler, {
        once: true,
      }),
      {
        updateLayout: () => detailsDialog?.resizeInteraction3d?.(),
        close: () => {
          (detailsDialog?.removeEventListener("close", cameraPreviewCloseHandler),
            detailsDialog?.close());
        },
        contains: (domTargetNode) => detailsDialog?.contains(domTargetNode),
      }
    );
  }
  ["showCameraPreview"](
    cameraComponent,
    { preview: isCameraPreview = false, interaction3d: cameraInteractionConfig = null } = {},
  ) {
    const cameraEntityId = cameraComponent.bindings?.entity?.entityId;
    if (!cameraEntityId) throw new Error("该摄像头控件没有关联实体。");
    this.closeRuntimeDialog();
    const cameraPreviewDialog: ComponentDialogElement = document.createElement("dialog");
    ((cameraPreviewDialog.className = "hb-camera-preview-dialog fit-media-ratio"),
      (cameraPreviewDialog.dataset.componentId = cameraComponent.id || ""));
    const cameraPreviewCard = document.createElement("div");
    cameraPreviewCard.className = "hb-camera-preview-card";
    const cameraPreviewHeading = document.createElement("div");
    cameraPreviewHeading.className = "hb-camera-preview-heading";
    const cameraPreviewTitleBox = document.createElement("div"),
      cameraPreviewTitle = document.createElement("strong");
    cameraPreviewTitle.textContent = componentDialogTitle(cameraComponent, "摄像头实时预览");
    const cameraPreviewStatus = document.createElement("span");
    ((cameraPreviewStatus.className = "hb-camera-preview-status"),
      (cameraPreviewStatus.textContent = cameraInteractionConfig ? "正在加载画面" : "正在连接"),
      cameraPreviewStatus.classList.add("is-connecting"),
      cameraPreviewTitleBox.append(cameraPreviewTitle, cameraPreviewStatus));
    const cameraPreviewCloseButton = document.createElement("button");
    ((cameraPreviewCloseButton.type = "button"),
      cameraPreviewCloseButton.setAttribute("aria-label", "关闭摄像头预览"),
      (cameraPreviewCloseButton.textContent = "×"),
      cameraPreviewHeading.append(cameraPreviewTitleBox, cameraPreviewCloseButton));
    const cameraDeviceVisualSection = document.createElement("section");
    ((cameraDeviceVisualSection.className = "hb-camera-device-visual"),
      cameraDeviceVisualSection.setAttribute("aria-hidden", "true"));
    const cameraDeviceMountIcon = document.createElement("i");
    cameraDeviceMountIcon.className = "hb-camera-device-mount";
    const cameraDeviceArmIcon = document.createElement("i");
    cameraDeviceArmIcon.className = "hb-camera-device-arm";
    const cameraDeviceBody = document.createElement("div");
    cameraDeviceBody.className = "hb-camera-device-body";
    const cameraDeviceLensIcon = document.createElement("i");
    cameraDeviceLensIcon.className = "hb-camera-device-lens";
    const cameraDeviceLedIcon = document.createElement("i");
    ((cameraDeviceLedIcon.className = "hb-camera-device-led"),
      cameraDeviceBody.append(cameraDeviceLensIcon, cameraDeviceLedIcon),
      cameraDeviceVisualSection.append(
        cameraDeviceMountIcon,
        cameraDeviceArmIcon,
        cameraDeviceBody,
      ));
    let cameraMotionTimeoutId = 0,
      cameraMotionAnimation = null,
      cameraPreviousAngle = 0;
    const formatCameraTiltTransform = (tiltAngleDeg, tiltScaleFactor = 0) =>
        "translateX(-50%) perspective(260px) rotateY(" +
        tiltAngleDeg +
        "deg) rotateZ(" +
        tiltAngleDeg * 0.035 +
        "deg) translateY(" +
        tiltScaleFactor +
        "px)",
      cameraTiltTick = () => {
        if (!cameraDeviceBody.isConnected) return;
        const cameraTiltAngles = [-22, -16, -9, -4, 0, 6, 12, 18, 23].filter(
            (filteredAngle) => Math.abs(filteredAngle - cameraPreviousAngle) >= 7,
          ),
          cameraTargetAngle =
            cameraTiltAngles[Math.floor(Math.random() * cameraTiltAngles.length)] ?? 0,
          cameraTiltDirection = Math.sign(cameraTargetAngle - cameraPreviousAngle) || 1,
          abs = Math.abs(cameraTargetAngle - cameraPreviousAngle),
          round = Math.round(430 + abs * 18 + Math.random() * 320),
          cameraOvershootAngle =
            cameraTargetAngle + cameraTiltDirection * (1.4 + Math.random() * 2.2),
          cameraJitterAmount = Math.random() * 1.4 - 0.7;
        (cameraDeviceLensIcon.style.setProperty(
          "--hb-camera-lens-shift",
          (cameraTargetAngle / 23) * 2.5 + "px",
        ),
          cameraMotionAnimation?.cancel(),
          (cameraMotionAnimation = cameraDeviceBody.animate(
            [
              {
                transform: formatCameraTiltTransform(cameraPreviousAngle, 0),
                offset: 0,
              },
              {
                transform: formatCameraTiltTransform(cameraOvershootAngle, cameraJitterAmount),
                offset: 0.78,
              },
              {
                transform: formatCameraTiltTransform(cameraTargetAngle, cameraJitterAmount * 0.35),
                offset: 1,
              },
            ],
            {
              duration: round,
              easing: "cubic-bezier(.2,.72,.22,1)",
              fill: "forwards",
            },
          )),
          cameraMotionAnimation.addEventListener(
            "finish",
            () => {
              ((cameraPreviousAngle = cameraTargetAngle),
                (cameraDeviceBody.style.transform = formatCameraTiltTransform(
                  cameraPreviousAngle,
                  cameraJitterAmount * 0.35,
                )),
                cameraMotionAnimation?.cancel(),
                (cameraMotionAnimation = null));
              const cameraReturnDelayMs =
                Math.random() < 0.22 ? 180 + Math.random() * 260 : 680 + Math.random() * 1500;
              cameraMotionTimeoutId = window.setTimeout(cameraTiltTick, cameraReturnDelayMs);
            },
            {
              once: true,
            },
          ));
      };
    !cameraInteractionConfig &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches &&
      (cameraMotionTimeoutId = window.setTimeout(cameraTiltTick, 620));
    const cameraPreviewStage = document.createElement("div");
    ((cameraPreviewStage.className = "hb-camera-preview-stage"),
      cameraPreviewStage.classList.add("is-connecting"));
    const cameraRevealVeilIcon = document.createElement("i");
    ((cameraRevealVeilIcon.className = "hb-camera-preview-reveal-veil"),
      cameraRevealVeilIcon.setAttribute("aria-hidden", "true"));
    const cameraScanLineIcon = document.createElement("i");
    ((cameraScanLineIcon.className = "hb-camera-preview-scan-line"),
      cameraScanLineIcon.setAttribute("aria-hidden", "true"),
      cameraPreviewStage.append(cameraRevealVeilIcon, cameraScanLineIcon));
    const hasLiveVideo = !!cameraInteractionConfig,
      isMediaVisible = cameraComponent.properties?.mediaVisible !== false;
    (cameraPreviewStage.classList.toggle("is-16-9", !hasLiveVideo),
      cameraPreviewStage.classList.toggle("media-hidden", !isMediaVisible));
    const cameraCleanupCallbacks = [];
    let isCameraReady = false;
    const handleCameraReady = () => {
        isCameraReady ||
          ((isCameraReady = true),
          (cameraPreviewStatus.textContent = "实时画面"),
          cameraPreviewStatus.classList.remove("is-connecting", "is-unavailable"),
          cameraPreviewStatus.classList.add("is-live"),
          cameraDeviceVisualSection.classList.remove("is-unavailable"),
          cameraDeviceVisualSection.classList.add("is-live"),
          cameraPreviewStage.classList.remove("is-connecting", "is-unavailable", "is-revealing"),
          cameraPreviewStage.classList.add("is-ready"));
      },
      handleCameraUnavailable = () => {
        ((cameraPreviewStatus.textContent = "画面不可用"),
          cameraPreviewStatus.classList.remove("is-connecting", "is-live"),
          cameraPreviewStatus.classList.add("is-unavailable"),
          cameraDeviceVisualSection.classList.remove("is-live"),
          cameraDeviceVisualSection.classList.add("is-unavailable"),
          cameraPreviewStage.classList.remove("is-connecting", "is-revealing"),
          cameraPreviewStage.classList.add("is-unavailable"));
      };
    let cameraMediaRatio = cameraInteractionConfig ? cameraPreviewRatio2(cameraEntityId) : 16 / 9;
    const layoutCameraPreview = () => {
      if (cameraInteractionConfig) {
        ((cameraPreviewStage.style.aspectRatio = String(cameraMediaRatio)),
          cameraPreviewDialog.resizeInteraction3d?.());
        return;
      }
      const cameraPreviewMaxWidth = Math.max(280, this.container.clientWidth - 32),
        cameraPreviewMaxHeight = Math.max(180, Math.min(625, this.container.clientHeight - 88)),
        cameraPanelWidth = Math.min(
          760,
          cameraPreviewMaxWidth,
          cameraPreviewMaxHeight * cameraMediaRatio,
        );
      ((cameraPreviewDialog.style.width = Math.max(280, cameraPanelWidth) + "px"),
        (cameraPreviewStage.style.aspectRatio = String(cameraMediaRatio)),
        (cameraPreviewStage.style.borderRadius = "16px"));
    };
    if (isMediaVisible && !isCameraPreview) {
      const cameraLoadingHint = document.createElement("span");
      ((cameraLoadingHint.textContent = "正在载入摄像头实时预览"),
        cameraPreviewStage.append(cameraLoadingHint));
      const cameraMediaMount = mountCameraMedia2({
          container: cameraPreviewStage,
          entityId: cameraEntityId,
          label: cameraPreviewTitle.textContent,
          objectFit: cameraInteractionConfig ? "contain" : "fill",
          placeholder: cameraLoadingHint,
          onReady: handleCameraReady,
          onUnavailable: handleCameraUnavailable,
          cleanup: (cleanupRegistration) => {
            cameraCleanupCallbacks.push(cleanupRegistration);
          },
        }),
        syncCameraMediaSize = (mediaWidth, mediaHeight) => {
          !hasLiveVideo ||
            !Number.isFinite(mediaWidth) ||
            !Number.isFinite(mediaHeight) ||
            mediaWidth <= 0 ||
            mediaHeight <= 0 ||
            ((cameraMediaRatio = mediaWidth / mediaHeight),
            cameraPreviewRatio2(cameraEntityId, cameraMediaRatio),
            layoutCameraPreview());
        },
        handleVideoMetadata = () =>
          syncCameraMediaSize(
            cameraMediaMount.video.videoWidth,
            cameraMediaMount.video.videoHeight,
          ),
        handleImageLoad = () =>
          syncCameraMediaSize(
            cameraMediaMount.image.naturalWidth,
            cameraMediaMount.image.naturalHeight,
          );
      (cameraMediaMount.video.addEventListener("loadedmetadata", handleVideoMetadata),
        cameraMediaMount.video.addEventListener("resize", handleVideoMetadata),
        cameraMediaMount.image.addEventListener("load", handleImageLoad),
        cameraCleanupCallbacks.push(() =>
          cameraMediaMount.video.removeEventListener("loadedmetadata", handleVideoMetadata),
        ),
        cameraCleanupCallbacks.push(() =>
          cameraMediaMount.video.removeEventListener("resize", handleVideoMetadata),
        ),
        cameraCleanupCallbacks.push(() =>
          cameraMediaMount.image.removeEventListener("load", handleImageLoad),
        ));
    } else {
      if (isCameraPreview) {
        ((cameraPreviewStatus.textContent = "预览模式"),
          cameraPreviewStatus.classList.remove("is-connecting"),
          cameraPreviewStage.classList.remove("is-connecting"),
          cameraPreviewStage.classList.add("is-ready"));
        const cameraPreviewModeHint = document.createElement("span");
        ((cameraPreviewModeHint.textContent = "预览模式不获取摄像头实时画面"),
          cameraPreviewStage.append(cameraPreviewModeHint));
      } else {
        ((cameraPreviewStatus.textContent = "画面已隐藏"),
          cameraPreviewStatus.classList.remove("is-connecting"),
          cameraPreviewStage.classList.remove("is-connecting"),
          cameraPreviewStage.classList.add("is-ready"));
        const cameraHiddenHint = document.createElement("span");
        ((cameraHiddenHint.textContent = "摄像头画面已隐藏"),
          cameraPreviewStage.append(cameraHiddenHint));
      }
    }
    (window.addEventListener("resize", layoutCameraPreview),
      cameraCleanupCallbacks.push(() => window.removeEventListener("resize", layoutCameraPreview)),
      layoutCameraPreview(),
      cameraPreviewCard.append(
        cameraPreviewHeading,
        ...(cameraInteractionConfig ? [] : [cameraDeviceVisualSection]),
        cameraPreviewStage,
      ),
      cameraPreviewDialog.append(cameraPreviewCard));
    const cameraPreviewOverlay = document.createElement("div");
    if (
      ((cameraPreviewOverlay.className =
        "hb-renderer-runtime-dialog-layer" +
        (this.options.editable ? "" : " hb-runtime-no-select")),
      (cameraPreviewOverlay.tabIndex = -1),
      cameraPreviewOverlay.append(cameraPreviewDialog),
      this.container.append(cameraPreviewOverlay),
      (this.detailsDialog = cameraPreviewDialog),
      cameraInteractionConfig)
    ) {
      (cameraPreviewOverlay.classList.add("i3d-vacuum-dialog-layer"),
        cameraPreviewDialog.classList.add("i3d-vacuum-details", "i3d-camera-details"));
      const container = cameraInteractionConfig.root || this.container;
      (container.append(cameraPreviewOverlay),
        cameraPreviewDialog.style.setProperty(
          "--i3d-panel-opacity",
          String(
            Math.max(
              0,
              Math.min(
                100,
                Number.isFinite(cameraInteractionConfig.popupOpacity)
                  ? cameraInteractionConfig.popupOpacity
                  : 74,
              ),
            ) / 100,
          ),
        ));
      const resizeCameraPreview = () => {
        const cameraPresentationLayout = cameraInteractionConfig.getPresentationLayout?.(),
          hasFixedUiLayout =
            cameraPresentationLayout?.fixedUi === true &&
            cameraPresentationLayout?.sourceWidth > 0 &&
            cameraPresentationLayout?.sourceHeight > 0,
          sourceWidth = hasFixedUiLayout
            ? cameraPresentationLayout.sourceWidth
            : cameraPresentationLayout?.width > 0
              ? cameraPresentationLayout.width
              : container.clientWidth,
          sourceHeight = hasFixedUiLayout
            ? cameraPresentationLayout.sourceHeight
            : cameraPresentationLayout?.height > 0
              ? cameraPresentationLayout.height
              : container.clientHeight,
          layoutScaleX = container.clientWidth / Math.max(1, sourceWidth),
          layoutScaleY = container.clientHeight / Math.max(1, sourceHeight),
          measureCameraPopup = () =>
            Math.ceil(
              parseFloat(window.getComputedStyle?.(cameraPreviewHeading)?.height) ||
                cameraPreviewHeading.offsetHeight ||
                58,
            );
        let cameraPopupLayout = cameraPopupLayout2(
          sourceWidth,
          sourceHeight,
          cameraMediaRatio,
          measureCameraPopup(),
        );
        ((cameraPreviewDialog.style.width = cameraPopupLayout.panelWidth + "px"),
          (cameraPopupLayout = cameraPopupLayout2(
            sourceWidth,
            sourceHeight,
            cameraMediaRatio,
            measureCameraPopup(),
          )));
        const {
            panelWidth: popupPanelWidth,
            mediaHeight: popupMediaHeight,
            top: popupTopOffset,
          } = cameraPopupLayout,
          cameraPopupPlacement = popupPlacement2({
            width: sourceWidth,
            height: sourceHeight,
            panelWidth: popupPanelWidth,
            panelHeight: popupMediaHeight + measureCameraPopup() + 26,
            defaultScale: 2,
            defaultTop: hasFixedUiLayout ? cameraPopupLayout.top : popupTopOffset,
            settings: cameraInteractionConfig.getPopupLayout?.(),
          }),
          popupTopPx = cameraPopupPlacement.top * layoutScaleY;
        ((cameraPreviewDialog.style.width = popupPanelWidth + "px"),
          (cameraPreviewStage.style.height = popupMediaHeight + "px"),
          (cameraPreviewDialog.style.top = popupTopPx + "px"),
          (cameraPreviewDialog.style.right = cameraPopupPlacement.right * layoutScaleX + "px"),
          (cameraPreviewDialog.style.transform =
            "scale(" +
            cameraPopupPlacement.scale * layoutScaleX +
            "," +
            cameraPopupPlacement.scale * layoutScaleY +
            ")"),
          (cameraPreviewDialog.style.maxHeight = "none"));
      };
      cameraPreviewDialog.resizeInteraction3d = resizeCameraPreview;
      const resizeObserver = new ResizeObserver(resizeCameraPreview);
      (resizeObserver.observe(container),
        resizeObserver.observe(cameraPreviewHeading),
        cameraCleanupCallbacks.push(() => resizeObserver.disconnect()),
        resizeCameraPreview());
    } else this.registerRuntimeDialogScale(cameraPreviewOverlay, cameraPreviewDialog, 760, 680);
    (cameraPreviewCloseButton.addEventListener("click", () => cameraPreviewDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(
        cameraPreviewOverlay,
        cameraPreviewDialog,
        cameraPreviewCard,
      ),
      cameraPreviewOverlay.addEventListener("keydown", (previewKeyEvent) => {
        previewKeyEvent.key === "Escape" && cameraPreviewDialog.close();
      }),
      cameraPreviewDialog.addEventListener(
        "close",
        () => {
          (window.clearTimeout(cameraMotionTimeoutId), cameraMotionAnimation?.cancel());
          for (const cleanupFn of cameraCleanupCallbacks.splice(0)) cleanupFn();
          (this.clearRuntimeDialogScale(cameraPreviewDialog),
            this.detailsDialog === cameraPreviewDialog && (this.detailsDialog = null),
            cameraPreviewOverlay.remove());
        },
        {
          once: true,
        },
      ),
      cameraPreviewDialog.show(),
      cameraPreviewDialog.resizeInteraction3d?.());
  }
  ["createCapabilityDetailsControls"](
    capabilityEntityId,
    externalStateSnapshot,
    {
      interactive: isControlsInteractive = true,
      variant: capabilityVariant = "",
      selectLabel: selectLabel = "模式",
    } = {},
  ): ComponentControllerElement {
    const capabilityControlsSection: ComponentControllerElement = document.createElement("section");
    ((capabilityControlsSection.className =
      "hb-capability-details-controls" +
      (capabilityVariant ? " hb-capability-details-controls--" + capabilityVariant : "")),
      (capabilityControlsSection.inert = !isControlsInteractive));
    const capabilityDomain = String(capabilityEntityId || "").split(".", 1)[0];
    let capabilityEntityState = externalStateSnapshot || {
      entityId: capabilityEntityId,
      state: "unknown",
      attributes: {},
    };
    const componentDeviceType =
        capabilityDomain === "fan"
          ? resolveClimateDeviceType2(
              {
                properties: {},
              },
              capabilityEntityState,
              capabilityEntityId,
            )
          : "generic",
      modeLabelOverrides = {
        entityId: capabilityEntityId,
        entityMetadata: this.entityMetadata,
        entityTranslations: this.entityTranslations,
      },
      getEntityAttributes = () => capabilityEntityState?.attributes || {},
      isCapabilityUnavailable = () =>
        ["unknown", "unavailable"].includes(
          String(capabilityEntityState?.state || "").toLowerCase(),
        ),
      controlDescriptors = [],
      isPowerToggleCapable = ["fan", "switch", "input_boolean"].includes(capabilityDomain),
      hn2 = createSwitchVisual({
        label: "电源",
        interactive: isControlsInteractive,
        compact: capabilityVariant === "air-purifier",
        onToggle: async () => {
          if (!isControlsInteractive || isCapabilityUnavailable()) return;
          const isTurnedOff = String(capabilityEntityState?.state || "").toLowerCase() === "off",
            previousState = capabilityEntityState;
          ((capabilityEntityState = {
            ...capabilityEntityState,
            state: isTurnedOff ? "on" : "off",
          }),
            syncEntityState(capabilityEntityState));
          try {
            await this.callEntityService(
              capabilityDomain === "fan" ? "fan" : "homeassistant",
              capabilityDomain === "fan" ? (isTurnedOff ? "turn_on" : "turn_off") : "toggle",
              capabilityEntityId,
            );
          } catch (powerToggleError) {
            ((capabilityEntityState = previousState),
              syncEntityState(previousState),
              this.options.onError?.(powerToggleError));
          }
        },
      });
    (hn2.visual.classList.add("hb-capability-power"),
      isPowerToggleCapable && capabilityControlsSection.append(hn2.visual));
    const createSelectControl = (
        optionControlLabel,
        optionCandidates,
        activeOptionValue,
        optionServiceName,
        servicePayloadKey,
        optionServiceDomain = capabilityDomain,
      ) => {
        const selectOptions = [
          ...new Set<string>(
            (optionCandidates || [])
              .map((optionText) => String(optionText ?? "").trim())
              .filter(Boolean),
          ),
        ];
        if (
          !selectOptions.length &&
          !(
            ["electric-bed", "electric-bed-memory"].includes(capabilityVariant) &&
            capabilityDomain === "select"
          )
        )
          return;
        const optionGroupSection = document.createElement("section");
        optionGroupSection.className = "hb-capability-option-group";
        const optionGroupTitle = document.createElement("strong");
        optionGroupTitle.textContent = optionControlLabel;
        const optionGroupBox = document.createElement("div");
        if (
          ((optionGroupBox.className = "hb-capability-options"),
          ["electric-bed", "electric-bed-memory"].includes(capabilityVariant) &&
            capabilityDomain === "select")
        ) {
          const bedSelectWrapper = document.createElement("div");
          bedSelectWrapper.className = "hb-electric-bed-select";
          const bedSelectTriggerButton = document.createElement("button");
          ((bedSelectTriggerButton.type = "button"),
            (bedSelectTriggerButton.className = "hb-electric-bed-select-trigger"),
            bedSelectTriggerButton.setAttribute("aria-label", optionControlLabel),
            bedSelectTriggerButton.setAttribute("aria-haspopup", "listbox"),
            bedSelectTriggerButton.setAttribute("aria-expanded", "false"));
          const bedSelectValueLabel = document.createElement("span"),
            bedSelectArrowIcon = document.createElement("i");
          (bedSelectArrowIcon.setAttribute("aria-hidden", "true"),
            bedSelectTriggerButton.append(bedSelectValueLabel, bedSelectArrowIcon));
          const bedSelectMenu = document.createElement("div");
          ((bedSelectMenu.className = "hb-electric-bed-select-menu"),
            (bedSelectMenu.id =
              "hb-bed-select-" +
              String(this.renderNamespace || "runtime").replace(/[^a-z0-9_-]/gi, "-") +
              "-" +
              capabilityEntityId.replace(/[^a-z0-9_-]/gi, "-")),
            bedSelectMenu.setAttribute("role", "listbox"),
            bedSelectMenu.setAttribute("popover", "auto"),
            (bedSelectMenu.hidden = true),
            bedSelectTriggerButton.setAttribute("aria-controls", bedSelectMenu.id));
          let isSelectPending = false;
          const isBedSelectMenuOpen = () => {
              try {
                return bedSelectMenu.matches(":popover-open");
              } catch {
                return bedSelectMenu.dataset.open === "true";
              }
            },
            syncSelectState = () => {
              if (!isBedSelectMenuOpen() && bedSelectMenu.hidden) return;
              const selectTriggerRect = bedSelectTriggerButton.getBoundingClientRect(),
                innerWidth = window.innerWidth,
                innerHeight = window.innerHeight,
                bedSelectMenuWidth = Math.min(
                  Math.max(selectTriggerRect.width, 150),
                  Math.max(150, innerWidth - 20),
                );
              ((bedSelectMenu.style.width = bedSelectMenuWidth + "px"),
                (bedSelectMenu.style.maxHeight =
                  Math.min(306, Math.max(96, innerHeight - 20)) + "px"));
              const bedSelectMenuHeight = Math.min(bedSelectMenu.scrollHeight || 0, 306),
                menuSpaceBelow = innerHeight - selectTriggerRect.bottom - 10,
                menuSpaceAbove = selectTriggerRect.top - 10,
                bedSelectMenuTop =
                  menuSpaceBelow < Math.min(bedSelectMenuHeight, 160) &&
                  menuSpaceAbove > menuSpaceBelow
                    ? Math.max(10, selectTriggerRect.top - bedSelectMenuHeight - 5)
                    : Math.min(
                        innerHeight - bedSelectMenuHeight - 10,
                        selectTriggerRect.bottom + 5,
                      );
              ((bedSelectMenu.style.left =
                Math.max(
                  10,
                  Math.min(selectTriggerRect.left, innerWidth - bedSelectMenuWidth - 10),
                ) + "px"),
                (bedSelectMenu.style.top = Math.max(10, bedSelectMenuTop) + "px"));
            },
            closeBedSelectMenu = () => {
              (isBedSelectMenuOpen() &&
                typeof bedSelectMenu.hidePopover == "function" &&
                bedSelectMenu.hidePopover(),
                (bedSelectMenu.hidden = true),
                (bedSelectMenu.dataset.open = "false"),
                bedSelectTriggerButton.setAttribute("aria-expanded", "false"));
            },
            openBedSelectMenu = (shouldRestoreFocus = false) => {
              bedSelectTriggerButton.disabled ||
                ((bedSelectMenu.hidden = false),
                typeof bedSelectMenu.showPopover == "function"
                  ? bedSelectMenu.showPopover()
                  : (bedSelectMenu.dataset.open = "true"),
                bedSelectTriggerButton.setAttribute("aria-expanded", "true"),
                syncSelectState(),
                shouldRestoreFocus &&
                  (
                    bedSelectMenu.querySelector<HTMLElement>('[aria-selected="true"]') ||
                    bedSelectMenu.querySelector<HTMLElement>('[role="option"]')
                  )?.focus());
            },
            selectBedValue = async (bedSelectedValue) => {
              if (
                !isControlsInteractive ||
                isSelectPending ||
                !bedSelectedValue ||
                isCapabilityUnavailable()
              )
                return;
              const previousStateOnSelect = capabilityEntityState;
              ((isSelectPending = true),
                closeBedSelectMenu(),
                (capabilityEntityState = {
                  ...capabilityEntityState,
                  state:
                    optionServiceName === "select_option"
                      ? bedSelectedValue
                      : capabilityEntityState.state,
                  attributes: {
                    ...getEntityAttributes(),
                    [servicePayloadKey]: bedSelectedValue,
                  },
                }),
                syncEntityState(capabilityEntityState));
              try {
                await this.callEntityService(
                  optionServiceDomain,
                  optionServiceName,
                  capabilityEntityId,
                  {
                    [servicePayloadKey]: bedSelectedValue,
                  },
                );
              } catch (selectError) {
                ((capabilityEntityState = previousStateOnSelect),
                  syncEntityState(previousStateOnSelect),
                  this.options.onError?.(selectError));
              } finally {
                ((isSelectPending = false), syncEntityState(capabilityEntityState));
              }
            },
            renderSelectOptions = (valuesList, bedCurrentOptionValue) => {
              bedSelectMenu.replaceChildren(
                ...valuesList.map((selectableValue) => {
                  const bedSelectOptionButton = document.createElement("button");
                  ((bedSelectOptionButton.type = "button"),
                    (bedSelectOptionButton.className = "hb-electric-bed-select-option"),
                    bedSelectOptionButton.setAttribute("role", "option"),
                    (bedSelectOptionButton.dataset.value = selectableValue),
                    (bedSelectOptionButton.textContent = selectableValue));
                  const isSelectedOption = selectableValue === String(bedCurrentOptionValue ?? "");
                  return (
                    bedSelectOptionButton.classList.toggle("active", isSelectedOption),
                    bedSelectOptionButton.setAttribute("aria-selected", String(isSelectedOption)),
                    bedSelectOptionButton.addEventListener("click", () =>
                      selectBedValue(selectableValue),
                    ),
                    bedSelectOptionButton
                  );
                }),
              );
              const selectedOptionLabel = valuesList.includes(String(bedCurrentOptionValue ?? ""))
                ? String(bedCurrentOptionValue)
                : valuesList[0] || "读取中…";
              ((bedSelectValueLabel.textContent = selectedOptionLabel),
                (bedSelectValueLabel.title = selectedOptionLabel));
            };
          (bedSelectTriggerButton.addEventListener("click", () => {
            isBedSelectMenuOpen() || bedSelectMenu.dataset.open === "true"
              ? closeBedSelectMenu()
              : openBedSelectMenu();
          }),
            bedSelectTriggerButton.addEventListener("keydown", (bedTriggerKeyEvent) => {
              ["ArrowDown", "ArrowUp", "Enter", " "].includes(bedTriggerKeyEvent.key) &&
                (bedTriggerKeyEvent.preventDefault(), openBedSelectMenu(true));
            }),
            bedSelectMenu.addEventListener("keydown", (bedMenuKeyEvent) => {
              const selectOptionButtons = [
                  ...bedSelectMenu.querySelectorAll<HTMLElement>('[role="option"]'),
                ],
                indexOf = selectOptionButtons.findIndex(
                  (selectOptionButton) => selectOptionButton === document.activeElement,
                );
              if (bedMenuKeyEvent.key === "Escape")
                (bedMenuKeyEvent.preventDefault(),
                  closeBedSelectMenu(),
                  bedSelectTriggerButton.focus());
              else {
                if (bedMenuKeyEvent.key === "ArrowDown" || bedMenuKeyEvent.key === "ArrowUp") {
                  bedMenuKeyEvent.preventDefault();
                  const navigationStep = bedMenuKeyEvent.key === "ArrowDown" ? 1 : -1;
                  selectOptionButtons[
                    (indexOf + navigationStep + selectOptionButtons.length) %
                      selectOptionButtons.length
                  ]?.focus();
                } else
                  (bedMenuKeyEvent.key === "Enter" || bedMenuKeyEvent.key === " ") &&
                    (bedMenuKeyEvent.preventDefault(), clickFocusedElement());
              }
            }),
            bedSelectMenu.addEventListener("toggle", (menuToggleEvent) => {
              const isBedMenuOpen = menuToggleEvent.newState === "open";
              ((bedSelectMenu.hidden = !isBedMenuOpen),
                (bedSelectMenu.dataset.open = String(isBedMenuOpen)),
                bedSelectTriggerButton.setAttribute("aria-expanded", String(isBedMenuOpen)),
                isBedMenuOpen && syncSelectState());
            }),
            bedSelectWrapper.append(bedSelectTriggerButton, bedSelectMenu),
            optionGroupSection.append(optionGroupTitle, bedSelectWrapper),
            capabilityControlsSection.append(optionGroupSection),
            controlDescriptors.push({
              type: "bed-select",
              service: optionServiceName,
              dataKey: servicePayloadKey,
              trigger: bedSelectTriggerButton,
              menu: bedSelectMenu,
              renderOptions: renderSelectOptions,
              closeMenu: closeBedSelectMenu,
              isPending: () => isSelectPending,
            }));
          return;
        }
        const modeButtons = [];
        for (const capabilityModeValue of selectOptions) {
          const modeButton = document.createElement("button");
          modeButton.type = "button";
          const modeLabelMap = {
            auto: "自动",
            sleep: "睡眠",
            favorite: "喜爱",
            none: "标准",
            manual: "手动",
            silent: "静音",
          };
          ((modeButton.textContent =
            capabilityVariant === "air-purifier" && optionControlLabel === "运行模式"
              ? modeLabelMap[capabilityModeValue.toLowerCase()] || capabilityModeValue
              : capabilityDomain === "fan" &&
                  componentDeviceType === "bath-heater" &&
                  optionControlLabel === "运行模式"
                ? climateModeLabel2(capabilityModeValue, "bath-heater", modeLabelOverrides)
                : capabilityModeValue),
            (modeButton.dataset.value = capabilityModeValue),
            modeButton.classList.toggle(
              "active",
              capabilityModeValue === String(activeOptionValue ?? ""),
            ),
            modeButton.addEventListener("click", async () => {
              if (!isControlsInteractive) return;
              modeButtons.forEach((disabledModeButton) => {
                disabledModeButton.disabled = true;
              });
              const previousStateOnMode = capabilityEntityState;
              ((capabilityEntityState = {
                ...capabilityEntityState,
                state:
                  optionServiceName === "select_option"
                    ? capabilityModeValue
                    : capabilityEntityState.state,
                attributes: {
                  ...getEntityAttributes(),
                  [servicePayloadKey]: capabilityModeValue,
                },
              }),
                syncEntityState(capabilityEntityState));
              try {
                await this.callEntityService(
                  optionServiceDomain,
                  optionServiceName,
                  capabilityEntityId,
                  {
                    [servicePayloadKey]: capabilityModeValue,
                  },
                );
              } catch (modeError) {
                ((capabilityEntityState = previousStateOnMode),
                  syncEntityState(previousStateOnMode),
                  this.options.onError?.(modeError));
              } finally {
                modeButtons.forEach((enabledModeButton) => {
                  enabledModeButton.disabled = false;
                });
              }
            }),
            modeButtons.push(modeButton),
            optionGroupBox.append(modeButton));
        }
        (optionGroupSection.append(optionGroupTitle, optionGroupBox),
          capabilityControlsSection.append(optionGroupSection),
          controlDescriptors.push({
            type: "options",
            service: optionServiceName,
            dataKey: servicePayloadKey,
            buttons: modeButtons,
          }));
      },
      fanSpeedPercentage = Number(getEntityAttributes().percentage);
    if (capabilityDomain === "fan" && Number.isFinite(fanSpeedPercentage)) {
      if (capabilityVariant === "air-purifier") {
        const speedGroupSection = document.createElement("section");
        speedGroupSection.className = "hb-capability-option-group hb-air-purifier-speed-group";
        const speedGroupTitle = document.createElement("strong");
        speedGroupTitle.textContent = "风速";
        const speedGroupBox = document.createElement("div");
        speedGroupBox.className = "hb-capability-options hb-air-purifier-speed-options";
        const speedPresets = [
          {
            label: "低",
            value: 33,
          },
          {
            label: "中",
            value: 66,
          },
          {
            label: "高",
            value: 100,
          },
        ].map((speedEntry) => {
          const speedPresetButton = document.createElement("button");
          return (
            (speedPresetButton.type = "button"),
            (speedPresetButton.textContent = speedEntry.label),
            (speedPresetButton.dataset.percentage = String(speedEntry.value)),
            speedPresetButton.addEventListener("click", async () => {
              if (!isControlsInteractive || isCapabilityUnavailable()) return;
              speedPresets.forEach((disabledSpeedButton) => {
                disabledSpeedButton.disabled = true;
              });
              const previousStateOnSpeed = capabilityEntityState;
              ((capabilityEntityState = {
                ...capabilityEntityState,
                attributes: {
                  ...getEntityAttributes(),
                  percentage: speedEntry.value,
                },
              }),
                syncEntityState(capabilityEntityState));
              try {
                await this.callEntityService("fan", "set_percentage", capabilityEntityId, {
                  percentage: speedEntry.value,
                });
              } catch (speedError) {
                ((capabilityEntityState = previousStateOnSpeed),
                  syncEntityState(previousStateOnSpeed),
                  this.options.onError?.(speedError));
              } finally {
                speedPresets.forEach((enabledSpeedButton) => {
                  enabledSpeedButton.disabled = false;
                });
              }
            }),
            speedGroupBox.append(speedPresetButton),
            speedPresetButton
          );
        });
        (speedGroupSection.append(speedGroupTitle, speedGroupBox),
          capabilityControlsSection.append(speedGroupSection),
          controlDescriptors.push({
            type: "percentage-options",
            buttons: speedPresets,
          }));
      } else {
        const fanSpeedRangeSection = document.createElement("section");
        fanSpeedRangeSection.className = "hb-capability-range-group";
        const fanSpeedRangeHeading = document.createElement("div");
        fanSpeedRangeHeading.className = "hb-capability-range-heading";
        const fanSpeedRangeTitle = document.createElement("strong");
        fanSpeedRangeTitle.textContent = "风速";
        const fanSpeedRangeOutputElement = document.createElement("output");
        fanSpeedRangeHeading.append(fanSpeedRangeTitle, fanSpeedRangeOutputElement);
        const fanSpeedRangeSlider = document.createElement("input");
        ((fanSpeedRangeSlider.type = "range"),
          (fanSpeedRangeSlider.min = "0"),
          (fanSpeedRangeSlider.max = "100"),
          (fanSpeedRangeSlider.step = "1"),
          (fanSpeedRangeSlider.value = String(fanSpeedPercentage)),
          fanSpeedRangeSlider.addEventListener("change", async () => {
            if (!isControlsInteractive || isCapabilityUnavailable()) return;
            fanSpeedRangeSlider.disabled = true;
            const previousStateOnFanSpeed = capabilityEntityState,
              fanSpeedValue = Number(fanSpeedRangeSlider.value);
            ((capabilityEntityState = {
              ...capabilityEntityState,
              attributes: {
                ...getEntityAttributes(),
                percentage: fanSpeedValue,
              },
            }),
              syncEntityState(capabilityEntityState));
            try {
              await this.callEntityService("fan", "set_percentage", capabilityEntityId, {
                percentage: fanSpeedValue,
              });
            } catch (fanSpeedError) {
              ((capabilityEntityState = previousStateOnFanSpeed),
                syncEntityState(previousStateOnFanSpeed),
                this.options.onError?.(fanSpeedError));
            } finally {
              fanSpeedRangeSlider.disabled = false;
            }
          }),
          fanSpeedRangeSection.append(fanSpeedRangeHeading, fanSpeedRangeSlider),
          capabilityControlsSection.append(fanSpeedRangeSection),
          controlDescriptors.push({
            type: "range",
            input: fanSpeedRangeSlider,
            output: fanSpeedRangeOutputElement,
            dataKey: "percentage",
          }));
      }
    }
    if (
      (capabilityDomain === "fan" &&
        createSelectControl(
          "运行模式",
          getEntityAttributes().preset_modes,
          getEntityAttributes().preset_mode,
          "set_preset_mode",
          "preset_mode",
        ),
      capabilityDomain === "select" &&
        createSelectControl(
          selectLabel,
          getEntityAttributes().options,
          capabilityEntityState?.state,
          "select_option",
          "option",
          "select",
        ),
      ["number", "input_number"].includes(capabilityDomain))
    ) {
      const rangeMinimum = Number.isFinite(Number(getEntityAttributes().min))
          ? Number(getEntityAttributes().min)
          : 0,
        rangeMaximum = Number.isFinite(Number(getEntityAttributes().max))
          ? Number(getEntityAttributes().max)
          : 100,
        rangeStep =
          Number.isFinite(Number(getEntityAttributes().step)) &&
          Number(getEntityAttributes().step) > 0
            ? Number(getEntityAttributes().step)
            : 1,
        numericRangeSection = document.createElement("section");
      numericRangeSection.className = "hb-capability-range-group";
      const numericRangeHeading = document.createElement("div");
      numericRangeHeading.className = "hb-capability-range-heading";
      const numericRangeTitle = document.createElement("strong");
      numericRangeTitle.textContent = getEntityAttributes().unit_of_measurement
        ? "数值（" + getEntityAttributes().unit_of_measurement + "）"
        : "数值";
      const numericRangeOutputElement = document.createElement("output");
      numericRangeHeading.append(numericRangeTitle, numericRangeOutputElement);
      const numericRangeSlider = document.createElement("input");
      ((numericRangeSlider.type = "range"),
        (numericRangeSlider.min = String(rangeMinimum)),
        (numericRangeSlider.max = String(rangeMaximum)),
        (numericRangeSlider.step = String(rangeStep)),
        (numericRangeSlider.value = String(Number(capabilityEntityState?.state) || rangeMinimum)),
        numericRangeSlider.addEventListener("change", async () => {
          if (!isControlsInteractive || isCapabilityUnavailable()) return;
          numericRangeSlider.disabled = true;
          const previousStateOnRange = capabilityEntityState,
            rangeValue = Number(numericRangeSlider.value);
          ((capabilityEntityState = {
            ...capabilityEntityState,
            state: String(rangeValue),
          }),
            syncEntityState(capabilityEntityState));
          try {
            await this.callEntityService(capabilityDomain, "set_value", capabilityEntityId, {
              value: rangeValue,
            });
          } catch (rangeError) {
            ((capabilityEntityState = previousStateOnRange),
              syncEntityState(previousStateOnRange),
              this.options.onError?.(rangeError));
          } finally {
            numericRangeSlider.disabled = false;
          }
        }),
        numericRangeSection.append(numericRangeHeading, numericRangeSlider),
        capabilityControlsSection.append(numericRangeSection),
        controlDescriptors.push({
          type: "range",
          input: numericRangeSlider,
          output: numericRangeOutputElement,
          dataKey: "state",
        }));
    }
    function syncEntityState(nextState) {
      capabilityEntityState = nextState || capabilityEntityState;
      const lowerCase = String(capabilityEntityState?.state || "").toLowerCase(),
        hasCustomVisualState =
          capabilityDomain === "fan"
            ? !["off", "unknown", "unavailable"].includes(lowerCase)
            : lowerCase === "on",
        isPowerVisualActive = capabilityVariant !== "air-purifier" || hasCustomVisualState;
      isPowerToggleCapable &&
        hn2.sync(hasCustomVisualState, {
          unavailable: isCapabilityUnavailable(),
        });
      for (const controlDescriptor of controlDescriptors)
        if (controlDescriptor.type === "options") {
          const descriptorStateValue =
            controlDescriptor.service === "select_option"
              ? capabilityEntityState?.state
              : getEntityAttributes()[controlDescriptor.dataKey];
          controlDescriptor.buttons.forEach((descriptorButton) =>
            descriptorButton.classList.toggle(
              "active",
              isPowerVisualActive &&
                descriptorButton.dataset.value === String(descriptorStateValue ?? ""),
            ),
          );
        } else {
          if (controlDescriptor.type === "bed-select") {
            const descriptorOptionValues = [
                ...new Set(
                  (getEntityAttributes().options || [])
                    .map((rawInputValue) => String(rawInputValue ?? "").trim())
                    .filter(Boolean),
                ),
              ],
              descriptorCurrentValue =
                controlDescriptor.service === "select_option"
                  ? capabilityEntityState?.state
                  : getEntityAttributes()[controlDescriptor.dataKey];
            (controlDescriptor.renderOptions(descriptorOptionValues, descriptorCurrentValue),
              (controlDescriptor.trigger.disabled =
                !isControlsInteractive ||
                controlDescriptor.isPending() ||
                !descriptorOptionValues.length ||
                isCapabilityUnavailable()),
              controlDescriptor.trigger.disabled && controlDescriptor.closeMenu());
          } else {
            if (controlDescriptor.type === "select") {
              const inputOptionValues = [
                ...new Set<string>(
                  (getEntityAttributes().options || [])
                    .map((rawInputOption) => String(rawInputOption ?? "").trim())
                    .filter(Boolean),
                ),
              ];
              if (inputOptionValues.length) {
                const existingOptionValues = [...controlDescriptor.input.options].map(
                  (htmlOptionEntry) => htmlOptionEntry.value,
                );
                (existingOptionValues.length !== inputOptionValues.length ||
                  existingOptionValues.some(
                    (existingValue, optionIndex) =>
                      existingValue !== inputOptionValues[optionIndex],
                  )) &&
                  controlDescriptor.input.replaceChildren(
                    ...inputOptionValues.map((inputOptionValue) => {
                      const selectOptionElement = document.createElement("option");
                      return (
                        (selectOptionElement.value = inputOptionValue),
                        (selectOptionElement.textContent = inputOptionValue),
                        selectOptionElement
                      );
                    }),
                  );
              }
              const desiredInputValue =
                controlDescriptor.service === "select_option"
                  ? capabilityEntityState?.state
                  : getEntityAttributes()[controlDescriptor.dataKey];
              (desiredInputValue != null &&
                [...controlDescriptor.input.options].some(
                  (matchingOption) => matchingOption.value === String(desiredInputValue),
                ) &&
                (controlDescriptor.input.value = String(desiredInputValue)),
                (controlDescriptor.input.disabled =
                  !isControlsInteractive ||
                  !inputOptionValues.length ||
                  isCapabilityUnavailable()));
            } else {
              if (controlDescriptor.type === "percentage-options") {
                const purifierPercentage = Number(getEntityAttributes().percentage),
                  activeSpeedPercentage =
                    purifierPercentage <= 0 || !Number.isFinite(purifierPercentage)
                      ? 0
                      : purifierPercentage <= 49
                        ? 33
                        : purifierPercentage <= 82
                          ? 66
                          : 100;
                controlDescriptor.buttons.forEach((speedButton) =>
                  speedButton.classList.toggle(
                    "active",
                    isPowerVisualActive &&
                      Number(speedButton.dataset.percentage) === activeSpeedPercentage,
                  ),
                );
              } else {
                if (["number", "input_number"].includes(capabilityDomain)) {
                  const speedMinimum = Number.isFinite(Number(getEntityAttributes().min))
                      ? Number(getEntityAttributes().min)
                      : 0,
                    speedMaximum = Number.isFinite(Number(getEntityAttributes().max))
                      ? Number(getEntityAttributes().max)
                      : 100,
                    speedStep =
                      Number.isFinite(Number(getEntityAttributes().step)) &&
                      Number(getEntityAttributes().step) > 0
                        ? Number(getEntityAttributes().step)
                        : 1;
                  ((controlDescriptor.input.min = String(speedMinimum)),
                    (controlDescriptor.input.max = String(speedMaximum)),
                    (controlDescriptor.input.step = String(speedStep)));
                }
                const purifierLevelValue =
                  controlDescriptor.dataKey === "state"
                    ? Number(capabilityEntityState?.state)
                    : Number(getEntityAttributes()[controlDescriptor.dataKey]);
                (Number.isFinite(purifierLevelValue) &&
                  (controlDescriptor.input.value = String(purifierLevelValue)),
                  (controlDescriptor.output.textContent = Number.isFinite(purifierLevelValue)
                    ? "" + purifierLevelValue + (getEntityAttributes().unit_of_measurement || "%")
                    : "--"));
              }
            }
          }
        }
    }
    return (
      (capabilityControlsSection.syncCapabilityState = syncEntityState),
      (capabilityControlsSection.cleanupCapabilityDetails = () => {
        for (const closeableDescriptor of controlDescriptors) closeableDescriptor.closeMenu?.();
      }),
      syncEntityState(capabilityEntityState),
      capabilityControlsSection
    );
  }
  ["showCapabilityDetails"](
    capabilityComponent,
    { preview: isPreviewMode = false, title: dialogTitle = "" } = {},
  ) {
    const detailsEntityId = capabilityComponent.bindings?.entity?.entityId;
    if (!detailsEntityId) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    const capabilityStateSnapshot = this.states.get(detailsEntityId)?.newState ||
        this.states.get(detailsEntityId) || {
          entityId: detailsEntityId,
          state: "unknown",
          attributes: {},
        },
      capabilityDeviceProfile = this.deviceProfile(detailsEntityId),
      isAirPurifier = capabilityDeviceProfile?.deviceType === "air-purifier",
      capabilityDialog = document.createElement("dialog");
    capabilityDialog.className =
      "hb-entity-details-dialog capability-details" +
      (isAirPurifier ? " air-purifier-details" : "");
    const capabilityDialogCard = document.createElement("div");
    capabilityDialogCard.className = "hb-entity-details-card";
    const capabilityDialogHeading = document.createElement("div");
    capabilityDialogHeading.className = "hb-entity-details-heading";
    const capabilityDialogTitleBox = document.createElement("div"),
      capabilityDialogTitle = document.createElement("strong");
    capabilityDialogTitle.textContent =
      dialogTitle ||
      capabilityComponent.properties?.label ||
      capabilityStateSnapshot.attributes?.friendly_name ||
      detailsEntityId;
    const capabilityDialogStatus = document.createElement("span");
    ((capabilityDialogStatus.textContent =
      capabilityStateSnapshot.state === "unavailable" ? "当前不可用" : "设备控制"),
      capabilityDialogTitleBox.append(capabilityDialogTitle, capabilityDialogStatus));
    const capabilityDialogCloseButton = document.createElement("button");
    ((capabilityDialogCloseButton.type = "button"),
      (capabilityDialogCloseButton.textContent = "×"),
      capabilityDialogCloseButton.setAttribute("aria-label", "关闭弹窗"),
      capabilityDialogHeading.append(capabilityDialogTitleBox, capabilityDialogCloseButton));
    const capabilityDetailsBody = document.createElement("div");
    capabilityDetailsBody.className = "hb-capability-details-body";
    const capabilityDetailsControls = this.createCapabilityDetailsControls(
      detailsEntityId,
      capabilityStateSnapshot,
      {
        interactive: !isPreviewMode,
        variant: isAirPurifier ? "air-purifier" : "",
      },
    );
    (capabilityDetailsBody.append(capabilityDetailsControls),
      capabilityDialogCard.append(capabilityDialogHeading, capabilityDetailsBody),
      capabilityDialog.append(capabilityDialogCard));
    const metricRoleLabels = {
        pm25: "PM2.5",
        airQuality: "空气质量",
        temperature: "温度",
        humidity: "湿度",
        filterLife: "滤芯寿命",
      },
      slice2 = isAirPurifier
        ? ["pm25", "airQuality", "temperature", "humidity", "filterLife"]
            .map((deviceRoleName) => ({
              role: deviceRoleName,
              id: capabilityDeviceProfile.roles?.[deviceRoleName],
            }))
            .filter(({ id: metricEntityId }) => metricEntityId)
            .map(({ role: metricRole, id: metricId }) => ({
              role: metricRole,
              item: this.entityMetadata.get(metricId),
            }))
            .filter(
              ({ item: metricItem }) =>
                ["sensor", "binary_sensor"].includes(metricItem?.domain) &&
                entityMetadataIsAvailable2(metricItem),
            )
            .slice(0, 5)
        : [],
      metricValueByEntityId = new Map();
    if (slice2.length) {
      const capabilityMetricsBox = document.createElement("div");
      capabilityMetricsBox.className = "hb-capability-metrics";
      for (const { role: metricRoleKey, item: metricEntity } of slice2) {
        const capabilityMetricRow = document.createElement("div");
        capabilityMetricRow.className =
          "hb-capability-metric hb-capability-metric--" + metricRoleKey;
        const metricRoleLabel = document.createElement("small");
        metricRoleLabel.textContent =
          metricRoleLabels[metricRoleKey] ||
          metricEntity.name ||
          metricEntity.originalName ||
          metricEntity.entityId;
        const metricValueLabel = document.createElement("strong");
        (capabilityMetricRow.append(metricRoleLabel, metricValueLabel),
          capabilityMetricsBox.append(capabilityMetricRow),
          metricValueByEntityId.set(metricEntity.entityId, metricValueLabel));
      }
      capabilityDetailsBody.prepend(capabilityMetricsBox);
    }
    const capabilityDialogOverlay = document.createElement("div");
    ((capabilityDialogOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (capabilityDialogOverlay.tabIndex = -1),
      capabilityDialogOverlay.append(capabilityDialog),
      this.container.append(capabilityDialogOverlay),
      (this.detailsDialog = capabilityDialog));
    const syncCapabilityHandler = (capabilitySyncStateArg) => {
        (capabilityDetailsControls.syncCapabilityState?.(capabilitySyncStateArg),
          (capabilityDialogStatus.textContent = ["unknown", "unavailable"].includes(
            String(capabilitySyncStateArg?.state || "").toLowerCase(),
          )
            ? "当前不可用"
            : "设备控制"));
      },
      capabilityHandlerByEntityId = new Map([[detailsEntityId, [syncCapabilityHandler]]]);
    for (const { item: metricEntityItem } of slice2) {
      const syncMetricHandler = (metricState) => {
        const metricValueText = metricValueByEntityId.get(metricEntityItem.entityId);
        metricValueText &&
          (metricValueText.textContent =
            metricState?.state === "unknown" || metricState?.state === "unavailable"
              ? "--"
              : (
                  (metricState?.state ?? "--") +
                  " " +
                  (metricState?.attributes?.unit_of_measurement || "")
                ).trim());
      };
      (syncMetricHandler(
        this.states.get(metricEntityItem.entityId)?.newState ||
          this.states.get(metricEntityItem.entityId),
      ),
        capabilityHandlerByEntityId.set(metricEntityItem.entityId, [syncMetricHandler]));
    }
    ((this.detailsStateSync = {
      dialog: capabilityDialog,
      handlers: capabilityHandlerByEntityId,
    }),
      this.registerRuntimeDialogScale(
        capabilityDialogOverlay,
        capabilityDialog,
        isAirPurifier ? 620 : 560,
        isAirPurifier ? 560 : 500,
      ),
      capabilityDialogCloseButton.addEventListener("click", () => capabilityDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(
        capabilityDialogOverlay,
        capabilityDialog,
        capabilityDialogCard,
      ),
      capabilityDialogOverlay.addEventListener("keydown", (capabilityKeyEvent) => {
        capabilityKeyEvent.key === "Escape" && capabilityDialog.close();
      }),
      capabilityDialog.addEventListener(
        "close",
        () => {
          (capabilityDetailsControls.cleanupCapabilityDetails?.(),
            this.clearRuntimeDialogScale(capabilityDialog),
            this.detailsDialog === capabilityDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === capabilityDialog && (this.detailsStateSync = null),
            capabilityDialogOverlay.remove());
        },
        {
          once: true,
        },
      ),
      capabilityDialog.show());
  }
  ["showAirPurifierDetails"](
    airPurifierComponent,
    { preview: isAirPurifierPreview = false, title: airPurifierTitle = "" } = {},
  ) {
    const airPurifierEntityId = airPurifierComponent.bindings?.entity?.entityId;
    if (!airPurifierEntityId) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    const airPurifierDeviceProfile = this.deviceProfile(airPurifierEntityId),
      relatedEntityIds = selectedRelatedEntityIds2(airPurifierComponent);
    let airPurifierStateSnapshot = this.states.get(airPurifierEntityId)?.newState ||
      this.states.get(airPurifierEntityId) || {
        entityId: airPurifierEntityId,
        state: "unknown",
        attributes: {},
      };
    const airPurifierDialog = document.createElement("dialog");
    airPurifierDialog.className =
      "hb-entity-details-dialog air-purifier-details capability-details";
    const airPurifierDialogCard = document.createElement("div");
    airPurifierDialogCard.className = "hb-entity-details-card";
    const airPurifierDialogHeading = document.createElement("div");
    airPurifierDialogHeading.className = "hb-entity-details-heading";
    const airPurifierDialogTitleBox = document.createElement("div"),
      airPurifierDialogTitle = document.createElement("strong");
    airPurifierDialogTitle.textContent =
      airPurifierTitle ||
      componentDialogTitle(
        airPurifierComponent,
        airPurifierStateSnapshot.attributes?.friendly_name || "空气净化器",
      );
    const airPurifierDialogStatus = document.createElement("span");
    airPurifierDialogTitleBox.append(airPurifierDialogTitle, airPurifierDialogStatus);
    const airPurifierPowerButton = document.createElement("button");
    ((airPurifierPowerButton.type = "button"),
      (airPurifierPowerButton.className = "hb-air-purifier-visual"),
      (airPurifierPowerButton.inert = isAirPurifierPreview),
      airPurifierPowerButton.setAttribute("aria-label", "切换空气净化器电源"));
    const airPurifierAuraIcon = document.createElement("i");
    airPurifierAuraIcon.className = "hb-air-purifier-visual-aura";
    const airPurifierAirflowIcon = document.createElement("span");
    airPurifierAirflowIcon.className = "hb-air-purifier-visual-airflow";
    for (
      let purifierAirflowUnitIndex = 0;
      purifierAirflowUnitIndex < 4;
      purifierAirflowUnitIndex += 1
    )
      airPurifierAirflowIcon.append(document.createElement("i"));
    const airPurifierBodyIcon = document.createElement("span");
    airPurifierBodyIcon.className = "hb-air-purifier-visual-body";
    const airPurifierTopIcon = document.createElement("i");
    airPurifierTopIcon.className = "hb-air-purifier-visual-top";
    const airPurifierVentIcon = document.createElement("i");
    airPurifierVentIcon.className = "hb-air-purifier-visual-vent";
    const airPurifierDisplayIcon = document.createElement("span");
    airPurifierDisplayIcon.className = "hb-air-purifier-visual-display";
    const airPurifierDisplayLabel = document.createElement("strong");
    (airPurifierDisplayIcon.append(airPurifierDisplayLabel),
      airPurifierBodyIcon.append(airPurifierTopIcon, airPurifierVentIcon, airPurifierDisplayIcon),
      airPurifierPowerButton.append(
        airPurifierAuraIcon,
        airPurifierAirflowIcon,
        airPurifierBodyIcon,
      ));
    const airPurifierDialogCloseButton = document.createElement("button");
    ((airPurifierDialogCloseButton.type = "button"),
      (airPurifierDialogCloseButton.textContent = "×"),
      airPurifierDialogCloseButton.setAttribute("aria-label", "关闭弹窗"),
      airPurifierDialogHeading.append(
        airPurifierDialogTitleBox,
        airPurifierPowerButton,
        airPurifierDialogCloseButton,
      ));
    const airPurifierLayoutBox = document.createElement("div");
    airPurifierLayoutBox.className = "hb-air-purifier-layout";
    const airPurifierSummarySection = document.createElement("section");
    airPurifierSummarySection.className = "hb-air-purifier-summary";
    const airPurifierGaugeWrapElement = document.createElement("div");
    airPurifierGaugeWrapElement.className = "hb-air-purifier-gauge-wrap";
    const airPurifierGaugeBox = document.createElement("div");
    airPurifierGaugeBox.className = "hb-air-purifier-gauge is-quality";
    const airPurifierGaugeOrbitIcon = document.createElement("i");
    airPurifierGaugeOrbitIcon.className = "hb-air-purifier-gauge-orbit";
    const airPurifierArcStartIcon = document.createElement("i");
    airPurifierArcStartIcon.className = "hb-air-purifier-arc-cap start";
    const airPurifierArcEndIcon = document.createElement("i");
    airPurifierArcEndIcon.className = "hb-air-purifier-arc-cap end";
    const airPurifierGaugeContentElement = document.createElement("div");
    airPurifierGaugeContentElement.className = "hb-air-purifier-gauge-content";
    const airPurifierQualityCaption = document.createElement("small");
    airPurifierQualityCaption.textContent = "室内空气质量";
    const airPurifierQualityValueElement = document.createElement("strong"),
      airPurifierQualityNumberElement = document.createElement("span"),
      airPurifierQualityUnitElement = document.createElement("small");
    airPurifierQualityUnitElement.textContent = "";
    const airPurifierDeviceStatus = document.createElement("span");
    ((airPurifierDeviceStatus.textContent = "设备状态 --"),
      airPurifierQualityValueElement.append(
        airPurifierQualityNumberElement,
        airPurifierQualityUnitElement,
      ),
      airPurifierGaugeContentElement.append(
        airPurifierQualityCaption,
        airPurifierQualityValueElement,
        airPurifierDeviceStatus,
      ),
      airPurifierGaugeBox.append(
        airPurifierArcStartIcon,
        airPurifierArcEndIcon,
        airPurifierGaugeContentElement,
      ),
      airPurifierGaugeWrapElement.append(airPurifierGaugeOrbitIcon, airPurifierGaugeBox));
    const airPurifierSecondaryMetricsElement = document.createElement("div");
    ((airPurifierSecondaryMetricsElement.className = "hb-air-purifier-secondary-metrics"),
      airPurifierSummarySection.append(
        airPurifierGaugeWrapElement,
        airPurifierSecondaryMetricsElement,
      ));
    const capabilityDetailsControls2 = this.createCapabilityDetailsControls(
        airPurifierEntityId,
        airPurifierStateSnapshot,
        {
          interactive: !isAirPurifierPreview,
          variant: "air-purifier",
        },
      ),
      airPurifierControlsSection = document.createElement("section");
    ((airPurifierControlsSection.className = "hb-air-purifier-controls-pane"),
      airPurifierControlsSection.append(capabilityDetailsControls2),
      airPurifierLayoutBox.append(airPurifierSummarySection, airPurifierControlsSection),
      airPurifierDialogCard.append(airPurifierDialogHeading, airPurifierLayoutBox),
      airPurifierDialog.append(airPurifierDialogCard));
    const airPurifierMetricGroups = [
        {
          key: "pm25",
          label: "PM2.5",
          roles: ["pm25"],
        },
        {
          key: "pm10",
          label: "PM10",
          roles: ["pm10"],
        },
        {
          key: "hcho",
          label: "甲醛",
          roles: ["hcho"],
        },
        {
          key: "filter",
          label: "滤芯寿命",
          roles: ["filterLife", "filterLeftTime"],
        },
        {
          key: "temperature",
          label: "温度",
          roles: ["temperature"],
        },
        {
          key: "humidity",
          label: "湿度",
          roles: ["humidity"],
        },
      ]
        .map((metricGroupSource) => ({
          ...metricGroupSource,
          candidates: metricGroupSource.roles
            .map((metricRoleName) => ({
              role: metricRoleName,
              id: airPurifierDeviceProfile?.roles?.[metricRoleName],
            }))
            .filter(
              ({ id: matchedEntityId }, candidateIndex, candidateList) =>
                matchedEntityId &&
                candidateList.findIndex(
                  (candidateEntry) => candidateEntry.id === matchedEntityId,
                ) === candidateIndex,
            )
            .map((candidateSource) => ({
              ...candidateSource,
              item: this.entityMetadata.get(candidateSource.id),
            }))
            .filter(
              ({ item: metricSensorMetadata }) =>
                metricSensorMetadata?.domain === "sensor" &&
                entityMetadataIsAvailable2(metricSensorMetadata),
            ),
        }))
        .filter(({ candidates: groupCandidates }) => groupCandidates.length),
      isMetricValueValid = (metricStateArg) => {
        const numericMetricValue = Number(metricStateArg?.state);
        return ["unknown", "unavailable"].includes(
          String(metricStateArg?.state || "").toLowerCase(),
        ) || !Number.isFinite(numericMetricValue)
          ? null
          : numericMetricValue;
      },
      lookupEntityState = (stateLookupEntity) =>
        this.states.get(stateLookupEntity?.id)?.newState ||
        this.states.get(stateLookupEntity?.id) ||
        null,
      resolveSelectedCandidate = (metricGroupItem) =>
        metricGroupItem.candidates.find(
          (candidateItem) => isMetricValueValid(lookupEntityState(candidateItem)) != null,
        ) ||
        metricGroupItem.candidates[0] ||
        null,
      visibleMetricRows = Array.from(
        {
          length: 3,
        },
        () => {
          const secondaryMetricRow = document.createElement("div");
          secondaryMetricRow.className = "hb-air-purifier-secondary-metric";
          const secondaryMetricLabel = document.createElement("small"),
            secondaryMetricValueElement = document.createElement("strong");
          return (
            secondaryMetricRow.append(secondaryMetricLabel, secondaryMetricValueElement),
            airPurifierSecondaryMetricsElement.append(secondaryMetricRow),
            {
              item: secondaryMetricRow,
              label: secondaryMetricLabel,
              value: secondaryMetricValueElement,
            }
          );
        },
      );
    airPurifierSecondaryMetricsElement.hidden = true;
    const unitSuffixLabels = {
        pm25: "μg/m³",
        pm10: "μg/m³",
        hcho: "mg/m³",
        filterLife: "%",
        filterLeftTime: "h",
        temperature: "°C",
        humidity: "%",
      },
      formatMetricValue = (metricStateValue, metricKey) => {
        if (
          ["unknown", "unavailable"].includes(String(metricStateValue?.state || "").toLowerCase())
        )
          return "--";
        const unitSuffixAliases = {
            hours: "小时",
            hour: "小时",
            days: "天",
            day: "天",
          },
          unitSuffix =
            metricStateValue?.attributes?.unit_of_measurement || unitSuffixLabels[metricKey] || "",
          displayUnit = unitSuffixAliases[String(unitSuffix).toLowerCase()] || unitSuffix;
        return "" + (metricStateValue?.state ?? "--") + (displayUnit ? " " + displayUnit : "");
      },
      stateHandlerByEntityId = new Map(),
      registerEntityStateHandler = (registeredStateEntityId, handlerCallback) => {
        registeredStateEntityId &&
          (stateHandlerByEntityId.has(registeredStateEntityId) ||
            stateHandlerByEntityId.set(registeredStateEntityId, []),
          stateHandlerByEntityId.get(registeredStateEntityId).push(handlerCallback));
      },
      flatMap = airPurifierMetricGroups.flatMap((metricGroupEntry) =>
        metricGroupEntry.candidates.map((candidateRef) => candidateRef.id),
      ),
      airQualityIndexEntityId = airPurifierDeviceProfile?.roles?.airQuality || "",
      waterHeaterExtensionControls =
        relatedEntityIds !== null
          ? this.createWaterHeaterExtensionControls(airPurifierEntityId, {
              component: airPurifierComponent,
              interactive: !isAirPurifierPreview,
              excludedEntityIds: [
                ...flatMap,
                ...(airQualityIndexEntityId ? [airQualityIndexEntityId] : []),
              ],
            })
          : null;
    if (waterHeaterExtensionControls) {
      (airPurifierDialogCard.append(waterHeaterExtensionControls),
        airPurifierDialog.classList.add("has-related-extensions"));
      for (const [handlerKey, handlerValue] of waterHeaterExtensionControls.stateHandlers || [])
        stateHandlerByEntityId.set(handlerKey, handlerValue);
    }
    const qualityLevelLabels = {
      excellent: "空气优",
      good: "空气良",
      moderate: "一般",
      fair: "一般",
      poor: "较差",
      unhealthy: "较差",
      very_poor: "很差",
    };
    let airQualityState = airQualityIndexEntityId
        ? this.states.get(airQualityIndexEntityId)?.newState ||
          this.states.get(airQualityIndexEntityId)
        : null;
    const particulateMetricGroup = airPurifierMetricGroups.find(
        (particulateGroupItem) => particulateGroupItem.key === "pm25",
      ),
      resolveQualityLevel = () => {
        const particulateSelectedCandidate = particulateMetricGroup
            ? resolveSelectedCandidate(particulateMetricGroup)
            : null,
          particulateValue = isMetricValueValid(lookupEntityState(particulateSelectedCandidate));
        return particulateValue == null
          ? {
              text: "--",
              level: "unknown",
            }
          : particulateValue <= 35
            ? {
                text: "空气优",
                level: "excellent",
              }
            : particulateValue <= 75
              ? {
                  text: "空气良",
                  level: "good",
                }
              : particulateValue <= 115
                ? {
                    text: "轻度污染",
                    level: "warning",
                  }
                : {
                    text: "空气较差",
                    level: "poor",
                  };
      },
      refreshParticulate = () => {
        const trimmedStateText = String(airQualityState?.state || "").trim(),
          lowerCase2 = trimmedStateText.toLowerCase();
        let qualityDisplayValue = ["unknown", "unavailable", ""].includes(lowerCase2)
            ? ""
            : qualityLevelLabels[lowerCase2] || trimmedStateText,
          qualityLevel = "good";
        (qualityDisplayValue
          ? /very.?poor|severe|很差|重度|严重/.test(lowerCase2) ||
            /poor|unhealthy|较差|中度/.test(lowerCase2)
            ? (qualityLevel = "poor")
            : /moderate|fair|一般|轻度|污染/.test(lowerCase2)
              ? (qualityLevel = "warning")
              : /excellent|优/.test(lowerCase2) && (qualityLevel = "excellent")
          : ({ text: qualityDisplayValue, level: qualityLevel } = resolveQualityLevel()),
          (airPurifierQualityNumberElement.textContent = qualityDisplayValue || "--"),
          (airPurifierQualityUnitElement.textContent = ""),
          airPurifierGaugeBox.style.setProperty(
            "--hb-air-purifier-progress",
            {
              excellent: 72,
              good: 58,
              warning: 42,
              poor: 26,
              unknown: 0,
            }[qualityLevel] + "%",
          ),
          airPurifierGaugeBox.classList.toggle("is-warning", qualityLevel === "warning"),
          airPurifierGaugeBox.classList.toggle("is-poor", qualityLevel === "poor"));
        const accentColor =
            {
              excellent: "#76cfa1",
              good: "#76cfa1",
              warning: "#e4b15f",
              poor: "#db7770",
              unknown: "#7d8990",
            }[qualityLevel] || "#76cfa1",
          accentSoftColor =
            {
              excellent: "rgba(118,207,161,.13)",
              good: "rgba(118,207,161,.13)",
              warning: "rgba(228,177,95,.15)",
              poor: "rgba(219,119,112,.15)",
              unknown: "rgba(125,137,144,.13)",
            }[qualityLevel] || "rgba(118,207,161,.13)";
        (airPurifierDialog.style.setProperty("--hb-air-purifier-accent", accentColor),
          airPurifierDialog.style.setProperty("--hb-air-purifier-accent-soft", accentSoftColor));
      },
      syncAirQualityState = (airQualityStateArg) => {
        ((airQualityState = airQualityStateArg), refreshParticulate());
      },
      syncAirPurifierState = (nextAirPurifierState) => {
        airPurifierStateSnapshot = nextAirPurifierState || airPurifierStateSnapshot;
        const lowerCase3 = String(airPurifierStateSnapshot?.state || "").toLowerCase(),
          isPurifierUnavailable = ["unknown", "unavailable"].includes(lowerCase3),
          isAirPurifierOn = !isPurifierUnavailable && lowerCase3 !== "off";
        ((airPurifierDisplayLabel.textContent = isAirPurifierOn ? "ON" : "OFF"),
          (airPurifierDialogStatus.textContent = isPurifierUnavailable
            ? "当前不可用"
            : isAirPurifierOn
              ? "已开启"
              : "已关闭"),
          (airPurifierDeviceStatus.textContent = isPurifierUnavailable
            ? "设备不可用"
            : isAirPurifierOn
              ? "净化中"
              : "已关闭"),
          airPurifierDialogStatus.classList.toggle("is-on", isAirPurifierOn),
          airPurifierPowerButton.classList.toggle("is-on", isAirPurifierOn),
          airPurifierPowerButton.classList.toggle("is-unavailable", isPurifierUnavailable),
          airPurifierGaugeBox.classList.toggle("is-running", isAirPurifierOn),
          airPurifierGaugeOrbitIcon.classList.toggle("is-running", isAirPurifierOn),
          airPurifierPowerButton.setAttribute("aria-pressed", String(isAirPurifierOn)),
          capabilityDetailsControls2.syncCapabilityState?.(airPurifierStateSnapshot));
      },
      refreshQualityGauge = () => {
        const slice3 = airPurifierMetricGroups
          .map((metricCandidate) => ({
            metric: metricCandidate,
            selected: resolveSelectedCandidate(metricCandidate),
          }))
          .filter(
            ({ selected: selectedMetricCandidate }) =>
              isMetricValueValid(lookupEntityState(selectedMetricCandidate)) != null,
          )
          .slice(0, visibleMetricRows.length);
        (visibleMetricRows.forEach((metricRow, metricRowIndex) => {
          const metricEntry = slice3[metricRowIndex];
          if (
            ((metricRow.item.hidden = !metricEntry),
            (metricRow.item.className =
              "hb-air-purifier-secondary-metric" +
              (metricEntry ? " hb-air-purifier-secondary-metric--" + metricEntry.metric.key : "")),
            !metricEntry)
          ) {
            ((metricRow.label.textContent = ""), (metricRow.value.textContent = ""));
            return;
          }
          const metricLabelKey = metricEntry.selected?.role || metricEntry.metric.key;
          ((metricRow.label.textContent =
            metricEntry.metric.key === "filter" && metricLabelKey === "filterLeftTime"
              ? "滤芯剩余时间"
              : metricEntry.metric.label),
            (metricRow.value.textContent = formatMetricValue(
              lookupEntityState(metricEntry.selected),
              metricLabelKey,
            )));
        }),
          (airPurifierSecondaryMetricsElement.hidden = slice3.length === 0));
      };
    (syncAirPurifierState(airPurifierStateSnapshot),
      registerEntityStateHandler(airPurifierEntityId, syncAirPurifierState));
    for (const metricGroup of airPurifierMetricGroups) {
      const syncMetricGroup = () => {
        (refreshQualityGauge(), metricGroup.key === "pm25" && refreshParticulate());
      };
      syncMetricGroup();
      for (const metricCandidateRef of metricGroup.candidates)
        registerEntityStateHandler(metricCandidateRef.id, syncMetricGroup);
    }
    (syncAirQualityState(airQualityState),
      registerEntityStateHandler(airQualityIndexEntityId, syncAirQualityState),
      airPurifierPowerButton.addEventListener("click", () =>
        capabilityDetailsControls2.querySelector<HTMLElement>(".hb-capability-power")?.click(),
      ));
    const airPurifierDialogOverlay = document.createElement("div");
    ((airPurifierDialogOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (airPurifierDialogOverlay.tabIndex = -1),
      airPurifierDialogOverlay.append(airPurifierDialog),
      this.container.append(airPurifierDialogOverlay),
      (this.detailsDialog = airPurifierDialog),
      (this.detailsStateSync = {
        dialog: airPurifierDialog,
        handlers: stateHandlerByEntityId,
      }),
      this.registerRuntimeDialogScale(
        airPurifierDialogOverlay,
        airPurifierDialog,
        920,
        waterHeaterExtensionControls ? 620 : 540,
      ),
      airPurifierDialogCloseButton.addEventListener("click", () => airPurifierDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(
        airPurifierDialogOverlay,
        airPurifierDialog,
        airPurifierDialogCard,
      ),
      airPurifierDialogOverlay.addEventListener("keydown", (airPurifierKeyEvent) => {
        airPurifierKeyEvent.key === "Escape" && airPurifierDialog.close();
      }),
      airPurifierDialog.addEventListener(
        "close",
        () => {
          (capabilityDetailsControls2.cleanupCapabilityDetails?.(),
            this.clearRuntimeDialogScale(airPurifierDialog),
            this.detailsDialog === airPurifierDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === airPurifierDialog && (this.detailsStateSync = null),
            airPurifierDialogOverlay.remove());
        },
        {
          once: true,
        },
      ),
      airPurifierDialog.show());
  }
  ["showMediaPlayerDetails"](mediaComponent, { preview: isMediaDetailsPreview = false } = {}) {
    const mediaPlayerEntityId = mediaComponent.bindings?.entity?.entityId;
    if (!mediaPlayerEntityId) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    let mediaStateSnapshot = this.states.get(mediaPlayerEntityId)?.newState ||
      this.states.get(mediaPlayerEntityId) || {
        entityId: mediaPlayerEntityId,
        state: "unknown",
        attributes: {},
      };
    const mediaDialog = document.createElement("dialog");
    mediaDialog.className = "hb-entity-details-dialog media-player-details capability-details";
    const mediaDialogCard = document.createElement("div");
    mediaDialogCard.className = "hb-entity-details-card";
    const mediaDialogHeading = document.createElement("div");
    mediaDialogHeading.className = "hb-entity-details-heading";
    const mediaDialogTitleBox = document.createElement("div"),
      mediaDialogTitle = document.createElement("strong");
    mediaDialogTitle.textContent = componentDialogTitle(
      mediaComponent,
      mediaStateSnapshot.attributes?.friendly_name || "媒体",
    );
    const mediaDialogStatus = document.createElement("span");
    mediaDialogTitleBox.append(mediaDialogTitle, mediaDialogStatus);
    const mediaSpeakerVisualElement = document.createElement("div");
    ((mediaSpeakerVisualElement.className = "hb-media-speaker-visual"),
      mediaSpeakerVisualElement.setAttribute("aria-hidden", "true"));
    const mediaSpeakerBodyIcon = document.createElement("i");
    mediaSpeakerBodyIcon.className = "hb-media-speaker-body";
    const mediaSpeakerArtworkImage = document.createElement("img");
    ((mediaSpeakerArtworkImage.className = "hb-media-speaker-artwork"),
      (mediaSpeakerArtworkImage.alt = ""),
      (mediaSpeakerArtworkImage.hidden = true));
    const mediaSpeakerLightIcon = document.createElement("i");
    ((mediaSpeakerLightIcon.className = "hb-media-speaker-light"),
      mediaSpeakerVisualElement.append(
        mediaSpeakerBodyIcon,
        mediaSpeakerArtworkImage,
        mediaSpeakerLightIcon,
      ),
      mediaDialogHeading.append(mediaDialogTitleBox, mediaSpeakerVisualElement));
    const mediaDetailsBody = document.createElement("div");
    mediaDetailsBody.className = "hb-media-player-details-body";
    const mediaNowPlayingSection = document.createElement("section");
    mediaNowPlayingSection.className = "hb-media-player-now-playing";
    const mediaPlayerArtworkImage = document.createElement("img");
    ((mediaPlayerArtworkImage.className = "hb-media-player-artwork"),
      (mediaPlayerArtworkImage.alt = ""),
      (mediaPlayerArtworkImage.hidden = true));
    const mediaPlayerCopyBox = document.createElement("div");
    mediaPlayerCopyBox.className = "hb-media-player-copy";
    const mediaTitleLabel = document.createElement("strong"),
      mediaSubtitleLabel = document.createElement("span"),
      mediaProgressRow = document.createElement("div");
    ((mediaProgressRow.className = "hb-media-player-progress"), (mediaProgressRow.hidden = true));
    const mediaProgressBar = document.createElement("progress");
    ((mediaProgressBar.max = 1), (mediaProgressBar.value = 0));
    const mediaTimeRow = document.createElement("span"),
      mediaElapsedLabel = document.createElement("time"),
      mediaDurationLabel = document.createElement("time");
    (mediaTimeRow.append(mediaElapsedLabel, mediaDurationLabel),
      mediaProgressRow.append(mediaProgressBar, mediaTimeRow),
      mediaPlayerCopyBox.append(mediaTitleLabel, mediaSubtitleLabel, mediaProgressRow),
      mediaNowPlayingSection.append(mediaPlayerArtworkImage, mediaPlayerCopyBox));
    const mediaActionsRow = document.createElement("div");
    mediaActionsRow.className = "hb-media-player-actions";
    const createMediaControlButton = (buttonLabel, mediaService, serviceOptions = {}) => {
        const mediaControlButton = document.createElement("button");
        return (
          (mediaControlButton.type = "button"),
          (mediaControlButton.textContent = buttonLabel),
          mediaControlButton.addEventListener("click", async () => {
            if (!isMediaDetailsPreview) {
              mediaControlButton.disabled = true;
              try {
                await this.callEntityService(
                  "media_player",
                  mediaService,
                  mediaPlayerEntityId,
                  serviceOptions,
                );
              } catch (mediaControlError) {
                this.options.onError?.(mediaControlError);
              } finally {
                mediaControlButton.disabled = false;
              }
            }
          }),
          mediaActionsRow.append(mediaControlButton),
          mediaControlButton
        );
      },
      mediaPreviousButton = createMediaControlButton("上一曲", "media_previous_track"),
      mediaPlayButton = createMediaControlButton("播放", "media_play_pause"),
      mediaNextButton = createMediaControlButton("下一曲", "media_next_track"),
      mediaBrowserControl = this.createMediaBrowserControl(mediaPlayerEntityId, {
        preview: isMediaDetailsPreview,
      }),
      mediaVolumeSection = document.createElement("section");
    mediaVolumeSection.className = "hb-capability-range-group";
    const mediaVolumeHeading = document.createElement("div");
    mediaVolumeHeading.className = "hb-capability-range-heading";
    const mediaVolumeTitle = document.createElement("strong");
    mediaVolumeTitle.textContent = "音量";
    const mediaVolumeOutputElement = document.createElement("output");
    mediaVolumeHeading.append(mediaVolumeTitle, mediaVolumeOutputElement);
    const mediaVolumeSlider = document.createElement("input");
    ((mediaVolumeSlider.type = "range"),
      (mediaVolumeSlider.min = "0"),
      (mediaVolumeSlider.max = "1"),
      (mediaVolumeSlider.step = ".01"),
      (mediaVolumeSlider.disabled = isMediaDetailsPreview),
      mediaVolumeSection.append(mediaVolumeHeading, mediaVolumeSlider),
      mediaNowPlayingSection.append(mediaBrowserControl.root),
      mediaDetailsBody.append(mediaNowPlayingSection, mediaActionsRow, mediaVolumeSection));
    let artworkUrl = "",
      volumeLevel = null,
      sliderDraggingValue = null,
      lastCommittedVolume = null,
      pendingVolume = null,
      isVolumeDragging = false,
      volumeCommitTimer = null,
      volumeSyncTimer = null,
      mediaDurationSeconds = null,
      initialPositionSeconds = 0,
      playbackUpdatedAtMs = null,
      isMediaPlaying = false;
    const formatMediaTime = (secondsValue) => {
        const wholeSeconds = Math.max(0, Math.floor(Number(secondsValue) || 0)),
          floor = Math.floor(wholeSeconds / 60),
          padStart = String(wholeSeconds % 60).padStart(2, "0");
        return floor + ":" + padStart;
      },
      mediaPositionTick = () => {
        if (!Number.isFinite(mediaDurationSeconds) || mediaDurationSeconds <= 0) {
          mediaProgressRow.hidden = true;
          return;
        }
        let mediaPositionSeconds = Number.isFinite(initialPositionSeconds)
          ? initialPositionSeconds
          : 0;
        (isMediaPlaying &&
          Number.isFinite(playbackUpdatedAtMs) &&
          (mediaPositionSeconds += Math.max(0, (Date.now() - playbackUpdatedAtMs) / 1000)),
          (mediaPositionSeconds = Math.max(
            0,
            Math.min(mediaDurationSeconds, mediaPositionSeconds),
          )),
          (mediaProgressRow.hidden = false),
          (mediaProgressBar.max = mediaDurationSeconds),
          (mediaProgressBar.value = mediaPositionSeconds),
          (mediaElapsedLabel.textContent = formatMediaTime(mediaPositionSeconds)),
          (mediaDurationLabel.textContent = formatMediaTime(mediaDurationSeconds)));
      },
      setInterval = window.setInterval(mediaPositionTick, 1000),
      isVolumeClose = (leftVolume, rightVolume) =>
        Number.isFinite(leftVolume) &&
        Number.isFinite(rightVolume) &&
        Math.abs(leftVolume - rightVolume) <= 0.005,
      applyVolumeValue = (rawVolume) => {
        ((volumeLevel = Math.max(0, Math.min(1, Number(rawVolume) || 0))),
          (mediaVolumeSlider.value = String(volumeLevel)),
          (mediaVolumeOutputElement.textContent = Math.round(volumeLevel * 100) + "%"));
      },
      commitVolume = async () => {
        if (
          (window.clearTimeout(volumeCommitTimer),
          (volumeCommitTimer = null),
          isVolumeDragging || pendingVolume === null)
        )
          return;
        const committedVolume = pendingVolume;
        ((pendingVolume = null), (isVolumeDragging = true));
        try {
          await this.callEntityService("media_player", "volume_set", mediaPlayerEntityId, {
            volume_level: committedVolume,
          });
        } catch (volumeCommitError) {
          ((pendingVolume = null),
            (lastCommittedVolume = null),
            window.clearTimeout(volumeSyncTimer),
            sliderDraggingValue !== null && applyVolumeValue(sliderDraggingValue),
            this.options.onError?.(volumeCommitError));
        } finally {
          ((isVolumeDragging = false),
            pendingVolume !== null &&
              !isVolumeClose(pendingVolume, committedVolume) &&
              (volumeCommitTimer = window.setTimeout(commitVolume, 140)));
        }
      },
      handleVolumeChange = () => {
        const newVolumeLevel = Math.max(0, Math.min(1, Number(mediaVolumeSlider.value) || 0));
        ((lastCommittedVolume = newVolumeLevel),
          (pendingVolume = newVolumeLevel),
          window.clearTimeout(volumeSyncTimer),
          isVolumeDragging ||
            (window.clearTimeout(volumeCommitTimer),
            (volumeCommitTimer = window.setTimeout(commitVolume, 120))));
      };
    (mediaPlayerArtworkImage.addEventListener("error", () => {
      ((mediaPlayerArtworkImage.hidden = true),
        mediaNowPlayingSection.classList.remove("has-artwork"));
    }),
      mediaPlayerArtworkImage.addEventListener("load", () => {
        ((mediaPlayerArtworkImage.hidden = false),
          mediaNowPlayingSection.classList.add("has-artwork"));
      }),
      mediaSpeakerArtworkImage.addEventListener("error", () => {
        ((mediaSpeakerArtworkImage.hidden = true),
          mediaSpeakerVisualElement.classList.remove("has-artwork"));
      }),
      mediaSpeakerArtworkImage.addEventListener("load", () => {
        ((mediaSpeakerArtworkImage.hidden = false),
          mediaSpeakerVisualElement.classList.add("has-artwork"));
      }),
      mediaVolumeSlider.addEventListener("input", () => applyVolumeValue(mediaVolumeSlider.value)),
      mediaVolumeSlider.addEventListener("change", handleVolumeChange));
    const syncMediaState = (nextMediaState) => {
      mediaStateSnapshot = nextMediaState || mediaStateSnapshot;
      const mediaAttributes = mediaStateSnapshot.attributes || {},
        mediaStateLabels = {
          off: "已关闭",
          on: "已开启",
          idle: "空闲",
          playing: "播放中",
          paused: "已暂停",
          buffering: "缓冲中",
          standby: "待机",
          unavailable: "不可用",
          unknown: "未知状态",
        },
        lowerCase4 = String(mediaStateSnapshot.state || "unknown").toLowerCase(),
        mediaSupportedFeatures = Number(mediaAttributes.supported_features || 0);
      (mediaBrowserControl.sync(mediaStateSnapshot),
        (mediaDialogStatus.textContent =
          mediaStateLabels[lowerCase4] || mediaStateSnapshot.state || "未知状态"),
        mediaSpeakerVisualElement.classList.toggle("is-playing", lowerCase4 === "playing"),
        mediaSpeakerVisualElement.classList.toggle("is-paused", lowerCase4 === "paused"),
        mediaSpeakerVisualElement.classList.toggle(
          "is-off",
          ["off", "unavailable", "unknown"].includes(lowerCase4),
        ),
        (mediaTitleLabel.textContent =
          mediaAttributes.media_title ||
          mediaAttributes.media_series_title ||
          mediaAttributes.app_name ||
          mediaAttributes.source ||
          "暂无播放内容"),
        (mediaSubtitleLabel.textContent =
          [mediaAttributes.media_artist, mediaAttributes.media_album_name]
            .filter(Boolean)
            .join(" · ") ||
          mediaAttributes.media_content_type ||
          "媒体播放器"),
        (mediaPlayButton.textContent = lowerCase4 === "playing" ? "暂停" : "播放"),
        (mediaPlayButton.disabled =
          isMediaDetailsPreview || ["off", "unavailable", "unknown"].includes(lowerCase4)),
        (mediaPreviousButton.disabled = isMediaDetailsPreview || !(mediaSupportedFeatures & 16)),
        (mediaNextButton.disabled = isMediaDetailsPreview || !(mediaSupportedFeatures & 32)),
        (mediaDurationSeconds = Number.isFinite(Number(mediaAttributes.media_duration))
          ? Number(mediaAttributes.media_duration)
          : null),
        (initialPositionSeconds = Number.isFinite(Number(mediaAttributes.media_position))
          ? Number(mediaAttributes.media_position)
          : 0));
      const mediaPositionUpdatedAtMs = Date.parse(
        String(mediaAttributes.media_position_updated_at || ""),
      );
      ((playbackUpdatedAtMs = Number.isFinite(mediaPositionUpdatedAtMs)
        ? mediaPositionUpdatedAtMs
        : null),
        (isMediaPlaying = lowerCase4 === "playing"),
        mediaPositionTick());
      const reportVolumeLevel = Number(mediaAttributes.volume_level);
      ((mediaVolumeSection.hidden = !Number.isFinite(reportVolumeLevel)),
        Number.isFinite(reportVolumeLevel) &&
          (lastCommittedVolume === null
            ? ((sliderDraggingValue = reportVolumeLevel), applyVolumeValue(reportVolumeLevel))
            : isVolumeClose(reportVolumeLevel, lastCommittedVolume)
              ? ((sliderDraggingValue = reportVolumeLevel),
                applyVolumeValue(lastCommittedVolume),
                window.clearTimeout(volumeSyncTimer),
                (volumeSyncTimer = window.setTimeout(() => {
                  lastCommittedVolume = null;
                }, 1800)))
              : window.clearTimeout(volumeSyncTimer)));
      const candidateArtworkUrl =
        [
          mediaAttributes.entity_picture_local,
          mediaAttributes.entity_picture,
          mediaAttributes.media_image_url,
        ]
          .map((rawArtworkUrl) => String(rawArtworkUrl || "").trim())
          .find(
            (artworkPath) =>
              artworkPath.startsWith("/api/media_player_proxy/") ||
              artworkPath.startsWith("/api/image_proxy/"),
          ) || "";
      candidateArtworkUrl !== artworkUrl &&
        ((artworkUrl = candidateArtworkUrl),
        (mediaPlayerArtworkImage.hidden = !artworkUrl),
        mediaNowPlayingSection.classList.toggle("has-artwork", !!artworkUrl),
        (mediaSpeakerArtworkImage.hidden = !artworkUrl),
        mediaSpeakerVisualElement.classList.toggle("has-artwork", !!artworkUrl),
        artworkUrl
          ? ((mediaPlayerArtworkImage.src = artworkUrl),
            (mediaSpeakerArtworkImage.src = artworkUrl))
          : (mediaPlayerArtworkImage.removeAttribute("src"),
            mediaSpeakerArtworkImage.removeAttribute("src")));
    };
    (syncMediaState(mediaStateSnapshot),
      mediaDialogCard.append(mediaDialogHeading, mediaDetailsBody, mediaBrowserControl.panel),
      mediaDialog.append(mediaDialogCard));
    const mediaDialogOverlay = document.createElement("div");
    ((mediaDialogOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (mediaDialogOverlay.tabIndex = -1),
      mediaDialogOverlay.append(mediaDialog),
      this.container.append(mediaDialogOverlay),
      (this.detailsDialog = mediaDialog),
      (this.detailsStateSync = {
        dialog: mediaDialog,
        handlers: new Map([[mediaPlayerEntityId, [syncMediaState]]]),
      }),
      this.registerRuntimeDialogScale(mediaDialogOverlay, mediaDialog, 540, 368),
      this.bindRuntimeDialogOutsideDismiss(mediaDialogOverlay, mediaDialog, mediaDialogCard),
      mediaDialogOverlay.addEventListener("keydown", (mediaKeyEvent) => {
        mediaKeyEvent.key === "Escape" && mediaDialog.close();
      }));
    let artworkImageRequest = null;
    (mediaDialog.addEventListener(
      "close",
      () => {
        (artworkImageRequest?.cancel(),
          mediaBrowserControl.cleanup?.(),
          window.clearInterval(setInterval),
          window.clearTimeout(volumeCommitTimer),
          window.clearTimeout(volumeSyncTimer),
          this.clearRuntimeDialogScale(mediaDialog),
          this.detailsDialog === mediaDialog && (this.detailsDialog = null),
          this.detailsStateSync?.dialog === mediaDialog && (this.detailsStateSync = null),
          mediaDialogOverlay.remove());
      },
      {
        once: true,
      },
    ),
      mediaDialog.show(),
      (artworkImageRequest = playMediaSpeakerEntrance2(mediaSpeakerVisualElement)));
  }
  ["showCustomPopup"](customPopupModule, { preview: isCustomPopupPreview = false } = {}) {
    (this.closeRuntimeDialog(),
      (this.historyPopupGeneration += 1),
      (this.activePopupId = String(customPopupModule?.id || "")),
      this.connectRuntime());
    const customPopupDialog = document.createElement("dialog");
    customPopupDialog.className = "hb-custom-popup-dialog";
    const customPopupCard = document.createElement("div");
    customPopupCard.className = "hb-custom-popup-card";
    const popupModules = customPopupModule.modules || [],
      popupLayoutMetrics = popupLayoutMetrics2(popupModules, customPopupModule.layout),
      popupWidth = popupLayoutMetrics.popupWidth,
      popupHeight = popupLayoutMetrics.popupHeight;
    ((customPopupDialog.dataset.runtimeDialogLayout =
      popupLayoutMetrics.rows === 1 && popupLayoutMetrics.columns === 2 ? "compact" : "fill"),
      (customPopupCard.style.width = popupWidth + "px"),
      (customPopupCard.style.height = popupHeight + "px"),
      (customPopupCard.style.maxHeight = "none"));
    const customPopupHeading = document.createElement("div");
    customPopupHeading.className = "hb-custom-popup-heading";
    const customPopupTitleBox = document.createElement("div"),
      customPopupTitle = document.createElement("strong");
    ((customPopupTitle.textContent = customPopupModule.name || "组合弹窗"),
      customPopupTitleBox.append(customPopupTitle));
    const customPopupCloseButton = document.createElement("button");
    ((customPopupCloseButton.type = "button"),
      (customPopupCloseButton.textContent = "×"),
      customPopupCloseButton.setAttribute("aria-label", "关闭组合弹窗"),
      customPopupHeading.append(customPopupTitleBox, customPopupCloseButton));
    const customPopupGrid = document.createElement("div");
    ((customPopupGrid.className = "hb-custom-popup-grid"),
      (customPopupGrid.style.gridTemplateColumns =
        "repeat(" + popupLayoutMetrics.columns + ", minmax(0, 1fr))"),
      (customPopupGrid.style.gridTemplateRows =
        "repeat(" + popupLayoutMetrics.rows + ", minmax(0, 1fr))"));
    const popupCleanupCallbacks = [],
      popupMediaSpeakerVisuals = [],
      popupControlPanels = [],
      popupEntranceTargets = [],
      popupRefreshCallbacks = [],
      stateHandlerByPopupEntityId = new Map(),
      registerPopupStateHandler = (popupHandlerEntityId, popupHandlerCallback) => {
        (stateHandlerByPopupEntityId.has(popupHandlerEntityId) ||
          stateHandlerByPopupEntityId.set(popupHandlerEntityId, []),
          stateHandlerByPopupEntityId.get(popupHandlerEntityId).push(popupHandlerCallback));
      };
    for (const [moduleIndex, popupModuleEntry] of popupModules.entries()) {
      const popupModuleOptions =
          popupModuleEntry.type === "capability-device"
            ? {
                ...popupModuleEntry,
                type: "generic",
              }
            : popupModuleEntry,
        moduleEntityId = String(popupModuleOptions.entityId || ""),
        popupDeviceProfile = this.deviceProfile(moduleEntityId),
        xiaomiDeviceProfile = applyXiaomiDeviceProfile2(
          {
            bindings: {
              entity: {
                entityId: popupModuleOptions.entityId,
              },
            },
            properties: {
              ...(popupModuleOptions.properties || {}),
              deviceType:
                popupModuleOptions.deviceType ||
                popupModuleOptions.properties?.deviceType ||
                "auto",
            },
          },
          popupDeviceProfile,
        ),
        moduleDeviceProfile = popupDeviceProfile
          ? {
              ...popupModuleOptions,
              properties: xiaomiDeviceProfile.properties,
              deviceType:
                xiaomiDeviceProfile.properties?.deviceType || popupModuleOptions.deviceType,
            }
          : popupModuleOptions,
        modulePlacement = popupLayoutMetrics.placements[moduleIndex] || {
          x: 0,
          y: moduleIndex,
          width: 1,
          height: 1,
        },
        moduleColumnSpan = [
          "climate",
          "air-purifier",
          "water-heater",
          "media-player",
          "camera",
          "line-chart",
        ].includes(moduleDeviceProfile.type)
          ? 2
          : modulePlacement.width,
        entityId = moduleEntityId || moduleDeviceProfile.entityId,
        moduleEntityState = this.states.get(entityId),
        popupEntityState = moduleEntityState?.newState || moduleEntityState,
        popupModuleSection = document.createElement("section");
      ((popupModuleSection.className =
        "hb-custom-popup-module hb-custom-popup-module--" +
        (moduleDeviceProfile.type || "generic")),
        (popupModuleSection.style.gridColumn =
          modulePlacement.x + 1 + " / span " + moduleColumnSpan),
        (popupModuleSection.style.gridRow =
          modulePlacement.y + 1 + " / span " + modulePlacement.height));
      const popupModuleHeading = document.createElement("div");
      popupModuleHeading.className = "hb-custom-popup-module-heading";
      const popupModuleTitle = document.createElement("strong");
      popupModuleTitle.textContent = popupModuleDialogTitle(moduleDeviceProfile, popupEntityState);
      const popupModuleStatus = document.createElement("span");
      popupModuleStatus.className =
        "hb-custom-popup-module-status type-" + (moduleDeviceProfile.type || "generic");
      const moduleStatusLabels = {
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
        generic: "设备",
      };
      if (
        ((popupModuleStatus.textContent =
          moduleStatusLabels[moduleDeviceProfile.type] || moduleStatusLabels.generic),
        popupModuleHeading.append(popupModuleTitle, popupModuleStatus),
        popupModuleSection.append(popupModuleHeading),
        moduleDeviceProfile.type === "electric-bed" &&
          popupDeviceProfile?.deviceType !== "electric-bed")
      ) {
        popupModuleSection.classList.add("hb-custom-popup-module--electric-bed");
        const bedPositionSection = document.createElement("section");
        bedPositionSection.className =
          "hb-custom-electric-bed-loading hb-climate-details-loading is-loading";
        const bedPositionIcon = document.createElement("i");
        bedPositionIcon.setAttribute("aria-hidden", "true");
        const bedPositionValueElement = document.createElement("strong");
        ((bedPositionValueElement.textContent = "—"),
          bedPositionSection.append(bedPositionIcon, bedPositionValueElement),
          popupModuleSection.append(bedPositionSection));
      } else {
        if (moduleDeviceProfile.type === "electric-bed") {
          popupModuleSection.classList.add("hb-custom-popup-module--electric-bed");
          const bedRoles = (popupDeviceProfile || this.deviceProfile(entityId))?.roles || {},
            resolveBedEntityState = (bedEntityId) => {
              const bedEntityState = this.states.get(bedEntityId);
              return (
                bedEntityState?.newState ||
                bedEntityState || {
                  entityId: bedEntityId,
                  state: "unknown",
                  attributes: {},
                }
              );
            },
            electricBedBodyElement = document.createElement("div");
          electricBedBodyElement.className = "hb-custom-electric-bed-body";
          const electricBedVisualElement = document.createElement("section");
          electricBedVisualElement.className = "hb-electric-bed-visual";
          const electricBedModelArea = document.createElement("div");
          electricBedModelArea.className = "hb-electric-bed-model";
          for (const bedModelPart of ["mattress", "back", "waist", "legs", "base"]) {
            const bedModelPartIcon = document.createElement("i");
            ((bedModelPartIcon.className = "hb-electric-bed-" + bedModelPart),
              electricBedModelArea.append(bedModelPartIcon));
          }
          const createBedAngleReadout = (anglePartName, anglePartLabel) => {
              const bedAngleReadoutElement = document.createElement("span");
              bedAngleReadoutElement.className = "hb-electric-bed-angle-readout " + anglePartName;
              const bedAngleValueElement = document.createElement("strong"),
                bedAngleCaption = document.createElement("small");
              return (
                (bedAngleCaption.textContent = anglePartLabel),
                bedAngleReadoutElement.append(bedAngleValueElement, bedAngleCaption),
                {
                  item: bedAngleReadoutElement,
                  value: bedAngleValueElement,
                }
              );
            },
            backrestReadoutElement = createBedAngleReadout("back", "靠背"),
            waistReadoutElement = createBedAngleReadout("waist", "腰部"),
            legsReadoutElement = createBedAngleReadout("legs", "腿部");
          electricBedVisualElement.append(
            electricBedModelArea,
            backrestReadoutElement.item,
            waistReadoutElement.item,
            legsReadoutElement.item,
          );
          const bedModeControl = document.createElement("section");
          bedModeControl.className = "hb-electric-bed-control hb-electric-bed-mode";
          const bedMemorySection = document.createElement("section");
          bedMemorySection.className = "hb-electric-bed-memory";
          const bedAngleControlsSection = document.createElement("section");
          bedAngleControlsSection.className = "hb-electric-bed-angle-controls";
          const bedModeValue = String(bedRoles.mode || ""),
            slice4 = [bedRoles.memory1, bedRoles.memory2].filter(Boolean).slice(0, 2),
            bedAngleControlEntries = [
              ["backrest", "靠背角度", "back"],
              ["leg", "腿部角度", "legs"],
              ["waist", "腰部角度", "waist"],
            ]
              .map(([angleRole, angleLabel, angleVisualClass]) => ({
                role: angleRole,
                label: angleLabel,
                visualClass: angleVisualClass,
                entityId: String(bedRoles[angleRole] || ""),
              }))
              .filter((angleControlItem) => angleControlItem.entityId),
            createBedControlBlock = (
              controlParentElement,
              controlLabelText,
              blockEntityId,
              controlVariantName = "",
            ) => {
              const bedControlSection = document.createElement("section");
              bedControlSection.className = "hb-electric-bed-control";
              const bedControlTitle = document.createElement("strong");
              bedControlTitle.textContent = controlLabelText;
              const capabilityDetailsControls3 = this.createCapabilityDetailsControls(
                blockEntityId,
                resolveBedEntityState(blockEntityId),
                {
                  interactive: !isCustomPopupPreview,
                  variant: controlVariantName,
                },
              );
              (capabilityDetailsControls3.classList.add("hb-electric-bed-capability"),
                bedControlSection.append(bedControlTitle, capabilityDetailsControls3),
                controlParentElement.append(bedControlSection),
                popupCleanupCallbacks.push(() =>
                  capabilityDetailsControls3.cleanupCapabilityDetails?.(),
                ),
                registerPopupStateHandler(blockEntityId, (capabilityStateArg) =>
                  capabilityDetailsControls3.syncCapabilityState?.(capabilityStateArg),
                ));
            };
          if (bedModeValue)
            createBedControlBlock(bedModeControl, "模式", bedModeValue, "electric-bed");
          else {
            const bedModeTitle = document.createElement("strong");
            bedModeTitle.textContent = "模式";
            const bedModeSelect = document.createElement("select");
            ((bedModeSelect.className = "hb-capability-select"),
              (bedModeSelect.disabled = true),
              bedModeSelect.append(new Option("未识别到模式实体")),
              bedModeControl.append(bedModeTitle, bedModeSelect));
          }
          const bedMemoryTitle = document.createElement("strong");
          bedMemoryTitle.textContent = "记忆姿势";
          const bedMemoryList = document.createElement("div");
          bedMemoryList.className = "hb-electric-bed-memory-list";
          for (let memoryIndex = 0; memoryIndex < 2; memoryIndex += 1) {
            const memorySlotEntityId = String(slice4[memoryIndex] || ""),
              memoryMetadata = memorySlotEntityId
                ? this.entityMetadata.get(memorySlotEntityId)
                : null;
            if (memorySlotEntityId.split(".", 1)[0] === "select") {
              createBedControlBlock(
                bedMemoryList,
                "记忆姿势 " + (memoryIndex + 1),
                memorySlotEntityId,
                "electric-bed-memory",
              );
              continue;
            }
            const bedMemoryButton = document.createElement("button");
            ((bedMemoryButton.type = "button"),
              (bedMemoryButton.className = "hb-electric-bed-memory-button"),
              (bedMemoryButton.textContent =
                memoryMetadata?.name ||
                memoryMetadata?.originalName ||
                "记忆姿势 " + (memoryIndex + 1)),
              (bedMemoryButton.disabled = isCustomPopupPreview || !memorySlotEntityId),
              bedMemoryButton.addEventListener("click", async () => {
                if (!(isCustomPopupPreview || !memorySlotEntityId || bedMemoryButton.disabled)) {
                  bedMemoryButton.disabled = true;
                  try {
                    (await this.callEntityService("button", "press", memorySlotEntityId),
                      bedMemoryButton.classList.add("is-success"),
                      window.setTimeout(() => bedMemoryButton.classList.remove("is-success"), 900));
                  } catch (memoryPressError) {
                    this.options.onError?.(memoryPressError);
                  } finally {
                    bedMemoryButton.disabled = isCustomPopupPreview || !memorySlotEntityId;
                  }
                }
              }),
              bedMemoryList.append(bedMemoryButton));
          }
          bedMemorySection.append(bedMemoryTitle, bedMemoryList);
          for (const bedAngleEntry of bedAngleControlEntries)
            createBedControlBlock(
              bedAngleControlsSection,
              bedAngleEntry.label,
              bedAngleEntry.entityId,
            );
          const syncBedAngle = () => {
            const bedAngleEntityIds = {
                backrest: resolveBedEntityState(bedRoles.backrest),
                leg: resolveBedEntityState(bedRoles.leg),
                waist: resolveBedEntityState(bedRoles.waist),
              },
              getBedAngleValue = (bedAngleState) => {
                const bedAngleNumber = Number(bedAngleState?.state);
                return Number.isFinite(bedAngleNumber) ? bedAngleNumber : null;
              },
              applyBedAngle = (angleRoleName, _angleElement, angleReadoutValue) => {
                const bedAngleDegrees = getBedAngleValue(bedAngleEntityIds[angleRoleName]);
                ((angleReadoutValue.textContent =
                  bedAngleDegrees === null ? "--" : Math.round(bedAngleDegrees) + "°"),
                  bedAngleDegrees !== null &&
                    electricBedModelArea.style.setProperty(
                      "--hb-bed-" +
                        (angleRoleName === "backrest" ? "backrest" : angleRoleName) +
                        "-angle",
                      bedAngleDegrees + "deg",
                    ));
              };
            (applyBedAngle("backrest", electricBedModelArea, backrestReadoutElement.value),
              applyBedAngle("waist", electricBedModelArea, waistReadoutElement.value),
              applyBedAngle("leg", electricBedModelArea, legsReadoutElement.value),
              (popupModuleStatus.textContent = "已连接"));
          };
          for (const bedAngleEntityId of [bedRoles.backrest, bedRoles.leg, bedRoles.waist].filter(
            Boolean,
          ))
            registerPopupStateHandler(bedAngleEntityId, syncBedAngle);
          (syncBedAngle(),
            electricBedBodyElement.append(
              bedModeControl,
              electricBedVisualElement,
              bedMemorySection,
              bedAngleControlsSection,
            ),
            popupModuleSection.append(electricBedBodyElement));
        } else {
          if (moduleDeviceProfile.type === "camera") {
            const popupCameraVisualElement = document.createElement("section");
            ((popupCameraVisualElement.className =
              "hb-camera-device-visual hb-custom-camera-device-visual"),
              popupCameraVisualElement.setAttribute("aria-hidden", "true"));
            const popupCameraMountIcon = document.createElement("i");
            popupCameraMountIcon.className = "hb-camera-device-mount";
            const popupCameraArmIcon = document.createElement("i");
            popupCameraArmIcon.className = "hb-camera-device-arm";
            const popupCameraBody = document.createElement("div");
            popupCameraBody.className = "hb-camera-device-body";
            const popupCameraLensIcon = document.createElement("i");
            popupCameraLensIcon.className = "hb-camera-device-lens";
            const popupCameraLedIcon = document.createElement("i");
            ((popupCameraLedIcon.className = "hb-camera-device-led"),
              popupCameraBody.append(popupCameraLensIcon, popupCameraLedIcon),
              popupCameraVisualElement.append(
                popupCameraMountIcon,
                popupCameraArmIcon,
                popupCameraBody,
              ),
              popupModuleHeading.append(popupCameraVisualElement));
            let popupCameraMotionTimeoutId = 0,
              popupCameraMotionAnimation = null,
              popupCameraPreviousAngle = 0;
            const formatPopupCameraTilt = (popupTiltAngleDeg, popupTiltScaleFactor = 0) =>
                "translateX(-50%) perspective(260px) rotateY(" +
                popupTiltAngleDeg +
                "deg) rotateZ(" +
                popupTiltAngleDeg * 0.035 +
                "deg) translateY(" +
                popupTiltScaleFactor +
                "px)",
              popupCameraTiltTick = () => {
                if (!popupCameraBody.isConnected) return;
                const popupCameraTiltAngles = [-22, -16, -9, -4, 0, 6, 12, 18, 23].filter(
                    (filteredPopupAngle) =>
                      Math.abs(filteredPopupAngle - popupCameraPreviousAngle) >= 7,
                  ),
                  popupCameraTargetAngle =
                    popupCameraTiltAngles[
                      Math.floor(Math.random() * popupCameraTiltAngles.length)
                    ] ?? 0,
                  popupCameraTiltDirection =
                    Math.sign(popupCameraTargetAngle - popupCameraPreviousAngle) || 1,
                  abs2 = Math.abs(popupCameraTargetAngle - popupCameraPreviousAngle),
                  round2 = Math.round(430 + abs2 * 18 + Math.random() * 320),
                  popupCameraOvershootAngle =
                    popupCameraTargetAngle + popupCameraTiltDirection * (1.4 + Math.random() * 2.2),
                  popupCameraJitterAmount = Math.random() * 1.4 - 0.7;
                (popupCameraLensIcon.style.setProperty(
                  "--hb-camera-lens-shift",
                  (popupCameraTargetAngle / 23) * 2.5 + "px",
                ),
                  popupCameraMotionAnimation?.cancel(),
                  (popupCameraMotionAnimation = popupCameraBody.animate(
                    [
                      {
                        transform: formatPopupCameraTilt(popupCameraPreviousAngle, 0),
                        offset: 0,
                      },
                      {
                        transform: formatPopupCameraTilt(
                          popupCameraOvershootAngle,
                          popupCameraJitterAmount,
                        ),
                        offset: 0.78,
                      },
                      {
                        transform: formatPopupCameraTilt(
                          popupCameraTargetAngle,
                          popupCameraJitterAmount * 0.35,
                        ),
                        offset: 1,
                      },
                    ],
                    {
                      duration: round2,
                      easing: "cubic-bezier(.2,.72,.22,1)",
                      fill: "forwards",
                    },
                  )),
                  popupCameraMotionAnimation.addEventListener(
                    "finish",
                    () => {
                      ((popupCameraPreviousAngle = popupCameraTargetAngle),
                        (popupCameraBody.style.transform = formatPopupCameraTilt(
                          popupCameraPreviousAngle,
                          popupCameraJitterAmount * 0.35,
                        )),
                        popupCameraMotionAnimation?.cancel(),
                        (popupCameraMotionAnimation = null));
                      const popupCameraReturnDelayMs =
                        Math.random() < 0.22
                          ? 180 + Math.random() * 260
                          : 680 + Math.random() * 1500;
                      popupCameraMotionTimeoutId = window.setTimeout(
                        popupCameraTiltTick,
                        popupCameraReturnDelayMs,
                      );
                    },
                    {
                      once: true,
                    },
                  ));
              };
            (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
              (popupCameraMotionTimeoutId = window.setTimeout(popupCameraTiltTick, 620)),
              popupCleanupCallbacks.push(() => {
                (window.clearTimeout(popupCameraMotionTimeoutId),
                  popupCameraMotionAnimation?.cancel());
              }));
            const popupCameraStage = document.createElement("div");
            ((popupCameraStage.className = "hb-custom-popup-camera-stage is-connecting"),
              (popupModuleStatus.textContent = isCustomPopupPreview ? "预览模式" : "正在连接"),
              popupModuleStatus.classList.add("is-connecting"));
            const popupCameraRevealVeilIcon = document.createElement("i");
            popupCameraRevealVeilIcon.className = "hb-camera-preview-reveal-veil";
            const popupCameraScanLineIcon = document.createElement("i");
            ((popupCameraScanLineIcon.className = "hb-camera-preview-scan-line"),
              popupCameraStage.append(popupCameraRevealVeilIcon, popupCameraScanLineIcon));
            const popupCameraPlaceholderElement = document.createElement("span");
            ((popupCameraPlaceholderElement.textContent = isCustomPopupPreview
              ? "预览模式不获取实时画面"
              : "正在载入摄像头实时预览"),
              popupCameraStage.append(popupCameraPlaceholderElement),
              isCustomPopupPreview
                ? (popupModuleStatus.classList.remove("is-connecting"),
                  popupCameraStage.classList.remove("is-connecting"),
                  popupCameraStage.classList.add("is-ready"))
                : mountCameraMedia2({
                    container: popupCameraStage,
                    entityId: entityId,
                    label: popupModuleTitle.textContent,
                    objectFit: "fill",
                    placeholder: popupCameraPlaceholderElement,
                    onReady: () => {
                      ((popupModuleStatus.textContent = "实时画面"),
                        popupModuleStatus.classList.remove("is-connecting", "is-unavailable"),
                        popupModuleStatus.classList.add("is-live"),
                        popupCameraVisualElement.classList.remove("is-unavailable"),
                        popupCameraVisualElement.classList.add("is-live"),
                        popupCameraStage.classList.remove(
                          "is-connecting",
                          "is-unavailable",
                          "is-revealing",
                        ),
                        popupCameraStage.classList.add("is-ready"));
                    },
                    onUnavailable: () => {
                      ((popupModuleStatus.textContent = "画面不可用"),
                        popupModuleStatus.classList.remove("is-connecting", "is-live"),
                        popupModuleStatus.classList.add("is-unavailable"),
                        popupCameraVisualElement.classList.remove("is-live"),
                        popupCameraVisualElement.classList.add("is-unavailable"),
                        popupCameraStage.classList.remove("is-connecting", "is-revealing"),
                        popupCameraStage.classList.add("is-unavailable"));
                    },
                    cleanup: (popupCleanupCallback) => {
                      popupCleanupCallbacks.push(popupCleanupCallback);
                    },
                  }),
              popupModuleSection.append(popupCameraStage));
          } else {
            if (moduleDeviceProfile.type === "line-chart") {
              const lineChartModuleOptions = {
                  type: "line-chart",
                  bindings: {
                    entity: {
                      entityId: entityId,
                    },
                  },
                  properties: {
                    ...syncedLineChartProperties2(
                      this.document,
                      this.page,
                      entityId,
                      moduleDeviceProfile.properties,
                    ),
                    compactDetailsHorizontal: true,
                  },
                },
                lineChartCurrentOutputElement = document.createElement("output");
              lineChartCurrentOutputElement.className = "hb-custom-line-chart-current";
              const lineChartCurrentLabel = document.createElement("strong"),
                lineChartCurrentUnitElement = document.createElement("small"),
                chartValueColor = String(
                  lineChartModuleOptions.properties?.valueColor || "#dce1e5",
                );
              ((lineChartCurrentLabel.style.color = chartValueColor),
                (lineChartCurrentUnitElement.style.color = chartValueColor),
                lineChartCurrentOutputElement.append(
                  lineChartCurrentLabel,
                  lineChartCurrentUnitElement,
                ),
                popupModuleHeading.append(lineChartCurrentOutputElement));
              const syncLineChart = (chartStateArg) => {
                  const float = Number.parseFloat(chartStateArg?.state);
                  ((lineChartCurrentLabel.textContent = Number.isFinite(float)
                    ? formatLineChartValue2(
                        float,
                        lineChartModuleOptions.properties?.statePrecision,
                      )
                    : chartStateArg?.state || "--"),
                    (lineChartCurrentUnitElement.textContent = String(
                      chartStateArg?.attributes?.unit_of_measurement || "",
                    )),
                    lineChartCurrentOutputElement.setAttribute(
                      "aria-label",
                      "当前数值 " +
                        lineChartCurrentLabel.textContent +
                        lineChartCurrentUnitElement.textContent,
                    ));
                },
                lineChartStateOptions = {
                  states: this.states,
                  history: this.historySeries,
                  renderNamespace: this.renderNamespace + "-" + moduleDeviceProfile.id,
                  interactive: true,
                  animate: false,
                };
              let lineChartPanel: ComponentControllerElement = renderLineChartDetails2(
                  lineChartModuleOptions,
                  lineChartStateOptions,
                ),
                chartRefreshTimer = 0;
              const rerenderLineChart = () => {
                  if (
                    ((chartRefreshTimer = 0),
                    !lineChartPanel?.isConnected ||
                      this.detailsStateSync?.dialog !== customPopupDialog)
                  )
                    return;
                  const nextLineChartDetails = renderLineChartDetails2(
                    lineChartModuleOptions,
                    lineChartStateOptions,
                  );
                  (lineChartPanel.cleanupLineChartHover?.(),
                    lineChartPanel.replaceWith(nextLineChartDetails),
                    (lineChartPanel = nextLineChartDetails),
                    syncLineChartState());
                },
                scheduleChartRefresh = (chartRefreshDelayMs = 700) => {
                  chartRefreshTimer ||
                    (chartRefreshTimer = window.setTimeout(
                      rerenderLineChart,
                      Math.max(0, Number(chartRefreshDelayMs) || 0),
                    ));
                };
              popupRefreshCallbacks.push(() => scheduleChartRefresh(0));
              const syncLineChartState = () => {
                lineChartCurrentOutputElement.style.setProperty(
                  "--hb-custom-chart-accent",
                  lineChartPanel.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
                );
              };
              (syncLineChart(popupEntityState),
                syncLineChartState(),
                registerPopupStateHandler(entityId, (lineChartStateArg) => {
                  (syncLineChart(lineChartStateArg),
                    lineChartPanel.syncLineChartState?.(lineChartStateArg),
                    syncLineChartState());
                }),
                popupCleanupCallbacks.push(() => {
                  (window.clearTimeout(chartRefreshTimer),
                    lineChartPanel.cleanupLineChartHover?.());
                }),
                popupModuleSection.append(lineChartPanel));
            } else {
              if (moduleDeviceProfile.type === "switch") {
                let currentModuleState = popupEntityState,
                  isModuleTogglePending = false,
                  toggleStatusValue = "idle",
                  togglePressHandler = null;
                const isMomentaryButton = entityId.split(".")[0] === "button",
                  hn3 = createSwitchVisual({
                    label: popupModuleTitle.textContent,
                    interactive: !isCustomPopupPreview,
                    momentary: isMomentaryButton,
                    onToggle: () => togglePressHandler?.(),
                  });
                hn3.visual.classList.add("hb-custom-switch-visual");
                const syncPopupModuleState = (moduleState) => {
                  currentModuleState = moduleState;
                  const isModuleUnavailable =
                      !moduleState?.state || ["unknown", "unavailable"].includes(moduleState.state),
                    isModuleOn = !isMomentaryButton && moduleState?.state === "on";
                  (hn3.sync(isModuleOn, {
                    unavailable: isModuleUnavailable,
                    pending: isModuleTogglePending && toggleStatusValue !== "success",
                    success: toggleStatusValue === "success",
                  }),
                    (popupModuleStatus.textContent = isModuleUnavailable
                      ? "当前不可用"
                      : isMomentaryButton
                        ? toggleStatusValue === "success"
                          ? "执行成功"
                          : isModuleTogglePending
                            ? "正在执行"
                            : "按下执行"
                        : isModuleOn
                          ? "已开启"
                          : "已关闭"),
                    popupModuleStatus.classList.toggle(
                      "is-live",
                      (isMomentaryButton
                        ? isModuleTogglePending || toggleStatusValue === "success"
                        : isModuleOn) && !isModuleUnavailable,
                    ));
                };
                ((togglePressHandler = async () => {
                  if (
                    isCustomPopupPreview ||
                    isModuleTogglePending ||
                    ["unknown", "unavailable"].includes(currentModuleState?.state)
                  )
                    return;
                  const previousModuleState = currentModuleState;
                  ((isModuleTogglePending = true),
                    (toggleStatusValue = "idle"),
                    syncPopupModuleState(
                      isMomentaryButton
                        ? previousModuleState
                        : {
                            ...previousModuleState,
                            state: previousModuleState?.state === "on" ? "off" : "on",
                          },
                    ));
                  try {
                    isMomentaryButton
                      ? (await this.callEntityService("button", "press", entityId),
                        (toggleStatusValue = "success"),
                        syncPopupModuleState(currentModuleState),
                        await new Promise((timeoutResolve) =>
                          window.setTimeout(timeoutResolve, 900),
                        ))
                      : await this.callEntityService("homeassistant", "toggle", entityId);
                  } catch (moduleToggleError) {
                    ((toggleStatusValue = "idle"),
                      syncPopupModuleState(previousModuleState),
                      this.options.onError?.(moduleToggleError));
                  } finally {
                    ((isModuleTogglePending = false),
                      (toggleStatusValue = "idle"),
                      syncPopupModuleState(currentModuleState));
                  }
                }),
                  syncPopupModuleState(popupEntityState),
                  registerPopupStateHandler(entityId, syncPopupModuleState),
                  popupModuleSection.append(hn3.visual));
              } else {
                if (moduleDeviceProfile.type === "light") {
                  let popupBathLightControl = null;
                  popupModuleHeading.classList.add("has-light-visual");
                  const popupLightVisualElement = document.createElement("button");
                  ((popupLightVisualElement.type = "button"),
                    (popupLightVisualElement.className = "hb-light-visual hb-custom-light-visual"),
                    (popupLightVisualElement.style.animationDelay =
                      0.08 + moduleIndex * 0.07 + "s"),
                    (popupLightVisualElement.inert = isCustomPopupPreview),
                    popupLightVisualElement.setAttribute(
                      "aria-disabled",
                      String(isCustomPopupPreview),
                    ));
                  const lightVisualAuraElement = document.createElement("div");
                  lightVisualAuraElement.className = "hb-light-visual-aura";
                  const lightVisualLampElement = document.createElement("div");
                  lightVisualLampElement.className = "hb-light-visual-lamp";
                  for (const lightVisualPart of ["cord", "shade", "bulb", "filament"]) {
                    const lightVisualPartIcon = document.createElement("i");
                    ((lightVisualPartIcon.className = "hb-light-visual-" + lightVisualPart),
                      lightVisualLampElement.append(lightVisualPartIcon));
                  }
                  (popupLightVisualElement.append(lightVisualAuraElement, lightVisualLampElement),
                    popupModuleHeading.append(popupLightVisualElement));
                  const popupLightAttributes = popupEntityState?.attributes || {},
                    supportsLightColor = lightSupportsColor2(popupLightAttributes),
                    minMiredColorKelvin =
                      Number(popupLightAttributes.min_color_temp_kelvin) ||
                      (Number.isFinite(Number(popupLightAttributes.max_mireds))
                        ? 1000000 / Number(popupLightAttributes.max_mireds)
                        : 2000),
                    maxMiredColorKelvin =
                      Number(popupLightAttributes.max_color_temp_kelvin) ||
                      (Number.isFinite(Number(popupLightAttributes.min_mireds))
                        ? 1000000 / Number(popupLightAttributes.min_mireds)
                        : 6500),
                    NaN2 =
                      Number(popupLightAttributes.color_temp_kelvin) ||
                      (Number.isFinite(Number(popupLightAttributes.color_temp))
                        ? 1000000 / Number(popupLightAttributes.color_temp)
                        : NaN),
                    lightVisualValue = {
                      isOn: popupEntityState?.state === "on",
                      brightnessPercent: Number.isFinite(Number(popupLightAttributes.brightness))
                        ? (Number(popupLightAttributes.brightness) / 255) * 100
                        : 100,
                      colorTemperatureKelvin: Number.isFinite(NaN2)
                        ? NaN2
                        : (minMiredColorKelvin + maxMiredColorKelvin) / 2,
                      colorRgb: supportsLightColor ? lightColorRgb2(popupLightAttributes) : null,
                    },
                    syncLightVisual = (lightValueInput: ComponentPayload = {}) => {
                      const lightVisualAttributes = lightValueInput.attributes || {};
                      (typeof lightValueInput.isOn == "boolean"
                        ? (lightVisualValue.isOn = lightValueInput.isOn)
                        : typeof lightValueInput.state == "string" &&
                          (lightVisualValue.isOn = lightValueInput.state === "on"),
                        Number.isFinite(Number(lightValueInput.brightnessPercent))
                          ? (lightVisualValue.brightnessPercent = Number(
                              lightValueInput.brightnessPercent,
                            ))
                          : Number.isFinite(Number(lightVisualAttributes.brightness)) &&
                            (lightVisualValue.brightnessPercent =
                              (Number(lightVisualAttributes.brightness) / 255) * 100),
                        Number.isFinite(Number(lightValueInput.colorTemperatureKelvin))
                          ? (lightVisualValue.colorTemperatureKelvin = Number(
                              lightValueInput.colorTemperatureKelvin,
                            ))
                          : Number.isFinite(Number(lightVisualAttributes.color_temp_kelvin))
                            ? (lightVisualValue.colorTemperatureKelvin = Number(
                                lightVisualAttributes.color_temp_kelvin,
                              ))
                            : Number.isFinite(Number(lightVisualAttributes.color_temp)) &&
                              (lightVisualValue.colorTemperatureKelvin =
                                1000000 / Number(lightVisualAttributes.color_temp)),
                        Object.hasOwn(lightValueInput, "colorRgb")
                          ? (lightVisualValue.colorRgb = lightValueInput.colorRgb)
                          : lightValueInput.attributes &&
                            supportsLightColor &&
                            (lightVisualValue.colorRgb = lightColorRgb2(lightVisualAttributes)));
                      const brightnessLevel = Math.max(
                          1,
                          Math.min(100, Number(lightVisualValue.brightnessPercent) || 1),
                        ),
                        colorBlendRatio =
                          (Math.max(
                            2000,
                            Math.min(6500, Number(lightVisualValue.colorTemperatureKelvin) || 4250),
                          ) -
                            2000) /
                          4500,
                        coldColorRgb = [255, 132, 42],
                        warmRgbChannel = [172, 225, 255],
                        blendedRgbChannels =
                          lightVisualValue.colorRgb ||
                          coldColorRgb.map((channelValue, rgbChannelIndex) =>
                            Math.round(
                              channelValue +
                                (warmRgbChannel[rgbChannelIndex] - channelValue) * colorBlendRatio,
                            ),
                          );
                      (popupLightVisualElement.classList.toggle("is-on", lightVisualValue.isOn),
                        popupLightVisualElement.style.setProperty(
                          "--hb-light-visual-color",
                          "rgb(" + blendedRgbChannels.join(",") + ")",
                        ),
                        popupLightVisualElement.style.setProperty(
                          "--hb-light-visual-opacity",
                          lightVisualValue.isOn
                            ? String(0.08 + (brightnessLevel / 100) * 0.92)
                            : "0",
                        ),
                        popupLightVisualElement.style.setProperty(
                          "--hb-light-visual-blur",
                          Math.round(15 + brightnessLevel * 1.14) + "px",
                        ),
                        popupLightVisualElement.style.setProperty(
                          "--hb-light-visual-scale",
                          String(0.62 + (brightnessLevel / 100) * 1.05),
                        ),
                        popupLightVisualElement.setAttribute(
                          "aria-pressed",
                          String(lightVisualValue.isOn),
                        ),
                        popupLightVisualElement.setAttribute(
                          "aria-label",
                          "" +
                            popupModuleTitle.textContent +
                            (lightVisualValue.isOn ? "已开启，点击关闭" : "已关闭，点击开启"),
                        ),
                        (popupModuleStatus.textContent = lightVisualValue.isOn
                          ? "已开启"
                          : "已关闭"),
                        popupModuleStatus.classList.toggle("is-live", lightVisualValue.isOn));
                    };
                  syncLightVisual();
                  let isLightTogglePending = false;
                  (popupLightVisualElement.addEventListener("click", async () => {
                    if (isCustomPopupPreview || isLightTogglePending) return;
                    ((isLightTogglePending = true),
                      popupLightVisualElement.setAttribute("aria-busy", "true"));
                    const isOn2 = lightVisualValue.isOn;
                    syncLightVisual({
                      isOn: !isOn2,
                    });
                    try {
                      await this.callEntityService("homeassistant", "toggle", entityId);
                    } catch (lightToggleError) {
                      (syncLightVisual({
                        isOn: isOn2,
                      }),
                        this.options.onError?.(lightToggleError));
                    } finally {
                      ((isLightTogglePending = false),
                        popupLightVisualElement.removeAttribute("aria-busy"));
                    }
                  }),
                    (popupBathLightControl = this.createLightDetailsControls(
                      entityId,
                      popupEntityState,
                      {
                        interactive: !isCustomPopupPreview,
                        onTurnOn: () => {
                          syncLightVisual({
                            isOn: true,
                          });
                        },
                        onVisualChange: syncLightVisual,
                      },
                    )),
                    popupCleanupCallbacks.push(() =>
                      popupBathLightControl?.cleanupLightDetails?.(),
                    ),
                    registerPopupStateHandler(entityId, (popupLightStateArg) => {
                      (syncLightVisual(popupLightStateArg),
                        popupBathLightControl?.syncLightState?.(popupLightStateArg));
                    }),
                    popupModuleSection.append(popupBathLightControl));
                } else {
                  if (
                    moduleDeviceProfile.type === "climate" ||
                    moduleDeviceProfile.type === "water-heater"
                  ) {
                    popupModuleSection.classList.add("hb-custom-popup-module--climate");
                    const heaterType =
                      moduleDeviceProfile.type === "water-heater"
                        ? "water-heater"
                        : resolveClimateDeviceType2(
                            {
                              properties: {
                                deviceType:
                                  moduleDeviceProfile.deviceType ||
                                  moduleDeviceProfile.properties?.deviceType ||
                                  "auto",
                                label: moduleDeviceProfile.title || "",
                              },
                            },
                            popupEntityState,
                            entityId,
                          );
                    let currentClimateState = popupEntityState;
                    const climateModeLabelOptions = {
                        entityId: entityId,
                        entityMetadata: this.entityMetadata,
                        entityTranslations: this.entityTranslations,
                      },
                      climateVisualElement = document.createElement("button");
                    ((climateVisualElement.type = "button"),
                      (climateVisualElement.className =
                        "hb-climate-visual hb-custom-climate-visual"),
                      climateVisualElement.classList.toggle(
                        "is-bath-heater",
                        heaterType === "bath-heater",
                      ),
                      climateVisualElement.classList.toggle(
                        "is-water-heater",
                        heaterType === "water-heater",
                      ),
                      heaterType === "water-heater" &&
                        popupEntranceTargets.push({
                          visual: climateVisualElement,
                          distance: 168,
                          delay: 100 + moduleIndex * 45,
                        }),
                      (climateVisualElement.inert = isCustomPopupPreview),
                      climateVisualElement.setAttribute(
                        "aria-disabled",
                        String(isCustomPopupPreview),
                      ));
                    const climateVisualUnitBox = document.createElement("div");
                    climateVisualUnitBox.className = "hb-climate-visual-unit";
                    const climateVisualBrandElement = document.createElement("span");
                    ((climateVisualBrandElement.className = "hb-climate-visual-brand"),
                      (climateVisualBrandElement.textContent =
                        heaterType === "bath-heater"
                          ? "BATH HEATER"
                          : heaterType === "water-heater"
                            ? "SMART WATER"
                            : "SMART AIR"));
                    const climateVisualDisplayElement = document.createElement("strong");
                    climateVisualDisplayElement.className = "hb-climate-visual-display";
                    const climateVisualVentBox = document.createElement("div");
                    climateVisualVentBox.className = "hb-climate-visual-vent";
                    for (
                      let climateVentUnitIndex = 0;
                      climateVentUnitIndex < 5;
                      climateVentUnitIndex += 1
                    )
                      climateVisualVentBox.append(document.createElement("i"));
                    climateVisualUnitBox.append(
                      climateVisualBrandElement,
                      climateVisualDisplayElement,
                      climateVisualVentBox,
                    );
                    const climateVisualAirflowBox = document.createElement("div");
                    climateVisualAirflowBox.className = "hb-climate-visual-airflow";
                    for (
                      let climateAirflowUnitIndex = 0;
                      climateAirflowUnitIndex < 3;
                      climateAirflowUnitIndex += 1
                    )
                      climateVisualAirflowBox.append(document.createElement("i"));
                    climateVisualElement.append(climateVisualUnitBox, climateVisualAirflowBox);
                    const syncClimateVisual = ({
                        mode: climateMode = "off",
                        visualMode: climateVisualModeState = "off",
                        running: isClimateRunning = false,
                        accentColor: climateVisualAccentColor = "#65717a",
                        targetTemperature: targetTemperature,
                      }: ClimateVisualSyncPayload = {}) => {
                        const isClimateOn = climateVisualModeState !== "off";
                        (climateVisualElement.classList.toggle("is-on", isClimateOn),
                          climateVisualElement.classList.toggle("is-running", isClimateRunning),
                          climateVisualElement.classList.toggle(
                            "is-airflow-mode",
                            heaterType === "bath-heater" &&
                              isClimateOn &&
                              bathHeaterModeUsesAirflow2(climateMode),
                          ),
                          (climateVisualElement.dataset.visualMode = climateVisualModeState),
                          climateVisualElement.style.setProperty(
                            "--hb-climate-visual-accent",
                            climateVisualAccentColor,
                          ));
                        const finite =
                          targetTemperature != null &&
                          targetTemperature !== "" &&
                          Number.isFinite(Number(targetTemperature));
                        ((climateVisualDisplayElement.textContent = isClimateOn
                          ? finite
                            ? Number(targetTemperature) + "°"
                            : climateModeLabel2(climateMode, heaterType, climateModeLabelOptions)
                          : "OFF"),
                          heaterType === "bath-heater"
                            ? climateVisualElement.setAttribute(
                                "aria-label",
                                popupModuleTitle.textContent + "，点击切换浴霸灯",
                              )
                            : (climateVisualElement.setAttribute(
                                "aria-pressed",
                                String(isClimateOn),
                              ),
                              climateVisualElement.setAttribute(
                                "aria-label",
                                "" +
                                  popupModuleTitle.textContent +
                                  (isClimateOn ? "已开启，点击关闭" : "已关闭，点击开启"),
                              )));
                      },
                      climateDetailsControls = this.createClimateDetailsControls(
                        entityId,
                        popupEntityState,
                        {
                          interactive: !isCustomPopupPreview,
                          deviceType: heaterType,
                          onVisualChange: ({
                            mode: climateStateMode,
                            visualMode: climateStateVisualMode,
                            running: isClimateStateRunning,
                            accentColor: climateStateAccent,
                            accentSoft: climateStateAccentSoft,
                            targetTemperature: climateStateTargetTemperature,
                          }) => {
                            ((popupModuleStatus.textContent = climateModeLabel2(
                              climateStateMode,
                              heaterType,
                              climateModeLabelOptions,
                            )),
                              popupModuleStatus.classList.toggle(
                                "is-live",
                                climateStateVisualMode !== "off",
                              ),
                              popupModuleStatus.classList.toggle(
                                "is-running",
                                isClimateStateRunning,
                              ),
                              popupModuleStatus.style.setProperty(
                                "--hb-climate-accent",
                                climateStateAccent,
                              ),
                              popupModuleStatus.style.setProperty(
                                "--hb-climate-accent-soft",
                                climateStateAccentSoft,
                              ),
                              syncClimateVisual({
                                mode: climateStateMode,
                                visualMode: climateStateVisualMode,
                                running: isClimateStateRunning,
                                accentColor: climateStateAccent,
                                targetTemperature: climateStateTargetTemperature,
                              }));
                          },
                        },
                      );
                    popupCleanupCallbacks.push(() =>
                      climateDetailsControls.cleanupClimateDetails?.(),
                    );
                    const bathLightEntityId =
                        heaterType === "bath-heater" ? popupDeviceProfile?.roles?.light : "",
                      bathLightMetadata = bathLightEntityId
                        ? this.entityMetadata.get(bathLightEntityId)
                        : heaterType === "bath-heater"
                          ? relatedDeviceDomainEntity2(this.entityMetadata, entityId, "light")
                          : null;
                    let moduleBathLightControl = null;
                    if (bathLightMetadata?.entityId) {
                      const moduleBathLightState = this.states.get(bathLightMetadata.entityId),
                        bathLightStateSnapshot = moduleBathLightState?.newState ||
                          moduleBathLightState || {
                            state: "unknown",
                            attributes: {},
                          };
                      ((moduleBathLightControl = this.createBathHeaterLightControl(
                        bathLightMetadata.entityId,
                        bathLightStateSnapshot,
                        {
                          interactive: !isCustomPopupPreview,
                          onStateChange: ({
                            isOn: isModuleBathLightOn,
                            unavailable: isModuleBathLightUnavailable,
                          }) => {
                            (climateVisualElement.classList.toggle(
                              "is-light-on",
                              isModuleBathLightOn && !isModuleBathLightUnavailable,
                            ),
                              climateVisualElement.setAttribute(
                                "aria-pressed",
                                String(isModuleBathLightOn && !isModuleBathLightUnavailable),
                              ));
                          },
                        },
                      )),
                        climateDetailsControls.append(moduleBathLightControl),
                        registerPopupStateHandler(
                          bathLightMetadata.entityId,
                          (moduleBathLightStateArg) =>
                            moduleBathLightControl.syncBathLightState?.(moduleBathLightStateArg),
                        ));
                    }
                    const climateChildElements = Array.from(climateDetailsControls.children),
                      climateThermostatElement = climateChildElements.find((childElement) =>
                        childElement.classList.contains("hb-climate-thermostat"),
                      ),
                      fanSliderElement = climateChildElements.find((fanSliderChildElement) =>
                        fanSliderChildElement.classList.contains("hb-climate-fan-slider"),
                      ),
                      climateLeftColumn = document.createElement("div");
                    climateLeftColumn.className = "hb-custom-climate-left";
                    const climateRightColumn = document.createElement("div");
                    ((climateRightColumn.className = "hb-custom-climate-right"),
                      climateThermostatElement &&
                        climateLeftColumn.append(climateThermostatElement),
                      fanSliderElement && climateLeftColumn.append(fanSliderElement),
                      climateRightColumn.append(
                        climateVisualElement,
                        ...climateChildElements.filter(
                          (remainingChild) =>
                            remainingChild !== climateThermostatElement &&
                            remainingChild !== fanSliderElement,
                        ),
                      ));
                    const hasPrimaryControls = !!(climateThermostatElement || fanSliderElement);
                    (climateDetailsControls.classList.toggle(
                      "without-primary-controls",
                      !hasPrimaryControls,
                    ),
                      climateDetailsControls.replaceChildren(
                        ...(hasPrimaryControls
                          ? [climateLeftColumn, climateRightColumn]
                          : [climateRightColumn]),
                      ));
                    let isClimateTogglePending = false;
                    (climateVisualElement.addEventListener("click", async () => {
                      if (heaterType === "bath-heater") {
                        moduleBathLightControl?.toggleBathLight
                          ? await moduleBathLightControl.toggleBathLight()
                          : this.options.onError?.(new Error("未找到与浴霸同设备的灯光实体。"));
                        return;
                      }
                      if (isCustomPopupPreview || isClimateTogglePending) return;
                      ((isClimateTogglePending = true),
                        climateVisualElement.setAttribute("aria-busy", "true"));
                      const previousClimateState = currentClimateState,
                        isClimatePoweredOn = climateIsPoweredOn2(previousClimateState, heaterType),
                        state2 =
                          climateDetailsControls.dataset.lastClimateMode ||
                          (isClimatePoweredOn ? previousClimateState.state : "auto"),
                        currentClimateSnapshot = {
                          state: isClimatePoweredOn ? "off" : state2,
                          attributes: {
                            ...(previousClimateState?.attributes || {}),
                            hvac_action: isClimatePoweredOn ? "off" : state2,
                          },
                        };
                      ((currentClimateState = currentClimateSnapshot),
                        climateDetailsControls.syncClimateState?.(currentClimateSnapshot));
                      try {
                        const climatePowerServicePayload = climatePowerCommand2(
                          entityId,
                          previousClimateState,
                          !isClimatePoweredOn,
                          heaterType,
                          climateDetailsControls.dataset.lastClimateMode || "",
                        );
                        await this.callEntityService(
                          climatePowerServicePayload.domain,
                          climatePowerServicePayload.service,
                          entityId,
                          climatePowerServicePayload.data,
                        );
                      } catch (climatePowerError) {
                        ((currentClimateState = previousClimateState),
                          climateDetailsControls.syncClimateState?.(previousClimateState),
                          this.options.onError?.(climatePowerError));
                      } finally {
                        ((isClimateTogglePending = false),
                          climateVisualElement.removeAttribute("aria-busy"));
                      }
                    }),
                      registerPopupStateHandler(entityId, (popupClimateStateArg) => {
                        ((currentClimateState = popupClimateStateArg),
                          climateDetailsControls.syncClimateState?.(popupClimateStateArg));
                      }),
                      popupModuleSection.append(climateDetailsControls));
                  } else {
                    if (moduleDeviceProfile.type === "cover") {
                      let currentCoverState = popupEntityState;
                      const coverAttributes = popupEntityState?.attributes || {},
                        isCoverAirer = coverComponentIsAirer2(
                          moduleDeviceProfile,
                          entityId,
                          popupEntityState,
                          this.entityMetadata,
                          this.deviceMetadata,
                        ),
                        coverSupportedFeatures = Number(coverAttributes.supported_features || 0),
                        coverIdentityText =
                          entityId +
                          " " +
                          (coverAttributes.friendly_name || "") +
                          " " +
                          (moduleDeviceProfile.title || ""),
                        finite2 =
                          Number.isFinite(Number(coverAttributes.current_tilt_position)) ||
                          !!(coverSupportedFeatures & 240),
                        test2 = /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(
                          coverIdentityText,
                        ),
                        coverKind = ["standard", "dream", "airer"].includes(
                          moduleDeviceProfile.properties?.coverKind,
                        )
                          ? moduleDeviceProfile.properties.coverKind
                          : "auto",
                        isDreamCurtain =
                          !isCoverAirer &&
                          (coverKind === "dream" || (coverKind === "auto" && (finite2 || test2))),
                        coverAirerLightEntityId =
                          (isCoverAirer
                            ? relatedAirerLightEntity2(this.entityMetadata, entityId)
                            : null
                          )?.entityId || "",
                        airerLightMetadata = coverAirerLightEntityId
                          ? this.states.get(coverAirerLightEntityId)
                          : null;
                      let coverAirerLightState =
                        airerLightMetadata?.newState || airerLightMetadata || null;
                      const coverPositionEntityId =
                          (isCoverAirer
                            ? relatedAirerPositionNumberEntity2(this.entityMetadata, entityId)
                            : null
                          )?.entityId || "",
                        coverPositionState = this.states.get(coverPositionEntityId),
                        coverCommandStateValue =
                          coverPositionState?.newState || coverPositionState || null,
                        coverPositionCommandEntityId =
                          (isCoverAirer
                            ? relatedAirerCurrentPositionSensor2(this.entityMetadata, entityId)
                            : null
                          )?.entityId || "",
                        airerMotorEntityId =
                          (isCoverAirer
                            ? relatedAirerMotorSpeedSensor2(this.entityMetadata, entityId)
                            : null
                          )?.entityId || "",
                        airerMotorState = this.states.get(airerMotorEntityId),
                        airerMotorStateValue = airerMotorState?.newState || airerMotorState || null,
                        airerRoles = isCoverAirer
                          ? relatedAirerMotorActionEntities2(this.entityMetadata, entityId)
                          : {},
                        entries = Object.fromEntries(
                          Object.entries(airerRoles).map(([airerRoleKey, airerRoleMeta]) => [
                            airerRoleKey,
                            airerRoleMeta?.entityId || "",
                          ]),
                        ),
                        coverPositionCommandStateValue = this.states.get(
                          coverPositionCommandEntityId || coverPositionEntityId,
                        ),
                        coverPositionStateValue =
                          coverPositionCommandStateValue?.newState ||
                          coverPositionCommandStateValue ||
                          null,
                        isTiltSupported = isDreamCurtain && finite2,
                        isCoverMotorReversed = coverMotorIsReversedForComponent2(
                          moduleDeviceProfile,
                          this.entityMetadata,
                          this.states,
                          entityId,
                        ),
                        openServiceByDirection = isCoverMotorReversed
                          ? "open_cover"
                          : "close_cover",
                        closeServiceByDirection = isCoverMotorReversed
                          ? "close_cover"
                          : "open_cover",
                        coverDirection = ["left", "right"].includes(
                          moduleDeviceProfile.properties?.coverDirection,
                        )
                          ? moduleDeviceProfile.properties.coverDirection
                          : "split",
                        coverLayoutBox = document.createElement("div");
                      coverLayoutBox.className = "hb-custom-cover-layout";
                      const coverVisualElement = document.createElement("button");
                      ((coverVisualElement.type = "button"),
                        (coverVisualElement.className = "hb-cover-visual hb-custom-cover-visual"),
                        (coverVisualElement.inert = isCustomPopupPreview),
                        coverVisualElement.setAttribute(
                          "aria-disabled",
                          String(isCustomPopupPreview),
                        ));
                      const coverRailIcon = document.createElement("i");
                      coverRailIcon.className = "hb-cover-visual-rail";
                      const coverLeftPanelIcon = document.createElement("i");
                      coverLeftPanelIcon.className = "hb-cover-visual-panel left";
                      const coverRightPanelIcon = document.createElement("i");
                      coverRightPanelIcon.className = "hb-cover-visual-panel right";
                      const coverSlatsBox = document.createElement("span");
                      coverSlatsBox.className = "hb-cover-visual-slats";
                      const coverSlatTotal = 13;
                      for (
                        let coverSlatPosition = 0;
                        coverSlatPosition < coverSlatTotal;
                        coverSlatPosition += 1
                      ) {
                        const coverSlatIcon = document.createElement("span");
                        coverSlatIcon.className = "hb-cover-visual-slat";
                        const coverSlatDetailIcon = document.createElement("i");
                        coverSlatIcon.style.setProperty(
                          "--hb-cover-slat-index",
                          String(coverSlatPosition),
                        );
                        const abs3 =
                          coverDirection === "right"
                            ? coverSlatTotal - 1 - coverSlatPosition
                            : coverDirection === "split"
                              ? Math.abs((coverSlatTotal - 1) / 2 - coverSlatPosition)
                              : coverSlatPosition;
                        coverSlatIcon.style.setProperty(
                          "--hb-cover-slat-delay-index",
                          String(abs3),
                        );
                        const retractedShiftPx =
                          coverDirection === "left"
                            ? -coverSlatPosition * 14.5
                            : coverDirection === "right"
                              ? (coverSlatTotal - 1 - coverSlatPosition) * 14.5
                              : coverSlatPosition <= (coverSlatTotal - 1) / 2
                                ? -coverSlatPosition * 14.5
                                : (coverSlatTotal - 1 - coverSlatPosition) * 14.5;
                        (coverSlatIcon.style.setProperty(
                          "--hb-cover-retracted-shift",
                          retractedShiftPx + "px",
                        ),
                          coverSlatIcon.append(coverSlatDetailIcon),
                          coverSlatsBox.append(coverSlatIcon));
                      }
                      const coverWindowIcon = document.createElement("i");
                      ((coverWindowIcon.className = "hb-cover-visual-window"),
                        coverVisualElement.classList.toggle("is-dream", isDreamCurtain),
                        coverVisualElement.classList.toggle("is-airer", isCoverAirer),
                        coverVisualElement.classList.add("direction-" + coverDirection),
                        coverVisualElement.append(
                          coverWindowIcon,
                          coverRailIcon,
                          coverLeftPanelIcon,
                          coverRightPanelIcon,
                          coverSlatsBox,
                        ),
                        isCoverAirer && createAirerVisual(coverVisualElement));
                      const syncAirerLight = (nextAirerLightState = coverAirerLightState) => {
                        if (!isCoverAirer) return;
                        coverAirerLightState = nextAirerLightState || coverAirerLightState;
                        const isCoverAirerLightUnavailable =
                            !coverAirerLightEntityId ||
                            ["unknown", "unavailable"].includes(
                              String(coverAirerLightState?.state || "unknown"),
                            ),
                          isCoverAirerLightOn = coverAirerLightState?.state === "on";
                        (coverVisualElement.classList.toggle(
                          "is-light-on",
                          isCoverAirerLightOn && !isCoverAirerLightUnavailable,
                        ),
                          coverVisualElement.classList.toggle(
                            "is-light-unavailable",
                            isCoverAirerLightUnavailable,
                          ),
                          (coverVisualElement.disabled =
                            isCustomPopupPreview || isCoverAirerLightUnavailable),
                          coverVisualElement.setAttribute(
                            "aria-pressed",
                            String(isCoverAirerLightOn && !isCoverAirerLightUnavailable),
                          ),
                          coverVisualElement.setAttribute(
                            "aria-label",
                            isCoverAirerLightUnavailable
                              ? "晾衣机灯光实体不可用"
                              : "晾衣机灯光" +
                                  (isCoverAirerLightOn ? "已开启，点击关闭" : "已关闭，点击开启"),
                          ));
                      };
                      syncAirerLight();
                      let airerCurrentPosition = 0;
                      const coverAirerPositionCalibration = airerPositionCalibration2(
                          this.entityMetadata,
                          this.deviceMetadata,
                          entityId,
                        ),
                        syncAirerVisual = ({
                          position: airerVisualPosition = 0,
                          state: airerVisualState = "",
                        } = {}) => {
                          const clampedAirerPosition = Math.max(
                              0,
                              Math.min(100, Number(airerVisualPosition) || 0),
                            ),
                            coverDisplayState = coverPresentationState2(
                              {
                                state: airerVisualState,
                                attributes: {
                                  current_position: clampedAirerPosition,
                                },
                              },
                              isCoverMotorReversed,
                            ),
                            coverPhysicalState = physicalCoverState2(
                              airerVisualState || currentCoverState?.state,
                              isCoverMotorReversed,
                            ),
                            isCoverFullyOpen =
                              coverPhysicalState === "open" || coverPhysicalState === "opening";
                          ((airerCurrentPosition = clampedAirerPosition),
                            coverVisualElement.style.setProperty(
                              "--hb-cover-open-position",
                              clampedAirerPosition + "%",
                            ),
                            coverVisualElement.style.setProperty(
                              "--hb-airer-drop",
                              airerVisualDrop2(clampedAirerPosition) + "px",
                            ),
                            coverVisualElement.style.setProperty(
                              "--hb-cover-panel-width",
                              45.9 - clampedAirerPosition * 0.331 + "%",
                            ),
                            coverVisualElement.style.setProperty(
                              "--hb-cover-single-panel-width",
                              91.8 - clampedAirerPosition * 0.79 + "%",
                            ),
                            coverVisualElement.style.setProperty(
                              "--hb-cover-slat-angle",
                              clampedAirerPosition * 1.8 + "deg",
                            ),
                            coverVisualElement.classList.toggle(
                              "is-tilt-reversed",
                              clampedAirerPosition > 50,
                            ),
                            coverVisualElement.classList.toggle(
                              "is-tilt-center",
                              Math.abs(clampedAirerPosition - 50) <= 2,
                            ),
                            coverVisualElement.classList.toggle(
                              "is-open",
                              isDreamCurtain
                                ? isCoverFullyOpen
                                : coverDisplayState === "open" || coverDisplayState === "opening",
                            ),
                            coverVisualElement.classList.toggle(
                              "is-moving",
                              airerVisualState === "opening" || airerVisualState === "closing",
                            ),
                            coverVisualElement.setAttribute(
                              "aria-pressed",
                              String(
                                isDreamCurtain
                                  ? isCoverFullyOpen
                                  : coverDisplayState === "open" || coverDisplayState === "opening",
                              ),
                            ),
                            isCoverAirer
                              ? (popupModuleStatus.textContent =
                                  entityStateText(coverDisplayState) ||
                                  Math.round(clampedAirerPosition) + "%")
                              : isDreamCurtain
                                ? (popupModuleStatus.textContent = dreamCurtainStatusText2(
                                    airerVisualState || currentCoverState?.state,
                                    clampedAirerPosition,
                                    isCoverMotorReversed,
                                  ))
                                : (popupModuleStatus.textContent =
                                    {
                                      open: "已打开",
                                      closed: "已关闭",
                                      opening: "正在打开",
                                      closing: "正在关闭",
                                    }[coverDisplayState] || Math.round(clampedAirerPosition) + "%"),
                            popupModuleStatus.classList.toggle(
                              "is-live",
                              isDreamCurtain
                                ? isCoverFullyOpen
                                : coverDisplayState === "open" || coverDisplayState === "opening",
                            ),
                            isCoverAirer ||
                              coverVisualElement.setAttribute(
                                "aria-label",
                                isDreamCurtain
                                  ? "" +
                                      popupModuleTitle.textContent +
                                      dreamCurtainStatusText2(
                                        airerVisualState || currentCoverState?.state,
                                        clampedAirerPosition,
                                        isCoverMotorReversed,
                                      )
                                  : "" +
                                      popupModuleTitle.textContent +
                                      (coverDisplayState === "open" ||
                                      coverDisplayState === "opening"
                                        ? "已打开，点击关闭"
                                        : "已关闭，点击打开"),
                              ));
                        },
                        coverDetailsControls = this.createCoverDetailsControls(
                          entityId,
                          popupEntityState,
                          {
                            interactive: !isCustomPopupPreview,
                            dream: isDreamCurtain,
                            airer: isCoverAirer,
                            tilt: isTiltSupported,
                            motorReversed: isCoverMotorReversed,
                            positionState: coverPositionStateValue,
                            positionCommandEntityId: coverPositionEntityId,
                            positionCommandState: coverCommandStateValue,
                            motorState: airerMotorStateValue,
                            airerActionEntityIds: entries,
                            positionCalibration: coverAirerPositionCalibration,
                            onVisualChange: syncAirerVisual,
                            onCurtainPositionChange: ({
                              retracted: isCurtainFolded,
                              moving: isAirerCurtainMoving,
                            }) => {
                              (coverVisualElement.classList.toggle(
                                "is-curtain-retracted",
                                isCurtainFolded,
                              ),
                                coverVisualElement.classList.toggle(
                                  "is-curtain-moving",
                                  isAirerCurtainMoving,
                                ),
                                (coverVisualElement.dataset.curtainRetracted =
                                  String(isCurtainFolded)),
                                isDreamCurtain &&
                                  ((popupModuleStatus.textContent =
                                    dreamCurtainStatusFromRetraction2(
                                      isCurtainFolded,
                                      isAirerCurtainMoving,
                                      airerCurrentPosition,
                                    )),
                                  popupModuleStatus.classList.toggle("is-live", isCurtainFolded)));
                            },
                          },
                        );
                      let isCoverTogglePending = false;
                      (coverVisualElement.addEventListener("click", async () => {
                        if (isCustomPopupPreview || isCoverTogglePending) return;
                        if (
                          ((isCoverTogglePending = true),
                          coverVisualElement.setAttribute("aria-busy", "true"),
                          isCoverAirer)
                        ) {
                          const previousAirerLightState = coverAirerLightState;
                          syncAirerLight({
                            ...(coverAirerLightState || {}),
                            state: coverAirerLightState?.state === "on" ? "off" : "on",
                          });
                          try {
                            await this.callEntityService(
                              "homeassistant",
                              "toggle",
                              coverAirerLightEntityId,
                            );
                          } catch (coverToggleError) {
                            (syncAirerLight(previousAirerLightState),
                              this.options.onError?.(coverToggleError));
                          } finally {
                            ((isCoverTogglePending = false),
                              coverVisualElement.removeAttribute("aria-busy"));
                          }
                          return;
                        }
                        const initialCoverPosition = airerCurrentPosition,
                          nextCurtainRetracted =
                            coverDetailsControls.isDreamCurtainRetracted?.() ??
                            coverVisualElement.dataset.curtainRetracted === "true",
                          isCoverClosed = initialCoverPosition > COVER_CLOSED_POSITION_EPSILON;
                        isDreamCurtain
                          ? coverDetailsControls.beginDreamCurtainMotion?.(!nextCurtainRetracted)
                          : coverDetailsControls.beginCoverMotion?.(
                              isCoverClosed ? 0 : 100,
                              isCoverClosed ? "closing" : "opening",
                            );
                        try {
                          await this.callEntityService(
                            "cover",
                            isDreamCurtain
                              ? dreamCurtainToggleService2(
                                  nextCurtainRetracted,
                                  closeServiceByDirection,
                                  openServiceByDirection,
                                )
                              : isCoverClosed
                                ? openServiceByDirection
                                : closeServiceByDirection,
                            entityId,
                          );
                        } catch (coverPositionError) {
                          (isDreamCurtain
                            ? (coverDetailsControls.cancelDreamCurtainMotion?.(),
                              coverDetailsControls.setDreamCurtainRetracted?.(
                                nextCurtainRetracted,
                                false,
                              ))
                            : coverDetailsControls.cancelCoverMotion?.(),
                            coverDetailsControls.syncCoverState?.(currentCoverState),
                            this.options.onError?.(coverPositionError));
                        } finally {
                          ((isCoverTogglePending = false),
                            coverVisualElement.removeAttribute("aria-busy"));
                        }
                      }),
                        registerPopupStateHandler(entityId, (coverSyncStateArg) => {
                          ((currentCoverState = coverSyncStateArg),
                            coverDetailsControls.syncCoverState?.(coverSyncStateArg));
                        }),
                        coverAirerLightEntityId &&
                          registerPopupStateHandler(coverAirerLightEntityId, syncAirerLight),
                        coverPositionCommandEntityId &&
                          registerPopupStateHandler(
                            coverPositionCommandEntityId,
                            (popupCoverCommandArg) =>
                              coverDetailsControls.syncCoverPositionState?.(popupCoverCommandArg),
                          ),
                        coverPositionEntityId &&
                          registerPopupStateHandler(
                            coverPositionEntityId,
                            (popupCoverPositionStateArg) => {
                              (coverDetailsControls.syncCoverPositionCommandState?.(
                                popupCoverPositionStateArg,
                              ),
                                coverPositionCommandEntityId ||
                                  coverDetailsControls.syncCoverPositionState?.(
                                    popupCoverPositionStateArg,
                                  ));
                            },
                          ),
                        airerMotorEntityId &&
                          registerPopupStateHandler(airerMotorEntityId, (airerMotorStateArg) =>
                            coverDetailsControls.syncAirerMotorState?.(airerMotorStateArg),
                          ),
                        popupCleanupCallbacks.push(() =>
                          coverDetailsControls.cleanupCoverDetails?.(),
                        ),
                        coverLayoutBox.append(coverVisualElement, coverDetailsControls),
                        popupModuleSection.append(coverLayoutBox));
                    } else {
                      if (moduleDeviceProfile.type === "air-purifier") {
                        let airPurifierSnapshot = popupEntityState || {
                          entityId: entityId,
                          state: "unknown",
                          attributes: {},
                        };
                        const popupAirPurifierVisualElement = document.createElement("button");
                        ((popupAirPurifierVisualElement.type = "button"),
                          (popupAirPurifierVisualElement.className =
                            "hb-air-purifier-visual hb-custom-air-purifier-visual"),
                          (popupAirPurifierVisualElement.inert = isCustomPopupPreview),
                          popupAirPurifierVisualElement.setAttribute(
                            "aria-disabled",
                            String(isCustomPopupPreview),
                          ));
                        const popupPurifierAuraIcon = document.createElement("i");
                        popupPurifierAuraIcon.className = "hb-air-purifier-visual-aura";
                        const popupPurifierAirflowIcon = document.createElement("span");
                        popupPurifierAirflowIcon.className = "hb-air-purifier-visual-airflow";
                        for (
                          let popupPurifierAirflowIndex = 0;
                          popupPurifierAirflowIndex < 4;
                          popupPurifierAirflowIndex += 1
                        )
                          popupPurifierAirflowIcon.append(document.createElement("i"));
                        const popupPurifierBodyIcon = document.createElement("span");
                        popupPurifierBodyIcon.className = "hb-air-purifier-visual-body";
                        const popupPurifierTopIcon = document.createElement("i");
                        popupPurifierTopIcon.className = "hb-air-purifier-visual-top";
                        const popupPurifierVentIcon = document.createElement("i");
                        popupPurifierVentIcon.className = "hb-air-purifier-visual-vent";
                        const popupPurifierDisplayIcon = document.createElement("span");
                        popupPurifierDisplayIcon.className = "hb-air-purifier-visual-display";
                        const popupPurifierDisplayLabel = document.createElement("strong");
                        (popupPurifierDisplayIcon.append(popupPurifierDisplayLabel),
                          popupPurifierBodyIcon.append(
                            popupPurifierTopIcon,
                            popupPurifierVentIcon,
                            popupPurifierDisplayIcon,
                          ),
                          popupAirPurifierVisualElement.append(
                            popupPurifierAuraIcon,
                            popupPurifierAirflowIcon,
                            popupPurifierBodyIcon,
                          ));
                        const capabilityDetailsControls4 = this.createCapabilityDetailsControls(
                            entityId,
                            airPurifierSnapshot,
                            {
                              interactive: !isCustomPopupPreview,
                              variant: "air-purifier",
                            },
                          ),
                          popupPurifierLayoutBox = document.createElement("div");
                        popupPurifierLayoutBox.className =
                          "hb-air-purifier-layout hb-custom-air-purifier-layout";
                        const popupPurifierSummarySection = document.createElement("section");
                        popupPurifierSummarySection.className = "hb-air-purifier-summary";
                        const popupPurifierGaugeWrapElement = document.createElement("div");
                        popupPurifierGaugeWrapElement.className = "hb-air-purifier-gauge-wrap";
                        const popupPurifierGaugeBox = document.createElement("div");
                        popupPurifierGaugeBox.className = "hb-air-purifier-gauge is-quality";
                        const popupPurifierGaugeOrbitIcon = document.createElement("i");
                        popupPurifierGaugeOrbitIcon.className = "hb-air-purifier-gauge-orbit";
                        const popupPurifierArcStartIcon = document.createElement("i");
                        popupPurifierArcStartIcon.className = "hb-air-purifier-arc-cap start";
                        const popupPurifierArcEndIcon = document.createElement("i");
                        popupPurifierArcEndIcon.className = "hb-air-purifier-arc-cap end";
                        const popupPurifierGaugeContentElement = document.createElement("div");
                        popupPurifierGaugeContentElement.className =
                          "hb-air-purifier-gauge-content";
                        const popupPurifierQualityCaption = document.createElement("small");
                        popupPurifierQualityCaption.textContent = "室内空气质量";
                        const popupPurifierQualityValueElement = document.createElement("strong"),
                          popupPurifierQualityNumberElement = document.createElement("span"),
                          popupPurifierDeviceStatus = document.createElement("span");
                        ((popupPurifierDeviceStatus.textContent = "设备状态 --"),
                          popupPurifierQualityValueElement.append(
                            popupPurifierQualityNumberElement,
                          ),
                          popupPurifierGaugeContentElement.append(
                            popupPurifierQualityCaption,
                            popupPurifierQualityValueElement,
                            popupPurifierDeviceStatus,
                          ),
                          popupPurifierGaugeBox.append(
                            popupPurifierArcStartIcon,
                            popupPurifierArcEndIcon,
                            popupPurifierGaugeContentElement,
                          ),
                          popupPurifierGaugeWrapElement.append(
                            popupPurifierGaugeOrbitIcon,
                            popupPurifierGaugeBox,
                          ));
                        const popupPurifierControlsSection = document.createElement("section");
                        ((popupPurifierControlsSection.className = "hb-air-purifier-controls-pane"),
                          popupPurifierControlsSection.append(capabilityDetailsControls4));
                        const popupMetricLabels = {
                            pm25: "PM2.5",
                            pm10: "PM10",
                            filterLife: "滤芯寿命",
                            filterLeftTime: "滤芯剩余时间",
                            hcho: "甲醛",
                            temperature: "温度",
                            humidity: "湿度",
                          },
                          airPurifierMetricCandidates = [
                            {
                              role: "pm25",
                              ids: [popupDeviceProfile?.roles?.pm25],
                            },
                            {
                              role: "pm10",
                              ids: [popupDeviceProfile?.roles?.pm10],
                            },
                            {
                              role: "filterLife",
                              ids: [
                                popupDeviceProfile?.roles?.filterLife,
                                popupDeviceProfile?.roles?.filterLeftTime,
                              ],
                            },
                            {
                              role: "hcho",
                              ids: [popupDeviceProfile?.roles?.hcho],
                            },
                            {
                              role: "temperature",
                              ids: [popupDeviceProfile?.roles?.temperature],
                            },
                            {
                              role: "humidity",
                              ids: [popupDeviceProfile?.roles?.humidity],
                            },
                          ].map((metricCandidateEntry) => ({
                            ...metricCandidateEntry,
                            ids: metricCandidateEntry.ids.filter(Boolean),
                          })),
                          resolveEntityStateById = (resolveStateEntityId) => {
                            const stateForEntity = this.states.get(resolveStateEntityId);
                            return stateForEntity?.newState || stateForEntity || null;
                          },
                          hasStateForEntity = (candidateEntityId) => {
                            const resolvedStateValue = resolveEntityStateById(candidateEntityId);
                            return (
                              resolvedStateValue &&
                              !["unknown", "unavailable"].includes(
                                String(resolvedStateValue.state || "").toLowerCase(),
                              ) &&
                              Number.isFinite(Number(resolvedStateValue.state))
                            );
                          },
                          slice5 = airPurifierMetricCandidates
                            .map((metricCandidateGroup) => ({
                              ...metricCandidateGroup,
                              id:
                                metricCandidateGroup.ids.find((candidateId) =>
                                  hasStateForEntity(candidateId),
                                ) ||
                                metricCandidateGroup.ids.find((knownEntityId) =>
                                  this.entityMetadata.has(knownEntityId),
                                ),
                            }))
                            .filter((metricCandidateFilter) => metricCandidateFilter.id)
                            .slice(0, 3),
                          popupSecondaryMetricsElement = document.createElement("div");
                        popupSecondaryMetricsElement.className =
                          "hb-air-purifier-secondary-metrics hb-custom-air-purifier-metrics";
                        for (const popupMetricEntry of slice5) {
                          const popupMetricMetadata = this.entityMetadata.get(popupMetricEntry.id),
                            popupMetricRow = document.createElement("div");
                          popupMetricRow.className =
                            "hb-air-purifier-secondary-metric hb-air-purifier-secondary-metric--" +
                            popupMetricEntry.role;
                          const popupMetricLabel = document.createElement("small");
                          popupMetricLabel.textContent =
                            popupMetricLabels[popupMetricEntry.role] || popupMetricEntry.role;
                          const popupMetricValueElement = document.createElement("strong");
                          (popupMetricRow.append(popupMetricLabel, popupMetricValueElement),
                            popupSecondaryMetricsElement.append(popupMetricRow));
                          const syncPopupMetric = (popupMetricState) => {
                            popupMetricValueElement.textContent = [
                              "unknown",
                              "unavailable",
                            ].includes(String(popupMetricState?.state || "").toLowerCase())
                              ? "--"
                              : (
                                  (popupMetricState?.state ?? "--") +
                                  " " +
                                  (popupMetricState?.attributes?.unit_of_measurement ||
                                    popupMetricMetadata?.unitOfMeasurement ||
                                    "")
                                ).trim();
                          };
                          (syncPopupMetric(resolveEntityStateById(popupMetricEntry.id)),
                            registerPopupStateHandler(popupMetricEntry.id, syncPopupMetric));
                        }
                        const airQualityRoleEntityId = popupDeviceProfile?.roles?.airQuality,
                          particulateRoleEntityId = popupDeviceProfile?.roles?.pm25,
                          syncPopupAirQuality = () => {
                            const airQualityStateValue =
                                resolveEntityStateById(airQualityRoleEntityId),
                              particulateStateValue =
                                resolveEntityStateById(particulateRoleEntityId),
                              airQualityStateText = ["unknown", "unavailable"].includes(
                                String(airQualityStateValue?.state || "").toLowerCase(),
                              )
                                ? ""
                                : String(airQualityStateValue?.state || "").trim(),
                              particulateNumericValue = Number(particulateStateValue?.state),
                              lowerCase5 = airQualityStateText.toLowerCase();
                            let airQualityDisplayText = airQualityStateText,
                              popupQualityLevel = "unknown";
                            (/excellent|优/.test(lowerCase5)
                              ? (popupQualityLevel = "excellent")
                              : /good|良/.test(lowerCase5)
                                ? (popupQualityLevel = "good")
                                : /moderate|fair|一般|轻度|污染/.test(lowerCase5)
                                  ? (popupQualityLevel = "warning")
                                  : /poor|unhealthy|较差|中度|重度|严重/.test(lowerCase5)
                                    ? (popupQualityLevel = "poor")
                                    : Number.isFinite(particulateNumericValue) &&
                                      ((popupQualityLevel =
                                        particulateNumericValue <= 15
                                          ? "excellent"
                                          : particulateNumericValue <= 35
                                            ? "good"
                                            : particulateNumericValue <= 75
                                              ? "warning"
                                              : "poor"),
                                      (airQualityDisplayText = {
                                        excellent: "空气优",
                                        good: "空气良",
                                        warning: "轻度污染",
                                        poor: "空气较差",
                                      }[popupQualityLevel])),
                              (popupPurifierQualityNumberElement.textContent =
                                airQualityDisplayText || "--"),
                              popupPurifierGaugeBox.style.setProperty(
                                "--hb-air-purifier-progress",
                                {
                                  excellent: 72,
                                  good: 58,
                                  warning: 42,
                                  poor: 26,
                                  unknown: 0,
                                }[popupQualityLevel] + "%",
                              ),
                              popupPurifierGaugeBox.classList.toggle(
                                "is-warning",
                                popupQualityLevel === "warning",
                              ),
                              popupPurifierGaugeBox.classList.toggle(
                                "is-poor",
                                popupQualityLevel === "poor",
                              ));
                            const popupPurifierAccent = {
                                excellent: "#76cfa1",
                                good: "#76cfa1",
                                warning: "#e4b15f",
                                poor: "#db7770",
                                unknown: "#7d8990",
                              }[popupQualityLevel],
                              popupPurifierAccentSoft = {
                                excellent: "rgba(118,207,161,.13)",
                                good: "rgba(118,207,161,.13)",
                                warning: "rgba(228,177,95,.15)",
                                poor: "rgba(219,119,112,.15)",
                                unknown: "rgba(125,137,144,.13)",
                              }[popupQualityLevel];
                            (popupModuleSection.style.setProperty(
                              "--hb-air-purifier-accent",
                              popupPurifierAccent,
                            ),
                              popupModuleSection.style.setProperty(
                                "--hb-air-purifier-accent-soft",
                                popupPurifierAccentSoft,
                              ));
                          };
                        (airQualityRoleEntityId &&
                          registerPopupStateHandler(airQualityRoleEntityId, syncPopupAirQuality),
                          particulateRoleEntityId &&
                            particulateRoleEntityId !== airQualityRoleEntityId &&
                            registerPopupStateHandler(particulateRoleEntityId, syncPopupAirQuality),
                          syncPopupAirQuality());
                        const syncPopupPurifierState = (
                          nextPopupPurifierState = airPurifierSnapshot,
                        ) => {
                          airPurifierSnapshot = nextPopupPurifierState || airPurifierSnapshot;
                          const lowerCase6 = String(airPurifierSnapshot?.state || "").toLowerCase(),
                            isPopupPurifierUnavailable = ["unknown", "unavailable"].includes(
                              lowerCase6,
                            ),
                            isPopupPurifierOn = !isPopupPurifierUnavailable && lowerCase6 !== "off";
                          ((popupPurifierDisplayLabel.textContent = isPopupPurifierOn
                            ? "ON"
                            : "OFF"),
                            popupAirPurifierVisualElement.classList.toggle(
                              "is-on",
                              isPopupPurifierOn,
                            ),
                            popupAirPurifierVisualElement.classList.toggle(
                              "is-unavailable",
                              isPopupPurifierUnavailable,
                            ),
                            popupAirPurifierVisualElement.setAttribute(
                              "aria-pressed",
                              String(isPopupPurifierOn),
                            ),
                            popupAirPurifierVisualElement.setAttribute(
                              "aria-label",
                              "" +
                                popupModuleTitle.textContent +
                                (isPopupPurifierOn ? "已开启，点击关闭" : "已关闭，点击开启"),
                            ),
                            (popupModuleStatus.textContent = isPopupPurifierUnavailable
                              ? "当前不可用"
                              : isPopupPurifierOn
                                ? "已开启"
                                : "已关闭"),
                            popupModuleStatus.classList.toggle("is-live", isPopupPurifierOn),
                            (popupPurifierDeviceStatus.textContent = isPopupPurifierUnavailable
                              ? "设备不可用"
                              : isPopupPurifierOn
                                ? "净化中"
                                : "已关闭"),
                            popupPurifierGaugeBox.classList.toggle("is-running", isPopupPurifierOn),
                            popupPurifierGaugeOrbitIcon.classList.toggle(
                              "is-running",
                              isPopupPurifierOn,
                            ),
                            capabilityDetailsControls4.syncCapabilityState?.(airPurifierSnapshot));
                        };
                        syncPopupPurifierState();
                        let isPopupPurifierPending = false;
                        (popupAirPurifierVisualElement.addEventListener("click", async () => {
                          if (
                            isCustomPopupPreview ||
                            isPopupPurifierPending ||
                            ["unknown", "unavailable"].includes(
                              String(airPurifierSnapshot?.state || "").toLowerCase(),
                            )
                          )
                            return;
                          ((isPopupPurifierPending = true),
                            popupAirPurifierVisualElement.setAttribute("aria-busy", "true"));
                          const previousPopupPurifierState = airPurifierSnapshot,
                            isPopupPurifierOff =
                              String(previousPopupPurifierState?.state || "").toLowerCase() ===
                              "off";
                          syncPopupPurifierState({
                            ...previousPopupPurifierState,
                            state: isPopupPurifierOff ? "on" : "off",
                          });
                          try {
                            await this.callEntityService(
                              "fan",
                              isPopupPurifierOff ? "turn_on" : "turn_off",
                              entityId,
                            );
                          } catch (popupPurifierError) {
                            (syncPopupPurifierState(previousPopupPurifierState),
                              this.options.onError?.(popupPurifierError));
                          } finally {
                            ((isPopupPurifierPending = false),
                              popupAirPurifierVisualElement.removeAttribute("aria-busy"));
                          }
                        }),
                          registerPopupStateHandler(entityId, syncPopupPurifierState),
                          popupModuleHeading.append(popupAirPurifierVisualElement),
                          popupPurifierSummarySection.append(
                            popupPurifierGaugeWrapElement,
                            popupSecondaryMetricsElement,
                          ),
                          popupPurifierLayoutBox.append(
                            popupPurifierSummarySection,
                            popupPurifierControlsSection,
                          ),
                          popupModuleSection.append(popupPurifierLayoutBox));
                      } else {
                        if (moduleDeviceProfile.type === "media-player") {
                          ((popupModuleTitle.textContent = popupModuleDialogTitle(
                            moduleDeviceProfile,
                            popupEntityState,
                            "媒体",
                          )),
                            popupModuleSection.classList.add("hb-media-player-details"));
                          const popupMediaSpeakerVisualElement = document.createElement("div");
                          ((popupMediaSpeakerVisualElement.className = "hb-media-speaker-visual"),
                            popupMediaSpeakerVisualElement.setAttribute("aria-hidden", "true"),
                            popupMediaSpeakerVisuals.push(popupMediaSpeakerVisualElement));
                          const popupSpeakerBodyIcon = document.createElement("i");
                          popupSpeakerBodyIcon.className = "hb-media-speaker-body";
                          const popupSpeakerArtworkImage = document.createElement("img");
                          ((popupSpeakerArtworkImage.className = "hb-media-speaker-artwork"),
                            (popupSpeakerArtworkImage.alt = ""),
                            (popupSpeakerArtworkImage.hidden = true));
                          const popupSpeakerLightIcon = document.createElement("i");
                          ((popupSpeakerLightIcon.className = "hb-media-speaker-light"),
                            popupMediaSpeakerVisualElement.append(
                              popupSpeakerBodyIcon,
                              popupSpeakerArtworkImage,
                              popupSpeakerLightIcon,
                            ),
                            popupModuleHeading.append(popupMediaSpeakerVisualElement));
                          const popupMediaBody = document.createElement("div");
                          popupMediaBody.className =
                            "hb-media-player-details-body hb-custom-media-player-body";
                          const popupNowPlayingSection = document.createElement("section");
                          popupNowPlayingSection.className = "hb-media-player-now-playing";
                          const popupMediaArtworkImage = document.createElement("img");
                          ((popupMediaArtworkImage.className = "hb-media-player-artwork"),
                            (popupMediaArtworkImage.alt = ""),
                            (popupMediaArtworkImage.hidden = true));
                          const popupMediaCopyBox = document.createElement("div");
                          popupMediaCopyBox.className = "hb-media-player-copy";
                          const popupMediaTitleLabel = document.createElement("strong"),
                            popupMediaSubtitleLabel = document.createElement("span"),
                            popupMediaProgressRow = document.createElement("div");
                          ((popupMediaProgressRow.className = "hb-media-player-progress"),
                            (popupMediaProgressRow.hidden = true));
                          const popupMediaProgressBar = document.createElement("progress");
                          ((popupMediaProgressBar.max = 1), (popupMediaProgressBar.value = 0));
                          const popupMediaTimeRow = document.createElement("span"),
                            popupMediaElapsedLabel = document.createElement("time"),
                            popupMediaDurationLabel = document.createElement("time");
                          (popupMediaTimeRow.append(
                            popupMediaElapsedLabel,
                            popupMediaDurationLabel,
                          ),
                            popupMediaProgressRow.append(popupMediaProgressBar, popupMediaTimeRow),
                            popupMediaCopyBox.append(
                              popupMediaTitleLabel,
                              popupMediaSubtitleLabel,
                              popupMediaProgressRow,
                            ),
                            popupNowPlayingSection.append(
                              popupMediaArtworkImage,
                              popupMediaCopyBox,
                            ));
                          const popupMediaActionsRow = document.createElement("div");
                          popupMediaActionsRow.className = "hb-media-player-actions";
                          const createPopupMediaButton = (popupButtonLabel, popupMediaService) => {
                              const popupMediaButton = document.createElement("button");
                              return (
                                (popupMediaButton.type = "button"),
                                (popupMediaButton.textContent = popupButtonLabel),
                                popupMediaButton.addEventListener("click", async () => {
                                  if (!isCustomPopupPreview) {
                                    popupMediaButton.disabled = true;
                                    try {
                                      await this.callEntityService(
                                        "media_player",
                                        popupMediaService,
                                        entityId,
                                      );
                                    } catch (popupMediaControlError) {
                                      this.options.onError?.(popupMediaControlError);
                                    } finally {
                                      popupMediaButton.disabled = false;
                                    }
                                  }
                                }),
                                popupMediaActionsRow.append(popupMediaButton),
                                popupMediaButton
                              );
                            },
                            popupMediaPreviousButton = createPopupMediaButton(
                              "上一曲",
                              "media_previous_track",
                            ),
                            popupMediaPlayButton = createPopupMediaButton(
                              "播放",
                              "media_play_pause",
                            ),
                            popupMediaNextButton = createPopupMediaButton(
                              "下一曲",
                              "media_next_track",
                            ),
                            mediaBrowserControl2 = this.createMediaBrowserControl(entityId, {
                              preview: isCustomPopupPreview,
                            });
                          popupCleanupCallbacks.push(() => mediaBrowserControl2.cleanup?.());
                          const popupMediaVolumeSection = document.createElement("section");
                          popupMediaVolumeSection.className = "hb-capability-range-group";
                          const popupMediaVolumeHeading = document.createElement("div");
                          popupMediaVolumeHeading.className = "hb-capability-range-heading";
                          const popupMediaVolumeTitle = document.createElement("strong");
                          popupMediaVolumeTitle.textContent = "音量";
                          const popupMediaVolumeOutputElement = document.createElement("output");
                          popupMediaVolumeHeading.append(
                            popupMediaVolumeTitle,
                            popupMediaVolumeOutputElement,
                          );
                          const popupMediaVolumeSlider = document.createElement("input");
                          ((popupMediaVolumeSlider.type = "range"),
                            (popupMediaVolumeSlider.min = "0"),
                            (popupMediaVolumeSlider.max = "1"),
                            (popupMediaVolumeSlider.step = ".01"),
                            (popupMediaVolumeSlider.disabled = isCustomPopupPreview),
                            popupMediaVolumeSection.append(
                              popupMediaVolumeHeading,
                              popupMediaVolumeSlider,
                            ));
                          let popupArtworkUrl = "",
                            popupMediaDuration = null,
                            popupInitialPosition = 0,
                            popupPlaybackUpdatedAtMs = null,
                            isPopupVolumeDragging = false,
                            popupVolumeLevel = null,
                            popupDraggingValue = null,
                            popupLastCommittedVolume = null,
                            popupPendingVolume = null,
                            isPopupVolumeSyncing = false,
                            popupVolumeCommitTimer = null,
                            popupVolumeSyncTimer = null;
                          const formatPopupMediaTime = (popupSecondsValue) => {
                              const popupWholeSeconds = Math.max(
                                0,
                                Math.floor(Number(popupSecondsValue) || 0),
                              );
                              return (
                                Math.floor(popupWholeSeconds / 60) +
                                ":" +
                                String(popupWholeSeconds % 60).padStart(2, "0")
                              );
                            },
                            popupMediaPositionTick = () => {
                              if (!Number.isFinite(popupMediaDuration) || popupMediaDuration <= 0) {
                                popupMediaProgressRow.hidden = true;
                                return;
                              }
                              let popupMediaPositionSeconds = Number.isFinite(popupInitialPosition)
                                ? popupInitialPosition
                                : 0;
                              (isPopupVolumeDragging &&
                                Number.isFinite(popupPlaybackUpdatedAtMs) &&
                                (popupMediaPositionSeconds += Math.max(
                                  0,
                                  (Date.now() - popupPlaybackUpdatedAtMs) / 1000,
                                )),
                                (popupMediaPositionSeconds = Math.max(
                                  0,
                                  Math.min(popupMediaDuration, popupMediaPositionSeconds),
                                )),
                                (popupMediaProgressRow.hidden = false),
                                (popupMediaProgressBar.max = popupMediaDuration),
                                (popupMediaProgressBar.value = popupMediaPositionSeconds),
                                (popupMediaElapsedLabel.textContent =
                                  formatPopupMediaTime(popupMediaPositionSeconds)),
                                (popupMediaDurationLabel.textContent =
                                  formatPopupMediaTime(popupMediaDuration)));
                            },
                            setInterval2 = window.setInterval(popupMediaPositionTick, 1000);
                          (popupCleanupCallbacks.push(() => {
                            (window.clearInterval(setInterval2),
                              window.clearTimeout(popupVolumeCommitTimer),
                              window.clearTimeout(popupVolumeSyncTimer));
                          }),
                            popupMediaArtworkImage.addEventListener("error", () => {
                              ((popupMediaArtworkImage.hidden = true),
                                popupNowPlayingSection.classList.remove("has-artwork"));
                            }),
                            popupMediaArtworkImage.addEventListener("load", () => {
                              ((popupMediaArtworkImage.hidden = false),
                                popupNowPlayingSection.classList.add("has-artwork"));
                            }),
                            popupSpeakerArtworkImage.addEventListener("error", () => {
                              ((popupSpeakerArtworkImage.hidden = true),
                                popupMediaSpeakerVisualElement.classList.remove("has-artwork"));
                            }),
                            popupSpeakerArtworkImage.addEventListener("load", () => {
                              ((popupSpeakerArtworkImage.hidden = false),
                                popupMediaSpeakerVisualElement.classList.add("has-artwork"));
                            }));
                          const isPopupVolumeClose = (popupLeftVolume, popupRightVolume) =>
                              Number.isFinite(popupLeftVolume) &&
                              Number.isFinite(popupRightVolume) &&
                              Math.abs(popupLeftVolume - popupRightVolume) <= 0.005,
                            applyPopupVolume = (popupRawVolume) => {
                              ((popupVolumeLevel = Math.max(
                                0,
                                Math.min(1, Number(popupRawVolume) || 0),
                              )),
                                (popupMediaVolumeSlider.value = String(popupVolumeLevel)),
                                (popupMediaVolumeOutputElement.textContent =
                                  Math.round(popupVolumeLevel * 100) + "%"));
                            },
                            commitPopupVolume = async () => {
                              if (
                                (window.clearTimeout(popupVolumeCommitTimer),
                                (popupVolumeCommitTimer = null),
                                isPopupVolumeSyncing || popupPendingVolume === null)
                              )
                                return;
                              const popupCommittedVolume = popupPendingVolume;
                              ((popupPendingVolume = null), (isPopupVolumeSyncing = true));
                              try {
                                await this.callEntityService(
                                  "media_player",
                                  "volume_set",
                                  entityId,
                                  {
                                    volume_level: popupCommittedVolume,
                                  },
                                );
                              } catch (popupVolumeError) {
                                ((popupPendingVolume = null),
                                  (popupLastCommittedVolume = null),
                                  window.clearTimeout(popupVolumeSyncTimer),
                                  popupDraggingValue !== null &&
                                    applyPopupVolume(popupDraggingValue),
                                  this.options.onError?.(popupVolumeError));
                              } finally {
                                ((isPopupVolumeSyncing = false),
                                  popupPendingVolume !== null &&
                                    !isPopupVolumeClose(popupPendingVolume, popupCommittedVolume) &&
                                    (popupVolumeCommitTimer = window.setTimeout(
                                      commitPopupVolume,
                                      140,
                                    )));
                              }
                            },
                            handlePopupVolumeChange = () => {
                              const popupNewVolumeLevel = Math.max(
                                0,
                                Math.min(1, Number(popupMediaVolumeSlider.value) || 0),
                              );
                              ((popupLastCommittedVolume = popupNewVolumeLevel),
                                (popupPendingVolume = popupNewVolumeLevel),
                                window.clearTimeout(popupVolumeSyncTimer),
                                isPopupVolumeSyncing ||
                                  (window.clearTimeout(popupVolumeCommitTimer),
                                  (popupVolumeCommitTimer = window.setTimeout(
                                    commitPopupVolume,
                                    120,
                                  ))));
                            };
                          (popupMediaVolumeSlider.addEventListener("input", () =>
                            applyPopupVolume(popupMediaVolumeSlider.value),
                          ),
                            popupMediaVolumeSlider.addEventListener(
                              "change",
                              handlePopupVolumeChange,
                            ));
                          const syncPopupMediaState = (nextPopupMediaState) => {
                            const popupMediaAttributes = nextPopupMediaState?.attributes || {},
                              lowerCase7 = String(
                                nextPopupMediaState?.state || "unknown",
                              ).toLowerCase(),
                              popupMediaSupportedFeatures = Number(
                                popupMediaAttributes.supported_features || 0,
                              );
                            mediaBrowserControl2.sync(nextPopupMediaState);
                            const popupMediaStateLabels = {
                              off: "已关闭",
                              on: "已开启",
                              idle: "空闲",
                              playing: "播放中",
                              paused: "已暂停",
                              buffering: "缓冲中",
                              standby: "待机",
                              unavailable: "不可用",
                              unknown: "未知状态",
                            };
                            ((popupModuleStatus.textContent =
                              popupMediaStateLabels[lowerCase7] ||
                              nextPopupMediaState?.state ||
                              "未知状态"),
                              popupModuleStatus.classList.toggle(
                                "is-live",
                                ["playing", "paused"].includes(lowerCase7),
                              ),
                              (popupMediaTitleLabel.textContent =
                                popupMediaAttributes.media_title ||
                                popupMediaAttributes.media_series_title ||
                                popupMediaAttributes.app_name ||
                                popupMediaAttributes.source ||
                                "暂无播放内容"),
                              (popupMediaSubtitleLabel.textContent =
                                [
                                  popupMediaAttributes.media_artist,
                                  popupMediaAttributes.media_album_name,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") ||
                                popupMediaAttributes.media_content_type ||
                                "媒体播放器"),
                              (popupMediaPlayButton.textContent =
                                lowerCase7 === "playing" ? "暂停" : "播放"),
                              (popupMediaPlayButton.disabled =
                                isCustomPopupPreview ||
                                ["off", "unavailable", "unknown"].includes(lowerCase7)),
                              (popupMediaPreviousButton.disabled =
                                isCustomPopupPreview || !(popupMediaSupportedFeatures & 16)),
                              (popupMediaNextButton.disabled =
                                isCustomPopupPreview || !(popupMediaSupportedFeatures & 32)),
                              popupMediaSpeakerVisualElement.classList.toggle(
                                "is-playing",
                                lowerCase7 === "playing",
                              ),
                              popupMediaSpeakerVisualElement.classList.toggle(
                                "is-paused",
                                lowerCase7 === "paused",
                              ),
                              popupMediaSpeakerVisualElement.classList.toggle(
                                "is-off",
                                ["off", "unavailable", "unknown"].includes(lowerCase7),
                              ),
                              (popupMediaDuration = Number.isFinite(
                                Number(popupMediaAttributes.media_duration),
                              )
                                ? Number(popupMediaAttributes.media_duration)
                                : null),
                              (popupInitialPosition = Number.isFinite(
                                Number(popupMediaAttributes.media_position),
                              )
                                ? Number(popupMediaAttributes.media_position)
                                : 0));
                            const popupPositionUpdatedAtMs = Date.parse(
                              String(popupMediaAttributes.media_position_updated_at || ""),
                            );
                            ((popupPlaybackUpdatedAtMs = Number.isFinite(popupPositionUpdatedAtMs)
                              ? popupPositionUpdatedAtMs
                              : null),
                              (isPopupVolumeDragging = lowerCase7 === "playing"),
                              popupMediaPositionTick());
                            const popupReportVolumeLevel = Number(
                              popupMediaAttributes.volume_level,
                            );
                            ((popupMediaVolumeSection.hidden =
                              !Number.isFinite(popupReportVolumeLevel)),
                              Number.isFinite(popupReportVolumeLevel) &&
                                (popupLastCommittedVolume === null
                                  ? ((popupDraggingValue = popupReportVolumeLevel),
                                    applyPopupVolume(popupReportVolumeLevel))
                                  : isPopupVolumeClose(
                                        popupReportVolumeLevel,
                                        popupLastCommittedVolume,
                                      )
                                    ? ((popupDraggingValue = popupReportVolumeLevel),
                                      applyPopupVolume(popupLastCommittedVolume),
                                      window.clearTimeout(popupVolumeSyncTimer),
                                      (popupVolumeSyncTimer = window.setTimeout(() => {
                                        popupLastCommittedVolume = null;
                                      }, 1800)))
                                    : window.clearTimeout(popupVolumeSyncTimer)));
                            const popupCandidateArtworkUrl =
                              [
                                popupMediaAttributes.entity_picture_local,
                                popupMediaAttributes.entity_picture,
                                popupMediaAttributes.media_image_url,
                              ]
                                .map((popupRawArtworkUrl) =>
                                  String(popupRawArtworkUrl || "").trim(),
                                )
                                .find(
                                  (popupArtworkPath) =>
                                    popupArtworkPath.startsWith("/api/media_player_proxy/") ||
                                    popupArtworkPath.startsWith("/api/image_proxy/"),
                                ) || "";
                            popupCandidateArtworkUrl !== popupArtworkUrl &&
                              ((popupArtworkUrl = popupCandidateArtworkUrl),
                              (popupMediaArtworkImage.hidden = !popupArtworkUrl),
                              (popupSpeakerArtworkImage.hidden = !popupArtworkUrl),
                              popupNowPlayingSection.classList.toggle(
                                "has-artwork",
                                !!popupArtworkUrl,
                              ),
                              popupMediaSpeakerVisualElement.classList.toggle(
                                "has-artwork",
                                !!popupArtworkUrl,
                              ),
                              popupArtworkUrl
                                ? ((popupMediaArtworkImage.src = popupArtworkUrl),
                                  (popupSpeakerArtworkImage.src = popupArtworkUrl))
                                : (popupMediaArtworkImage.removeAttribute("src"),
                                  popupSpeakerArtworkImage.removeAttribute("src")));
                          };
                          (popupNowPlayingSection.append(mediaBrowserControl2.root),
                            syncPopupMediaState(popupEntityState),
                            registerPopupStateHandler(entityId, syncPopupMediaState),
                            popupMediaBody.append(
                              popupNowPlayingSection,
                              popupMediaActionsRow,
                              popupMediaVolumeSection,
                            ),
                            popupControlPanels.push(mediaBrowserControl2.panel),
                            popupModuleSection.append(popupMediaBody));
                        } else {
                          const popupModuleStatusNote = document.createElement("p");
                          popupModuleStatusNote.className = "hb-custom-popup-generic";
                          const syncPopupModuleStatus = (popupModuleStateArg) => {
                            popupModuleStatusNote.textContent =
                              "当前状态：" + (popupModuleStateArg?.state ?? "暂无状态");
                          };
                          (syncPopupModuleStatus(popupEntityState),
                            registerPopupStateHandler(entityId, syncPopupModuleStatus),
                            popupModuleSection.append(popupModuleStatusNote));
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
      customPopupGrid.append(popupModuleSection);
    }
    if (!(customPopupModule.modules || []).length) {
      const popupEmptyNote = document.createElement("p");
      ((popupEmptyNote.className = "hb-custom-popup-generic"),
        (popupEmptyNote.textContent = "这个组合弹窗还没有添加模块。"),
        customPopupGrid.append(popupEmptyNote));
    }
    (customPopupCard.append(customPopupHeading, customPopupGrid, ...popupControlPanels),
      customPopupDialog.append(customPopupCard));
    const customPopupOverlay = document.createElement("div");
    ((customPopupOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (customPopupOverlay.tabIndex = -1),
      customPopupOverlay.append(customPopupDialog),
      this.container.append(customPopupOverlay),
      (this.detailsDialog = customPopupDialog));
    const popupStructureKey = (popupStructureEntry) =>
        popupStructureEntry
          .map((popupStructureModule) => {
            const popupStructureProfile =
                popupStructureModule.type === "electric-bed"
                  ? this.deviceProfile(this.runtimeEntityId(popupStructureModule.entityId))
                  : null,
              popupRoleIdAliases =
                popupStructureProfile?.deviceType === "electric-bed"
                  ? popupStructureProfile.roles || {}
                  : {};
            return [
              popupStructureModule.id,
              popupStructureProfile?.deviceType || popupStructureModule.type || "generic",
              "backrest",
              "leg",
              "waist",
              "mode",
              "memory1",
              "memory2",
            ]
              .map((popupRoleId) =>
                String(
                  popupRoleId === popupStructureModule.id
                    ? popupStructureModule.id
                    : popupRoleIdAliases[popupRoleId] || "",
                ),
              )
              .join(":");
          })
          .join("|"),
      previousStructureKey = popupStructureKey(popupModules);
    ((this.detailsStateSync = {
      dialog: customPopupDialog,
      handlers: stateHandlerByPopupEntityId,
      refreshHistory: () =>
        popupRefreshCallbacks.forEach((popupRefreshCallback) => popupRefreshCallback()),
      refreshEntityCatalog: () => {
        this.detailsDialog !== customPopupDialog ||
          !customPopupDialog.open ||
          (popupStructureKey(popupModules) !== previousStructureKey &&
            this.showCustomPopup(customPopupModule, {
              preview: isCustomPopupPreview,
            }));
      },
    }),
      this.registerRuntimeDialogScale(
        customPopupOverlay,
        customPopupDialog,
        popupWidth,
        popupHeight,
      ),
      customPopupCloseButton.addEventListener("click", () => customPopupDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(customPopupOverlay, customPopupDialog, customPopupCard),
      customPopupOverlay.addEventListener("keydown", (customPopupKeyEvent) => {
        customPopupKeyEvent.key === "Escape" && customPopupDialog.close();
      }),
      customPopupDialog.addEventListener(
        "close",
        () => {
          for (const popupCleanupFn of popupCleanupCallbacks.splice(0)) popupCleanupFn();
          (this.clearRuntimeDialogScale(customPopupDialog),
            this.detailsDialog === customPopupDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === customPopupDialog && (this.detailsStateSync = null),
            !this.replacingDocument &&
              this.activePopupId === String(customPopupModule?.id || "") &&
              ((this.activePopupId = null),
              (this.historyPopupGeneration += 1),
              this.connectRuntime(),
              this.refreshHistorySeries()),
            customPopupOverlay.remove());
        },
        {
          once: true,
        },
      ),
      customPopupDialog.show(),
      this.refreshHistorySeries());
    for (const popupSpeakerVisualElement of popupMediaSpeakerVisuals) {
      const mediaSpeakerAnimation = playMediaSpeakerEntrance2(popupSpeakerVisualElement);
      mediaSpeakerAnimation && popupCleanupCallbacks.push(() => mediaSpeakerAnimation.cancel());
    }
    for (const popupEntranceTarget of popupEntranceTargets) {
      const popupEntranceAnimation = playFixedDeviceDropEntrance2(
        popupEntranceTarget.visual,
        popupEntranceTarget,
      );
      popupEntranceAnimation && popupCleanupCallbacks.push(() => popupEntranceAnimation.cancel());
    }
  }
  ["createLightDetailsControls"](
    lightEntityId,
    lightState,
    {
      interactive: isLightInteractive = true,
      onTurnOn: onLightTurnOn = null,
      onVisualChange: onLightVisualChange = null,
    } = {},
  ): ComponentControllerElement {
    const lightStateAttributes = lightState?.attributes || {},
      startsWith3 = lightEntityId.startsWith("light."),
      hasColorPicker = startsWith3 && lightSupportsColor2(lightStateAttributes),
      { brightness: supportsBrightness, colorTemperature: supportsColorTemperature } =
        lightRealtimeCapabilities2(lightEntityId, lightState),
      supportsColorTemperatureControl = supportsColorTemperature,
      lightDetailsControlsElement: ComponentControllerElement = document.createElement("section");
    ((lightDetailsControlsElement.className = "hb-light-details-controls"),
      lightDetailsControlsElement.classList.toggle("has-color-picker", hasColorPicker),
      (lightDetailsControlsElement.inert = !isLightInteractive));
    const sliderByPayloadKey = new Map(),
      lightControlModes = lightControlModes2(lightStateAttributes);
    let currentLightMode = lightControlMode2(lightStateAttributes.color_mode, lightControlModes);
    const lightModeSelect = document.createElement("select");
    ((lightModeSelect.className = "hb-light-mode"),
      lightModeSelect.setAttribute("aria-label", "灯光模式"),
      (lightModeSelect.hidden = lightControlModes.length < 2));
    for (const lightModeOption of lightControlModes) {
      const lightModeOptionElement = document.createElement("option");
      ((lightModeOptionElement.value = lightModeOption),
        (lightModeOptionElement.textContent = {
          color: "彩光",
          temperature: "色温",
          white: "白光",
        }[lightModeOption]),
        lightModeSelect.append(lightModeOptionElement));
    }
    const applyLightMode = (nextLightMode) => {
      ((currentLightMode = nextLightMode),
        (lightModeSelect.value = nextLightMode),
        lightColorPickerPanel && (lightColorPickerPanel.hidden = nextLightMode !== "color"));
      const temperatureSlider = sliderByPayloadKey.get("color_temp_kelvin");
      (temperatureSlider && (temperatureSlider.root.hidden = nextLightMode !== "temperature"),
        lightDetailsControlsElement.classList.toggle(
          "has-color-picker",
          hasColorPicker && nextLightMode === "color",
        ));
    };
    lightModeSelect.addEventListener("change", async () => {
      if (!isLightInteractive) return;
      resyncLightDetails();
      const previousLightMode = currentLightMode;
      applyLightMode(lightModeSelect.value);
      const lightTurnOnOptions =
        currentLightMode === "white"
          ? {
              white: Math.round(
                Math.max(
                  1,
                  Math.min(255, Number(previousLightState?.attributes?.brightness) || 255),
                ),
              ),
            }
          : currentLightMode === "temperature"
            ? {
                color_temp_kelvin:
                  Number(sliderByPayloadKey.get("color_temp_kelvin")?.input.value) ||
                  minColorTemperatureKelvin,
              }
            : lightColorServiceData2(lightStateAttributes, [
                lightColorHs?.hue || 0,
                lightColorHs?.saturation || 0,
              ]);
      try {
        (await this.callEntityService("light", "turn_on", lightEntityId, lightTurnOnOptions),
          onLightTurnOn?.());
      } catch (lightModeError) {
        (applyLightMode(previousLightMode), this.options.onError?.(lightModeError));
      }
    });
    const syncLightSlider = ({
      label: sliderLabel,
      value: sliderInitialValue,
      minimum: sliderMinimum,
      maximum: sliderMaximum,
      step: sliderStep,
      suffix: sliderSuffix,
      dataKey: sliderPayloadKey,
      className: sliderClassName = "",
      icon: sliderIcon,
      minimumLabel: sliderMinimumLabel,
      maximumLabel: sliderMaximumLabel,
      supported: isSliderSupported = true,
    }) => {
      const lightSliderField = document.createElement("label");
      ((lightSliderField.className = ("hb-light-details-slider " + sliderClassName).trim()),
        lightSliderField.classList.toggle("is-unavailable", !isSliderSupported));
      const lightSliderHeading = document.createElement("span");
      lightSliderHeading.className = "hb-light-details-slider-heading";
      const lightSliderIcon = document.createElement("i");
      ((lightSliderIcon.className = "hb-light-details-slider-icon"),
        lightSliderIcon.setAttribute("aria-hidden", "true"),
        (lightSliderIcon.textContent = sliderIcon));
      const lightSliderLabel = document.createElement("strong");
      lightSliderLabel.textContent = sliderLabel;
      const lightSliderOutputElement = document.createElement("output"),
        clampedSliderValue = Math.max(sliderMinimum, Math.min(sliderMaximum, sliderInitialValue));
      ((lightSliderOutputElement.textContent = "" + Math.round(clampedSliderValue) + sliderSuffix),
        lightSliderHeading.append(lightSliderIcon, lightSliderLabel, lightSliderOutputElement));
      const lightSliderInput = document.createElement("input");
      ((lightSliderInput.type = "range"),
        (lightSliderInput.min = String(sliderMinimum)),
        (lightSliderInput.max = String(sliderMaximum)),
        (lightSliderInput.step = String(sliderStep)),
        (lightSliderInput.value = String(clampedSliderValue)),
        (lightSliderInput.disabled = !isSliderSupported));
      const updateSliderValue = ({ notify: shouldNotifyChange = false } = {}) => {
        const sliderValue = Number(lightSliderInput.value),
          sliderProgressPercent =
            ((sliderValue - sliderMinimum) / Math.max(1, sliderMaximum - sliderMinimum)) * 100;
        ((lightSliderOutputElement.textContent = isSliderSupported
          ? "" + Math.round(sliderValue) + sliderSuffix
          : "不支持"),
          lightSliderInput.style.setProperty(
            "--hb-light-slider-progress",
            Math.max(0, Math.min(100, sliderProgressPercent)) + "%",
          ),
          shouldNotifyChange &&
            isSliderSupported &&
            onLightVisualChange?.(
              sliderPayloadKey === "brightness_pct"
                ? {
                    brightnessPercent: sliderValue,
                  }
                : {
                    colorTemperatureKelvin: sliderValue,
                    colorRgb: null,
                  },
            ));
      };
      (updateSliderValue(),
        lightSliderInput.addEventListener("input", () => {
          (resyncLightDetails(),
            updateSliderValue({
              notify: true,
            }));
        }),
        lightSliderInput.addEventListener("change", async () => {
          if (!(!isLightInteractive || !isSliderSupported))
            try {
              (await this.callEntityService("light", "turn_on", lightEntityId, {
                [sliderPayloadKey]: Number(lightSliderInput.value),
              }),
                onLightTurnOn?.());
            } catch (sliderCommitError) {
              (this.options.onError?.(sliderCommitError),
                (lightSliderOutputElement.textContent = "设置失败"));
            }
        }));
      const lightSliderLegend = document.createElement("span");
      lightSliderLegend.className = "hb-light-details-slider-legend";
      const lightSliderMinimumLabel = document.createElement("small");
      lightSliderMinimumLabel.textContent = sliderMinimumLabel;
      const lightSliderMaximumLabel = document.createElement("small");
      ((lightSliderMaximumLabel.textContent = sliderMaximumLabel),
        lightSliderLegend.append(lightSliderMinimumLabel, lightSliderMaximumLabel),
        lightSliderField.append(lightSliderHeading, lightSliderInput, lightSliderLegend),
        lightDetailsControlsElement.append(lightSliderField),
        sliderByPayloadKey.set(sliderPayloadKey, {
          root: lightSliderField,
          input: lightSliderInput,
          updateSliderValue: updateSliderValue,
          supported: isSliderSupported,
        }));
    };
    let lightColorPickerPanel = null,
      lightColorHs = null,
      isColorPickerBound = false;
    if (hasColorPicker) {
      const initialColorHs = lightColorHs2(lightStateAttributes) || [0, 0];
      ((lightColorHs = {
        hue: Number(initialColorHs[0]) || 0,
        saturation: Number(initialColorHs[1]) || 0,
      }),
        (lightColorPickerPanel = document.createElement("div")),
        (lightColorPickerPanel.className = "hb-light-color-picker"),
        lightColorPickerPanel.setAttribute("role", "slider"),
        lightColorPickerPanel.setAttribute("tabindex", isLightInteractive ? "0" : "-1"),
        lightColorPickerPanel.setAttribute("aria-label", "选择灯光颜色"));
      const colorPickerGlowIcon = document.createElement("i");
      colorPickerGlowIcon.className = "hb-light-color-picker-glow";
      const colorPickerHandleIcon = document.createElement("i");
      ((colorPickerHandleIcon.className = "hb-light-color-picker-handle"),
        lightColorPickerPanel.append(colorPickerGlowIcon, colorPickerHandleIcon));
      const measureColorPickerPoint = () =>
          lightColorPickerPointFromHs2([lightColorHs.hue, lightColorHs.saturation]),
        syncColorPicker = ({
          hue: nextHue = lightColorHs.hue,
          saturation: nextSaturation = lightColorHs.saturation,
        } = {}) => {
          ((lightColorHs.hue = (((Number(nextHue) || 0) % 360) + 360) % 360),
            (lightColorHs.saturation = Math.max(0, Math.min(100, Number(nextSaturation) || 0))));
          const colorPickerPoint = measureColorPickerPoint(),
            lightColorRgb = hsToRgbColor2([lightColorHs.hue, lightColorHs.saturation]),
            lightColorCss = "rgb(" + lightColorRgb.join(",") + ")";
          (lightColorPickerPanel.style.setProperty(
            "--hb-light-color-picker-x",
            colorPickerPoint.x * 100 + "%",
          ),
            lightColorPickerPanel.style.setProperty(
              "--hb-light-color-picker-y",
              colorPickerPoint.y * 100 + "%",
            ),
            lightColorPickerPanel.style.setProperty("--hb-light-color-picker-color", lightColorCss),
            lightColorPickerPanel.setAttribute(
              "aria-valuetext",
              "色相 " +
                Math.round(lightColorHs.hue) +
                " 度，饱和度 " +
                Math.round(lightColorHs.saturation) +
                "%",
            ),
            onLightVisualChange?.({
              colorHs: [lightColorHs.hue, lightColorHs.saturation],
              colorRgb: lightColorRgb,
            }));
        },
        applyColorPickerPointer = (colorPointerEvent) => {
          const colorPickerRect = lightColorPickerPanel.getBoundingClientRect();
          if (!colorPickerRect.width || !colorPickerRect.height) return;
          const pickerX = Math.max(
              0,
              Math.min(
                1,
                (colorPointerEvent.clientX - colorPickerRect.left) / colorPickerRect.width,
              ),
            ),
            pickerY = Math.max(
              0,
              Math.min(
                1,
                (colorPointerEvent.clientY - colorPickerRect.top) / colorPickerRect.height,
              ),
            ),
            [pickedHue, pickedSaturation] = lightColorPickerHsFromPoint2(pickerX, pickerY);
          syncColorPicker({
            hue: pickedHue,
            saturation: pickedSaturation,
          });
        },
        commitColorPicker = async () => {
          if (!(!isLightInteractive || isColorPickerBound)) {
            ((isColorPickerBound = true), lightColorPickerPanel.setAttribute("aria-busy", "true"));
            try {
              (await this.callEntityService(
                "light",
                "turn_on",
                lightEntityId,
                lightColorServiceData2(lightStateAttributes, [
                  lightColorHs.hue,
                  lightColorHs.saturation,
                ]),
              ),
                onLightTurnOn?.());
            } catch (colorPickerError) {
              this.options.onError?.(colorPickerError);
            } finally {
              ((isColorPickerBound = false), lightColorPickerPanel.removeAttribute("aria-busy"));
            }
          }
        };
      (lightColorPickerPanel.addEventListener("pointerdown", (pickerPointerDownEvent) => {
        isLightInteractive &&
          (lightColorPickerPanel.setPointerCapture?.(pickerPointerDownEvent.pointerId),
          (lightColorPickerPanel.dataset.dragging = "true"),
          applyColorPickerPointer(pickerPointerDownEvent),
          pickerPointerDownEvent.preventDefault());
      }),
        lightColorPickerPanel.addEventListener("pointermove", (pickerPointerMoveEvent) => {
          lightColorPickerPanel.dataset.dragging === "true" &&
            applyColorPickerPointer(pickerPointerMoveEvent);
        }));
      const endColorPickerDrag = async (pickerPointerUpEvent) => {
        lightColorPickerPanel.dataset.dragging === "true" &&
          ((lightColorPickerPanel.dataset.dragging = "false"),
          lightColorPickerPanel.releasePointerCapture?.(pickerPointerUpEvent.pointerId),
          await commitColorPicker());
      };
      (lightColorPickerPanel.addEventListener("pointerup", endColorPickerDrag),
        lightColorPickerPanel.addEventListener("pointercancel", endColorPickerDrag),
        lightColorPickerPanel.addEventListener("keydown", async (colorPickerKeyEvent) => {
          if (!isLightInteractive) return;
          const keyboardStep = colorPickerKeyEvent.shiftKey ? 10 : 3;
          let { hue: keyboardHue, saturation: keyboardSaturation } = lightColorHs;
          if (colorPickerKeyEvent.key === "ArrowLeft") keyboardHue -= keyboardStep;
          else {
            if (colorPickerKeyEvent.key === "ArrowRight") keyboardHue += keyboardStep;
            else {
              if (colorPickerKeyEvent.key === "ArrowUp") keyboardSaturation -= keyboardStep;
              else {
                if (colorPickerKeyEvent.key === "ArrowDown") keyboardSaturation += keyboardStep;
                else {
                  if (colorPickerKeyEvent.key === "Enter" || colorPickerKeyEvent.key === " ") {
                    (await commitColorPicker(), colorPickerKeyEvent.preventDefault());
                    return;
                  } else return;
                }
              }
            }
          }
          (syncColorPicker({
            hue: keyboardHue,
            saturation: keyboardSaturation,
          }),
            colorPickerKeyEvent.preventDefault());
        }),
        (lightColorPickerPanel.syncColorPicker = syncColorPicker),
        (lightColorPickerPanel.cleanupColorPicker = () => {
          lightColorPickerPanel.dataset.dragging = "false";
        }),
        syncColorPicker(),
        lightDetailsControlsElement.append(lightColorPickerPanel));
    }
    const maxMiredsKelvin = Number.isFinite(Number(lightStateAttributes.max_mireds))
        ? 1000000 / Number(lightStateAttributes.max_mireds)
        : 2000,
      minMiredsKelvin = Number.isFinite(Number(lightStateAttributes.min_mireds))
        ? 1000000 / Number(lightStateAttributes.min_mireds)
        : 6500,
      minColorTemperatureKelvin =
        Number(lightStateAttributes.min_color_temp_kelvin) || maxMiredsKelvin,
      maxColorTemperatureKelvin =
        Number(lightStateAttributes.max_color_temp_kelvin) || minMiredsKelvin,
      miredColorTemperatureKelvin = Number.isFinite(Number(lightStateAttributes.color_temp))
        ? 1000000 / Number(lightStateAttributes.color_temp)
        : minColorTemperatureKelvin,
      currentColorTemperatureKelvin =
        Number(lightStateAttributes.color_temp_kelvin) || miredColorTemperatureKelvin;
    (!hasColorPicker || supportsColorTemperature) &&
      syncLightSlider({
        label: "色温",
        value: currentColorTemperatureKelvin,
        minimum: Math.round(minColorTemperatureKelvin),
        maximum: Math.round(maxColorTemperatureKelvin),
        step: 50,
        suffix: "K",
        dataKey: "color_temp_kelvin",
        className: "hb-light-details-temperature",
        icon: "♨",
        minimumLabel: "暖色",
        maximumLabel: "冷色",
        supported: supportsColorTemperature,
      });
    const brightnessByte = Number.isFinite(Number(lightStateAttributes.brightness))
      ? (Number(lightStateAttributes.brightness) / 255) * 100
      : 100;
    syncLightSlider({
      label: "亮度",
      value: brightnessByte,
      minimum: 1,
      maximum: 100,
      step: 1,
      suffix: "%",
      dataKey: "brightness_pct",
      className: "hb-light-details-brightness",
      icon: "☀",
      minimumLabel: "暗",
      maximumLabel: "亮",
      supported: supportsBrightness,
    });
    let lightPresetPending = null,
      presetTimeoutTimer = 0,
      previousLightState = lightState;
    const resyncLightDetails = ({ resync: shouldResync = false } = {}) => {
        (window.clearTimeout(presetTimeoutTimer),
          (presetTimeoutTimer = 0),
          (lightPresetPending = null),
          shouldResync && lightDetailsControlsElement.syncLightState?.(previousLightState));
      },
      presetTimeoutTick = () => {
        if (
          (window.clearTimeout(presetTimeoutTimer), (presetTimeoutTimer = 0), !lightPresetPending)
        )
          return;
        const presetNowMs = Date.now(),
          presetDecision = lightPresetPendingDecision2(lightPresetPending, presetNowMs);
        if (presetDecision === "confirmed" || presetDecision === "timeout") {
          resyncLightDetails({
            resync: true,
          });
          return;
        }
        const presetHoldMs = lightPresetPending.latestMatches
          ? Math.min(
              lightPresetPending.expiresAt,
              Math.max(
                lightPresetPending.minimumHoldUntil,
                lightPresetPending.matchStartedAt + LIGHT_PRESET_STABLE_CONFIRMATION_MS2,
              ),
            )
          : lightPresetPending.expiresAt;
        presetTimeoutTimer = window.setTimeout(
          presetTimeoutTick,
          Math.max(50, presetHoldMs - presetNowMs),
        );
      },
      lightPresetDefinitions = LIGHT_DETAIL_PRESET_DEFINITIONS2,
      colorTemperatureFromPercent = (presetEntry) =>
        relativeLightColorTemperature2(
          minColorTemperatureKelvin,
          maxColorTemperatureKelvin,
          presetEntry.colorTemperaturePercent,
        ),
      lightPresetsBox = document.createElement("div");
    ((lightPresetsBox.className = "hb-light-details-presets"),
      (lightPresetsBox.hidden =
        hasColorPicker || (!supportsBrightness && !supportsColorTemperatureControl)));
    const lightPresetEntries = lightPresetDefinitions.map((presetDefinition) => {
      const lightPresetButton = document.createElement("button");
      ((lightPresetButton.type = "button"), (lightPresetButton.disabled = !startsWith3));
      const lightPresetLabel = document.createElement("strong");
      lightPresetLabel.textContent = presetDefinition.label;
      const lightPresetDetailElement = document.createElement("small");
      return (
        (lightPresetDetailElement.textContent = supportsBrightness
          ? presetDefinition.detail
          : "开启"),
        lightPresetButton.append(lightPresetLabel, lightPresetDetailElement),
        lightPresetButton.addEventListener("click", async () => {
          if (!isLightInteractive || !startsWith3) return;
          const presetColorTemperatureKelvin = colorTemperatureFromPercent(presetDefinition),
            lightPresetServicePayload: ComponentPayload = {};
          (supportsBrightness &&
            Object.assign(
              lightPresetServicePayload,
              lightPresetBrightnessServiceData2(presetDefinition.brightnessPercent),
            ),
            supportsColorTemperatureControl &&
              (lightPresetServicePayload.color_temp_kelvin = Math.round(
                presetColorTemperatureKelvin,
              )),
            window.clearTimeout(presetTimeoutTimer));
          const presetStartedAtMs = Date.now();
          ((lightPresetPending = {
            brightnessPercent: presetDefinition.brightnessPercent,
            colorTemperatureKelvin: presetColorTemperatureKelvin,
            minimumHoldUntil: presetStartedAtMs + LIGHT_PRESET_MINIMUM_HOLD_MS2,
            expiresAt: presetStartedAtMs + LIGHT_PRESET_MAXIMUM_HOLD_MS2,
            latestMatches: false,
            matchStartedAt: null,
          }),
            presetTimeoutTick());
          const brightnessSlider = sliderByPayloadKey.get("brightness_pct");
          brightnessSlider?.supported &&
            ((brightnessSlider.input.value = String(presetDefinition.brightnessPercent)),
            brightnessSlider.updateSliderValue({
              notify: true,
            }));
          const colorTemperatureSlider = sliderByPayloadKey.get("color_temp_kelvin");
          colorTemperatureSlider?.supported &&
            ((colorTemperatureSlider.input.value = String(presetColorTemperatureKelvin)),
            colorTemperatureSlider.updateSliderValue({
              notify: true,
            }));
          for (const presetControl of lightPresetEntries)
            presetControl.button.classList.toggle(
              "is-active",
              presetControl.button === lightPresetButton,
            );
          (onLightVisualChange?.({
            isOn: true,
            ...(supportsBrightness
              ? {
                  brightnessPercent: presetDefinition.brightnessPercent,
                }
              : {}),
            ...(supportsColorTemperatureControl
              ? {
                  colorTemperatureKelvin: presetColorTemperatureKelvin,
                }
              : {}),
          }),
            onLightTurnOn?.());
          try {
            await this.callEntityService(
              "light",
              "turn_on",
              lightEntityId,
              lightPresetServicePayload,
            );
          } catch (presetApplyError) {
            (resyncLightDetails({
              resync: true,
            }),
              lightPresetButton.classList.remove("is-active"),
              this.options.onError?.(presetApplyError));
          }
        }),
        lightPresetsBox.append(lightPresetButton),
        {
          button: lightPresetButton,
          ...presetDefinition,
        }
      );
    });
    (lightDetailsControlsElement.append(lightPresetsBox),
      lightDetailsControlsElement.prepend(lightModeSelect),
      lightDetailsControlsElement.classList.toggle(
        "has-mode-switch",
        lightControlModes.length > 1,
      ));
    const syncLightStateDetails = (nextLightDetailsState) => {
      const lightDetailsAttributes = nextLightDetailsState?.attributes || {},
        isLightOn = nextLightDetailsState?.state === "on",
        NaN3 = Number.isFinite(Number(lightDetailsAttributes.brightness))
          ? (Number(lightDetailsAttributes.brightness) / 255) * 100
          : NaN,
        NaN4 = Number.isFinite(Number(lightDetailsAttributes.color_temp))
          ? 1000000 / Number(lightDetailsAttributes.color_temp)
          : NaN,
        reportedColorTemperatureKelvin = Number(lightDetailsAttributes.color_temp_kelvin) || NaN4;
      for (const presetControlEntry of lightPresetEntries) {
        const presetColorTemperatureTarget = colorTemperatureFromPercent(presetControlEntry),
          colorTemperatureTolerance = Math.max(
            50,
            (maxColorTemperatureKelvin - minColorTemperatureKelvin) * 0.06,
          ),
          finite3 =
            !supportsBrightness ||
            (Number.isFinite(NaN3) && Math.abs(NaN3 - presetControlEntry.brightnessPercent) <= 4),
          finite4 =
            !supportsColorTemperatureControl ||
            (Number.isFinite(reportedColorTemperatureKelvin) &&
              Math.abs(reportedColorTemperatureKelvin - presetColorTemperatureTarget) <=
                colorTemperatureTolerance);
        presetControlEntry.button.classList.toggle("is-active", isLightOn && finite3 && finite4);
      }
    };
    return (
      syncLightStateDetails(lightState),
      (lightDetailsControlsElement.syncLightState = (lightStateArg) => {
        if (!lightStateArg) return;
        previousLightState = lightStateArg;
        const lightRealtimeAttributes = lightStateArg.attributes || {};
        lightRealtimeAttributes.color_mode &&
          applyLightMode(lightControlMode2(lightRealtimeAttributes.color_mode, lightControlModes));
        const colorTemperatureSliderControl = sliderByPayloadKey.get("color_temp_kelvin"),
          NaN5 = Number.isFinite(Number(lightRealtimeAttributes.color_temp))
            ? 1000000 / Number(lightRealtimeAttributes.color_temp)
            : NaN,
          realtimeColorTemperatureKelvin =
            Number(lightRealtimeAttributes.color_temp_kelvin) || NaN5,
          brightnessSliderControl = sliderByPayloadKey.get("brightness_pct"),
          NaN6 = Number.isFinite(Number(lightRealtimeAttributes.brightness))
            ? (Number(lightRealtimeAttributes.brightness) / 255) * 100
            : NaN;
        if (lightPresetPending) {
          const finite5 =
              !supportsBrightness ||
              (Number.isFinite(NaN6) && Math.abs(NaN6 - lightPresetPending.brightnessPercent) <= 4),
            finite6 =
              !supportsColorTemperatureControl ||
              (Number.isFinite(realtimeColorTemperatureKelvin) &&
                Math.abs(
                  realtimeColorTemperatureKelvin - lightPresetPending.colorTemperatureKelvin,
                ) <= 220),
            isLightStateMatching = finite5 && finite6;
          (isLightStateMatching &&
            !lightPresetPending.latestMatches &&
            (lightPresetPending.matchStartedAt = Date.now()),
            isLightStateMatching || (lightPresetPending.matchStartedAt = null),
            (lightPresetPending.latestMatches = isLightStateMatching),
            presetTimeoutTick());
        }
        const pendingColorTemperatureKelvin =
            lightPresetPending?.colorTemperatureKelvin ?? realtimeColorTemperatureKelvin,
          pendingBrightnessPercent = lightPresetPending?.brightnessPercent ?? NaN6;
        if (
          (colorTemperatureSliderControl?.supported &&
            Number.isFinite(pendingColorTemperatureKelvin) &&
            ((colorTemperatureSliderControl.input.value = String(pendingColorTemperatureKelvin)),
            colorTemperatureSliderControl.updateSliderValue()),
          brightnessSliderControl?.supported &&
            Number.isFinite(pendingBrightnessPercent) &&
            ((brightnessSliderControl.input.value = String(pendingBrightnessPercent)),
            brightnessSliderControl.updateSliderValue()),
          lightColorPickerPanel)
        ) {
          const realtimeColorHs = lightColorHs2(lightRealtimeAttributes);
          realtimeColorHs &&
            lightColorPickerPanel.syncColorPicker({
              hue: realtimeColorHs[0],
              saturation: realtimeColorHs[1],
            });
        }
        syncLightStateDetails(
          lightPresetPending
            ? {
                state: "on",
                attributes: {
                  ...lightRealtimeAttributes,
                  ...(supportsBrightness
                    ? {
                        brightness: (lightPresetPending.brightnessPercent / 100) * 255,
                      }
                    : {}),
                  ...(supportsColorTemperatureControl
                    ? {
                        color_temp_kelvin: lightPresetPending.colorTemperatureKelvin,
                      }
                    : {}),
                },
              }
            : lightStateArg,
        );
        const visualColorTemperature = lightVisualValueForCapability2(
            supportsColorTemperatureControl,
            pendingColorTemperatureKelvin,
            UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN2,
          ),
          visualBrightnessPercent = lightVisualValueForCapability2(
            supportsBrightness,
            pendingBrightnessPercent,
            UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT2,
          );
        onLightVisualChange?.({
          isOn: lightStateArg.state === "on",
          colorTemperatureKelvin: visualColorTemperature,
          brightnessPercent: visualBrightnessPercent,
          colorRgb: hasColorPicker ? lightColorRgb2(lightRealtimeAttributes) : null,
        });
      }),
      applyLightMode(currentLightMode),
      lightDetailsControlsElement.syncLightState(lightState),
      (lightDetailsControlsElement.cleanupLightDetails = () => {
        (resyncLightDetails(), lightColorPickerPanel?.cleanupColorPicker?.());
      }),
      lightDetailsControlsElement
    );
  }
  ["createCoverDetailsControls"](
    coverDetailsEntityId,
    coverStateObject,
    {
      interactive: isCoverInteractive = true,
      dream: isTilt = false,
      airer: isAirer = false,
      tilt: isTiltMode = false,
      motorReversed: isMotorReversed = false,
      positionState: positionStateOption = null,
      positionCommandEntityId: coverCommandEntityId = "",
      positionCommandState: positionCommandStateOption = null,
      motorState: motorStateOption = null,
      airerActionEntityIds: airerActionEntityIds = {},
      positionCalibration: positionCalibration = {},
      onVisualChange: onCoverVisualChange = null,
      onCurtainPositionChange: onCurtainPositionChange = null,
    } = {},
  ): ComponentControllerElement {
    const coverControlsPanel: ComponentControllerElement = document.createElement("section");
    ((coverControlsPanel.className = "hb-cover-details-controls"),
      (coverControlsPanel.inert = !isCoverInteractive));
    const coverPositionField = document.createElement("label");
    coverPositionField.className = "hb-cover-details-position";
    const coverPositionHeading = document.createElement("span");
    coverPositionHeading.className = "hb-cover-details-position-heading";
    const coverPositionLabel = document.createElement("strong");
    coverPositionLabel.textContent = isTilt ? "叶片角度" : isAirer ? "晾杆高度" : "开合位置";
    const coverPositionOutputElement = document.createElement("output");
    coverPositionHeading.append(coverPositionLabel, coverPositionOutputElement);
    const coverPositionSlider = document.createElement("input");
    ((coverPositionSlider.type = "range"),
      (coverPositionSlider.min = "0"),
      (coverPositionSlider.max = "100"),
      (coverPositionSlider.step = "1"));
    const coverPositionLegend = document.createElement("span");
    ((coverPositionLegend.className = "hb-cover-details-position-legend"),
      isTilt
        ? coverPositionLegend.append(
            Object.assign(document.createElement("small"), {
              textContent: "0 · 一侧闭合",
            }),
            Object.assign(document.createElement("small"), {
              textContent: "50 · 90°打开",
            }),
            Object.assign(document.createElement("small"), {
              textContent: "100 · 反向闭合",
            }),
          )
        : isAirer
          ? coverPositionLegend.append(
              Object.assign(document.createElement("small"), {
                textContent: "下降",
              }),
              Object.assign(document.createElement("small"), {
                textContent: "升起",
              }),
            )
          : coverPositionLegend.append(
              Object.assign(document.createElement("small"), {
                textContent: "关闭",
              }),
              Object.assign(document.createElement("small"), {
                textContent: "打开",
              }),
            ),
      coverPositionField.append(coverPositionHeading, coverPositionSlider, coverPositionLegend));
    const coverActionsRow = document.createElement("div");
    coverActionsRow.className = "hb-cover-details-actions";
    const openCoverService = "open_cover",
      stopCoverService = "stop_cover",
      closeCoverService = "close_cover",
      normalizedOpenService = isMotorReversed ? openCoverService : closeCoverService,
      normalizedCloseService = isMotorReversed ? closeCoverService : openCoverService;
    let isCurtainRetractedState = dreamCurtainIsRetracted2(
      coverStateObject?.state,
      isMotorReversed,
    );
    const coverActionEntries = (
      isTilt
        ? [
            {
              label: "关闭",
              icon: "←",
              service: normalizedOpenService,
              curtainRetracted: false,
            },
            {
              label: "暂停",
              icon: "Ⅱ",
              service: stopCoverService,
            },
            {
              label: "开启",
              icon: "→",
              service: normalizedCloseService,
              curtainRetracted: true,
            },
          ]
        : isAirer
          ? [
              {
                label: "下降",
                icon: "↓",
                service: normalizedOpenService,
                action: "down",
              },
              {
                label: "暂停",
                icon: "Ⅱ",
                service: stopCoverService,
                action: "pause",
              },
              {
                label: "升起",
                icon: "↑",
                service: normalizedCloseService,
                action: "up",
              },
            ]
          : [
              {
                label: "关闭",
                icon: "←",
                service: normalizedOpenService,
              },
              {
                label: "暂停",
                icon: "Ⅱ",
                service: stopCoverService,
              },
              {
                label: "打开",
                icon: "→",
                service: normalizedCloseService,
              },
            ]
    ).map((coverAction) => {
      const coverActionButton = document.createElement("button");
      ((coverActionButton.type = "button"),
        (coverActionButton.dataset.coverAction = coverAction.service));
      const coverActionIcon = document.createElement("i");
      ((coverActionIcon.textContent = coverAction.icon),
        coverActionIcon.setAttribute("aria-hidden", "true"));
      const coverActionLabel = document.createElement("strong");
      return (
        (coverActionLabel.textContent = coverAction.label),
        coverActionButton.append(coverActionIcon, coverActionLabel),
        coverActionButton.addEventListener("click", async () => {
          if (isCoverInteractive) {
            (isTilt &&
              typeof coverAction.curtainRetracted == "boolean" &&
              coverControlsPanel.beginDreamCurtainMotion?.(coverAction.curtainRetracted),
              !isTilt && coverAction.service === normalizedCloseService
                ? coverControlsPanel.beginCoverMotion?.(100, "opening")
                : !isTilt && coverAction.service === normalizedOpenService
                  ? coverControlsPanel.beginCoverMotion?.(0, "closing")
                  : coverControlsPanel.stopCoverMotion?.(),
              coverActionButton.classList.add("is-pending"));
            try {
              const airerActionEntityId =
                isAirer && coverAction.action ? airerActionEntityIds[coverAction.action] : "";
              if (isAirer && coverCommandEntityId && ["up", "down"].includes(coverAction.action)) {
                const airerMoveTargetPosition = coverAction.action === "up" ? 100 : 0,
                  airerMovePosition = airerDevicePosition2(
                    airerMoveTargetPosition,
                    positionCalibration,
                  );
                await this.callEntityService("number", "set_value", coverCommandEntityId, {
                  value: airerMovePosition,
                });
              } else
                isAirer && coverAction.action === "pause"
                  ? await this.callEntityService("cover", stopCoverService, coverDetailsEntityId)
                  : airerActionEntityId
                    ? await this.callEntityService("button", "press", airerActionEntityId)
                    : await this.callEntityService(
                        "cover",
                        coverAction.service,
                        coverDetailsEntityId,
                      );
            } catch (coverActionError) {
              (coverControlsPanel.cancelDreamCurtainMotion?.(),
                coverControlsPanel.cancelCoverMotion?.(),
                coverControlsPanel.syncCoverState?.(coverStateObject),
                this.options.onError?.(coverActionError));
            } finally {
              coverActionButton.classList.remove("is-pending");
            }
          }
        }),
        coverActionsRow.append(coverActionButton),
        coverActionButton
      );
    });
    let coverPositionStateSnapshot = positionStateOption,
      coverPositionCommandSnapshot = positionCommandStateOption,
      coverMotorStateSnapshot = motorStateOption;
    const syncCoverDerivedState = () => {
      isAirer &&
        learnAirerPositionCalibration2(
          positionCalibration,
          coverPositionStateSnapshot?.state,
          coverPositionCommandSnapshot?.state,
          coverMotorStateSnapshot?.state,
        );
    };
    syncCoverDerivedState();
    let coverStateText = String(coverStateObject?.state || "");
    const resolveCoverPosition = (positionSourceState) => {
      const computedCoverPosition = isAirer
        ? airerReportedPosition2(
            coverPositionStateSnapshot,
            positionSourceState,
            positionCalibration,
          )
        : Number(
            positionSourceState?.attributes?.[
              isTiltMode ? "current_tilt_position" : "current_position"
            ],
          );
      if (Number.isFinite(computedCoverPosition)) {
        const clampedPosition = Math.max(0, Math.min(100, computedCoverPosition));
        return isAirer
          ? airerPresentationPositionForState2(
              clampedPosition,
              coverStateText || positionSourceState?.state,
              positionCalibration,
              isMotorReversed,
            )
          : clampedPosition;
      }
      return positionSourceState?.state === "open" ? 100 : 0;
    };
    let primaryCoverState = coverStateObject,
      resolvedCoverPosition = resolveCoverPosition(coverStateObject),
      displayCoverPosition = resolvedCoverPosition,
      isCoverMotionActive = false,
      coverHandleIndex = 0,
      coverMotionState = null,
      airerHoldPosition = null,
      airerHoldExpiryMs = 0,
      dreamCurtainTarget = null;
    const clearCoverMotionTimers = () => {
        (window.cancelAnimationFrame(coverHandleIndex), (coverHandleIndex = 0));
      },
      updateCoverPosition = (nextCoverPosition, coverMotionPhase = "") => {
        ((displayCoverPosition = Math.max(0, Math.min(100, Number(nextCoverPosition) || 0))),
          (coverPositionSlider.value = String(displayCoverPosition)),
          coverPositionSlider.style.setProperty(
            "--hb-cover-position-progress",
            displayCoverPosition + "%",
          ),
          (coverPositionOutputElement.textContent = Math.round(displayCoverPosition) + "%"));
        for (const coverActionButtonElement of coverActionEntries)
          coverActionButtonElement.classList.toggle(
            "is-active",
            coverActionButtonElement.dataset.coverAction ===
              (coverMotionPhase === "opening"
                ? openCoverService
                : coverMotionPhase === "closing"
                  ? closeCoverService
                  : ""),
          );
        onCoverVisualChange?.({
          position: displayCoverPosition,
          state: coverMotionPhase,
        });
      };
    ((coverControlsPanel.setDreamCurtainRetracted = (
      retractedState,
      isCurtainMovingState = false,
    ) => {
      isTilt &&
        ((isCurtainRetractedState = !!retractedState),
        (coverPositionSlider.disabled = !isCoverInteractive),
        onCurtainPositionChange?.({
          retracted: isCurtainRetractedState,
          moving: !!isCurtainMovingState,
        }));
    }),
      (coverControlsPanel.isDreamCurtainRetracted = () => isCurtainRetractedState),
      (coverControlsPanel.beginDreamCurtainMotion = (curtainRetractedValue) => {
        isTilt &&
          ((dreamCurtainTarget = {
            target: !!curtainRetractedValue,
            expiresAt: Date.now() + 10000,
          }),
          coverControlsPanel.setDreamCurtainRetracted?.(dreamCurtainTarget.target, true));
      }),
      (coverControlsPanel.cancelDreamCurtainMotion = () => {
        dreamCurtainTarget = null;
      }),
      (coverControlsPanel.beginCoverMotion = (targetCoverPosition, coverMotionPhaseName) => {
        (clearCoverMotionTimers(), (airerHoldPosition = null), (airerHoldExpiryMs = 0));
        const motionStartPosition = displayCoverPosition,
          motionTargetPosition = Math.max(0, Math.min(100, Number(targetCoverPosition) || 0));
        coverMotionState = {
          direction: motionTargetPosition >= motionStartPosition ? 1 : -1,
          target: motionTargetPosition,
          state: coverMotionPhaseName,
          initialPosition: motionStartPosition,
          lastServerPosition: motionStartPosition,
          sawMotorRunning: false,
          ignoreStaleUntil: Date.now() + 4000,
          expiresAt: Date.now() + (isAirer ? 120000 : 10000),
        };
        const motionStartTimeMs = performance.now(),
          motionDurationMs = Math.max(
            900,
            Math.abs(motionTargetPosition - motionStartPosition) * 28,
          ),
          motionFrame = (motionTimestamp) => {
            const motionProgress = Math.min(
                1,
                (motionTimestamp - motionStartTimeMs) / motionDurationMs,
              ),
              motionEasing = 1 - (1 - motionProgress) ** 3;
            (updateCoverPosition(
              motionStartPosition + (motionTargetPosition - motionStartPosition) * motionEasing,
              coverMotionPhaseName,
            ),
              motionProgress < 1
                ? (coverHandleIndex = window.requestAnimationFrame(motionFrame))
                : (coverHandleIndex = 0));
          };
        (updateCoverPosition(motionStartPosition, coverMotionPhaseName),
          (coverHandleIndex = window.requestAnimationFrame(motionFrame)));
      }),
      (coverControlsPanel.stopCoverMotion = () => {
        (clearCoverMotionTimers(),
          (coverMotionState = null),
          updateCoverPosition(displayCoverPosition, ""));
      }),
      (coverControlsPanel.cancelCoverMotion = () => {
        (clearCoverMotionTimers(), (coverMotionState = null));
      }),
      (coverControlsPanel.holdCoverPosition = (holdCoverPosition) => {
        (clearCoverMotionTimers(), (airerHoldPosition = null), (airerHoldExpiryMs = 0));
        const holdTargetPosition = Math.max(0, Math.min(100, Number(holdCoverPosition) || 0)),
          holdInitialPosition = resolvedCoverPosition,
          holdDirection = holdTargetPosition >= holdInitialPosition ? 1 : -1,
          holdMotionPhase =
            isTilt || Math.abs(holdTargetPosition - holdInitialPosition) < 0.5
              ? ""
              : holdDirection > 0
                ? "opening"
                : "closing";
        ((coverMotionState = {
          direction: holdDirection,
          target: holdTargetPosition,
          state: holdMotionPhase,
          initialPosition: holdInitialPosition,
          lastServerPosition: holdInitialPosition,
          sawMotorRunning: false,
          ignoreStaleUntil: Date.now() + 4000,
          expiresAt: Date.now() + (isAirer ? 120000 : 10000),
        }),
          updateCoverPosition(holdTargetPosition, holdMotionPhase));
      }));
    const syncCoverDetails = (
      primaryStateSource,
      { primary: shouldUpdatePrimary = false } = {},
    ) => {
      (shouldUpdatePrimary &&
        ((primaryCoverState = primaryStateSource || primaryCoverState),
        (coverStateText = String(primaryStateSource?.state || coverStateText))),
        airerHoldPosition !== null &&
          Date.now() >= airerHoldExpiryMs &&
          ((airerHoldPosition = null), (airerHoldExpiryMs = 0)));
      const currentServerPosition =
        isAirer && airerHoldPosition !== null
          ? airerHoldPosition
          : resolveCoverPosition(primaryStateSource);
      resolvedCoverPosition = currentServerPosition;
      const serverStateText = String(primaryStateSource?.state || "");
      if (isTilt) {
        const physicalState = physicalCoverState2(serverStateText, isMotorReversed),
          isAirerCurtainRetracted = dreamCurtainIsRetracted2(serverStateText, isMotorReversed);
        if (dreamCurtainTarget && isAirerCurtainRetracted === dreamCurtainTarget.target) {
          const dreamCurtainTargetValue = dreamCurtainTarget.target;
          ((dreamCurtainTarget = null),
            coverControlsPanel.setDreamCurtainRetracted?.(dreamCurtainTargetValue, false));
        } else
          dreamCurtainTarget && Date.now() < dreamCurtainTarget.expiresAt
            ? coverControlsPanel.setDreamCurtainRetracted?.(dreamCurtainTarget.target, true)
            : ((dreamCurtainTarget = null),
              coverControlsPanel.setDreamCurtainRetracted?.(
                isAirerCurtainRetracted,
                physicalState === "opening" || physicalState === "closing",
              ));
      }
      if (!isCoverMotionActive) {
        if (coverMotionState) {
          const motionNowMs = Date.now(),
            {
              direction: motionDirection,
              target: motionTarget,
              state: motionPhase,
            } = coverMotionState,
            hasReachedTarget = coverPositionReachedTarget2(
              currentServerPosition,
              motionTarget,
              motionDirection,
            ),
            isAtBoundary =
              (motionTarget <= 0.5 && serverStateText === "closed") ||
              (motionTarget >= 99.5 && serverStateText === "open"),
            motorNumericState = Number(coverMotorStateSnapshot?.state),
            finite7 =
              isAirer &&
              coverMotionState.sawMotorRunning &&
              Number.isFinite(motorNumericState) &&
              Math.abs(motorNumericState) < 0.5;
          if (
            isAirer
              ? isAtBoundary || (finite7 && hasReachedTarget)
              : hasReachedTarget ||
                isAtBoundary ||
                (motionTarget >= 99.5 && currentServerPosition >= 99.5)
          ) {
            (clearCoverMotionTimers(),
              isAirer &&
                ((airerHoldPosition = motionTarget), (airerHoldExpiryMs = Date.now() + 120000)),
              (coverMotionState = null),
              updateCoverPosition(
                motionTarget,
                serverStateText || (motionDirection < 0 ? "closed" : "open"),
              ));
            return;
          }
          if (
            motionDirection < 0
              ? currentServerPosition < coverMotionState.lastServerPosition - 0.5 ||
                serverStateText === "closing"
              : currentServerPosition > coverMotionState.lastServerPosition + 0.5 ||
                serverStateText === "opening"
          ) {
            coverMotionState.lastServerPosition =
              motionDirection < 0
                ? Math.min(coverMotionState.lastServerPosition, currentServerPosition)
                : Math.max(coverMotionState.lastServerPosition, currentServerPosition);
            const pendingDisplayPosition = coverPendingDisplayPosition2(
              displayCoverPosition,
              currentServerPosition,
              motionDirection,
            );
            updateCoverPosition(pendingDisplayPosition, motionPhase);
            return;
          }
          if (
            motionNowMs < coverMotionState.ignoreStaleUntil ||
            (isAirer && motionNowMs < coverMotionState.expiresAt) ||
            (motionNowMs < coverMotionState.expiresAt &&
              Math.abs(currentServerPosition - coverMotionState.initialPosition) < 0.5)
          )
            return;
          (clearCoverMotionTimers(), (coverMotionState = null));
        } else clearCoverMotionTimers();
        updateCoverPosition(currentServerPosition, serverStateText);
      }
    };
    return (
      coverPositionSlider.addEventListener("pointerdown", () => {
        ((isCoverMotionActive = true), clearCoverMotionTimers(), (coverMotionState = null));
      }),
      coverPositionSlider.addEventListener("input", () => {
        ((isCoverMotionActive = true), clearCoverMotionTimers(), (coverMotionState = null));
        const sliderPositionValue = Number(coverPositionSlider.value);
        updateCoverPosition(
          sliderPositionValue,
          isTilt ? "" : sliderPositionValue > 0 ? "open" : "closed",
        );
      }),
      coverPositionSlider.addEventListener("change", async () => {
        if (((isCoverMotionActive = false), !isCoverInteractive)) return;
        const sliderTargetValue = Number(coverPositionSlider.value),
          airerDevicePosition = airerDevicePosition2(sliderTargetValue, positionCalibration);
        coverControlsPanel.holdCoverPosition(sliderTargetValue);
        try {
          isAirer && coverCommandEntityId
            ? await this.callEntityService("number", "set_value", coverCommandEntityId, {
                value: airerDevicePosition,
              })
            : await this.callEntityService(
                "cover",
                isTiltMode ? "set_cover_tilt_position" : "set_cover_position",
                coverDetailsEntityId,
                {
                  [isTiltMode ? "tilt_position" : "position"]: sliderTargetValue,
                },
              );
        } catch (coverSyncError) {
          (coverControlsPanel.cancelCoverMotion(),
            syncCoverDetails(primaryCoverState),
            this.options.onError?.(coverSyncError));
        }
      }),
      coverPositionSlider.addEventListener("pointercancel", () => {
        ((isCoverMotionActive = false), syncCoverDetails(primaryCoverState));
      }),
      coverControlsPanel.append(coverPositionField, coverActionsRow),
      (coverControlsPanel.syncCoverState = (coverStateSourceArg) =>
        syncCoverDetails(coverStateSourceArg, {
          primary: true,
        })),
      (coverControlsPanel.syncCoverPositionState = (coverPositionStateArg) => {
        ((coverPositionStateSnapshot = coverPositionStateArg || coverPositionStateSnapshot),
          syncCoverDerivedState(),
          syncCoverDetails(primaryCoverState));
      }),
      (coverControlsPanel.syncCoverPositionCommandState = (coverPositionCommandArg) => {
        ((coverPositionCommandSnapshot = coverPositionCommandArg || coverPositionCommandSnapshot),
          syncCoverDerivedState(),
          syncCoverDetails(primaryCoverState));
      }),
      (coverControlsPanel.syncAirerMotorState = (coverMotorStateArg) => {
        coverMotorStateSnapshot = coverMotorStateArg || coverMotorStateSnapshot;
        const motorStateNumber = Number(coverMotorStateSnapshot?.state);
        (coverMotionState &&
          Number.isFinite(motorStateNumber) &&
          Math.abs(motorStateNumber) >= 0.5 &&
          (coverMotionState.sawMotorRunning = true),
          syncCoverDerivedState(),
          syncCoverDetails(primaryCoverState));
      }),
      (coverControlsPanel.cleanupCoverDetails = () => {
        (clearCoverMotionTimers(),
          (coverMotionState = null),
          (dreamCurtainTarget = null),
          (isCoverMotionActive = false));
      }),
      syncCoverDetails(coverStateObject, {
        primary: true,
      }),
      coverControlsPanel
    );
  }
  ["createClimateDetailsControls"](
    climateDetailsEntityId,
    climateState,
    {
      interactive: isClimateInteractive = true,
      onPowerChange: onClimatePowerChange = null,
      onVisualChange: onClimateVisualChange = null,
      modeColors: climateModeColors = {} as Record<string, string>,
      deviceType: climateStructureType = "air-conditioner",
    } = {},
  ): ComponentControllerElement {
    const climateNormalizedCapabilities = normalizeClimateCapabilities2(climateState),
      attributes2 = climateNormalizedCapabilities.attributes,
      climateEntityDomain = String(climateDetailsEntityId || "").split(".", 1)[0],
      climateModeOptionLabels = {
        entityId: climateDetailsEntityId,
        entityMetadata: this.entityMetadata,
        entityTranslations: this.entityTranslations,
      },
      climateDetailsPanel: ComponentControllerElement = document.createElement("section");
    ((climateDetailsPanel.className = "hb-climate-details-controls"),
      (climateDetailsPanel.dataset.climateDeviceType = climateStructureType),
      (climateDetailsPanel.dataset.climateStructureKey = climateControlStructureKey2(
        climateDetailsEntityId,
        climateState,
        climateStructureType,
      )),
      (climateDetailsPanel.inert = !isClimateInteractive));
    const currentTemperature = climateNormalizedCapabilities.currentTemperature,
      targetTemperature2 = climateNormalizedCapabilities.targetTemperature,
      minimumTemperature = climateNormalizedCapabilities.minimumTemperature,
      maximumTemperature = climateNormalizedCapabilities.maximumTemperature,
      temperatureStep = climateNormalizedCapabilities.temperatureStep,
      supportsTargetTemperature =
        ["climate", "water_heater"].includes(climateEntityDomain) &&
        climateNormalizedCapabilities.supportsTargetTemperature,
      isWaterHeater = climateEntityDomain === "water_heater";
    climateDetailsPanel.classList.toggle("without-temperature", !supportsTargetTemperature);
    let targetTemperatureValue = supportsTargetTemperature
        ? targetTemperature2
        : minimumTemperature,
      temperatureCommitTimer = null,
      temperatureSyncTimer = null,
      temperatureControlTimer = null;
    const applyCommittedTemperature = () => {
        ((temperatureCommitTimer = null),
          window.clearTimeout(temperatureSyncTimer),
          window.clearTimeout(temperatureControlTimer),
          (temperatureSyncTimer = null),
          (temperatureControlTimer = null));
      },
      commitTemperature = (nextTemperature) => {
        ((temperatureCommitTimer = nextTemperature),
          window.clearTimeout(temperatureSyncTimer),
          window.clearTimeout(temperatureControlTimer),
          (temperatureControlTimer = null),
          (temperatureSyncTimer = window.setTimeout(() => {
            ((temperatureCommitTimer = null), (temperatureSyncTimer = null));
          }, 8000)));
      },
      applyLocalTemperature = () => {
        (window.clearTimeout(temperatureControlTimer),
          (temperatureControlTimer = window.setTimeout(applyCommittedTemperature, 2500)));
      },
      climateThermostatSection = document.createElement("section");
    climateThermostatSection.className = "hb-climate-thermostat";
    const temperatureDecreaseButton = document.createElement("button");
    ((temperatureDecreaseButton.type = "button"),
      (temperatureDecreaseButton.className = "hb-climate-temperature-step"),
      (temperatureDecreaseButton.textContent = "−"),
      temperatureDecreaseButton.setAttribute("aria-label", "降低设定温度"));
    const temperatureDialBox = document.createElement("div");
    temperatureDialBox.className = "hb-climate-temperature-dial";
    const temperatureArcStartIcon = document.createElement("i");
    ((temperatureArcStartIcon.className = "hb-climate-arc-cap start"),
      temperatureArcStartIcon.setAttribute("aria-hidden", "true"));
    const temperatureArcEndIcon = document.createElement("i");
    ((temperatureArcEndIcon.className = "hb-climate-arc-cap end"),
      temperatureArcEndIcon.setAttribute("aria-hidden", "true"));
    const temperatureThumbButton = document.createElement("button");
    ((temperatureThumbButton.type = "button"),
      (temperatureThumbButton.className = "hb-climate-temperature-thumb"),
      temperatureThumbButton.setAttribute("aria-label", "拖动调节设定温度"));
    const temperatureContentBox = document.createElement("div");
    temperatureContentBox.className = "hb-climate-temperature-content";
    const temperatureSettingCaption = document.createElement("small");
    temperatureSettingCaption.textContent = "设定温度";
    const temperatureValueLabel = document.createElement("strong"),
      temperatureCurrentLabel = document.createElement("span");
    ((temperatureCurrentLabel.textContent = Number.isFinite(currentTemperature)
      ? "当前温度 " + currentTemperature + "°C"
      : "当前温度 --"),
      temperatureContentBox.append(
        temperatureSettingCaption,
        temperatureValueLabel,
        temperatureCurrentLabel,
      ),
      temperatureDialBox.append(
        temperatureArcStartIcon,
        temperatureArcEndIcon,
        temperatureThumbButton,
        temperatureContentBox,
      ));
    const temperatureIncreaseButton = document.createElement("button");
    ((temperatureIncreaseButton.type = "button"),
      (temperatureIncreaseButton.className = "hb-climate-temperature-step"),
      (temperatureIncreaseButton.textContent = "+"),
      temperatureIncreaseButton.setAttribute("aria-label", "提高设定温度"));
    let climateDetailsSnapshot = climateState;
    const climateEffectMode = (climateStateArg) =>
        climateEffectMode2(climateStateArg, climateStructureType),
      syncClimateState = (nextClimateState = climateDetailsSnapshot) => {
        climateDetailsSnapshot = nextClimateState || climateDetailsSnapshot;
        const climateVisualModeName = climateEffectMode(climateDetailsSnapshot),
          accentBlendAmount = Math.max(
            0,
            Math.min(
              1,
              (targetTemperatureValue - minimumTemperature) /
                Math.max(temperatureStep, maximumTemperature - minimumTemperature),
            ),
          ),
          climateDetailsAccent =
            climateVisualModeName === "cool"
              ? climateModeColors.cool || "#73c8ff"
              : climateVisualModeName === "heat"
                ? climateModeColors.heat || "#ff8a65"
                : climateModeColors.other || "#dce2e6",
          climateDarkAccentColor =
            climateVisualModeName === "off"
              ? "#65717a"
              : climateVisualModeName === "cool"
                ? mixHexColor(climateDetailsAccent, "#ffffff", accentBlendAmount * 0.32)
                : climateVisualModeName === "heat"
                  ? mixHexColor(climateDetailsAccent, "#ffffff", (1 - accentBlendAmount) * 0.3)
                  : climateDetailsAccent;
        ((climateDetailsPanel.dataset.climateVisualMode = climateVisualModeName),
          climateVisualModeName !== "off" &&
            (climateDetailsPanel.dataset.lastClimateMode = String(
              climateDetailsSnapshot?.state || "auto",
            )));
        const gn2 = mixHexColor(climateDarkAccentColor, "#11171c", 0.72);
        (climateDetailsPanel.style.setProperty("--hb-climate-accent", climateDarkAccentColor),
          climateDetailsPanel.style.setProperty("--hb-climate-accent-soft", gn2));
        const isClimateRunningState = climateIsRunning2(
          climateDetailsSnapshot,
          climateStructureType,
        );
        (climateDetailsPanel.classList.toggle("is-running", isClimateRunningState),
          onClimateVisualChange?.({
            mode: climatePresentationMode2(climateDetailsSnapshot, climateStructureType),
            visualMode: climateVisualModeName,
            running: isClimateRunningState,
            accentColor: climateDarkAccentColor,
            accentSoft: gn2,
            targetTemperature: supportsTargetTemperature ? targetTemperatureValue : null,
          }));
        const currentTemperature2 =
          normalizeClimateCapabilities2(climateDetailsSnapshot).currentTemperature;
        temperatureCurrentLabel.textContent =
          currentTemperature2 !== null ? "当前温度 " + currentTemperature2 + "°C" : "当前温度 --";
        const climateServiceStateKey = (climateServiceName) =>
          climateServiceName === "set_hvac_mode"
            ? climateDetailsSnapshot?.state
            : climateServiceName === "set_fan_mode"
              ? climateDetailsSnapshot?.attributes?.fan_mode
              : climateServiceName === "set_swing_mode"
                ? climateDetailsSnapshot?.attributes?.swing_mode
                : climateServiceName === "set_swing_horizontal_mode"
                  ? climateDetailsSnapshot?.attributes?.swing_horizontal_mode
                  : climateServiceName === "set_preset_mode"
                    ? climateDetailsSnapshot?.attributes?.preset_mode
                    : climateServiceName === "set_operation_mode"
                      ? climateDetailsSnapshot?.attributes?.operation_mode
                      : null;
        for (const climateServiceButton of climateDetailsPanel.querySelectorAll<HTMLElement>(
          "button[data-climate-service]",
        )) {
          const climateService = climateServiceButton.dataset.climateService,
            climateServiceValue = climateServiceStateKey(climateService);
          climateServiceButton.classList.toggle(
            "active",
            climateServiceButton.dataset.climateValue === String(climateServiceValue ?? ""),
          );
        }
        for (const climateSelectContainer of climateDetailsPanel.querySelectorAll<HTMLElement>(
          ".hb-climate-select[data-climate-service]",
        )) {
          const currentClimateServiceValue = String(
            climateServiceStateKey(climateSelectContainer.dataset.climateService) ?? "",
          );
          climateSelectContainer.dataset.currentValue = currentClimateServiceValue;
          const selectedClimateOption = Array.from(
              climateSelectContainer.querySelectorAll<HTMLElement>('[role="option"]'),
            ).find(
              (climateOptionCandidateElement) =>
                climateOptionCandidateElement.dataset.value === currentClimateServiceValue,
            ),
            climateSelectTriggerLabel = climateSelectContainer.querySelector<HTMLElement>(
              ".hb-climate-select-trigger > span",
            );
          (climateSelectTriggerLabel &&
            ((climateSelectTriggerLabel.textContent =
              selectedClimateOption?.textContent || currentClimateServiceValue || "请选择"),
            (climateSelectTriggerLabel.title = climateSelectTriggerLabel.textContent)),
            climateSelectContainer
              .querySelectorAll<HTMLElement>('[role="option"]')
              .forEach((climateOptionElement) => {
                const isClimateOptionSelected =
                  climateOptionElement.dataset.value === currentClimateServiceValue;
                (climateOptionElement.classList.toggle("active", isClimateOptionSelected),
                  climateOptionElement.setAttribute(
                    "aria-selected",
                    String(isClimateOptionSelected),
                  ));
              }));
        }
      },
      commitClimateChange = (isForcedCommit = false) => {
        temperatureValueLabel.innerHTML = supportsTargetTemperature
          ? targetTemperatureValue + "<small>°C</small>"
          : "--";
        const temperatureProgressValue =
            ((targetTemperatureValue - minimumTemperature) /
              Math.max(temperatureStep, maximumTemperature - minimumTemperature)) *
            75,
          temperatureProgress = Math.max(0, Math.min(75, temperatureProgressValue));
        (temperatureDialBox.style.setProperty(
          "--hb-climate-temperature-progress",
          temperatureProgress + "%",
        ),
          temperatureDialBox.style.setProperty(
            "--hb-climate-thumb-angle",
            225 + (temperatureProgress / 75) * 270 + "deg",
          ),
          temperatureThumbButton.setAttribute("aria-valuemin", String(minimumTemperature)),
          temperatureThumbButton.setAttribute("aria-valuemax", String(maximumTemperature)),
          temperatureThumbButton.setAttribute("aria-valuenow", String(targetTemperatureValue)),
          temperatureThumbButton.setAttribute("aria-valuetext", targetTemperatureValue + "°C"));
        const temperatureStepEpsilon = Math.max(0.001, temperatureStep / 2);
        ((temperatureDecreaseButton.disabled =
          !supportsTargetTemperature ||
          targetTemperatureValue <= minimumTemperature + temperatureStepEpsilon),
          (temperatureIncreaseButton.disabled =
            !supportsTargetTemperature ||
            targetTemperatureValue >= maximumTemperature - temperatureStepEpsilon),
          (temperatureDecreaseButton.title = "最低 " + minimumTemperature + "°C"),
          (temperatureIncreaseButton.title = "最高 " + maximumTemperature + "°C"),
          syncClimateState(),
          isForcedCommit &&
            (temperatureValueLabel.classList.remove("is-changing"),
            window.requestAnimationFrame(() =>
              temperatureValueLabel.classList.add("is-changing"),
            )));
      };
    let committedTemperature = targetTemperatureValue;
    const pendingTemperatures = [];
    let activePendingTemperature = null,
      previousTemperature = targetTemperatureValue,
      isStepPending = false,
      stepTimerId = null;
    const areTemperaturesEqual = (temperatureA, temperatureB) =>
        temperatureA !== null &&
        temperatureB !== null &&
        Math.abs(temperatureA - temperatureB) < 1e-8,
      getPendingTemperature = () => pendingTemperatures.at(-1) ?? activePendingTemperature,
      resetPendingTemperatureQueue = () => {
        const pendingTemperature = getPendingTemperature();
        pendingTemperature !== null && commitTemperature(pendingTemperature);
      },
      flushPendingTemperatures = async () => {
        if (
          (window.clearTimeout(stepTimerId),
          (stepTimerId = null),
          isStepPending || !pendingTemperatures.length)
        )
          return;
        const shift = pendingTemperatures.shift();
        if (
          ((activePendingTemperature = shift), areTemperaturesEqual(shift, committedTemperature))
        ) {
          ((activePendingTemperature = null),
            resetPendingTemperatureQueue(),
            pendingTemperatures.length &&
              (stepTimerId = window.setTimeout(flushPendingTemperatures, 220)));
          return;
        }
        isStepPending = true;
        try {
          (await this.callEntityService(
            climateEntityDomain === "climate" ? "climate" : climateEntityDomain,
            "set_temperature",
            climateDetailsEntityId,
            {
              temperature: shift,
            },
          ),
            (committedTemperature = shift),
            climateEntityDomain !== "water_heater" && onClimatePowerChange?.(true));
        } catch (temperatureCommitError) {
          ((pendingTemperatures.length = 0),
            applyCommittedTemperature(),
            (previousTemperature = committedTemperature),
            (targetTemperatureValue = committedTemperature),
            commitClimateChange(true),
            this.options.onError?.(temperatureCommitError));
        } finally {
          ((isStepPending = false),
            (activePendingTemperature = null),
            resetPendingTemperatureQueue(),
            pendingTemperatures.length &&
              (stepTimerId = window.setTimeout(flushPendingTemperatures, 220)));
        }
      },
      applyTemperatureChange = ({
        preserveIntermediateSteps: shouldPreserveIntermediateSteps = true,
      } = {}) => {
        const newTemperature = targetTemperatureValue;
        previousTemperature = newTemperature;
        const latestTemperatureEntry =
          pendingTemperatures.at(-1) ?? activePendingTemperature ?? committedTemperature;
        if (areTemperaturesEqual(newTemperature, latestTemperatureEntry)) {
          resetPendingTemperatureQueue();
          return;
        }
        if (shouldPreserveIntermediateSteps && isWaterHeater) {
          const at2 =
            pendingTemperatures.at(-2) ?? activePendingTemperature ?? committedTemperature;
          pendingTemperatures.length && areTemperaturesEqual(newTemperature, at2)
            ? pendingTemperatures.pop()
            : pendingTemperatures.push(newTemperature);
        } else ((pendingTemperatures.length = 0), pendingTemperatures.push(newTemperature));
        (resetPendingTemperatureQueue(),
          isStepPending ||
            (window.clearTimeout(stepTimerId),
            (stepTimerId = window.setTimeout(flushPendingTemperatures, 160))));
      },
      adjustTemperatureByStep = (stepDirection) => {
        if (!isClimateInteractive || !supportsTargetTemperature) return;
        const initialTemperature = targetTemperatureValue,
          temperatureStepDecimals = String(temperatureStep).split(".")[1]?.length || 0;
        ((targetTemperatureValue = Number(
          Math.max(
            minimumTemperature,
            Math.min(maximumTemperature, targetTemperatureValue + stepDirection * temperatureStep),
          ).toFixed(temperatureStepDecimals),
        )),
          targetTemperatureValue !== initialTemperature &&
            (commitClimateChange(true), applyTemperatureChange()));
      },
      temperatureFromPointer = (pointerEvent) => {
        const temperatureDialBounds = temperatureDialBox.getBoundingClientRect(),
          dialCenterX = temperatureDialBounds.left + temperatureDialBounds.width / 2,
          dialCenterY = temperatureDialBounds.top + temperatureDialBounds.height / 2,
          pointerOffsetX = pointerEvent.clientX - dialCenterX,
          pointerOffsetY = pointerEvent.clientY - dialCenterY,
          pointerAngleDeg =
            ((Math.atan2(pointerOffsetX, -pointerOffsetY) * 180) / Math.PI + 360) % 360;
        let normalizedAngleDeg;
        pointerAngleDeg >= 225
          ? (normalizedAngleDeg = pointerAngleDeg)
          : pointerAngleDeg <= 135
            ? (normalizedAngleDeg = pointerAngleDeg + 360)
            : (normalizedAngleDeg = pointerAngleDeg <= 180 ? 495 : 225);
        const angleRatio = Math.max(0, Math.min(1, (normalizedAngleDeg - 225) / 270)),
          dialStepDecimals = String(temperatureStep).split(".")[1]?.length || 0;
        return Number(
          (
            minimumTemperature +
            Math.round(((maximumTemperature - minimumTemperature) * angleRatio) / temperatureStep) *
              temperatureStep
          ).toFixed(dialStepDecimals),
        );
      };
    let activePointer = null;
    (temperatureDialBox.addEventListener(
      "pointerdown",
      (createClimateDetailsControlsPointerDownEvent) => {
        if (!isClimateInteractive || !supportsTargetTemperature) return;
        const temperatureDialRect = temperatureDialBox.getBoundingClientRect(),
          dialRadius = Math.min(temperatureDialRect.width, temperatureDialRect.height) / 2,
          hypot4 = Math.hypot(
            createClimateDetailsControlsPointerDownEvent.clientX -
              (temperatureDialRect.left + temperatureDialRect.width / 2),
            createClimateDetailsControlsPointerDownEvent.clientY -
              (temperatureDialRect.top + temperatureDialRect.height / 2),
          );
        (createClimateDetailsControlsPointerDownEvent.target !== temperatureThumbButton &&
          Math.abs(hypot4 - dialRadius) > 34) ||
          (createClimateDetailsControlsPointerDownEvent.preventDefault(),
          (activePointer = {
            pointerId: createClimateDetailsControlsPointerDownEvent.pointerId,
            previous: targetTemperatureValue,
          }),
          temperatureDialBox.setPointerCapture(
            createClimateDetailsControlsPointerDownEvent.pointerId,
          ),
          temperatureDialBox.classList.add("is-dragging"),
          (targetTemperatureValue = temperatureFromPointer(
            createClimateDetailsControlsPointerDownEvent,
          )),
          commitClimateChange());
      },
    ),
      temperatureDialBox.addEventListener(
        "pointermove",
        (createClimateDetailsControlsPointerMoveEvent) => {
          !activePointer ||
            createClimateDetailsControlsPointerMoveEvent.pointerId !== activePointer.pointerId ||
            ((targetTemperatureValue = temperatureFromPointer(
              createClimateDetailsControlsPointerMoveEvent,
            )),
            commitClimateChange());
        },
      ));
    const endTemperatureDrag = (createClimateDetailsControlsPointerUpEvent) => {
      if (
        !activePointer ||
        createClimateDetailsControlsPointerUpEvent.pointerId !== activePointer.pointerId
      )
        return;
      const previous = activePointer.previous;
      ((activePointer = null),
        temperatureDialBox.classList.remove("is-dragging"),
        temperatureDialBox.hasPointerCapture(
          createClimateDetailsControlsPointerUpEvent.pointerId,
        ) &&
          temperatureDialBox.releasePointerCapture(
            createClimateDetailsControlsPointerUpEvent.pointerId,
          ),
        commitClimateChange(true),
        targetTemperatureValue !== previous &&
          applyTemperatureChange({
            preserveIntermediateSteps: false,
          }));
    };
    (temperatureDialBox.addEventListener("pointerup", endTemperatureDrag),
      temperatureDialBox.addEventListener("pointercancel", endTemperatureDrag),
      (temperatureThumbButton.disabled = !supportsTargetTemperature),
      temperatureDecreaseButton.addEventListener("click", () => adjustTemperatureByStep(-1)),
      temperatureIncreaseButton.addEventListener("click", () => adjustTemperatureByStep(1)),
      commitClimateChange(),
      climateThermostatSection.append(
        temperatureDecreaseButton,
        temperatureDialBox,
        temperatureIncreaseButton,
      ),
      supportsTargetTemperature && climateDetailsPanel.append(climateThermostatSection));
    const waterHeaterControlPanel =
      climateStructureType === "water-heater" ? document.createElement("section") : null;
    waterHeaterControlPanel &&
      ((waterHeaterControlPanel.className = "hb-water-heater-control-panel"),
      (waterHeaterControlPanel.dataset.controlSource = "primary-entity"),
      climateDetailsPanel.append(waterHeaterControlPanel),
      (climateDetailsPanel.waterHeaterControlPanel = waterHeaterControlPanel));
    const createClimateDetailsGroup = ({
        label: groupLabel,
        values: optionValues,
        current: currentOptionValue,
        service: createClimateDetailsGroupServiceName,
        dataKey: servicePayloadField,
        labels: optionLabels = {},
        icons: optionIcons = {},
        className: extraClassName = "",
        domain: createClimateDetailsGroupServiceDomain = "climate",
        presentation: presentationMode = "auto",
      }) => {
        const normalizedOptionValues = [
          ...new Set(
            (Array.isArray(optionValues) ? optionValues : [])
              .map((rawOptionValue) => String(rawOptionValue ?? "").trim())
              .filter(Boolean),
          ),
        ];
        if (!normalizedOptionValues.length) return;
        const resolvedPresentation =
            presentationMode === "auto"
              ? climateOptionPresentation2(normalizedOptionValues, optionLabels)
              : presentationMode,
          detailsGroupElement = document.createElement("div");
        ((detailsGroupElement.className = ("hb-climate-details-group " + extraClassName).trim()),
          waterHeaterControlPanel &&
            (detailsGroupElement.dataset.controlSource = "primary-entity"));
        const detailsGroupLabel = document.createElement("strong");
        if (((detailsGroupLabel.textContent = groupLabel), resolvedPresentation === "select")) {
          detailsGroupElement.classList.add("select-options");
          const selectWrapper = document.createElement("div");
          ((selectWrapper.className = "hb-climate-select"),
            (selectWrapper.dataset.climateService = createClimateDetailsGroupServiceName),
            (selectWrapper.dataset.currentValue = String(currentOptionValue ?? "")));
          const selectTriggerButton = document.createElement("button");
          ((selectTriggerButton.type = "button"),
            (selectTriggerButton.className = "hb-climate-select-trigger"),
            selectTriggerButton.setAttribute("aria-label", groupLabel),
            selectTriggerButton.setAttribute("aria-haspopup", "listbox"),
            selectTriggerButton.setAttribute("aria-expanded", "false"),
            (selectTriggerButton.disabled = !isClimateInteractive));
          const selectTriggerLabel = document.createElement("span"),
            selectCaretIcon = document.createElement("i");
          (selectCaretIcon.setAttribute("aria-hidden", "true"),
            selectTriggerButton.append(selectTriggerLabel, selectCaretIcon));
          const selectMenuElement = document.createElement("div");
          ((selectMenuElement.className = "hb-climate-select-menu"),
            (selectMenuElement.id = "hb-climate-select-" + randomUuid2()),
            selectMenuElement.setAttribute("role", "listbox"),
            selectMenuElement.setAttribute("aria-label", groupLabel),
            selectMenuElement.setAttribute("popover", "auto"),
            (selectMenuElement.hidden = true),
            selectTriggerButton.setAttribute("aria-controls", selectMenuElement.id));
          let isMenuBusy = false;
          const isSelectMenuOpen = () => {
              try {
                return selectMenuElement.matches(":popover-open");
              } catch {
                return selectMenuElement.dataset.open === "true";
              }
            },
            applySelectValue = (selectedValue) => {
              const normalizedSelectedValue = String(selectedValue ?? "");
              selectWrapper.dataset.currentValue = normalizedSelectedValue;
              const selectedMenuOption = Array.from(
                selectMenuElement.querySelectorAll<HTMLElement>('[role="option"]'),
              ).find(
                (optionMatchElement) =>
                  optionMatchElement.dataset.value === normalizedSelectedValue,
              );
              ((selectTriggerLabel.textContent =
                selectedMenuOption?.textContent || normalizedSelectedValue || "请选择"),
                (selectTriggerLabel.title = selectTriggerLabel.textContent),
                selectMenuElement
                  .querySelectorAll<HTMLElement>('[role="option"]')
                  .forEach((menuOptionElement) => {
                    const isMenuOptionSelected =
                      menuOptionElement.dataset.value === normalizedSelectedValue;
                    (menuOptionElement.classList.toggle("active", isMenuOptionSelected),
                      menuOptionElement.setAttribute(
                        "aria-selected",
                        String(isMenuOptionSelected),
                      ));
                  }));
            },
            positionSelectMenu = () => {
              if (!isSelectMenuOpen() && selectMenuElement.hidden) return;
              const triggerBounds = selectTriggerButton.getBoundingClientRect(),
                innerWidth2 = window.innerWidth,
                innerHeight2 = window.innerHeight,
                menuWidth = Math.min(
                  Math.max(triggerBounds.width, 190),
                  Math.max(190, innerWidth2 - 20),
                );
              ((selectMenuElement.style.width = menuWidth + "px"),
                (selectMenuElement.style.maxHeight =
                  Math.min(360, Math.max(120, innerHeight2 - 20)) + "px"));
              const menuHeight = Math.min(selectMenuElement.scrollHeight || 0, 360),
                selectSpaceBelow = innerHeight2 - triggerBounds.bottom - 10,
                selectSpaceAbove = triggerBounds.top - 10,
                menuTop =
                  selectSpaceBelow < Math.min(menuHeight, 180) &&
                  selectSpaceAbove > selectSpaceBelow
                    ? Math.max(10, triggerBounds.top - menuHeight - 5)
                    : Math.min(innerHeight2 - menuHeight - 10, triggerBounds.bottom + 5);
              ((selectMenuElement.style.left =
                Math.max(10, Math.min(triggerBounds.left, innerWidth2 - menuWidth - 10)) + "px"),
                (selectMenuElement.style.top = Math.max(10, menuTop) + "px"));
            },
            openSelectMenu = () => {
              (isSelectMenuOpen() &&
                typeof selectMenuElement.hidePopover == "function" &&
                selectMenuElement.hidePopover(),
                (selectMenuElement.hidden = true),
                (selectMenuElement.dataset.open = "false"),
                selectTriggerButton.setAttribute("aria-expanded", "false"));
            },
            closeSelectMenu = (shouldFocusTrigger = false) => {
              selectTriggerButton.disabled ||
                isMenuBusy ||
                ((selectMenuElement.hidden = false),
                typeof selectMenuElement.showPopover == "function"
                  ? selectMenuElement.showPopover()
                  : (selectMenuElement.dataset.open = "true"),
                selectTriggerButton.setAttribute("aria-expanded", "true"),
                positionSelectMenu(),
                shouldFocusTrigger &&
                  (
                    selectMenuElement.querySelector<HTMLElement>('[aria-selected="true"]') ||
                    selectMenuElement.querySelector<HTMLElement>('[role="option"]')
                  )?.focus());
            },
            selectClimateOption = async (optionValue) => {
              if (!isClimateInteractive || isMenuBusy) return;
              const currentValue = selectWrapper.dataset.currentValue;
              ((isMenuBusy = true),
                (selectTriggerButton.disabled = true),
                openSelectMenu(),
                applySelectValue(optionValue));
              try {
                await this.callEntityService(
                  createClimateDetailsGroupServiceDomain,
                  createClimateDetailsGroupServiceName,
                  climateDetailsEntityId,
                  {
                    [servicePayloadField]: optionValue,
                  },
                );
                const detailsGroupOptions = {
                  ...(climateDetailsSnapshot?.attributes || {}),
                  [servicePayloadField]: optionValue,
                };
                if (createClimateDetailsGroupServiceName === "set_hvac_mode")
                  ((climateDetailsSnapshot = {
                    ...(climateDetailsSnapshot || {}),
                    state: optionValue,
                    attributes: {
                      ...detailsGroupOptions,
                      hvac_action:
                        optionValue === "cool"
                          ? "cooling"
                          : optionValue === "heat"
                            ? "heating"
                            : optionValue === "off"
                              ? "off"
                              : optionValue,
                    },
                  }),
                    onClimatePowerChange?.(optionValue !== "off"));
                else {
                  if (createClimateDetailsGroupServiceName === "set_preset_mode") {
                    const isClimateActive =
                        climateStructureType === "bath-heater" &&
                        ["idle", "standby", "待机", "关闭"].includes(
                          String(optionValue).trim().toLowerCase(),
                        ),
                      unknownStateText =
                        climateDetailsPanel.dataset.lastClimateMode ||
                        climateNormalizedCapabilities.hvacModes.find(
                          (hvacModeCandidate) => hvacModeCandidate !== "off",
                        ) ||
                        (climateEntityDomain === "fan" ? "on" : "auto"),
                      climateStateOptions = {
                        ...(climateDetailsSnapshot || {}),
                        state: isClimateActive
                          ? "off"
                          : climateIsPoweredOn2(climateDetailsSnapshot, climateStructureType)
                            ? climateDetailsSnapshot?.state
                            : unknownStateText,
                        attributes: {
                          ...detailsGroupOptions,
                          preset_mode: optionValue,
                        },
                      },
                      effectMode = climateEffectMode2(climateStateOptions, climateStructureType);
                    ((climateStateOptions.attributes.hvac_action = isClimateActive
                      ? "idle"
                      : effectMode === "cool"
                        ? "cooling"
                        : effectMode === "heat"
                          ? "heating"
                          : "fan"),
                      (climateDetailsSnapshot = climateStateOptions),
                      onClimatePowerChange?.(!isClimateActive));
                  } else
                    createClimateDetailsGroupServiceName === "set_operation_mode"
                      ? ((climateDetailsSnapshot = {
                          ...(climateDetailsSnapshot || {}),
                          state: optionValue === "off" ? "off" : "on",
                          attributes: {
                            ...detailsGroupOptions,
                            operation_mode: optionValue,
                          },
                        }),
                        onClimatePowerChange?.(optionValue !== "off"))
                      : (climateDetailsSnapshot = {
                          ...(climateDetailsSnapshot || {}),
                          attributes: detailsGroupOptions,
                        });
                }
                syncClimateState();
              } catch (climateUpdateError) {
                (applySelectValue(currentValue), this.options.onError?.(climateUpdateError));
              } finally {
                ((isMenuBusy = false), (selectTriggerButton.disabled = !isClimateInteractive));
              }
            };
          for (const climateModeValue of normalizedOptionValues) {
            const climateOptionButton = document.createElement("button");
            ((climateOptionButton.type = "button"),
              (climateOptionButton.className = "hb-climate-select-option"),
              climateOptionButton.setAttribute("role", "option"),
              (climateOptionButton.dataset.value = climateModeValue),
              (climateOptionButton.textContent =
                optionLabels[climateModeValue] || climateModeValue),
              (climateOptionButton.title = climateOptionButton.textContent),
              climateOptionButton.addEventListener("click", () =>
                selectClimateOption(climateModeValue),
              ),
              selectMenuElement.append(climateOptionButton));
          }
          (applySelectValue(String(currentOptionValue ?? "")),
            selectTriggerButton.addEventListener("click", () => {
              isSelectMenuOpen() || selectMenuElement.dataset.open === "true"
                ? openSelectMenu()
                : closeSelectMenu();
            }),
            selectTriggerButton.addEventListener("keydown", (triggerKeyEvent) => {
              ["ArrowDown", "ArrowUp", "Enter", " "].includes(triggerKeyEvent.key) &&
                (triggerKeyEvent.preventDefault(), closeSelectMenu(true));
            }),
            selectMenuElement.addEventListener("keydown", (menuKeyEvent) => {
              const menuOptions = [
                  ...selectMenuElement.querySelectorAll<HTMLElement>('[role="option"]'),
                ],
                indexOf2 = menuOptions.findIndex(
                  (menuOptionElement) => menuOptionElement === document.activeElement,
                );
              if (menuKeyEvent.key === "Escape")
                (menuKeyEvent.preventDefault(), openSelectMenu(), selectTriggerButton.focus());
              else {
                if (menuKeyEvent.key === "ArrowDown" || menuKeyEvent.key === "ArrowUp") {
                  menuKeyEvent.preventDefault();
                  const keyDirection = menuKeyEvent.key === "ArrowDown" ? 1 : -1;
                  menuOptions[
                    (indexOf2 + keyDirection + menuOptions.length) % menuOptions.length
                  ]?.focus();
                } else
                  (menuKeyEvent.key === "Enter" || menuKeyEvent.key === " ") &&
                    (menuKeyEvent.preventDefault(), clickFocusedElement());
              }
            }),
            selectMenuElement.addEventListener("toggle", (toggleEvent) => {
              const isMenuOpen = toggleEvent.newState === "open";
              ((selectMenuElement.hidden = !isMenuOpen),
                (selectMenuElement.dataset.open = String(isMenuOpen)),
                selectTriggerButton.setAttribute("aria-expanded", String(isMenuOpen)),
                isMenuOpen && positionSelectMenu());
            }),
            selectWrapper.append(selectTriggerButton, selectMenuElement),
            detailsGroupElement.append(detailsGroupLabel, selectWrapper),
            (waterHeaterControlPanel || climateDetailsPanel).append(detailsGroupElement));
          return;
        }
        const detailsOptionsWrapper = document.createElement("div");
        detailsOptionsWrapper.className = "hb-climate-details-options";
        for (const detailsOptionValue of normalizedOptionValues) {
          const detailsOptionButton = document.createElement("button");
          ((detailsOptionButton.type = "button"),
            (detailsOptionButton.dataset.climateService = createClimateDetailsGroupServiceName),
            (detailsOptionButton.dataset.climateValue = detailsOptionValue));
          const detailsOptionIcon = document.createElement("i");
          (detailsOptionIcon.setAttribute("aria-hidden", "true"),
            (detailsOptionIcon.textContent = optionIcons[detailsOptionValue] || ""));
          const detailsOptionLabel = document.createElement("span");
          ((detailsOptionLabel.textContent =
            optionLabels[detailsOptionValue] || detailsOptionValue),
            detailsOptionButton.append(detailsOptionIcon, detailsOptionLabel),
            detailsOptionButton.classList.toggle(
              "active",
              detailsOptionValue === currentOptionValue,
            ),
            detailsOptionButton.addEventListener("click", async () => {
              if (!isClimateInteractive) return;
              const isDetailActive =
                climateStructureType === "bath-heater" &&
                createClimateDetailsGroupServiceName === "set_preset_mode" &&
                ["idle", "standby", "待机", "关闭"].includes(
                  String(detailsOptionValue).trim().toLowerCase(),
                );
              detailsOptionsWrapper.querySelectorAll("button").forEach((disabledOptionButton) => {
                disabledOptionButton.disabled = true;
              });
              try {
                if (
                  (await this.callEntityService(
                    createClimateDetailsGroupServiceDomain,
                    createClimateDetailsGroupServiceName,
                    climateDetailsEntityId,
                    {
                      [servicePayloadField]: detailsOptionValue,
                    },
                  ),
                  isDetailActive)
                ) {
                  const powerCommand = climatePowerCommand2(
                    climateDetailsEntityId,
                    climateDetailsSnapshot,
                    false,
                    "bath-heater",
                  );
                  await this.callEntityService(
                    powerCommand.domain,
                    powerCommand.service,
                    climateDetailsEntityId,
                    powerCommand.data,
                  );
                }
                if (
                  (detailsOptionsWrapper
                    .querySelectorAll("button")
                    .forEach((activeOptionButton) =>
                      activeOptionButton.classList.toggle(
                        "active",
                        activeOptionButton === detailsOptionButton,
                      ),
                    ),
                  createClimateDetailsGroupServiceName === "set_hvac_mode")
                ) {
                  const hvacActionText =
                    detailsOptionValue === "cool"
                      ? "cooling"
                      : detailsOptionValue === "heat"
                        ? "heating"
                        : detailsOptionValue === "off"
                          ? "off"
                          : detailsOptionValue;
                  ((climateDetailsSnapshot = {
                    ...(climateDetailsSnapshot || {}),
                    state: detailsOptionValue,
                    attributes: {
                      ...(climateDetailsSnapshot?.attributes || {}),
                      hvac_action: hvacActionText,
                    },
                  }),
                    syncClimateState(),
                    onClimatePowerChange?.(detailsOptionValue !== "off"));
                } else {
                  if (createClimateDetailsGroupServiceName === "set_preset_mode") {
                    const isOptionActive = isDetailActive,
                      defaultStateText =
                        climateDetailsPanel.dataset.lastClimateMode ||
                        climateNormalizedCapabilities.hvacModes.find(
                          (hvacModeItem) => hvacModeItem !== "off",
                        ) ||
                        (climateEntityDomain === "fan" ? "on" : "auto"),
                      waterHeaterStateOptions = {
                        ...(climateDetailsSnapshot || {}),
                        state: isOptionActive
                          ? "off"
                          : climateIsPoweredOn2(climateDetailsSnapshot, climateStructureType)
                            ? climateDetailsSnapshot?.state
                            : defaultStateText,
                        attributes: {
                          ...(climateDetailsSnapshot?.attributes || {}),
                          preset_mode: detailsOptionValue,
                        },
                      },
                      waterHeaterEffectMode = climateEffectMode2(
                        waterHeaterStateOptions,
                        climateStructureType,
                      );
                    ((waterHeaterStateOptions.attributes.hvac_action = isOptionActive
                      ? "idle"
                      : waterHeaterEffectMode === "cool"
                        ? "cooling"
                        : waterHeaterEffectMode === "heat"
                          ? "heating"
                          : "fan"),
                      (climateDetailsSnapshot = waterHeaterStateOptions),
                      syncClimateState(),
                      onClimatePowerChange?.(!isOptionActive));
                  } else
                    createClimateDetailsGroupServiceName === "set_operation_mode" &&
                      ((climateDetailsSnapshot = {
                        ...(climateDetailsSnapshot || {}),
                        state: detailsOptionValue === "off" ? "off" : "on",
                        attributes: {
                          ...(climateDetailsSnapshot?.attributes || {}),
                          operation_mode: detailsOptionValue,
                        },
                      }),
                      syncClimateState(),
                      onClimatePowerChange?.(detailsOptionValue !== "off"));
                }
              } catch (waterHeaterUpdateError) {
                this.options.onError?.(waterHeaterUpdateError);
              } finally {
                detailsOptionsWrapper.querySelectorAll("button").forEach((enabledOptionButton) => {
                  enabledOptionButton.disabled = false;
                });
              }
            }),
            detailsOptionsWrapper.append(detailsOptionButton));
        }
        (detailsGroupElement.append(detailsGroupLabel, detailsOptionsWrapper),
          (waterHeaterControlPanel || climateDetailsPanel).append(detailsGroupElement));
      },
      operationModeValues = climateOperationModeValues2(climateState, climateStructureType),
      modeLabelEntries = Object.fromEntries(
        operationModeValues.map((modeValue) => [
          modeValue,
          climateModeLabel2(modeValue, climateStructureType, climateModeOptionLabels),
        ]),
      ),
      modeIconEntries = Object.fromEntries(
        operationModeValues.map((iconModeValue) => [
          iconModeValue,
          climateModeIcon2(iconModeValue, climateStructureType),
        ]),
      );
    createClimateDetailsGroup({
      label: "运行模式",
      values: operationModeValues,
      current: String(
        climateStructureType === "water-heater"
          ? attributes2.operation_mode || ""
          : climateState?.state || "",
      ),
      service: climateStructureType === "water-heater" ? "set_operation_mode" : "set_hvac_mode",
      dataKey: climateStructureType === "water-heater" ? "operation_mode" : "hvac_mode",
      labels: modeLabelEntries,
      icons: modeIconEntries,
      className: "mode-options",
      domain: climateStructureType === "water-heater" ? "water_heater" : "climate",
      presentation: climateOptionPresentation2(operationModeValues, modeLabelEntries),
    });
    const fanModes =
      climateEntityDomain === "climate" ? climateNormalizedCapabilities.fanModes : [];
    if (fanModes.length) {
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
          max: "Max档",
        },
        autoFanMode = fanModes.find((fanModeCandidate) =>
          ["auto", "自动"].includes(String(fanModeCandidate).toLowerCase()),
        ),
        manualFanModes = fanModes.filter((fanModeOption) => fanModeOption !== autoFanMode),
        fanSliderSection = document.createElement("section");
      fanSliderSection.className = "hb-climate-fan-slider";
      const fanSliderHeading = document.createElement("span");
      fanSliderHeading.className = "hb-climate-fan-slider-heading";
      const fanSliderIcon = document.createElement("i");
      (fanSliderIcon.setAttribute("aria-hidden", "true"), (fanSliderIcon.textContent = "✾"));
      const fanSliderLabel = document.createElement("strong");
      fanSliderLabel.textContent = "风速";
      const fanSpeedBadge = document.createElement("output"),
        fanModeIndex = Math.max(0, manualFanModes.indexOf(attributes2.fan_mode));
      let committedFanModeIndex = fanModeIndex,
        isAutoFanMode = !!(autoFanMode && attributes2.fan_mode === autoFanMode),
        fan_mode = attributes2.fan_mode;
      const fanSpeedSlider = document.createElement("input");
      ((fanSpeedSlider.type = "range"),
        (fanSpeedSlider.min = "0"),
        (fanSpeedSlider.max = String(Math.max(0, manualFanModes.length - 1))),
        (fanSpeedSlider.step = "1"),
        (fanSpeedSlider.value = String(fanModeIndex)),
        (fanSpeedSlider.disabled = manualFanModes.length === 0));
      const fanModeDisplayLabel = (fanModeIndexValue) =>
          fanModeLabels[String(manualFanModes[fanModeIndexValue]).toLowerCase()] ||
          manualFanModes[fanModeIndexValue] ||
          "--",
        fanAutoButton = document.createElement("button");
      ((fanAutoButton.type = "button"),
        (fanAutoButton.className = "hb-climate-fan-auto"),
        (fanAutoButton.textContent = "自动"),
        (fanAutoButton.hidden = !autoFanMode),
        fanAutoButton.classList.toggle("active", isAutoFanMode));
      const resetFanSlider = () => {
        const fanSliderIndex = Number(fanSpeedSlider.value),
          fanProgressPercent =
            manualFanModes.length > 1 ? (fanSliderIndex / (manualFanModes.length - 1)) * 100 : 100;
        ((fanSpeedBadge.textContent = isAutoFanMode ? "自动" : fanModeDisplayLabel(fanSliderIndex)),
          fanSpeedSlider.style.setProperty("--hb-climate-fan-progress", fanProgressPercent + "%"));
      };
      (fanSliderHeading.append(fanSliderIcon, fanSliderLabel, fanSpeedBadge, fanAutoButton),
        fanSpeedSlider.addEventListener("input", () => {
          ((isAutoFanMode = false), fanAutoButton.classList.remove("active"), resetFanSlider());
        }),
        fanSpeedSlider.addEventListener("change", async () => {
          if (!isClimateInteractive || !manualFanModes.length) return;
          const fanSliderValue = Number(fanSpeedSlider.value),
            selectedFanMode = manualFanModes[fanSliderValue];
          ((fanSpeedSlider.disabled = true), (fanAutoButton.disabled = true));
          try {
            (await this.callEntityService("climate", "set_fan_mode", climateDetailsEntityId, {
              fan_mode: selectedFanMode,
            }),
              (committedFanModeIndex = fanSliderValue),
              (fan_mode = selectedFanMode),
              (isAutoFanMode = false));
          } catch (fanSpeedUpdateError) {
            ((isAutoFanMode = !!(autoFanMode && fan_mode === autoFanMode)),
              isAutoFanMode || (fanSpeedSlider.value = String(committedFanModeIndex)),
              fanAutoButton.classList.toggle("active", isAutoFanMode),
              resetFanSlider(),
              this.options.onError?.(fanSpeedUpdateError));
          } finally {
            ((fanSpeedSlider.disabled = false), (fanAutoButton.disabled = false));
          }
        }),
        fanAutoButton.addEventListener("click", async () => {
          if (!(!isClimateInteractive || !autoFanMode || fanAutoButton.disabled)) {
            ((fanSpeedSlider.disabled = true), (fanAutoButton.disabled = true));
            try {
              (await this.callEntityService("climate", "set_fan_mode", climateDetailsEntityId, {
                fan_mode: autoFanMode,
              }),
                (isAutoFanMode = true),
                (fan_mode = autoFanMode),
                fanAutoButton.classList.add("active"),
                resetFanSlider());
            } catch (fanSpeedCommitError) {
              this.options.onError?.(fanSpeedCommitError);
            } finally {
              ((fanSpeedSlider.disabled = manualFanModes.length === 0),
                (fanAutoButton.disabled = false));
            }
          }
        }));
      const fanSliderLegend = document.createElement("span");
      fanSliderLegend.className = "hb-climate-fan-slider-legend";
      const fanSliderMinLabel = document.createElement("small");
      fanSliderMinLabel.textContent = fanModeDisplayLabel(0);
      const fanSliderMaxLabel = document.createElement("small");
      ((fanSliderMaxLabel.textContent = fanModeDisplayLabel(manualFanModes.length - 1)),
        fanSliderLegend.append(fanSliderMinLabel, fanSliderMaxLabel),
        resetFanSlider(),
        fanSliderSection.append(fanSliderHeading, fanSpeedSlider, fanSliderLegend),
        climateDetailsPanel.append(fanSliderSection));
    }
    let fanCapabilitiesListener = null;
    if (climateEntityDomain === "fan" && climateNormalizedCapabilities.supportsFanPercentage) {
      const fanPercentageSection = document.createElement("section");
      fanPercentageSection.className = "hb-climate-fan-slider";
      const fanPercentageHeading = document.createElement("span");
      fanPercentageHeading.className = "hb-climate-fan-slider-heading";
      const fanPercentageIcon = document.createElement("i");
      (fanPercentageIcon.setAttribute("aria-hidden", "true"),
        (fanPercentageIcon.textContent = "✾"));
      const fanPercentageLabel = document.createElement("strong");
      fanPercentageLabel.textContent = "风速";
      const fanPercentageBadge = document.createElement("output");
      let fanSpeedPercent = Math.max(0, Math.min(100, climateNormalizedCapabilities.fanPercentage));
      const fanPercentageSlider = document.createElement("input");
      ((fanPercentageSlider.type = "range"),
        (fanPercentageSlider.min = "0"),
        (fanPercentageSlider.max = "100"),
        (fanPercentageSlider.step = String(climateNormalizedCapabilities.fanPercentageStep)),
        (fanPercentageSlider.value = String(fanSpeedPercent)));
      const syncFanPercentage = () => {
        const fanPercentageValue = Math.max(
          0,
          Math.min(100, Number(fanPercentageSlider.value) || 0),
        );
        ((fanPercentageBadge.textContent = Math.round(fanPercentageValue) + "%"),
          fanPercentageSlider.style.setProperty(
            "--hb-climate-fan-progress",
            fanPercentageValue + "%",
          ));
      };
      ((fanCapabilitiesListener = (capabilitiesPayload) => {
        const fanPercentage = normalizeClimateCapabilities2(capabilitiesPayload).fanPercentage;
        fanPercentage !== null &&
          ((fanSpeedPercent = Math.max(0, Math.min(100, fanPercentage))),
          (fanPercentageSlider.value = String(fanSpeedPercent)),
          syncFanPercentage());
      }),
        fanPercentageSlider.addEventListener("input", syncFanPercentage),
        fanPercentageSlider.addEventListener("change", async () => {
          if (!isClimateInteractive || fanPercentageSlider.disabled) return;
          const normalizedFanPercentage = Math.max(
            0,
            Math.min(100, Number(fanPercentageSlider.value) || 0),
          );
          fanPercentageSlider.disabled = true;
          try {
            (await this.callEntityService("fan", "set_percentage", climateDetailsEntityId, {
              percentage: normalizedFanPercentage,
            }),
              (fanSpeedPercent = normalizedFanPercentage),
              (climateDetailsSnapshot = {
                ...(climateDetailsSnapshot || {}),
                state: normalizedFanPercentage > 0 ? "on" : "off",
                attributes: {
                  ...(climateDetailsSnapshot?.attributes || {}),
                  percentage: normalizedFanPercentage,
                },
              }),
              syncClimateState(),
              onClimatePowerChange?.(normalizedFanPercentage > 0));
          } catch (fanPercentageError) {
            ((fanPercentageSlider.value = String(fanSpeedPercent)),
              syncFanPercentage(),
              this.options.onError?.(fanPercentageError));
          } finally {
            fanPercentageSlider.disabled = false;
          }
        }));
      const fanPercentageLegend = document.createElement("span");
      fanPercentageLegend.className = "hb-climate-fan-slider-legend";
      const fanPercentageOffLabel = document.createElement("small");
      fanPercentageOffLabel.textContent = "关闭";
      const fanPercentageMaxLabel = document.createElement("small");
      ((fanPercentageMaxLabel.textContent = "最大"),
        fanPercentageLegend.append(fanPercentageOffLabel, fanPercentageMaxLabel),
        fanPercentageHeading.append(fanPercentageIcon, fanPercentageLabel, fanPercentageBadge),
        syncFanPercentage(),
        fanPercentageSection.append(fanPercentageHeading, fanPercentageSlider, fanPercentageLegend),
        climateDetailsPanel.append(fanPercentageSection));
    }
    const swingModeLabels = Object.fromEntries(
      climateNormalizedCapabilities.swingModes.map((swingMode) => [
        swingMode,
        climateSwingModeLabel2(swingMode, "vertical", climateModeOptionLabels),
      ]),
    );
    createClimateDetailsGroup({
      label: climateNormalizedCapabilities.horizontalSwingModes.length ? "纵向摆风" : "摆风",
      values: climateNormalizedCapabilities.swingModes,
      current: attributes2.swing_mode,
      service: "set_swing_mode",
      dataKey: "swing_mode",
      labels: swingModeLabels,
      icons: {
        off: "—",
        vertical: "↕",
        horizontal: "↔",
        both: "✣",
      },
      className: "compact-options",
      presentation: climateOptionPresentation2(
        climateNormalizedCapabilities.swingModes,
        swingModeLabels,
        {
          inlineIcon: true,
        },
      ),
    });
    const horizontalSwingLabels = Object.fromEntries(
      climateNormalizedCapabilities.horizontalSwingModes.map((horizontalSwingMode) => [
        horizontalSwingMode,
        climateSwingModeLabel2(horizontalSwingMode, "horizontal", climateModeOptionLabels),
      ]),
    );
    createClimateDetailsGroup({
      label: "水平摆风",
      values: climateNormalizedCapabilities.horizontalSwingModes,
      current: attributes2.swing_horizontal_mode,
      service: "set_swing_horizontal_mode",
      dataKey: "swing_horizontal_mode",
      labels: horizontalSwingLabels,
      className: "compact-options",
      presentation: climateOptionPresentation2(
        climateNormalizedCapabilities.horizontalSwingModes,
        horizontalSwingLabels,
        {
          inlineIcon: true,
        },
      ),
    });
    const presetModeLabels = Object.fromEntries(
        climateNormalizedCapabilities.presetModes.map((presetMode) => [
          presetMode,
          climateModeLabel2(presetMode, climateStructureType, climateModeOptionLabels),
        ]),
      ),
      presetModeIcons = Object.fromEntries(
        climateNormalizedCapabilities.presetModes.map((presetIconMode) => [
          presetIconMode,
          climateModeIcon2(presetIconMode, climateStructureType),
        ]),
      );
    createClimateDetailsGroup({
      label: "预设模式",
      values: climateNormalizedCapabilities.presetModes,
      current: attributes2.preset_mode,
      service: "set_preset_mode",
      dataKey: "preset_mode",
      labels: presetModeLabels,
      icons: presetModeIcons,
      className: "compact-options",
      domain: climateEntityDomain === "fan" ? "fan" : "climate",
      presentation: climateOptionPresentation2(
        climateNormalizedCapabilities.presetModes,
        presetModeLabels,
        {
          inlineIcon: true,
        },
      ),
    });
    let climateStateListener = null;
    if (!climateDetailsPanel.childElementCount) {
      const climateLoadingSection = document.createElement("section");
      climateLoadingSection.className = "hb-climate-details-loading";
      const climateLoadingIcon = document.createElement("i");
      climateLoadingIcon.setAttribute("aria-hidden", "true");
      const climateLoadingLabel = document.createElement("strong"),
        climateLoadingHint = document.createElement("span");
      ((climateStateListener = (climateLoadingStatePayload) => {
        const lowerCase8 = String(climateLoadingStatePayload?.state || "")
            .trim()
            .toLowerCase(),
          isClimateLoading = !climateLoadingStatePayload || !lowerCase8 || lowerCase8 === "unknown",
          isClimateUnavailable = lowerCase8 === "unavailable";
        (climateLoadingSection.classList.toggle("is-loading", isClimateLoading),
          climateLoadingSection.classList.toggle("is-unavailable", isClimateUnavailable),
          (climateLoadingLabel.textContent = isClimateLoading
            ? "—"
            : isClimateUnavailable
              ? "设备当前不可用"
              : "暂无可用控制数据"),
          (climateLoadingHint.textContent =
            isClimateLoading || isClimateUnavailable
              ? ""
              : "请检查该实体在 Home Assistant 中提供的控制能力"));
      }),
        climateStateListener(climateState),
        climateLoadingSection.append(climateLoadingIcon, climateLoadingLabel, climateLoadingHint),
        climateDetailsPanel.append(climateLoadingSection));
    }
    return (
      (climateDetailsPanel.syncClimateGrid = () => {
        const thermostatChildren = Array.from(
            climateDetailsPanel.querySelectorAll<HTMLElement>(":scope > *"),
          ),
          thermostatElement = thermostatChildren.find((thermostatCandidateElement) =>
            thermostatCandidateElement.classList.contains("hb-climate-thermostat"),
          );
        if (!thermostatElement) return;
        const waterHeaterElement = thermostatChildren.find((waterHeaterCandidateElement) =>
            waterHeaterCandidateElement.classList.contains("is-water-heater"),
          ),
          remainingControlCount = thermostatChildren.filter(
            (controlElement) =>
              controlElement !== thermostatElement && controlElement !== waterHeaterElement,
          ).length;
        ((thermostatElement.style.gridRow = "1 / span " + Math.max(1, remainingControlCount)),
          waterHeaterElement &&
            (waterHeaterElement.style.gridRow = "1 / span " + Math.max(1, remainingControlCount)));
      }),
      climateDetailsPanel.syncClimateGrid(),
      (climateDetailsPanel.syncClimateState = (climateStateSnapshot) => {
        if (!climateStateSnapshot) return;
        ((climateDetailsSnapshot = climateStateSnapshot),
          climateStateListener?.(climateStateSnapshot),
          fanCapabilitiesListener?.(climateStateSnapshot));
        const targetTemperature3 =
            normalizeClimateCapabilities2(climateStateSnapshot).targetTemperature,
          reconciledTemperature = reconcileClimateTargetTemperature2(
            previousTemperature,
            targetTemperature3,
            temperatureCommitTimer,
            temperatureStep,
          );
        ((temperatureCommitTimer === null || reconciledTemperature.confirmed) &&
          (previousTemperature = reconciledTemperature.temperature),
          (targetTemperatureValue = previousTemperature),
          targetTemperature3 !== null &&
            (temperatureCommitTimer === null || reconciledTemperature.confirmed) &&
            (committedTemperature = targetTemperature3),
          temperatureCommitTimer !== null &&
            reconciledTemperature.confirmed &&
            (isWaterHeater ? applyLocalTemperature() : applyCommittedTemperature()),
          commitClimateChange());
      }),
      (climateDetailsPanel.cleanupClimateDetails = () => {
        (window.clearTimeout(stepTimerId),
          (stepTimerId = null),
          (pendingTemperatures.length = 0),
          (activePendingTemperature = null),
          applyCommittedTemperature());
      }),
      syncClimateState(),
      climateDetailsPanel
    );
  }
  ["createWaterHeaterExtensionControls"](
    primaryEntityId,
    {
      component: componentRecord = null,
      interactive: createWaterHeaterExtensionControlsIsInteractive = true,
      excludedEntityIds: excludedEntityIdsInput = [],
    } = {},
  ): ComponentControllerElement {
    const relatedPopupEntities = componentRecord
        ? relatedPopupContext2(
            componentRecord,
            this.entityMetadata,
            this.deviceMetadata,
            this.states,
          )
        : null,
      selectedRelatedEntities = componentRecord
        ? selectedRelatedEntities2(
            componentRecord,
            this.entityMetadata,
            this.deviceMetadata,
            this.states,
          )
        : null,
      excludedEntityIdSet = new Set(excludedEntityIdsInput),
      relatedEntityControls = (
        selectedRelatedEntities === null
          ? relatedWaterHeaterEntities2(this.entityMetadata, primaryEntityId)
          : selectedRelatedEntities
      ).filter((relatedEntityControl) => !excludedEntityIdSet.has(relatedEntityControl.entityId)),
      primaryEntity = relatedPopupEntities?.primary || this.entityMetadata.get(primaryEntityId);
    if (!relatedEntityControls.length) return null;
    const waterHeaterExtensionSection: ComponentControllerElement = document.createElement("section");
    ((waterHeaterExtensionSection.className =
      "hb-related-entity-extensions hb-water-heater-extensions" +
      (relatedPopupEntities?.deviceType ? " is-" + relatedPopupEntities.deviceType : "")),
      (waterHeaterExtensionSection.dataset.controlSource =
        selectedRelatedEntities === null ? "automatic-device" : "user-selected"));
    const stateHandlersByEntityId = new Map(),
      resolveEntityState = (stateEntityId) => {
        const resolvedEntityState = this.states.get(stateEntityId);
        return (
          resolvedEntityState?.newState ||
          resolvedEntityState || {
            entityId: stateEntityId,
            state: "unknown",
            attributes: {},
          }
        );
      },
      registerStateHandler = (
        createWaterHeaterExtensionControlsHandledEntityId,
        registeredStateHandler,
      ) => {
        (stateHandlersByEntityId.has(createWaterHeaterExtensionControlsHandledEntityId) ||
          stateHandlersByEntityId.set(createWaterHeaterExtensionControlsHandledEntityId, []),
          stateHandlersByEntityId
            .get(createWaterHeaterExtensionControlsHandledEntityId)
            .push(registeredStateHandler));
      },
      extensionGrid = document.createElement("div");
    extensionGrid.className = "hb-water-heater-extension-grid";
    for (const relatedEntity of relatedEntityControls) {
      const entityId2 = relatedEntity.entityId,
        controlEntityDomain = String(relatedEntity.domain || ""),
        entityLabel = relatedPopupEntities
          ? relatedEntityLabel2(relatedPopupEntities, relatedEntity)
          : waterHeaterRelatedEntityLabel2(primaryEntity, relatedEntity);
      if (["light", "switch", "input_boolean", "fan"].includes(controlEntityDomain)) {
        const extensionToggleButton = document.createElement("button");
        ((extensionToggleButton.type = "button"),
          (extensionToggleButton.className = "hb-water-heater-extension-toggle"));
        const extensionToggleIcon = document.createElement("i");
        extensionToggleIcon.setAttribute("aria-hidden", "true");
        const extensionToggleWrapper = document.createElement("span"),
          extensionToggleLabel = document.createElement("strong");
        extensionToggleLabel.textContent = entityLabel;
        const extensionToggleStateLabel = document.createElement("small");
        (extensionToggleWrapper.append(extensionToggleLabel, extensionToggleStateLabel),
          extensionToggleButton.append(extensionToggleIcon, extensionToggleWrapper));
        let relatedEntityState = resolveEntityState(entityId2),
          isToggleBusy = false;
        const syncExtensionToggle = (nextToggleState = relatedEntityState) => {
          relatedEntityState = nextToggleState || relatedEntityState;
          const lowerCase9 = String(relatedEntityState?.state || "").toLowerCase(),
            isEntityUnavailable = ["unknown", "unavailable"].includes(lowerCase9),
            isEntityOn = lowerCase9 === "on";
          (extensionToggleButton.classList.toggle("is-on", isEntityOn && !isEntityUnavailable),
            extensionToggleButton.classList.toggle("is-unavailable", isEntityUnavailable),
            (extensionToggleButton.disabled =
              !createWaterHeaterExtensionControlsIsInteractive ||
              isToggleBusy ||
              isEntityUnavailable),
            extensionToggleButton.setAttribute("aria-pressed", String(isEntityOn)),
            extensionToggleButton.setAttribute("aria-busy", String(isToggleBusy)),
            (extensionToggleStateLabel.textContent = isEntityUnavailable
              ? "不可用"
              : isEntityOn
                ? "已开启"
                : "已关闭"));
        };
        (extensionToggleButton.addEventListener("click", async () => {
          if (
            !createWaterHeaterExtensionControlsIsInteractive ||
            isToggleBusy ||
            extensionToggleButton.classList.contains("is-unavailable")
          )
            return;
          const confirmedEntityState = relatedEntityState,
            isNextStateOn = String(relatedEntityState?.state || "").toLowerCase() !== "on";
          ((isToggleBusy = true),
            syncExtensionToggle({
              ...(relatedEntityState || {}),
              state: isNextStateOn ? "on" : "off",
            }));
          try {
            await this.callEntityService("homeassistant", "toggle", entityId2);
          } catch (toggleStateError) {
            (syncExtensionToggle(confirmedEntityState), this.options.onError?.(toggleStateError));
          } finally {
            ((isToggleBusy = false), syncExtensionToggle(relatedEntityState));
          }
        }),
          syncExtensionToggle(relatedEntityState),
          registerStateHandler(entityId2, syncExtensionToggle),
          extensionGrid.append(extensionToggleButton));
      } else {
        if (["select", "input_select"].includes(controlEntityDomain)) {
          const extensionSelectWrapper = document.createElement("div");
          extensionSelectWrapper.className = "hb-water-heater-extension-select";
          const extensionSelectLabel = document.createElement("span");
          ((extensionSelectLabel.textContent = entityLabel),
            (extensionSelectLabel.title = entityLabel));
          const relatedSelectTriggerButton = document.createElement("button");
          ((relatedSelectTriggerButton.type = "button"),
            (relatedSelectTriggerButton.className = "hb-related-select-trigger"),
            relatedSelectTriggerButton.setAttribute("aria-label", entityLabel),
            relatedSelectTriggerButton.setAttribute("aria-haspopup", "listbox"),
            relatedSelectTriggerButton.setAttribute("aria-expanded", "false"));
          const relatedSelectValueLabel = document.createElement("span"),
            relatedSelectCaretIcon = document.createElement("i");
          (relatedSelectCaretIcon.setAttribute("aria-hidden", "true"),
            relatedSelectTriggerButton.append(relatedSelectValueLabel, relatedSelectCaretIcon));
          const relatedSelectMenu = document.createElement("div");
          ((relatedSelectMenu.className = "hb-related-select-menu"),
            (relatedSelectMenu.id =
              "hb-related-select-" +
              String(this.renderNamespace || "runtime").replace(/[^a-z0-9_-]/gi, "-") +
              "-" +
              entityId2.replace(/[^a-z0-9_-]/gi, "-")),
            relatedSelectMenu.setAttribute("role", "listbox"),
            relatedSelectMenu.setAttribute("popover", "auto"),
            (relatedSelectMenu.hidden = true),
            relatedSelectTriggerButton.setAttribute("aria-controls", relatedSelectMenu.id));
          let selectEntityState = resolveEntityState(entityId2),
            selectStateValue = String(selectEntityState?.state || ""),
            isSelectBusy = false,
            cachedOptionsSignature = "",
            relatedEntityOptions = [];
          const bathHeaterLabelOptions = {
              entityId: entityId2,
              entityMetadata: this.entityMetadata,
              entityTranslations: this.entityTranslations,
              attributes: ["options", "option"],
            },
            relatedOptionLabel = (optionDisplayValue) =>
              relatedPopupEntities?.deviceType === "bath-heater"
                ? climateModeLabel2(optionDisplayValue, "bath-heater", bathHeaterLabelOptions)
                : String(optionDisplayValue || ""),
            isRelatedMenuVisible = () => {
              try {
                return relatedSelectMenu.matches(":popover-open");
              } catch {
                return relatedSelectMenu.dataset.open === "true";
              }
            },
            positionRelatedMenu = () => {
              if (!isRelatedMenuVisible() && relatedSelectMenu.hidden) return;
              const relatedTriggerBounds = relatedSelectTriggerButton.getBoundingClientRect(),
                innerWidth3 = window.innerWidth,
                innerHeight3 = window.innerHeight,
                relatedMenuWidth = Math.min(
                  Math.max(relatedTriggerBounds.width, 132),
                  Math.max(132, innerWidth3 - 16),
                );
              ((relatedSelectMenu.style.width = relatedMenuWidth + "px"),
                (relatedSelectMenu.style.maxHeight =
                  Math.min(216, Math.max(88, innerHeight3 - 16)) + "px"));
              const relatedMenuHeight = Math.min(relatedSelectMenu.scrollHeight || 0, 216),
                relatedSpaceBelow = innerHeight3 - relatedTriggerBounds.bottom - 8,
                relatedSpaceAbove = relatedTriggerBounds.top - 8,
                relatedMenuTop =
                  relatedSpaceBelow < Math.min(relatedMenuHeight, 140) &&
                  relatedSpaceAbove > relatedSpaceBelow
                    ? Math.max(8, relatedTriggerBounds.top - relatedMenuHeight - 4)
                    : Math.min(
                        innerHeight3 - relatedMenuHeight - 8,
                        relatedTriggerBounds.bottom + 4,
                      );
              ((relatedSelectMenu.style.left =
                Math.max(
                  8,
                  Math.min(relatedTriggerBounds.left, innerWidth3 - relatedMenuWidth - 8),
                ) + "px"),
                (relatedSelectMenu.style.top = Math.max(8, relatedMenuTop) + "px"));
            },
            openRelatedMenu = () => {
              (isRelatedMenuVisible() &&
                typeof relatedSelectMenu.hidePopover == "function" &&
                relatedSelectMenu.hidePopover(),
                (relatedSelectMenu.hidden = true),
                (relatedSelectMenu.dataset.open = "false"),
                relatedSelectTriggerButton.setAttribute("aria-expanded", "false"));
            },
            closeRelatedMenu = (shouldFocusRelatedTrigger = false) => {
              relatedSelectTriggerButton.disabled ||
                ((relatedSelectMenu.hidden = false),
                typeof relatedSelectMenu.showPopover == "function"
                  ? relatedSelectMenu.showPopover()
                  : (relatedSelectMenu.dataset.open = "true"),
                relatedSelectTriggerButton.setAttribute("aria-expanded", "true"),
                positionRelatedMenu(),
                shouldFocusRelatedTrigger &&
                  (
                    relatedSelectMenu.querySelector<HTMLElement>('[aria-selected="true"]') ||
                    relatedSelectMenu.querySelector<HTMLElement>('[role="option"]')
                  )?.focus());
            },
            selectRelatedOption = async (optionStateValue) => {
              if (
                !createWaterHeaterExtensionControlsIsInteractive ||
                isSelectBusy ||
                !optionStateValue
              )
                return;
              const previousSelectState = selectEntityState;
              ((isSelectBusy = true),
                openRelatedMenu(),
                syncRelatedSelect({
                  ...(selectEntityState || {}),
                  state: optionStateValue,
                  attributes: {
                    ...(selectEntityState?.attributes || {}),
                    options: relatedEntityOptions,
                  },
                }));
              try {
                const selectService = relatedEntitySelectService2(controlEntityDomain);
                if (!selectService) throw new Error("实体 " + entityId2 + " 不支持选项服务。");
                (await this.callEntityService(
                  selectService.domain,
                  selectService.service,
                  entityId2,
                  {
                    option: optionStateValue,
                  },
                ),
                  (selectStateValue = optionStateValue));
              } catch (selectServiceError) {
                (syncRelatedSelect(previousSelectState),
                  this.options.onError?.(selectServiceError));
              } finally {
                ((isSelectBusy = false), syncRelatedSelect(selectEntityState));
              }
            },
            renderRelatedOptions = (optionEntries, selectedOptionValue) => {
              relatedSelectMenu.replaceChildren(
                ...optionEntries.map((optionEntry) => {
                  const relatedSelectOptionButton = document.createElement("button");
                  ((relatedSelectOptionButton.type = "button"),
                    (relatedSelectOptionButton.className = "hb-related-select-option"),
                    relatedSelectOptionButton.setAttribute("role", "option"),
                    (relatedSelectOptionButton.dataset.value = optionEntry),
                    (relatedSelectOptionButton.textContent = relatedOptionLabel(optionEntry)),
                    (relatedSelectOptionButton.title = relatedSelectOptionButton.textContent));
                  const isRelatedOptionActive = optionEntry === selectedOptionValue;
                  return (
                    relatedSelectOptionButton.classList.toggle("active", isRelatedOptionActive),
                    relatedSelectOptionButton.setAttribute(
                      "aria-selected",
                      String(isRelatedOptionActive),
                    ),
                    relatedSelectOptionButton.addEventListener("click", () =>
                      selectRelatedOption(optionEntry),
                    ),
                    relatedSelectOptionButton
                  );
                }),
              );
            },
            syncRelatedSelect = (nextSelectState = selectEntityState) => {
              selectEntityState = nextSelectState || selectEntityState;
              const selectStateText = String(selectEntityState?.state || ""),
                availableOptions = relatedEntityOptions2(relatedEntity, selectEntityState);
              relatedEntityOptions = availableOptions;
              const stringify = JSON.stringify(availableOptions);
              if (stringify !== cachedOptionsSignature)
                ((cachedOptionsSignature = stringify),
                  renderRelatedOptions(availableOptions, selectStateText));
              else
                for (const relatedOptionElement of relatedSelectMenu.querySelectorAll<HTMLElement>(
                  '[role="option"]',
                )) {
                  const isRelatedOptionSelected =
                    relatedOptionElement.dataset.value === selectStateText;
                  (relatedOptionElement.classList.toggle("active", isRelatedOptionSelected),
                    relatedOptionElement.setAttribute(
                      "aria-selected",
                      String(isRelatedOptionSelected),
                    ));
                }
              (selectStateText &&
                !["unknown", "unavailable"].includes(selectStateText.toLowerCase()) &&
                (selectStateValue = selectStateText),
                (relatedSelectValueLabel.textContent = selectStateValue
                  ? relatedOptionLabel(selectStateValue)
                  : availableOptions.length
                    ? relatedOptionLabel(availableOptions[0])
                    : "无选项"),
                (relatedSelectValueLabel.title = relatedSelectValueLabel.textContent),
                (relatedSelectTriggerButton.disabled =
                  !createWaterHeaterExtensionControlsIsInteractive ||
                  isSelectBusy ||
                  !availableOptions.length ||
                  selectStateText.toLowerCase() === "unavailable"));
            };
          (relatedSelectTriggerButton.addEventListener("click", () => {
            isRelatedMenuVisible() || relatedSelectMenu.dataset.open === "true"
              ? openRelatedMenu()
              : closeRelatedMenu();
          }),
            relatedSelectTriggerButton.addEventListener("keydown", (relatedTriggerKeyEvent) => {
              ["ArrowDown", "ArrowUp", "Enter", " "].includes(relatedTriggerKeyEvent.key) &&
                (relatedTriggerKeyEvent.preventDefault(), closeRelatedMenu(true));
            }),
            relatedSelectMenu.addEventListener("keydown", (relatedMenuKeyEvent) => {
              const relatedMenuOptions = [
                  ...relatedSelectMenu.querySelectorAll<HTMLElement>('[role="option"]'),
                ],
                indexOf3 = relatedMenuOptions.findIndex(
                  (relatedOptionElement) => relatedOptionElement === document.activeElement,
                );
              if (relatedMenuKeyEvent.key === "Escape")
                (relatedMenuKeyEvent.preventDefault(),
                  openRelatedMenu(),
                  relatedSelectTriggerButton.focus());
              else {
                if (
                  relatedMenuKeyEvent.key === "ArrowDown" ||
                  relatedMenuKeyEvent.key === "ArrowUp"
                ) {
                  relatedMenuKeyEvent.preventDefault();
                  const relatedKeyDirection = relatedMenuKeyEvent.key === "ArrowDown" ? 1 : -1;
                  relatedMenuOptions[
                    (indexOf3 + relatedKeyDirection + relatedMenuOptions.length) %
                      relatedMenuOptions.length
                  ]?.focus();
                } else
                  (relatedMenuKeyEvent.key === "Enter" || relatedMenuKeyEvent.key === " ") &&
                    (relatedMenuKeyEvent.preventDefault(), clickFocusedElement());
              }
            }),
            relatedSelectMenu.addEventListener("toggle", (relatedToggleEvent) => {
              const isRelatedMenuExpanded = relatedToggleEvent.newState === "open";
              ((relatedSelectMenu.hidden = !isRelatedMenuExpanded),
                (relatedSelectMenu.dataset.open = String(isRelatedMenuExpanded)),
                relatedSelectTriggerButton.setAttribute(
                  "aria-expanded",
                  String(isRelatedMenuExpanded),
                ),
                isRelatedMenuExpanded && positionRelatedMenu());
            }),
            extensionSelectWrapper.append(
              extensionSelectLabel,
              relatedSelectTriggerButton,
              relatedSelectMenu,
            ),
            syncRelatedSelect(selectEntityState),
            registerStateHandler(entityId2, syncRelatedSelect),
            extensionGrid.append(extensionSelectWrapper));
        } else {
          if (["number", "input_number"].includes(controlEntityDomain)) {
            const extensionNumberWrapper = document.createElement("div");
            extensionNumberWrapper.className = "hb-water-heater-extension-number";
            const extensionNumberLabel = document.createElement("span");
            extensionNumberLabel.textContent = entityLabel;
            const extensionNumberControlsBox = document.createElement("span"),
              decrementButton = document.createElement("button");
            ((decrementButton.type = "button"), (decrementButton.textContent = "−"));
            const numberValueBadge = document.createElement("output"),
              incrementButton = document.createElement("button");
            ((incrementButton.type = "button"),
              (incrementButton.textContent = "+"),
              extensionNumberControlsBox.append(decrementButton, numberValueBadge, incrementButton),
              extensionNumberWrapper.append(extensionNumberLabel, extensionNumberControlsBox));
            let numberEntityState = resolveEntityState(entityId2),
              numberValue = Number(numberEntityState?.state),
              isNumberBusy = false;
            const resolveNumberCapabilities = () => {
                const numberAttributes = numberEntityState?.attributes || {},
                  numberMinimum = Number(numberAttributes.min),
                  numberMaximum = Number(numberAttributes.max),
                  numberStep = Math.max(0.001, Number(numberAttributes.step) || 1);
                return {
                  minimum: Number.isFinite(numberMinimum) ? numberMinimum : 0,
                  maximum: Number.isFinite(numberMaximum) ? numberMaximum : 100,
                  step: numberStep,
                };
              },
              syncNumberState = (nextNumberState = numberEntityState) => {
                numberEntityState = nextNumberState || numberEntityState;
                const currentNumberValue = Number(numberEntityState?.state),
                  isNumberUnavailable =
                    !Number.isFinite(currentNumberValue) ||
                    ["unknown", "unavailable"].includes(
                      String(numberEntityState?.state || "").toLowerCase(),
                    );
                isNumberUnavailable || (numberValue = currentNumberValue);
                const numberUnit = String(numberEntityState?.attributes?.unit_of_measurement || "");
                ((numberValueBadge.textContent = isNumberUnavailable
                  ? "--"
                  : "" + currentNumberValue + numberUnit),
                  (decrementButton.disabled =
                    !createWaterHeaterExtensionControlsIsInteractive ||
                    isNumberBusy ||
                    isNumberUnavailable),
                  (incrementButton.disabled =
                    !createWaterHeaterExtensionControlsIsInteractive ||
                    isNumberBusy ||
                    isNumberUnavailable));
              },
              stepNumberValue = async (numberStepDirection) => {
                if (
                  !createWaterHeaterExtensionControlsIsInteractive ||
                  isNumberBusy ||
                  !Number.isFinite(numberValue)
                )
                  return;
                const {
                    minimum: minimumValue,
                    maximum: maximumValue,
                    step: stepValue,
                  } = resolveNumberCapabilities(),
                  numberStepDecimals = String(stepValue).split(".")[1]?.length || 0,
                  nextNumberValue = Number(
                    Math.max(
                      minimumValue,
                      Math.min(maximumValue, numberValue + numberStepDirection * stepValue),
                    ).toFixed(numberStepDecimals),
                  );
                if (nextNumberValue === numberValue) return;
                const previousNumberState = numberEntityState;
                ((isNumberBusy = true),
                  syncNumberState({
                    ...(numberEntityState || {}),
                    state: String(nextNumberValue),
                  }));
                try {
                  (await this.callEntityService(controlEntityDomain, "set_value", entityId2, {
                    value: nextNumberValue,
                  }),
                    (numberValue = nextNumberValue));
                } catch (numberUpdateError) {
                  (syncNumberState(previousNumberState), this.options.onError?.(numberUpdateError));
                } finally {
                  ((isNumberBusy = false), syncNumberState(numberEntityState));
                }
              };
            (decrementButton.addEventListener("click", () => stepNumberValue(-1)),
              incrementButton.addEventListener("click", () => stepNumberValue(1)),
              syncNumberState(numberEntityState),
              registerStateHandler(entityId2, syncNumberState),
              extensionGrid.append(extensionNumberWrapper));
          } else {
            if (controlEntityDomain === "button") {
              const extensionActionButton = document.createElement("button");
              ((extensionActionButton.type = "button"),
                (extensionActionButton.className = "hb-water-heater-extension-action"),
                (extensionActionButton.textContent = entityLabel));
              let isActionBusy = false;
              const syncActionButton = (actionEntityState) => {
                const isActionUnavailable =
                  String(actionEntityState?.state || "").toLowerCase() === "unavailable";
                extensionActionButton.disabled =
                  !createWaterHeaterExtensionControlsIsInteractive ||
                  isActionBusy ||
                  isActionUnavailable;
              };
              (extensionActionButton.addEventListener("click", async () => {
                if (
                  !(
                    !createWaterHeaterExtensionControlsIsInteractive ||
                    isActionBusy ||
                    extensionActionButton.disabled
                  ) &&
                  !(
                    relatedEntityNeedsConfirmation2(relatedEntity) &&
                    !window.confirm("确认执行“" + entityLabel + "”吗？")
                  )
                ) {
                  ((isActionBusy = true), syncActionButton(resolveEntityState(entityId2)));
                  try {
                    await this.callEntityService("button", "press", entityId2);
                  } catch (actionUpdateError) {
                    this.options.onError?.(actionUpdateError);
                  } finally {
                    ((isActionBusy = false), syncActionButton(resolveEntityState(entityId2)));
                  }
                }
              }),
                syncActionButton(resolveEntityState(entityId2)),
                registerStateHandler(entityId2, syncActionButton),
                extensionGrid.append(extensionActionButton));
            } else {
              if (["sensor", "binary_sensor"].includes(controlEntityDomain)) {
                const readonlyValueRow = document.createElement("div");
                readonlyValueRow.className = "hb-water-heater-extension-readonly";
                const readonlyValueLabel = document.createElement("strong");
                readonlyValueLabel.textContent = entityLabel;
                const readonlyValueStateLabel = document.createElement("small"),
                  syncReadonlyValue = (readonlyEntityState) => {
                    const readonlyStateValue = String(readonlyEntityState?.state || "unknown"),
                      isReadonlyUnavailable = ["unknown", "unavailable"].includes(
                        readonlyStateValue.toLowerCase(),
                      ),
                      readonlyUnit = String(
                        readonlyEntityState?.attributes?.unit_of_measurement || "",
                      );
                    (isReadonlyUnavailable
                      ? (readonlyValueStateLabel.textContent = "不可用")
                      : controlEntityDomain === "binary_sensor"
                        ? (readonlyValueStateLabel.textContent =
                            readonlyStateValue === "on" ? "已触发" : "正常")
                        : (readonlyValueStateLabel.textContent =
                            "" + readonlyStateValue + (readonlyUnit ? " " + readonlyUnit : "")),
                      readonlyValueRow.classList.toggle("is-unavailable", isReadonlyUnavailable));
                  };
                (readonlyValueRow.append(readonlyValueLabel, readonlyValueStateLabel),
                  syncReadonlyValue(resolveEntityState(entityId2)),
                  registerStateHandler(entityId2, syncReadonlyValue),
                  extensionGrid.append(readonlyValueRow));
              }
            }
          }
        }
      }
    }
    if (extensionGrid.childElementCount) {
      const extensionTitleLabel = document.createElement("strong");
      ((extensionTitleLabel.className = "hb-water-heater-extension-title"),
        (extensionTitleLabel.textContent = "扩展功能"),
        (waterHeaterExtensionSection.dataset.controlCount = String(
          extensionGrid.childElementCount,
        )),
        (extensionGrid.dataset.controlCount = String(extensionGrid.childElementCount)),
        waterHeaterExtensionSection.append(extensionTitleLabel, extensionGrid));
    }
    return (
      (waterHeaterExtensionSection.stateHandlers = stateHandlersByEntityId),
      (waterHeaterExtensionSection.relatedEntityIds = relatedEntityControls.map(
        (relatedEntityEntry) => relatedEntityEntry.entityId,
      )),
      waterHeaterExtensionSection
    );
  }
  ["createBathHeaterLightControl"](
    createBathHeaterLightControlToggleEntityId,
    bathLightState,
    {
      interactive: isBathLightInteractive = true,
      onStateChange: onBathLightStateChange = null,
    } = {},
  ): ComponentControllerElement {
    const bathHeaterLightSection: ComponentControllerElement = document.createElement("section");
    bathHeaterLightSection.className = "hb-bath-heater-light-control";
    const bathLightHeading = document.createElement("span"),
      bathLightIcon = document.createElement("i");
    (bathLightIcon.setAttribute("aria-hidden", "true"), (bathLightIcon.textContent = "☀"));
    const bathLightLabel = document.createElement("strong");
    bathLightLabel.textContent = String(bathLightState?.attributes?.friendly_name || "浴霸灯");
    const bathLightBadge = document.createElement("output");
    bathLightHeading.append(bathLightIcon, bathLightLabel, bathLightBadge);
    const bathLightToggleButton = document.createElement("button");
    ((bathLightToggleButton.type = "button"),
      (bathLightToggleButton.disabled = !isBathLightInteractive));
    let currentBathLightState = bathLightState,
      isBathLightBusy = false;
    const syncBathLightState = (nextBathLightState = currentBathLightState) => {
        currentBathLightState = nextBathLightState || currentBathLightState;
        const isBathLightUnavailable = ["unknown", "unavailable"].includes(
            String(currentBathLightState?.state || ""),
          ),
          isBathLightOn = currentBathLightState?.state === "on";
        (bathHeaterLightSection.classList.toggle("is-on", isBathLightOn && !isBathLightUnavailable),
          bathHeaterLightSection.classList.toggle("is-unavailable", isBathLightUnavailable),
          (bathLightBadge.textContent = isBathLightUnavailable
            ? "不可用"
            : isBathLightOn
              ? "已开启"
              : "已关闭"),
          (bathLightToggleButton.textContent = isBathLightOn ? "关闭灯光" : "开启灯光"),
          (bathLightToggleButton.disabled =
            !isBathLightInteractive || isBathLightBusy || isBathLightUnavailable),
          bathLightToggleButton.setAttribute("aria-pressed", String(isBathLightOn)),
          onBathLightStateChange?.({
            isOn: isBathLightOn,
            unavailable: isBathLightUnavailable,
          }));
      },
      toggleBathLight = async () => {
        if (!isBathLightInteractive || isBathLightBusy) return;
        isBathLightBusy = true;
        const previousBathLightState = currentBathLightState;
        syncBathLightState({
          ...(currentBathLightState || {}),
          state: currentBathLightState?.state === "on" ? "off" : "on",
        });
        try {
          await this.callEntityService(
            "homeassistant",
            "toggle",
            createBathHeaterLightControlToggleEntityId,
          );
        } catch (bathLightUpdateError) {
          (syncBathLightState(previousBathLightState),
            this.options.onError?.(bathLightUpdateError));
        } finally {
          ((isBathLightBusy = false), syncBathLightState(currentBathLightState));
        }
      };
    return (
      bathLightToggleButton.addEventListener("click", toggleBathLight),
      bathHeaterLightSection.append(bathLightHeading, bathLightToggleButton),
      (bathHeaterLightSection.syncBathLightState = syncBathLightState),
      (bathHeaterLightSection.toggleBathLight = toggleBathLight),
      syncBathLightState(bathLightState),
      bathHeaterLightSection
    );
  }
  ["showElectricBedLoadingDetails"](
    electricBedComponent,
    { preview: _isElectricBedPreview = false } = {},
  ) {
    if (!electricBedComponent.bindings?.entity?.entityId) return;
    const pendingEntityDetails2 = this.pendingEntityDetails,
      detailsDialog2 = this.detailsDialog;
    ((this.detailsDialog = null),
      this.closeRuntimeDialog(detailsDialog2, {
        preservePending: true,
      }));
    const electricBedLoadingDialog = document.createElement("dialog");
    ((electricBedLoadingDialog.className =
      "hb-entity-details-dialog electric-bed-details electric-bed-loading-details"),
      (electricBedLoadingDialog.tabIndex = -1));
    const electricBedLoadingCard = document.createElement("div");
    electricBedLoadingCard.className = "hb-entity-details-card";
    const electricBedLoadingHeading = document.createElement("div");
    electricBedLoadingHeading.className = "hb-entity-details-heading";
    const electricBedLoadingTitle = document.createElement("strong");
    ((electricBedLoadingTitle.textContent = componentDialogTitle(electricBedComponent, "电动床")),
      electricBedLoadingHeading.append(electricBedLoadingTitle));
    const electricBedLoadingBody = document.createElement("section");
    electricBedLoadingBody.className = "hb-electric-bed-loading-body";
    const electricBedLoadingStateSection = document.createElement("section");
    electricBedLoadingStateSection.className = "hb-climate-details-loading is-loading";
    const electricBedLoadingIcon = document.createElement("i");
    electricBedLoadingIcon.setAttribute("aria-hidden", "true");
    const electricBedLoadingLabel = document.createElement("strong");
    electricBedLoadingLabel.textContent = "—";
    const electricBedLoadingHint = document.createElement("span");
    ((electricBedLoadingHint.textContent = ""),
      electricBedLoadingStateSection.append(
        electricBedLoadingIcon,
        electricBedLoadingLabel,
        electricBedLoadingHint,
      ),
      electricBedLoadingBody.append(electricBedLoadingStateSection),
      electricBedLoadingCard.append(electricBedLoadingHeading, electricBedLoadingBody),
      electricBedLoadingDialog.append(electricBedLoadingCard));
    const electricBedLoadingOverlay = document.createElement("div");
    ((electricBedLoadingOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (electricBedLoadingOverlay.tabIndex = -1),
      electricBedLoadingOverlay.append(electricBedLoadingDialog),
      this.container.append(electricBedLoadingOverlay),
      (this.detailsDialog = electricBedLoadingDialog),
      this.registerRuntimeDialogScale(
        electricBedLoadingOverlay,
        electricBedLoadingDialog,
        760,
        420,
      ),
      this.bindRuntimeDialogOutsideDismiss(
        electricBedLoadingOverlay,
        electricBedLoadingDialog,
        electricBedLoadingCard,
      ),
      electricBedLoadingOverlay.addEventListener("keydown", (loadingOverlayKeyEvent) => {
        loadingOverlayKeyEvent.key === "Escape" && electricBedLoadingDialog.close();
      }),
      electricBedLoadingDialog.addEventListener(
        "close",
        () => {
          (this.detailsDialog === electricBedLoadingDialog &&
            this.pendingEntityDetails === pendingEntityDetails2 &&
            this.cancelPendingEntityDetails(),
            this.clearRuntimeDialogScale(electricBedLoadingDialog),
            this.detailsDialog === electricBedLoadingDialog && (this.detailsDialog = null),
            electricBedLoadingOverlay.remove());
        },
        {
          once: true,
        },
      ),
      electricBedLoadingDialog.show(),
      electricBedLoadingDialog.focus({
        preventScroll: true,
      }));
  }
  ["showElectricBedDetails"](
    electricBedDetailsComponent,
    { preview: isElectricBedDetailsPreview = false } = {},
  ) {
    const electricBedEntityId = electricBedDetailsComponent.bindings?.entity?.entityId;
    if (!electricBedEntityId) throw new Error("该电动床控件没有关联实体。");
    const electricBedProfile = this.deviceProfile(electricBedEntityId),
      electricBedRoles = electricBedProfile?.roles || {},
      angleControls = [
        ["backrest", "靠背角度"],
        ["leg", "腿部角度"],
        ["waist", "腰部角度"],
      ]
        .map(([roleName, roleLabel]) => ({
          role: roleName,
          label: roleLabel,
          entityId: String(electricBedRoles[roleName] || ""),
        }))
        .filter((roleEntry) => roleEntry.entityId),
      modeEntityId = String(electricBedRoles.mode || ""),
      electricBedMetadata = this.entityMetadata.get(electricBedEntityId),
      siblingEntityIds = electricBedMetadata?.deviceId
        ? [...this.entityMetadata.values()]
            .filter(
              (siblingMetadata) =>
                siblingMetadata.deviceId === electricBedMetadata.deviceId &&
                ["button", "select"].includes(
                  String(siblingMetadata.domain || siblingMetadata.entityId || "").split(".", 1)[0],
                ) &&
                siblingMetadata.entityId !== electricBedRoles.mode &&
                entityMetadataIsAvailable2(siblingMetadata),
            )
            .sort((metadataA, metadataB) =>
              String(metadataA.entityId || "").localeCompare(String(metadataB.entityId || "")),
            )
            .map((siblingEntityId) => siblingEntityId.entityId)
        : [],
      slice6 = [
        ...new Set(
          [
            String(electricBedRoles.memory1 || ""),
            String(electricBedRoles.memory2 || ""),
            ...siblingEntityIds,
          ].filter(Boolean),
        ),
      ].slice(0, 2);
    this.closeRuntimeDialog();
    const electricBedDialog = document.createElement("dialog");
    electricBedDialog.className = "hb-entity-details-dialog electric-bed-details";
    const electricBedCard = document.createElement("div");
    electricBedCard.className = "hb-entity-details-card";
    const electricBedHeading = document.createElement("div");
    electricBedHeading.className = "hb-entity-details-heading";
    const electricBedTitleRow = document.createElement("div"),
      electricBedTitle = document.createElement("strong");
    electricBedTitle.textContent = componentDialogTitle(
      electricBedDetailsComponent,
      electricBedProfile?.deviceName || "电动床",
    );
    const electricBedUnavailableHint = document.createElement("span");
    electricBedTitleRow.append(electricBedTitle, electricBedUnavailableHint);
    const electricBedCloseButton = document.createElement("button");
    ((electricBedCloseButton.type = "button"),
      (electricBedCloseButton.textContent = "×"),
      electricBedCloseButton.setAttribute("aria-label", "关闭电动床详情"),
      electricBedHeading.append(electricBedTitleRow, electricBedCloseButton));
    const electricBedBody = document.createElement("div");
    electricBedBody.className = "hb-electric-bed-details-body";
    const electricBedVisualSection = document.createElement("section");
    electricBedVisualSection.className = "hb-electric-bed-visual";
    const electricBedModelElement = document.createElement("div");
    electricBedModelElement.className = "hb-electric-bed-model";
    const bedMattressElement = document.createElement("i");
    bedMattressElement.className = "hb-electric-bed-mattress";
    const bedBackElement = document.createElement("i");
    bedBackElement.className = "hb-electric-bed-back";
    const bedWaistElement = document.createElement("i");
    bedWaistElement.className = "hb-electric-bed-waist";
    const bedLegsElement = document.createElement("i");
    bedLegsElement.className = "hb-electric-bed-legs";
    const bedBaseElement = document.createElement("i");
    ((bedBaseElement.className = "hb-electric-bed-base"),
      electricBedModelElement.append(
        bedMattressElement,
        bedBackElement,
        bedWaistElement,
        bedLegsElement,
        bedBaseElement,
      ));
    const createAngleReadout = (readoutClassName, readoutLabel) => {
        const angleReadoutElement = document.createElement("span");
        angleReadoutElement.className = "hb-electric-bed-angle-readout " + readoutClassName;
        const angleReadoutValueLabel = document.createElement("strong"),
          angleReadoutLabel = document.createElement("small");
        return (
          (angleReadoutLabel.textContent = readoutLabel),
          angleReadoutElement.append(angleReadoutValueLabel, angleReadoutLabel),
          {
            readout: angleReadoutElement,
            value: angleReadoutValueLabel,
          }
        );
      },
      backAngleReadoutElement = createAngleReadout("back", "靠背"),
      waistAngleReadoutElement = createAngleReadout("waist", "腰部"),
      legsAngleReadoutElement = createAngleReadout("legs", "腿部"),
      deviceStatusLabel = document.createElement("strong"),
      deviceStatusHint = document.createElement("small");
    electricBedVisualSection.append(
      electricBedModelElement,
      backAngleReadoutElement.readout,
      waistAngleReadoutElement.readout,
      legsAngleReadoutElement.readout,
      deviceStatusLabel,
      deviceStatusHint,
    );
    const electricBedUtilitiesSection = document.createElement("section");
    electricBedUtilitiesSection.className = "hb-electric-bed-utilities";
    const electricBedMainSection = document.createElement("section");
    electricBedMainSection.className = "hb-electric-bed-main";
    const angleControlsSection = document.createElement("section");
    angleControlsSection.className = "hb-electric-bed-angle-controls";
    const syncHandlersByEntityId = new Map(),
      controlCleanups = [],
      resolveAngleState = (angleEntityId) => {
        const resolvedAngleState = this.states.get(angleEntityId);
        return (
          resolvedAngleState?.newState ||
          resolvedAngleState || {
            entityId: angleEntityId,
            state: "unknown",
            attributes: {},
          }
        );
      },
      createAngleControl = (
        controlLabel,
        controlEntityId,
        controlVariant = "",
        controlContainer = angleControlsSection,
      ) => {
        const controlAngleState = resolveAngleState(controlEntityId),
          angleControlSection = document.createElement("section");
        ((angleControlSection.className = "hb-electric-bed-control"),
          controlLabel === "模式" && angleControlSection.classList.add("hb-electric-bed-mode"));
        const angleControlLabel = document.createElement("strong");
        angleControlLabel.textContent = controlLabel;
        const capabilityDetailsControls5 = this.createCapabilityDetailsControls(
          controlEntityId,
          controlAngleState,
          {
            interactive: !isElectricBedDetailsPreview,
            variant: controlVariant,
          },
        );
        (capabilityDetailsControls5.classList.add("hb-electric-bed-capability"),
          angleControlSection.append(angleControlLabel, capabilityDetailsControls5),
          controlContainer.append(angleControlSection));
        const syncAngleControl = (angleState) =>
          capabilityDetailsControls5.syncCapabilityState?.(angleState);
        (syncHandlersByEntityId.set(controlEntityId, [syncAngleControl]),
          controlCleanups.push({
            role: controlLabel,
            entityId: controlEntityId,
            sync: syncAngleControl,
            cleanup: () => capabilityDetailsControls5.cleanupCapabilityDetails?.(),
          }));
      };
    for (const angleControlEntry of angleControls)
      createAngleControl(angleControlEntry.label, angleControlEntry.entityId);
    if (modeEntityId)
      createAngleControl("模式", modeEntityId, "electric-bed", electricBedUtilitiesSection);
    else {
      const modeControlSection = document.createElement("section");
      modeControlSection.className = "hb-electric-bed-control hb-electric-bed-mode is-unavailable";
      const modeControlLabel = document.createElement("strong");
      modeControlLabel.textContent = "模式";
      const modeSelect = document.createElement("select");
      ((modeSelect.className = "hb-capability-select"),
        (modeSelect.disabled = true),
        modeSelect.setAttribute("aria-label", "模式"));
      const modePlaceholderOptionElement = document.createElement("option");
      ((modePlaceholderOptionElement.textContent = "未识别到模式实体"),
        modeSelect.append(modePlaceholderOptionElement),
        modeControlSection.append(modeControlLabel, modeSelect),
        electricBedUtilitiesSection.append(modeControlSection));
    }
    const memoryControlSection = document.createElement("section");
    memoryControlSection.className = "hb-electric-bed-memory";
    const memoryControlLabel = document.createElement("strong");
    memoryControlLabel.textContent = "记忆姿势";
    const memoryControlList = document.createElement("div");
    memoryControlList.className = "hb-electric-bed-memory-list";
    for (let memorySlotIndex = 0; memorySlotIndex < 2; memorySlotIndex += 1) {
      const memoryEntityId = slice6[memorySlotIndex] || "",
        memoryEntityMetadata = memoryEntityId ? this.entityMetadata.get(memoryEntityId) : null;
      if (String(memoryEntityId).split(".", 1)[0] === "select") {
        const memorySlotSection = document.createElement("section");
        memorySlotSection.className = "hb-electric-bed-memory-control hb-electric-bed-control";
        const memorySlotLabel = document.createElement("strong");
        memorySlotLabel.textContent = "记忆姿势 " + (memorySlotIndex + 1);
        const capabilityDetailsControls6 = this.createCapabilityDetailsControls(
          memoryEntityId,
          resolveAngleState(memoryEntityId),
          {
            interactive: !isElectricBedDetailsPreview,
            variant: "electric-bed-memory",
            selectLabel: "姿势",
          },
        );
        (capabilityDetailsControls6.classList.add("hb-electric-bed-capability"),
          memorySlotSection.append(memorySlotLabel, capabilityDetailsControls6),
          memoryControlList.append(memorySlotSection));
        const syncMemorySlot = (memoryState) =>
          capabilityDetailsControls6.syncCapabilityState?.(memoryState);
        (syncHandlersByEntityId.set(memoryEntityId, [syncMemorySlot]),
          controlCleanups.push({
            role: "memory" + (memorySlotIndex + 1),
            entityId: memoryEntityId,
            sync: syncMemorySlot,
            cleanup: () => capabilityDetailsControls6.cleanupCapabilityDetails?.(),
          }));
        continue;
      }
      const memorySlotButton = document.createElement("button");
      ((memorySlotButton.type = "button"),
        (memorySlotButton.className = "hb-electric-bed-memory-button"),
        (memorySlotButton.textContent =
          memoryEntityMetadata?.name ||
          memoryEntityMetadata?.originalName ||
          "记忆姿势 " + (memorySlotIndex + 1)),
        (memorySlotButton.disabled = isElectricBedDetailsPreview || !memoryEntityId),
        memorySlotButton.classList.toggle("is-unavailable", !memoryEntityId),
        memorySlotButton.addEventListener("click", async () => {
          if (!(isElectricBedDetailsPreview || !memoryEntityId || memorySlotButton.disabled)) {
            ((memorySlotButton.disabled = true), memorySlotButton.classList.add("is-pending"));
            try {
              (await this.callEntityService("button", "press", memoryEntityId),
                memorySlotButton.classList.add("is-success"),
                window.setTimeout(() => memorySlotButton.classList.remove("is-success"), 900));
            } catch (memoryUpdateError) {
              this.options.onError?.(memoryUpdateError);
            } finally {
              (memorySlotButton.classList.remove("is-pending"),
                (memorySlotButton.disabled = isElectricBedDetailsPreview || !memoryEntityId));
            }
          }
        }),
        memoryControlList.append(memorySlotButton));
    }
    if (
      (memoryControlSection.append(memoryControlLabel, memoryControlList),
      electricBedUtilitiesSection.append(memoryControlSection),
      !angleControls.length)
    ) {
      const angleEmptyHint = document.createElement("p");
      ((angleEmptyHint.className = "hb-electric-bed-empty"),
        (angleEmptyHint.textContent = "暂未识别到角度实体"),
        angleControlsSection.append(angleEmptyHint));
    }
    (electricBedMainSection.append(electricBedVisualSection, angleControlsSection),
      electricBedBody.append(electricBedUtilitiesSection, electricBedMainSection),
      electricBedCard.append(electricBedHeading, electricBedBody),
      electricBedDialog.append(electricBedCard));
    const anglePercentForState = (_angleRoleEntityId, angleEntityState) => {
        const angleRawValue = Number(angleEntityState?.state),
          angleMinimum = Number(angleEntityState?.attributes?.min),
          angleMaximum = Number(angleEntityState?.attributes?.max);
        return Number.isFinite(angleRawValue)
          ? !Number.isFinite(angleMinimum) ||
            !Number.isFinite(angleMaximum) ||
            angleMaximum <= angleMinimum
            ? Math.max(0, Math.min(100, angleRawValue))
            : Math.max(
                0,
                Math.min(
                  100,
                  ((angleRawValue - angleMinimum) / (angleMaximum - angleMinimum)) * 100,
                ),
              )
          : 0;
      },
      syncAngleVisuals = () => {
        const backAngleState = resolveAngleState(electricBedRoles.backrest),
          legAngleState = resolveAngleState(electricBedRoles.leg),
          waistAngleState = resolveAngleState(electricBedRoles.waist),
          formatAngleValue = (angleValueState) => {
            const angleNumericValue = Number(angleValueState?.state);
            if (!Number.isFinite(angleNumericValue)) return "--";
            const angleUnit = String(angleValueState?.attributes?.unit_of_measurement || "°");
            return "" + angleNumericValue + angleUnit;
          };
        ((backAngleReadoutElement.value.textContent = formatAngleValue(backAngleState)),
          (waistAngleReadoutElement.value.textContent = formatAngleValue(waistAngleState)),
          (legsAngleReadoutElement.value.textContent = formatAngleValue(legAngleState)),
          electricBedVisualSection.style.setProperty(
            "--hb-bed-backrest-angle",
            anglePercentForState(electricBedRoles.backrest, backAngleState) * -0.42 + "deg",
          ),
          electricBedVisualSection.style.setProperty(
            "--hb-bed-leg-angle",
            anglePercentForState(electricBedRoles.leg, legAngleState) * -0.28 + "deg",
          ),
          electricBedVisualSection.style.setProperty(
            "--hb-bed-waist-angle",
            anglePercentForState(electricBedRoles.waist, waistAngleState) * -0.1 + "deg",
          ));
        const angleStateStrings = [backAngleState, legAngleState, waistAngleState].map(
            (angleStateString) => String(angleStateString?.state || "").toLowerCase(),
          ),
          some = angleStateStrings.some(
            (unavailableAngleState) => unavailableAngleState === "unavailable",
          ),
          some2 =
            !some &&
            angleStateStrings.some(
              (unknownAngleState) => unknownAngleState === "unknown" || !unknownAngleState,
            );
        ((deviceStatusLabel.textContent = some ? "部分实体不可用" : some2 ? "—" : "设备在线"),
          (deviceStatusHint.textContent = angleControls.length === 3 ? "三个角度独立控制" : ""),
          (electricBedUnavailableHint.textContent = some ? "部分功能不可用" : ""));
      };
    syncAngleVisuals();
    for (const entityControlEntry of angleControls)
      syncHandlersByEntityId.get(entityControlEntry.entityId)?.push(() => {
        syncAngleVisuals();
      });
    (modeEntityId && syncHandlersByEntityId.get(modeEntityId)?.push(() => syncAngleVisuals()),
      (this.detailsStateSync = {
        dialog: electricBedDialog,
        handlers: syncHandlersByEntityId,
      }));
    const electricBedOverlay = document.createElement("div");
    ((electricBedOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (electricBedOverlay.tabIndex = -1),
      electricBedOverlay.append(electricBedDialog),
      this.container.append(electricBedOverlay),
      (this.detailsDialog = electricBedDialog),
      this.registerRuntimeDialogScale(electricBedOverlay, electricBedDialog, 760, 560),
      electricBedCloseButton.addEventListener("click", () => electricBedDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(electricBedOverlay, electricBedDialog, electricBedCard),
      electricBedOverlay.addEventListener("keydown", (electricBedOverlayKeyEvent) => {
        electricBedOverlayKeyEvent.key === "Escape" && electricBedDialog.close();
      }),
      electricBedDialog.addEventListener(
        "close",
        () => {
          for (const controlCleanup of controlCleanups) controlCleanup.cleanup?.();
          (this.clearRuntimeDialogScale(electricBedDialog),
            this.detailsDialog === electricBedDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === electricBedDialog && (this.detailsStateSync = null),
            electricBedOverlay.remove());
        },
        {
          once: true,
        },
      ),
      electricBedDialog.show());
  }
  ["openInteraction3dVacuumDetails"](
    vacuumDetailsOptions,
    onDialogClose,
    {
      states: stateSnapshot = {},
      root: rootHost,
      frame: frameHost,
      popupOpacity: popupOpacity = 74,
      getPresentationLayout: getPresentationLayout,
      getPopupLayout: getPopupLayout,
    }: {
      states?: ComponentPayload;
      root?: any;
      frame?: any;
      popupOpacity?: number;
      getPresentationLayout?: any;
      getPopupLayout?: any;
    } = {},
  ) {
    const statusEntityIdSet = new Set([
      vacuumDetailsOptions.entityId,
      ...(vacuumDetailsOptions.relatedEntityIds || []),
    ]);
    let vacuumDialogElement = null;
    const updateVacuumStates = (stateMap) => {
      for (const statusEntityId of statusEntityIdSet) {
        const entityState = stateMap[statusEntityId] || {
          entityId: statusEntityId,
          state: "unavailable",
          attributes: {},
        };
        if (
          (this.states.set(statusEntityId, entityState),
          this.detailsStateSync?.dialog === vacuumDialogElement)
        ) {
          for (const stateHandler of this.detailsStateSync.handlers.get(statusEntityId) || [])
            stateHandler(entityState);
        }
      }
    };
    updateVacuumStates(stateSnapshot);
    const findVacuumComponent = (componentList) => {
        for (const componentRecordCandidate of componentList || []) {
          if (
            componentRecordCandidate.type === "vacuum-control" &&
            componentRecordCandidate.bindings?.entity?.entityId === vacuumDetailsOptions.entityId
          )
            return componentRecordCandidate;
          const nestedComponent = findVacuumComponent(componentRecordCandidate.children);
          if (nestedComponent) return nestedComponent;
        }
        return null;
      },
      pageComponent = (this.document?.pages || [])
        .map((documentPage) => findVacuumComponent(documentPage.components))
        .find(Boolean),
      selectedStatusEntityIds =
        pageComponent?.properties?.relatedEntities?.mode === "selected"
          ? (pageComponent.properties.relatedEntities.entityIds || []).filter((selectedEntityId) =>
              statusEntityIdSet.has(selectedEntityId),
            )
          : [],
      vacuumSnapshotOptions = {
        id: "vacuum:" + vacuumDetailsOptions.id,
        type: "vacuum-control",
        properties: {
          label: vacuumDetailsOptions.label,
          relatedEntities: {
            mode: "selected",
            entityIds: selectedStatusEntityIds,
          },
        },
        bindings: {
          entity: {
            entityId: vacuumDetailsOptions.entityId,
          },
        },
      };
    return (
      (() => {
        (vacuumDialogElement?.removeEventListener("close", onDialogClose),
          this.showVacuumDetails(vacuumSnapshotOptions, {
            preview: !!this.options.editable,
            interaction3d: {
              root: rootHost,
              frame: frameHost,
              popupOpacity: popupOpacity,
              getPresentationLayout: getPresentationLayout,
              getPopupLayout: getPopupLayout,
              statusEntities: [...statusEntityIdSet]
                .filter((sensorEntityId) => sensorEntityId.startsWith("sensor."))
                .map((statusSensorEntityId) => ({
                  entityId: statusSensorEntityId,
                  role: vacuumDetailsOptions.statusEntityRoles
                    ? vacuumDetailsOptions.statusEntityRoles[statusSensorEntityId] || ""
                    : undefined,
                })),
            },
          }),
          (vacuumDialogElement = this.detailsDialog),
          vacuumDialogElement?.addEventListener("close", onDialogClose, {
            once: true,
          }));
      })(),
      {
        updateStates: updateVacuumStates,
        updateLayout: () => vacuumDialogElement?.resizeInteraction3d?.(),
        close: () => {
          (vacuumDialogElement?.removeEventListener("close", onDialogClose),
            vacuumDialogElement?.close());
        },
        contains: (containedEntityId) => vacuumDialogElement?.contains(containedEntityId),
      }
    );
  }
  ["showVacuumDetails"](
    vacuumComponent,
    { preview: isVacuumPreview = false, interaction3d: interaction3dInstance = null } = {},
  ) {
    const vacuumEntityId = vacuumComponent.bindings?.entity?.entityId;
    if (!vacuumEntityId) throw new Error("该扫地机器人控件没有关联实体。");
    const selectedRelatedEntityIds = selectedRelatedEntityIds2(vacuumComponent);
    this.closeRuntimeDialog();
    const vacuumState = this.states.get(vacuumEntityId);
    let vacuumStateOptions = vacuumState?.newState ||
      vacuumState || {
        state: "unknown",
        attributes: {},
      };
    const vacuumDialog: ComponentDialogElement = document.createElement("dialog");
    ((vacuumDialog.className = "hb-entity-details-dialog vacuum-details"),
      interaction3dInstance && vacuumDialog.classList.add("i3d-vacuum-details"));
    const vacuumCard = document.createElement("div");
    ((vacuumCard.className = "hb-entity-details-card"),
      vacuumCard.classList.add("hb-vacuum-details-card"));
    const vacuumHeading = document.createElement("div");
    vacuumHeading.className = "hb-entity-details-heading";
    const vacuumTitleRow = document.createElement("div"),
      vacuumTitle = document.createElement("strong"),
      vacuumTitleText =
        String(vacuumStateOptions.attributes?.friendly_name || "扫地机器人").replace(/^\d+/, "") ||
        "扫地机器人";
    vacuumTitle.textContent = componentDialogTitle(vacuumComponent, vacuumTitleText);
    const vacuumSubtitleLabel = document.createElement("span");
    vacuumSubtitleLabel.className = "hb-vacuum-details-subtitle";
    const vacuumCloseButton = document.createElement("button");
    ((vacuumCloseButton.type = "button"),
      vacuumCloseButton.setAttribute("aria-label", "关闭扫地机器人详情"),
      (vacuumCloseButton.textContent = "×"),
      vacuumTitleRow.append(vacuumTitle, vacuumSubtitleLabel),
      vacuumHeading.append(vacuumTitleRow, vacuumCloseButton));
    const vacuumLayout = document.createElement("div");
    vacuumLayout.className = "hb-vacuum-details-layout";
    const vacuumOverviewSection = document.createElement("section");
    vacuumOverviewSection.className = "hb-vacuum-details-overview";
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
    const vacuumMopLeftElement = document.createElement("i");
    vacuumMopLeftElement.className = "hb-vacuum-robot-mop left";
    const vacuumMopRightElement = document.createElement("i");
    ((vacuumMopRightElement.className = "hb-vacuum-robot-mop right"),
      vacuumRobotElement.append(
        vacuumLidarElement,
        vacuumSensorElement,
        vacuumBumperElement,
        vacuumBrushElement,
        vacuumMopLeftElement,
        vacuumMopRightElement,
      ));
    const vacuumBatteryElement = document.createElement("div");
    vacuumBatteryElement.className = "hb-vacuum-battery";
    const vacuumBatteryPercentLabel = document.createElement("strong"),
      vacuumBatteryCaption = document.createElement("small");
    ((vacuumBatteryCaption.textContent = "电量"),
      vacuumBatteryElement.append(vacuumBatteryPercentLabel, vacuumBatteryCaption),
      vacuumBatteryRingElement.append(vacuumRobotElement),
      vacuumHeading.append(vacuumBatteryElement));
    const vacuumStatusLabel = document.createElement("span");
    ((vacuumStatusLabel.className = "hb-vacuum-visual-status"),
      vacuumVisualElement.append(vacuumBatteryRingElement, vacuumStatusLabel));
    const vacuumStatsElement = document.createElement("div");
    vacuumStatsElement.className = "hb-vacuum-details-stats";
    const createVacuumStat = (statLabel, statIcon) => {
        const vacuumStatElement = document.createElement("div"),
          vacuumStatValueLabel = document.createElement("span");
        vacuumStatValueLabel.className = "hb-vacuum-details-stat-value";
        const vacuumStatIcon = document.createElement("i");
        ((vacuumStatIcon.textContent = statIcon),
          vacuumStatIcon.setAttribute("aria-hidden", "true"));
        const vacuumStatNumberLabel = document.createElement("strong"),
          vacuumStatLabel = document.createElement("small");
        return (
          (vacuumStatLabel.textContent = statLabel),
          vacuumStatValueLabel.append(vacuumStatIcon, vacuumStatNumberLabel),
          vacuumStatElement.append(vacuumStatValueLabel, vacuumStatLabel),
          vacuumStatsElement.append(vacuumStatElement),
          vacuumStatNumberLabel
        );
      },
      vacuumAreaStatElement = createVacuumStat("本次面积", "◇"),
      vacuumTimeStatElement = createVacuumStat("清扫时长", "◷");
    (interaction3dInstance || vacuumOverviewSection.append(vacuumVisualElement),
      vacuumOverviewSection.append(vacuumStatsElement));
    const vacuumControlsSection = document.createElement("section");
    vacuumControlsSection.className = "hb-vacuum-details-controls";
    const vacuumActions = document.createElement("div");
    vacuumActions.className = "hb-vacuum-details-actions";
    const createVacuumAction = (
        actionTitle,
        descriptionText,
        actionIconValue,
        actionServiceName,
      ) => {
        const vacuumActionButton = document.createElement("button");
        ((vacuumActionButton.type = "button"),
          (vacuumActionButton.dataset.service = actionServiceName),
          (vacuumActionButton.disabled = isVacuumPreview));
        const vacuumActionIcon = document.createElement("i");
        ((vacuumActionIcon.textContent = actionIconValue),
          vacuumActionIcon.setAttribute("aria-hidden", "true"));
        const vacuumActionContentWrapper = document.createElement("span"),
          vacuumActionNameLabel = document.createElement("strong");
        vacuumActionNameLabel.textContent = actionTitle;
        const vacuumActionDescriptionLabel = document.createElement("small");
        return (
          (vacuumActionDescriptionLabel.textContent = descriptionText),
          vacuumActionContentWrapper.append(vacuumActionNameLabel, vacuumActionDescriptionLabel),
          vacuumActionButton.append(vacuumActionIcon, vacuumActionContentWrapper),
          vacuumActions.append(vacuumActionButton),
          {
            button: vacuumActionButton,
            name: vacuumActionNameLabel,
            description: vacuumActionDescriptionLabel,
          }
        );
      },
      vacuumActionDefs = [
        ["start", "开始清扫", "启动全屋任务", "▶"],
        ["pause", "暂停", "保留当前进度", "Ⅱ"],
        ["stop", "停止", "结束当前任务", "■"],
        ["return_to_base", "回充", "返回充电座", "⌂"],
        ["locate", "定位", "让设备发出声音", "◎"],
        ["clean_spot", "局部清扫", "清扫当前位置", "⌖"],
      ],
      vacuumActionsByService = new Map(
        vacuumActionDefs.map(([actionKey, actionLabel, actionGlyph, actionDescription]) => [
          actionKey,
          createVacuumAction(actionLabel, actionGlyph, actionDescription, actionKey),
        ]),
      ),
      startAction = vacuumActionsByService.get("start"),
      pauseAction = vacuumActionsByService.get("pause"),
      stopAction = vacuumActionsByService.get("stop"),
      returnToBaseAction = vacuumActionsByService.get("return_to_base"),
      locateAction = vacuumActionsByService.get("locate"),
      cleanSpotAction = vacuumActionsByService.get("clean_spot");
    vacuumControlsSection.append(vacuumActions);
    const normalizeActionKey = (rawActionValue) =>
        String(rawActionValue || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, ""),
      fanSpeedLabels = {
        sweeping: "扫地",
        mopping: "拖地",
        sweeping_and_mopping: "扫拖同步",
        mopping_after_sweeping: "先扫后拖",
      },
      suctionLevelLabels = {
        silent: "静音",
        quiet: "静音",
        standard: "标准",
        strong: "强力",
        turbo: "超强",
      },
      createVacuumOption = ({
        label: optionLabelText,
        detail: optionDetailText,
        labels: optionLabelMap,
        onSelect: onOptionSelect,
      }) => {
        const vacuumOptionGroupSection = document.createElement("section");
        vacuumOptionGroupSection.className = "hb-vacuum-details-option-group";
        const vacuumOptionHeading = document.createElement("div"),
          vacuumOptionTitle = document.createElement("strong");
        vacuumOptionTitle.textContent = optionLabelText;
        const vacuumOptionDetailLabel = document.createElement("small");
        ((vacuumOptionDetailLabel.textContent = optionDetailText),
          vacuumOptionHeading.append(vacuumOptionTitle, vacuumOptionDetailLabel));
        const vacuumOptionsContainer = document.createElement("div");
        vacuumOptionsContainer.className = "hb-vacuum-details-options";
        let vacuumOptionEntries = [],
          cachedOptionSignature = "";
        const syncVacuumOptions = (currentValueText, optionItems, isOptionSupported = true) => {
          const optionSignature = JSON.stringify(optionItems);
          (cachedOptionSignature !== optionSignature &&
            ((cachedOptionSignature = optionSignature),
            (vacuumOptionEntries = optionItems.map((optionItem) => {
              const optionKey = normalizeActionKey(optionItem),
                vacuumOptionButton = document.createElement("button");
              return (
                (vacuumOptionButton.type = "button"),
                (vacuumOptionButton.textContent = optionLabelMap[optionKey] || String(optionItem)),
                vacuumOptionButton.addEventListener("click", () => onOptionSelect(optionItem)),
                {
                  button: vacuumOptionButton,
                  key: optionKey,
                }
              );
            })),
            vacuumOptionsContainer.replaceChildren(
              ...vacuumOptionEntries.map((optionEntryItem) => optionEntryItem.button),
            )),
            (vacuumOptionGroupSection.hidden = !vacuumOptionEntries.length));
          const currentOptionKey = normalizeActionKey(currentValueText);
          for (const { button: optionButtonElement, key: optionButtonKey } of vacuumOptionEntries)
            (optionButtonElement.classList.toggle("active", optionButtonKey === currentOptionKey),
              (optionButtonElement.dataset.unsupported = String(!isOptionSupported)),
              (optionButtonElement.disabled =
                isVacuumPreview ||
                isVacuumBusy ||
                !vacuumStatus2(vacuumStateOptions).available ||
                !isOptionSupported));
        };
        return (
          vacuumOptionGroupSection.append(vacuumOptionHeading, vacuumOptionsContainer),
          vacuumControlsSection.append(vacuumOptionGroupSection),
          {
            group: vacuumOptionGroupSection,
            sync: syncVacuumOptions,
          }
        );
      },
      candidateCleaningModeEntityId =
        "select." + vacuumEntityId.slice(vacuumEntityId.indexOf(".") + 1) + "_cleaning_mode",
      cleaningModeEntityRecord = relatedDeviceEntity2(
        this.entityMetadata,
        vacuumEntityId,
        "select",
        "cleaning_mode",
        candidateCleaningModeEntityId,
      ),
      cleaningModeEntityId = String(cleaningModeEntityRecord?.entityId || ""),
      cleaningModeState = cleaningModeEntityId ? this.states.get(cleaningModeEntityId) : null;
    let cleaningModeStateValue = cleaningModeState?.newState || cleaningModeState || null;
    const vacuumBatteryEntity = relatedVacuumBatteryEntity2(
        this.entityMetadata,
        this.states,
        vacuumEntityId,
      ),
      batteryEntityId = String(vacuumBatteryEntity?.entityId || ""),
      batteryState = batteryEntityId ? this.states.get(batteryEntityId) : null;
    let batteryStateValue = batteryState?.newState || batteryState || null,
      modeOptionSync = null;
    const syncCleaningMode = (cleaningModeStateArg) => {
      cleaningModeStateArg &&
        ((cleaningModeStateValue = cleaningModeStateArg.newState || cleaningModeStateArg),
        syncCleaningModeOptions());
    };
    let isVacuumBusy = false,
      isVacuumActioning = false;
    const setVacuumPending = (interaction3dInstanceIsPending) => {
        ((isVacuumBusy = interaction3dInstanceIsPending),
          vacuumControlsSection.classList.toggle("is-pending", interaction3dInstanceIsPending));
        for (const controlButton of vacuumControlsSection.querySelectorAll<HTMLButtonElement>(
          ":scope > .hb-vacuum-details-actions button, :scope > .hb-vacuum-details-option-group button",
        ))
          controlButton.disabled =
            isVacuumPreview ||
            interaction3dInstanceIsPending ||
            !vacuumStatus2(vacuumStateOptions).available ||
            controlButton.dataset.unsupported === "true";
      },
      callVacuumService = async (
        targetDomain,
        targetService,
        targetEntityId,
        callVacuumServiceServicePayload,
        pendingError = null,
        stateApplier = applyVacuumState,
        appliedState = vacuumStateOptions,
      ) => {
        if (
          isVacuumActioning ||
          isVacuumPreview ||
          isVacuumBusy ||
          !vacuumStatus2(vacuumStateOptions).available
        )
          return false;
        (pendingError && stateApplier(pendingError), setVacuumPending(true));
        try {
          return (
            await this.callEntityService(
              targetDomain,
              targetService,
              targetEntityId,
              callVacuumServiceServicePayload,
            ),
            true
          );
        } catch (vacuumServiceError) {
          return (
            isVacuumActioning ||
              (pendingError && stateApplier(appliedState),
              this.options.onError?.(vacuumServiceError)),
            false
          );
        } finally {
          isVacuumActioning || setVacuumPending(false);
        }
      },
      hasCleaningModeEntity = !!cleaningModeEntityId;
    modeOptionSync = createVacuumOption({
      label: "清洁模式",
      detail: hasCleaningModeEntity ? "选择本次任务方式" : "当前设备未提供模式切换实体",
      labels: fanSpeedLabels,
      onSelect: async (selectedModeValue) => {
        const confirmedCleaningMode = cleaningModeStateValue;
        if (
          !hasCleaningModeEntity ||
          !confirmedCleaningMode ||
          ["unknown", "unavailable"].includes(confirmedCleaningMode.state)
        )
          return;
        const cleaningModeOptions = {
          ...confirmedCleaningMode,
          state: selectedModeValue,
        };
        await callVacuumService(
          "select",
          "select_option",
          cleaningModeEntityId,
          {
            option: selectedModeValue,
          },
          cleaningModeOptions,
          syncCleaningMode,
          confirmedCleaningMode,
        );
      },
    });
    const fanSpeedOptionElement = createVacuumOption({
        label: "吸力",
        detail: "按地面情况调节",
        labels: suctionLevelLabels,
        onSelect: async (selectedFanSpeed) => {
          const vacuumAttributesSource = vacuumStateOptions,
            suctionLevelOptions = {
              ...vacuumAttributesSource,
              attributes: {
                ...(vacuumAttributesSource.attributes || {}),
                fan_speed: selectedFanSpeed,
                suction_level: selectedFanSpeed,
              },
            };
          await callVacuumService(
            "vacuum",
            "set_fan_speed",
            vacuumEntityId,
            {
              fan_speed: selectedFanSpeed,
            },
            suctionLevelOptions,
          );
        },
      }),
      syncCleaningModeOptions = () => {
        const vacuumAttributes = vacuumStateOptions.attributes || {},
          cleaning_mode_list =
            cleaningModeStateValue?.attributes?.options ?? vacuumAttributes.cleaning_mode_list;
        modeOptionSync.sync(
          cleaningModeStateValue?.state || vacuumAttributes.cleaning_mode,
          Array.isArray(cleaning_mode_list) ? cleaning_mode_list : [],
          hasCleaningModeEntity &&
            !!cleaningModeStateValue &&
            !["unknown", "unavailable"].includes(cleaningModeStateValue.state),
        );
        const fan_speed_list = vacuumAttributes.fan_speed_list?.length
          ? vacuumAttributes.fan_speed_list
          : vacuumAttributes.suction_level_list;
        fanSpeedOptionElement.sync(
          vacuumAttributes.fan_speed || vacuumAttributes.suction_level,
          Array.isArray(fan_speed_list) ? fan_speed_list : [],
        );
      },
      waterHeaterExtensionControls2 =
        selectedRelatedEntityIds !== null
          ? this.createWaterHeaterExtensionControls(vacuumEntityId, {
              component: vacuumComponent,
              interactive: !isVacuumPreview,
              excludedEntityIds: [cleaningModeEntityId, batteryEntityId].filter(Boolean),
            })
          : null,
      vacuumWarningNote = document.createElement("p");
    ((vacuumWarningNote.className = "hb-vacuum-details-warning"),
      vacuumControlsSection.append(vacuumWarningNote),
      vacuumLayout.append(vacuumOverviewSection, vacuumControlsSection),
      vacuumCard.append(vacuumHeading, vacuumLayout),
      waterHeaterExtensionControls2 &&
        (vacuumCard.append(waterHeaterExtensionControls2),
        vacuumDialog.classList.add("has-related-extensions")),
      vacuumDialog.append(vacuumCard));
    const statusEntities =
        interaction3dInstance?.statusEntities ||
        relatedVacuumStatusEntities2(this.entityMetadata, vacuumEntityId),
      statesByEntityId = new Map(
        statusEntities.map((statusEntity) => [
          statusEntity.entityId,
          this.states.get(statusEntity.entityId),
        ]),
      ),
      resolveVacuumStatus = (vacuumStateInput) =>
        vacuumStatus2(
          vacuumStateInput,
          statusEntities.map((statusEntityEntry) => ({
            ...statusEntityEntry,
            state: statesByEntityId.get(statusEntityEntry.entityId),
          })),
        ),
      formatVacuumNumber = (numericValue, fallbackValue = "--") =>
        numericValue != null &&
        String(numericValue).trim() !== "" &&
        Number.isFinite(Number(numericValue))
          ? Number(numericValue)
          : fallbackValue,
      syncBatteryValue = () => {
        const batteryPercent = resolveVacuumStatus(vacuumStateOptions).available
          ? vacuumBatteryPercent2(vacuumStateOptions, batteryStateValue)
          : null;
        vacuumBatteryPercentLabel.textContent =
          batteryPercent === null ? "--" : Math.round(batteryPercent) + "%";
      },
      syncBatteryState = (batteryStateArg) => {
        ((batteryStateValue = batteryStateArg || batteryStateValue), syncBatteryValue());
      };
    function applyVacuumState(nextVacuumState) {
      if (!nextVacuumState) return;
      ((nextVacuumState = nextVacuumState.newState || nextVacuumState),
        (vacuumStateOptions = nextVacuumState),
        setVacuumPending(isVacuumBusy));
      const vacuumStateAttributes = nextVacuumState.attributes || {},
        vacuumStatus = resolveVacuumStatus(nextVacuumState),
        vacuumStatusText = vacuumStatus.status === "等待状态" ? "—" : vacuumStatus.status,
        active = vacuumStatus.active,
        paused = vacuumStatus.paused,
        returning = vacuumStatus.returning,
        cleaningModeKey = normalizeActionKey(vacuumStateAttributes.cleaning_mode),
        isSweepingMode = ["sweeping", "sweeping_and_mopping", "mopping_after_sweeping"].includes(
          cleaningModeKey,
        ),
        isMoppingMode = ["mopping", "sweeping_and_mopping", "mopping_after_sweeping"].includes(
          cleaningModeKey,
        ),
        supportedActionSet = new Set(vacuumSupportedActions2(nextVacuumState));
      for (const [actionKeyName, actionRecord] of vacuumActionsByService)
        actionRecord.button.hidden =
          !supportedActionSet.has(actionKeyName) ||
          !!(interaction3dInstance && actionKeyName === "clean_spot");
      const visibleActions = [...vacuumActionsByService.values()].filter(
          (filteredAction) => !filteredAction.button.hidden,
        ),
        visibleActionCount = visibleActions.length;
      ((vacuumActions.hidden = visibleActionCount === 0),
        vacuumActions.classList.toggle("has-many-actions", visibleActionCount > 3));
      for (const actionItem of vacuumActionsByService.values())
        actionItem.button.classList.remove("is-last-row-pair", "is-last-row-single");
      const lastRowActionCount = visibleActionCount % 3 || Math.min(visibleActionCount, 3);
      if (lastRowActionCount === 2) {
        for (const lastRowAction of visibleActions.slice(-2))
          lastRowAction.button.classList.add("is-last-row-pair");
      } else
        lastRowActionCount === 1 &&
          visibleActions.at(-1)?.button.classList.add("is-last-row-single");
      ((vacuumSubtitleLabel.textContent = vacuumStatusText),
        vacuumSubtitleLabel.classList.toggle("is-active", active && !paused),
        (vacuumStatusLabel.textContent = vacuumStatusText),
        syncBatteryValue(),
        vacuumVisualElement.classList.toggle("is-working", vacuumStatus.moving),
        vacuumVisualElement.classList.toggle("is-paused", paused),
        vacuumVisualElement.classList.toggle("is-returning", returning),
        vacuumVisualElement.classList.toggle("is-sweeping", isSweepingMode),
        vacuumVisualElement.classList.toggle("is-mopping", isMoppingMode),
        (vacuumAreaStatElement.textContent =
          formatVacuumNumber(vacuumStateAttributes.cleaned_area) + " m²"),
        (vacuumTimeStatElement.textContent =
          formatVacuumNumber(vacuumStateAttributes.cleaning_time) + " min"),
        startAction.button.classList.toggle("active", vacuumStatus.moving && !returning),
        pauseAction.button.classList.toggle("active", paused),
        stopAction.button.classList.toggle("active", false),
        returnToBaseAction.button.classList.toggle("active", returning),
        locateAction.button.classList.toggle("active", false),
        cleanSpotAction.button.classList.toggle(
          "active",
          active && !paused && !returning && nextVacuumState.state === "cleaning",
        ),
        (startAction.name.textContent = paused ? "继续清扫" : "开始清扫"),
        syncCleaningModeOptions());
      const errorText = String(vacuumStateAttributes.error || "").trim(),
        warningText = String(vacuumStateAttributes.low_water_warning || "").trim(),
        vacuumWarnings = [];
      (errorText && !/^no error$/i.test(errorText) && vacuumWarnings.push(errorText),
        warningText && !/^no warning$/i.test(warningText) && vacuumWarnings.push(warningText),
        (vacuumWarningNote.textContent = vacuumWarnings.length
          ? "注意：" + vacuumWarnings.join(" · ")
          : ""),
        (vacuumWarningNote.hidden = !vacuumWarnings.length));
    }
    (startAction.button.addEventListener("click", () =>
      callVacuumService(
        "vacuum",
        vacuumActionService2(vacuumStateOptions, "start"),
        vacuumEntityId,
        {},
      ),
    ),
      pauseAction.button.addEventListener("click", () =>
        callVacuumService("vacuum", "pause", vacuumEntityId, {}),
      ),
      returnToBaseAction.button.addEventListener("click", () =>
        callVacuumService("vacuum", "return_to_base", vacuumEntityId, {}),
      ),
      stopAction.button.addEventListener("click", () =>
        callVacuumService(
          "vacuum",
          vacuumActionService2(vacuumStateOptions, "stop"),
          vacuumEntityId,
          {},
        ),
      ),
      locateAction.button.addEventListener("click", () =>
        callVacuumService("vacuum", "locate", vacuumEntityId, {}),
      ),
      cleanSpotAction.button.addEventListener("click", () =>
        callVacuumService("vacuum", "clean_spot", vacuumEntityId, {}),
      ),
      applyVacuumState(vacuumStateOptions));
    const vacuumOverlay = document.createElement("div");
    ((vacuumOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (vacuumOverlay.tabIndex = -1),
      vacuumOverlay.append(vacuumDialog),
      this.container.append(vacuumOverlay),
      (this.detailsDialog = vacuumDialog));
    const vacuumHandlersByEntityId = new Map([[vacuumEntityId, [applyVacuumState]]]);
    (cleaningModeEntityId && vacuumHandlersByEntityId.set(cleaningModeEntityId, [syncCleaningMode]),
      batteryEntityId && vacuumHandlersByEntityId.set(batteryEntityId, [syncBatteryState]));
    for (const [handlerEntityId, handler] of waterHeaterExtensionControls2?.stateHandlers || [])
      vacuumHandlersByEntityId.set(handlerEntityId, handler);
    for (const vacuumStatusEntity of statusEntities) {
      const entityHandlers = vacuumHandlersByEntityId.get(vacuumStatusEntity.entityId) || [];
      (entityHandlers.push((interaction3dInstanceStateHandlerFunction) => {
        (statesByEntityId.set(
          vacuumStatusEntity.entityId,
          interaction3dInstanceStateHandlerFunction,
        ),
          applyVacuumState(vacuumStateOptions));
      }),
        vacuumHandlersByEntityId.set(vacuumStatusEntity.entityId, entityHandlers));
    }
    this.detailsStateSync = {
      dialog: vacuumDialog,
      handlers: vacuumHandlersByEntityId,
    };
    let vacuumResizeObserver = null;
    if (interaction3dInstance) {
      (vacuumOverlay.classList.add("i3d-vacuum-dialog-layer"),
        (interaction3dInstance.root || this.container).append(vacuumOverlay),
        vacuumDialog.style.setProperty(
          "--i3d-panel-opacity",
          String(
            Math.max(
              0,
              Math.min(
                100,
                Number.isFinite(interaction3dInstance.popupOpacity)
                  ? interaction3dInstance.popupOpacity
                  : 74,
              ),
            ) / 100,
          ),
        ));
      const resizeVacuumDialog = () => {
        const container2 = interaction3dInstance.root || this.container,
          presentationLayout = interaction3dInstance.getPresentationLayout?.(),
          isFixedUiLayout =
            presentationLayout?.fixedUi === true &&
            presentationLayout?.sourceWidth > 0 &&
            presentationLayout?.sourceHeight > 0,
          clientWidth = container2.clientWidth,
          clientHeight = container2.clientHeight,
          sourceWidth2 = isFixedUiLayout
            ? presentationLayout.sourceWidth
            : presentationLayout?.width > 0
              ? presentationLayout.width
              : clientWidth,
          sourceHeight2 = isFixedUiLayout
            ? presentationLayout.sourceHeight
            : presentationLayout?.height > 0
              ? presentationLayout.height
              : clientHeight,
          scaleX = clientWidth / Math.max(1, sourceWidth2),
          scaleY = clientHeight / Math.max(1, sourceHeight2),
          dialogMaxHeight = Math.max(12, Math.min(sourceHeight2 * 0.56 - 400, sourceHeight2 - 812)),
          popupPlacement = popupPlacement2({
            width: sourceWidth2,
            height: sourceHeight2,
            panelWidth: 360,
            panelHeight:
              Math.max(
                vacuumDialog.scrollHeight ? vacuumDialog.scrollHeight + 2 : 0,
                vacuumDialog.offsetHeight || 0,
              ) || 400,
            defaultScale: 2,
            defaultTop: dialogMaxHeight,
            settings: interaction3dInstance.getPopupLayout?.(),
          }),
          renderedScaleX = popupPlacement.scale * scaleX,
          renderedScaleY = popupPlacement.scale * scaleY,
          renderedTop = popupPlacement.top * scaleY;
        ((vacuumDialog.style.top = renderedTop + "px"),
          (vacuumDialog.style.right = popupPlacement.right * scaleX + "px"),
          (vacuumDialog.style.transform = "scale(" + renderedScaleX + "," + renderedScaleY + ")"),
          (vacuumDialog.style.maxHeight = "none"));
      };
      ((vacuumDialog.resizeInteraction3d = resizeVacuumDialog),
        (vacuumResizeObserver = new ResizeObserver(resizeVacuumDialog)),
        vacuumResizeObserver.observe(interaction3dInstance.root || this.container),
        vacuumResizeObserver.observe(vacuumDialog),
        interaction3dInstance.frame && vacuumResizeObserver.observe(interaction3dInstance.frame),
        resizeVacuumDialog());
    } else
      this.registerRuntimeDialogScale(
        vacuumOverlay,
        vacuumDialog,
        840,
        waterHeaterExtensionControls2 ? 560 : 458,
      );
    (vacuumCloseButton.addEventListener("click", () => vacuumDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(vacuumOverlay, vacuumDialog, vacuumCard),
      vacuumOverlay.addEventListener("keydown", (vacuumOverlayKeyEvent) => {
        vacuumOverlayKeyEvent.key === "Escape" && vacuumDialog.close();
      }),
      vacuumDialog.addEventListener(
        "close",
        () => {
          ((isVacuumActioning = true),
            vacuumResizeObserver?.disconnect(),
            this.clearRuntimeDialogScale(vacuumDialog),
            this.detailsDialog === vacuumDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === vacuumDialog && (this.detailsStateSync = null),
            vacuumOverlay.remove());
        },
        {
          once: true,
        },
      ),
      vacuumDialog.show(),
      vacuumDialog.resizeInteraction3d?.());
  }
  ["showPresenceDetails"](presenceComponent, { preview: _isPresencePreview = false } = {}) {
    const presenceEntityId = presenceComponent.bindings?.entity?.entityId;
    if (!presenceEntityId) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    const sensorKind = ["presence", "door-window", "water-leak", "smoke", "natural-gas"].includes(
        presenceComponent.properties?.sensorKind,
      )
        ? presenceComponent.properties.sensorKind
        : "presence",
      presencePresentationConfig = {
        presence: {
          title: "人在检测",
          occupied: "有人",
          clear: "无人",
          unavailable: "传感器离线",
          unknown: "—",
          hintOccupied: "空间内检测到人",
          hintClear: "当前空间无人",
        },
        "door-window": {
          title: "门窗状态",
          occupied: "打开",
          clear: "关闭",
          unavailable: "传感器离线",
          unknown: "—",
          hintOccupied: "门窗当前已打开",
          hintClear: "门窗当前已关闭",
        },
        "water-leak": {
          title: "水浸检测",
          occupied: "检测到水浸",
          clear: "正常",
          unavailable: "传感器离线",
          unknown: "—",
          hintOccupied: "传感器检测到水浸",
          hintClear: "当前未检测到水浸",
        },
        smoke: {
          title: "烟雾检测",
          occupied: "检测到烟雾",
          clear: "正常",
          unavailable: "传感器离线",
          unknown: "—",
          hintOccupied: "传感器检测到烟雾",
          hintClear: "当前未检测到烟雾",
        },
        "natural-gas": {
          title: "天然气检测",
          occupied: "检测到天然气",
          clear: "正常",
          unavailable: "传感器离线",
          unknown: "—",
          hintOccupied: "传感器检测到天然气",
          hintClear: "当前未检测到天然气",
        },
      }[sensorKind];
    let presenceState = this.states.get(presenceEntityId)?.newState ||
      this.states.get(presenceEntityId) || {
        entityId: presenceEntityId,
        state: "unknown",
        attributes: {},
      };
    const historyHours = Math.max(
        1,
        Math.min(168, Number(presenceComponent.properties?.historyHours || 24)),
      ),
      historyPoints = this.historySeries.get(presenceEntityId)?.points || [],
      occupiedColor =
        presenceComponent.properties?.iconOnColor ||
        presenceComponent.properties?.occupiedColor ||
        "#ffffff",
      clearColor =
        presenceComponent.properties?.iconColor ||
        presenceComponent.properties?.clearColor ||
        "#758189",
      resolvePresencePresentation = (presenceStateInput, nowTimestamp = Date.now()) =>
        presenceSensorPresentation2(presenceStateInput, "auto", {
          ...presenceMotionEventConfig2(
            presenceEntityId,
            presenceStateInput,
            this.entityMetadata,
            this.states,
            presenceComponent.properties,
          ),
          now: nowTimestamp,
        }),
      presenceDialog = document.createElement("dialog");
    ((presenceDialog.className = "hb-entity-details-dialog presence-details"),
      (presenceDialog.dataset.sensorKind = sensorKind),
      presenceDialog.style.setProperty("--hb-presence-occupied", occupiedColor),
      presenceDialog.style.setProperty("--hb-presence-clear", clearColor));
    const presenceCard = document.createElement("div");
    presenceCard.className = "hb-entity-details-card";
    const presenceHeading = document.createElement("div");
    presenceHeading.className = "hb-entity-details-heading";
    const presenceTitleRow = document.createElement("div"),
      presenceTitle = document.createElement("strong");
    presenceTitle.textContent = componentDialogTitle(
      presenceComponent,
      presenceState.attributes?.friendly_name || presencePresentationConfig.title,
    );
    const presenceStateLabel = document.createElement("span");
    presenceTitleRow.append(presenceTitle, presenceStateLabel);
    const presenceCloseButton = document.createElement("button");
    ((presenceCloseButton.type = "button"),
      (presenceCloseButton.textContent = "×"),
      presenceCloseButton.setAttribute("aria-label", "关闭弹窗"),
      presenceHeading.append(presenceTitleRow, presenceCloseButton));
    const presenceBody = document.createElement("div");
    presenceBody.className = "hb-presence-details-body";
    const presenceVisualElement = document.createElement("section");
    presenceVisualElement.className = "hb-presence-details-visual";
    let presenceSensorElement = null;
    if (sensorKind === "presence") {
      const presenceSpaceElement = document.createElement("span");
      presenceSpaceElement.className = "hb-presence-sensor-space";
      for (let spaceLayerIndex = 0; spaceLayerIndex < 3; spaceLayerIndex += 1)
        presenceSpaceElement.append(document.createElement("i"));
      const presenceFloorElement = document.createElement("span");
      presenceFloorElement.className = "hb-presence-sensor-floor";
      const presencePersonElement = document.createElement("span");
      presencePersonElement.className = "hb-presence-sensor-person";
      const personHeadElement = document.createElement("i"),
        personTorsoElement = document.createElement("b"),
        personArmLeftElement = document.createElement("span");
      personArmLeftElement.className = "arm left";
      const personArmRightElement = document.createElement("span");
      personArmRightElement.className = "arm right";
      const personLegLeftElement = document.createElement("span");
      personLegLeftElement.className = "leg left";
      const personLegRightElement = document.createElement("span");
      ((personLegRightElement.className = "leg right"),
        presencePersonElement.append(
          personHeadElement,
          personTorsoElement,
          personArmLeftElement,
          personArmRightElement,
          personLegLeftElement,
          personLegRightElement,
        ),
        presenceVisualElement.append(
          presenceSpaceElement,
          presenceFloorElement,
          presencePersonElement,
        ));
    } else
      ((presenceSensorElement = renderRegisteredComponent2(
        {
          ...presenceComponent,
          position: {
            ...(presenceComponent.position || {}),
            width: 100,
            height: 100,
          },
        },
        {
          states: new Map([[presenceEntityId, presenceState]]),
          entityMetadata: this.entityMetadata,
          editable: false,
          previewState: "auto",
          document: this.document,
        },
      )),
        presenceSensorElement.classList.add("hb-presence-details-sensor"),
        presenceVisualElement.append(presenceSensorElement));
    const presenceStateLabelElement = document.createElement("strong"),
      presenceStateHint = document.createElement("small");
    presenceVisualElement.append(presenceStateLabelElement, presenceStateHint);
    const presenceMetricsSection = document.createElement("section");
    presenceMetricsSection.className = "hb-presence-details-metrics";
    const createPresenceMetric = (metricLabel) => {
        const presenceMetricElement = document.createElement("div"),
          presenceMetricLabel = document.createElement("small");
        presenceMetricLabel.textContent = metricLabel;
        const presenceMetricValueLabel = document.createElement("strong");
        return (
          presenceMetricElement.append(presenceMetricLabel, presenceMetricValueLabel),
          presenceMetricsSection.append(presenceMetricElement),
          presenceMetricValueLabel
        );
      },
      presenceDurationMetricElement = createPresenceMetric("当前状态持续"),
      presenceLastDetectedMetricElement = createPresenceMetric("最近检测到人"),
      presenceOccupiedDurationMetricElement = createPresenceMetric(historyHours + " 小时有人时长"),
      presenceTimelineSection = document.createElement("section");
    presenceTimelineSection.className = "hb-presence-details-timeline";
    const presenceTimelineHeading = document.createElement("div"),
      presenceTimelineTitle = document.createElement("strong");
    presenceTimelineTitle.textContent = historyHours + " 小时在家时间轴";
    const presenceTimelineHint = document.createElement("span");
    ((presenceTimelineHint.textContent = "亮色为有人"),
      presenceTimelineHeading.append(presenceTimelineTitle, presenceTimelineHint));
    const presenceTimelineTrack = document.createElement("div"),
      presenceTimelineLabelsRow = document.createElement("div");
    ((presenceTimelineLabelsRow.innerHTML =
      "<span>" + historyHours + " 小时前</span><span>现在</span>"),
      presenceTimelineSection.append(
        presenceTimelineHeading,
        presenceTimelineTrack,
        presenceTimelineLabelsRow,
      ),
      presenceBody.append(presenceVisualElement, presenceMetricsSection, presenceTimelineSection),
      presenceCard.append(presenceHeading, presenceBody),
      presenceDialog.append(presenceCard));
    const formatPresenceTime = (timestamp) => {
        if (!Number.isFinite(timestamp)) return "--";
        const date = new Date(timestamp),
          todayDate = new Date(),
          formattedTime =
            date.getFullYear() === todayDate.getFullYear() &&
            date.getMonth() === todayDate.getMonth() &&
            date.getDate() === todayDate.getDate(),
          format = new Intl.DateTimeFormat("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(date);
        return formattedTime
          ? "今天 " + format
          : new Intl.DateTimeFormat("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
              .format(date)
              .replace(/\//g, "-");
      },
      refreshPresence = () => {
        const historyBuckets = presenceHistoryBuckets2(
          historyPoints,
          presenceState,
          Date.now(),
          historyHours,
          48,
          presenceMotionEventConfig2(
            presenceEntityId,
            presenceState,
            this.entityMetadata,
            this.states,
            presenceComponent.properties,
          ),
        );
        presenceTimelineTrack.replaceChildren(
          ...historyBuckets.map((bucketState, bucketIndex) => {
            const timelineBucketElement = document.createElement("i");
            timelineBucketElement.className = "is-" + bucketState;
            const round3 = Math.round(
              (historyHours * 60 * (historyBuckets.length - bucketIndex - 1)) /
                historyBuckets.length,
            );
            return (
              (timelineBucketElement.title =
                (round3 ? round3 + " 分钟前" : "现在") +
                "：" +
                {
                  occupied: "有人",
                  clear: "无人",
                  unavailable: "离线",
                  unknown: "未知",
                }[bucketState]),
              timelineBucketElement
            );
          }),
        );
        const occupiedBucketCount = historyBuckets.filter(
            (bucketValue) => bucketValue === "occupied",
          ).length,
          round4 = Math.round(
            (historyHours * 60 * occupiedBucketCount) / Math.max(1, historyBuckets.length),
          );
        presenceOccupiedDurationMetricElement.textContent =
          round4 >= 60
            ? Math.floor(round4 / 60) + " 小时 " + (round4 % 60) + " 分钟"
            : round4 + " 分钟";
      },
      resolveLastDetected = () => {
        const presenceMotionEventConfig = presenceMotionEventConfig2(
            presenceEntityId,
            presenceState,
            this.entityMetadata,
            this.states,
            presenceComponent.properties,
          ),
          presencePoints = historyPoints
            .map((rawHistoryPoint) => ({
              timestamp: Date.parse(rawHistoryPoint?.timestamp),
              state: {
                state: rawHistoryPoint?.value,
              },
            }))
            .filter(
              (historyPoint) =>
                Number.isFinite(historyPoint.timestamp) &&
                presenceSensorPresentation2(
                  {
                    state: historyPoint?.state?.state,
                    lastChanged: new Date(historyPoint.timestamp).toISOString(),
                  },
                  "auto",
                  {
                    ...presenceMotionEventConfig,
                    now: historyPoint.timestamp,
                    noMotionSeconds: null,
                    noMotionStateTimestamp: null,
                  },
                ).key === "occupied",
            ),
          lastDetectedTimestamp = presenceStateTimestamp2(presenceState);
        return (
          resolvePresencePresentation(presenceState).key === "occupied" &&
            Number.isFinite(lastDetectedTimestamp) &&
            presencePoints.push({
              timestamp: lastDetectedTimestamp,
            }),
          presencePoints.length
            ? Math.max(...presencePoints.map((presencePoint) => presencePoint.timestamp))
            : null
        );
      },
      applyPresenceState = (presenceStateValue) => {
        presenceState = presenceStateValue || presenceState;
        const presencePresentation = resolvePresencePresentation(presenceState),
          stateTimestamp = presenceStateTimestamp2(presenceState);
        ((presenceDialog.dataset.presenceState = presencePresentation.key),
          (presenceVisualElement.className =
            "hb-presence-details-visual is-" + presencePresentation.key));
        const unknown =
          presencePresentationConfig[presencePresentation.key] ||
          presencePresentationConfig.unknown;
        if (
          ((presenceStateLabel.textContent = unknown),
          presenceStateLabel.classList.toggle("is-on", presencePresentation.key === "occupied"),
          (presenceStateLabelElement.textContent = unknown),
          (presenceStateHint.textContent =
            presencePresentation.key === "occupied"
              ? presencePresentationConfig.hintOccupied
              : presencePresentation.key === "clear"
                ? presencePresentationConfig.hintClear
                : presencePresentation.key === "unavailable"
                  ? "设备当前不可用"
                  : ""),
          presenceSensorElement)
        ) {
          const sensorClassName = {
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
              (presencePresentation.key === "occupied" ? "alert" : presencePresentation.key),
          }[sensorKind];
          ((presenceSensorElement.className = sensorClassName + " hb-presence-details-sensor"),
            (presenceSensorElement.dataset.sensorState = presencePresentation.key),
            presenceSensorElement.setAttribute(
              "aria-label",
              presencePresentationConfig.title + "：" + unknown,
            ));
        }
        ((presenceDurationMetricElement.textContent = ["unknown", "unavailable"].includes(
          presencePresentation.key,
        )
          ? "--"
          : formatPresenceDuration2(stateTimestamp)),
          (presenceLastDetectedMetricElement.textContent =
            formatPresenceTime(resolveLastDetected())),
          refreshPresence());
      };
    applyPresenceState(presenceState);
    const motionEventConfig = presenceMotionEventConfig2(
        presenceEntityId,
        presenceState,
        this.entityMetadata,
        this.states,
        presenceComponent.properties,
      ),
      presenceHandlersByEntityId = new Map([[presenceEntityId, [applyPresenceState]]]);
    for (const companionEntityId of motionEventConfig.companionEntityIds)
      presenceHandlersByEntityId.set(companionEntityId, [() => applyPresenceState(presenceState)]);
    const setInterval3 = motionEventConfig.motionEvent
        ? window.setInterval(() => applyPresenceState(presenceState), 1000)
        : null,
      presenceOverlay = document.createElement("div");
    ((presenceOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (presenceOverlay.tabIndex = -1),
      presenceOverlay.append(presenceDialog),
      this.container.append(presenceOverlay),
      (this.detailsDialog = presenceDialog),
      (this.detailsStateSync = {
        dialog: presenceDialog,
        handlers: presenceHandlersByEntityId,
      }),
      this.registerRuntimeDialogScale(presenceOverlay, presenceDialog, 760, 560),
      presenceCloseButton.addEventListener("click", () => presenceDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(presenceOverlay, presenceDialog, presenceCard),
      presenceOverlay.addEventListener("keydown", (presenceOverlayKeyEvent) => {
        presenceOverlayKeyEvent.key === "Escape" && presenceDialog.close();
      }),
      presenceDialog.addEventListener(
        "close",
        () => {
          (setInterval3 && window.clearInterval(setInterval3),
            this.clearRuntimeDialogScale(presenceDialog),
            this.detailsDialog === presenceDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === presenceDialog && (this.detailsStateSync = null),
            presenceOverlay.remove());
        },
        {
          once: true,
        },
      ),
      presenceDialog.show());
  }
  ["showEntityDetails"](entityDetailsComponent, { preview: isEntityDetailsPreview = false } = {}) {
    const detailEntityId = entityDetailsComponent.bindings?.entity?.entityId;
    if (!detailEntityId) throw new Error("该控件没有关联实体。");
    const detailEntityIdText = String(detailEntityId),
      detailDeviceProfile = this.deviceProfile(detailEntityIdText);
    entityDetailsComponent = applyXiaomiDeviceProfile2(entityDetailsComponent, detailDeviceProfile);
    const isEntityDetailsPreviewEntityDomain = detailEntityIdText.split(".", 1)[0],
      isCatalogRetry =
        entityDetailsComponent.properties?.deviceType === "electric-bed" ||
        detailDeviceProfile?.deviceType === "electric-bed";
    if (!this.entityCatalogReady) {
      (this.deferEntityDetailsUntilReady(
        {
          ...entityDetailsComponent,
          properties: {
            ...(entityDetailsComponent.properties || {}),
            __catalogRetry: true,
          },
        },
        isEntityDetailsPreview,
        isCatalogRetry ? "electric-bed-catalog" : "catalog",
      ),
        isCatalogRetry &&
          this.showElectricBedLoadingDetails(entityDetailsComponent, {
            preview: isEntityDetailsPreview,
          }));
      return;
    }
    if (
      !detailDeviceProfile &&
      isEntityDetailsPreviewEntityDomain === "number" &&
      !entityDetailsComponent.properties?.__catalogRetry
    ) {
      (this.deferEntityDetailsUntilReady(
        {
          ...entityDetailsComponent,
          properties: {
            ...(entityDetailsComponent.properties || {}),
            __catalogRetry: true,
          },
        },
        isEntityDetailsPreview,
        isCatalogRetry ? "electric-bed-catalog" : "catalog",
      ),
        isCatalogRetry &&
          this.showElectricBedLoadingDetails(entityDetailsComponent, {
            preview: isEntityDetailsPreview,
          }));
      return;
    }
    if (
      isEntityDetailsPreviewEntityDomain === "water_heater" &&
      !this.waterHeaterDetailsReady(detailEntityIdText)
    ) {
      this.deferEntityDetailsUntilReady(entityDetailsComponent, isEntityDetailsPreview);
      return;
    }
    if ((this.cancelPendingEntityDetails(), entityDetailsComponent.type === "presence-sensor")) {
      this.showPresenceDetails(entityDetailsComponent, {
        preview: isEntityDetailsPreview,
      });
      return;
    }
    if (detailDeviceProfile?.deviceType === "electric-bed") {
      this.showElectricBedDetails(entityDetailsComponent, {
        preview: isEntityDetailsPreview,
      });
      return;
    }
    detailDeviceProfile?.deviceType === "air-purifier" &&
      isEntityDetailsPreviewEntityDomain === "fan" &&
      ["icon-button", "device-button", "icon-button-effect"].includes(
        entityDetailsComponent.type,
      ) &&
      (entityDetailsComponent = {
        ...entityDetailsComponent,
        type: "air-purifier",
        properties: {
          ...(entityDetailsComponent.properties || {}),
          deviceType: "air-purifier",
        },
      });
    const coveredDomainSet = new Set([
      "line-chart",
      "media-player",
      "air-purifier",
      "air-conditioner",
      "water-heater",
      "vacuum-control",
      "electric-bed",
    ]).has(entityDetailsComponent.type);
    if (
      entityDetailsComponent.type === "media-player" ||
      (!coveredDomainSet && isEntityDetailsPreviewEntityDomain === "media_player")
    ) {
      this.showMediaPlayerDetails(entityDetailsComponent, {
        preview: isEntityDetailsPreview,
      });
      return;
    }
    if (entityDetailsComponent.type === "air-purifier") {
      this.showAirPurifierDetails(entityDetailsComponent, {
        preview: isEntityDetailsPreview,
      });
      return;
    }
    if (
      (["air-conditioner", "bath-heater"].includes(detailDeviceProfile?.deviceType) &&
        ["climate", "fan"].includes(isEntityDetailsPreviewEntityDomain) &&
        !coveredDomainSet &&
        entityDetailsComponent.type !== "air-conditioner" &&
        (entityDetailsComponent = {
          ...entityDetailsComponent,
          type: "air-conditioner",
        }),
      entityDetailsComponent.type === "vacuum-control" ||
        (!coveredDomainSet && detailEntityIdText.startsWith("vacuum.")))
    ) {
      this.showVacuumDetails(entityDetailsComponent, {
        preview: isEntityDetailsPreview,
      });
      return;
    }
    const detailEntityState = this.states.get(detailEntityIdText),
      entityStateValue = detailEntityState?.newState || detailEntityState,
      entityAttributes = entityStateValue?.attributes || {},
      isLineChart = entityDetailsComponent.type === "line-chart",
      isCoverEntity = !isLineChart && isEntityDetailsPreviewEntityDomain === "cover",
      coverKind2 = ["standard", "dream", "airer"].includes(
        entityDetailsComponent.properties?.coverKind,
      )
        ? entityDetailsComponent.properties.coverKind
        : "auto",
      isAirerEntity =
        isCoverEntity &&
        coverComponentIsAirer2(
          entityDetailsComponent,
          detailEntityIdText,
          entityStateValue,
          this.entityMetadata,
          this.deviceMetadata,
        ),
      supportedFeatures = Number(entityAttributes.supported_features || 0),
      deviceNameHaystack =
        detailEntityIdText +
        " " +
        (entityAttributes.friendly_name || "") +
        " " +
        (entityDetailsComponent.properties?.label || ""),
      finite8 =
        Number.isFinite(Number(entityAttributes.current_tilt_position)) ||
        !!(supportedFeatures & 240),
      test3 = /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(deviceNameHaystack),
      isEntityDetailsPreviewIsDreamCover =
        isCoverEntity &&
        !isAirerEntity &&
        (coverKind2 === "dream" || (coverKind2 === "auto" && (finite8 || test3))),
      hasTiltPosition = isEntityDetailsPreviewIsDreamCover && finite8,
      airerLightEntityId =
        (isAirerEntity ? relatedAirerLightEntity2(this.entityMetadata, detailEntityIdText) : null)
          ?.entityId || "",
      airerLightState = airerLightEntityId ? this.states.get(airerLightEntityId) : null;
    let airerLightStateValue = airerLightState?.newState || airerLightState || null;
    const positionCommandEntityId =
        (isAirerEntity
          ? relatedAirerPositionNumberEntity2(this.entityMetadata, detailEntityIdText)
          : null
        )?.entityId || "",
      positionCommandState = this.states.get(positionCommandEntityId),
      positionCommandStateValue = positionCommandState?.newState || positionCommandState || null,
      positionEntityId =
        (isAirerEntity
          ? relatedAirerCurrentPositionSensor2(this.entityMetadata, detailEntityIdText)
          : null
        )?.entityId || "",
      motorEntityId =
        (isAirerEntity
          ? relatedAirerMotorSpeedSensor2(this.entityMetadata, detailEntityIdText)
          : null
        )?.entityId || "",
      motorState = this.states.get(motorEntityId),
      motorStateValue = motorState?.newState || motorState || null,
      motorActionEntities = isAirerEntity
        ? relatedAirerMotorActionEntities2(this.entityMetadata, detailEntityIdText)
        : {},
      motorActionEntityIds = Object.fromEntries(
        Object.entries(motorActionEntities).map(([motorActionKey, motorActionEntityValue]) => [
          motorActionKey,
          motorActionEntityValue?.entityId || "",
        ]),
      ),
      positionState = this.states.get(positionEntityId || positionCommandEntityId),
      positionStateValue = positionState?.newState || positionState || null,
      isOpenDirection =
        isCoverEntity &&
        coverMotorIsReversedForComponent2(
          entityDetailsComponent,
          this.entityMetadata,
          this.states,
          detailEntityIdText,
        ),
      openServiceName = isOpenDirection ? "open_cover" : "close_cover",
      closeServiceName = isOpenDirection ? "close_cover" : "open_cover",
      coverDirection2 = ["left", "right"].includes(
        entityDetailsComponent.properties?.coverDirection,
      )
        ? entityDetailsComponent.properties.coverDirection
        : "split",
      isButtonEntity = !isLineChart && isEntityDetailsPreviewEntityDomain === "button",
      isSwitchEntity =
        !isLineChart &&
        (isButtonEntity ||
          ["switch", "input_boolean"].includes(isEntityDetailsPreviewEntityDomain)),
      isLightEntity =
        entityDetailsComponent.type === "icon-button" &&
        isEntityDetailsPreviewEntityDomain === "light",
      isClimateEntity =
        !isLineChart &&
        (entityDetailsComponent.type === "air-conditioner" ||
          entityDetailsComponent.type === "water-heater" ||
          ["climate", "water_heater"].includes(isEntityDetailsPreviewEntityDomain)),
      climateDeviceType = isClimateEntity
        ? isEntityDetailsPreviewEntityDomain === "water_heater" ||
          entityDetailsComponent.type === "water-heater"
          ? "water-heater"
          : resolveClimateDeviceType2(entityDetailsComponent, entityStateValue, detailEntityIdText)
        : "air-conditioner",
      climateDeviceLabel = climateDeviceLabel2(climateDeviceType),
      replace = componentDialogTitle(
        entityDetailsComponent,
        String(entityAttributes.friendly_name || "").trim() || climateDeviceLabel,
      ).replace(/(浴霸)(?:\s+浴霸)+$/i, "$1"),
      componentDialogTitle2 = componentDialogTitle(
        entityDetailsComponent,
        String(entityAttributes.friendly_name || "").trim() || (isButtonEntity ? "按钮" : "开关"),
      ),
      isToggleable = isLightEntity || isClimateEntity || isSwitchEntity;
    this.closeRuntimeDialog();
    const resolveEntityStateLabel = (stateValueText, stateAttributes = entityAttributes) =>
        isButtonEntity
          ? false
          : isLightEntity || isSwitchEntity
            ? stateValueText === "on"
            : climateIsPoweredOn2(
                {
                  state: stateValueText,
                  attributes: stateAttributes,
                },
                climateDeviceType,
              ),
      entityDetailsDialog = document.createElement("dialog");
    ((entityDetailsDialog.className = "hb-entity-details-dialog"),
      (entityDetailsDialog.tabIndex = -1),
      entityDetailsDialog.classList.toggle("line-chart-details", isLineChart),
      entityDetailsDialog.classList.toggle("light-details", isLightEntity),
      entityDetailsDialog.classList.toggle("cover-details", isCoverEntity),
      entityDetailsDialog.classList.toggle(
        "dream-cover-details",
        isEntityDetailsPreviewIsDreamCover,
      ),
      entityDetailsDialog.classList.toggle("airer-cover-details", isAirerEntity),
      entityDetailsDialog.classList.toggle("climate-details", isClimateEntity),
      entityDetailsDialog.classList.toggle(
        "bath-heater-details",
        climateDeviceType === "bath-heater",
      ),
      entityDetailsDialog.classList.toggle(
        "water-heater-details",
        climateDeviceType === "water-heater",
      ),
      entityDetailsDialog.classList.toggle("switch-details", isSwitchEntity),
      entityDetailsDialog.classList.toggle("momentary-button-details", isButtonEntity));
    const entityDetailsCard = document.createElement("div");
    entityDetailsCard.className = "hb-entity-details-card";
    const entityDetailsHeading = document.createElement("div");
    entityDetailsHeading.className = "hb-entity-details-heading";
    const entityDetailsHeadingRow = document.createElement("div"),
      entityDetailsTitle = document.createElement("strong");
    ((entityDetailsTitle.textContent = isLightEntity
      ? componentDialogTitle(entityDetailsComponent, "灯光")
      : isCoverEntity
        ? componentDialogTitle(entityDetailsComponent, isAirerEntity ? "晾衣机" : "窗帘")
        : isClimateEntity
          ? replace
          : isSwitchEntity
            ? componentDialogTitle2
            : componentDialogTitle(entityDetailsComponent, "设备详情")),
      entityDetailsHeadingRow.append(entityDetailsTitle));
    let entityStateLabelElement = null,
      coverStateLabelElement = null,
      isEntityDetailsPreviewEntityStateText = String(entityStateValue?.state || ""),
      climateStateLabelElement = null,
      buttonStateLabelElement = null,
      lineChartStateLabelElement = null;
    if (isLightEntity) {
      const switchStateLabel = document.createElement("span");
      ((switchStateLabel.textContent = entityStateValue?.state === "on" ? "已开启" : "已关闭"),
        switchStateLabel.classList.toggle("is-on", entityStateValue?.state === "on"),
        (entityStateLabelElement = switchStateLabel),
        entityDetailsHeadingRow.append(switchStateLabel));
    } else {
      if (isCoverEntity) {
        const coverStateLabel = document.createElement("span"),
          physicalCoverState = physicalCoverState2(entityStateValue?.state, isOpenDirection),
          coverPositionPercent = Number(
            entityAttributes[hasTiltPosition ? "current_tilt_position" : "current_position"],
          ),
          coverStateLabels = {
            open: "已打开",
            closed: "已关闭",
            opening: "正在打开",
            closing: "正在关闭",
          };
        ((coverStateLabel.textContent = isAirerEntity
          ? entityStateText(physicalCoverState) || physicalCoverState || "状态未知"
          : isEntityDetailsPreviewIsDreamCover
            ? dreamCurtainStatusText2(
                entityStateValue?.state,
                coverPositionPercent,
                isOpenDirection,
              )
            : coverStateLabels[physicalCoverState] || physicalCoverState || "状态未知"),
          coverStateLabel.classList.toggle(
            "is-on",
            physicalCoverState === "open" || physicalCoverState === "opening",
          ),
          (coverStateLabelElement = coverStateLabel),
          entityDetailsHeadingRow.append(coverStateLabel));
      } else {
        if (isClimateEntity || isSwitchEntity) {
          const toggleStateLabel = document.createElement("span"),
            toggleStateValue = resolveEntityStateLabel(entityStateValue?.state);
          ((toggleStateLabel.textContent = isButtonEntity
            ? ["unknown", "unavailable"].includes(entityStateValue?.state)
              ? "当前不可用"
              : "按下执行"
            : climateDeviceType === "water-heater"
              ? waterHeaterStatusLabel2(entityStateValue)
              : ["unknown", "unavailable"].includes(entityStateValue?.state)
                ? "当前不可用"
                : toggleStateValue
                  ? "已开启"
                  : "已关闭"),
            toggleStateLabel.classList.toggle("is-on", toggleStateValue),
            isClimateEntity
              ? (climateStateLabelElement = toggleStateLabel)
              : (buttonStateLabelElement = toggleStateLabel),
            entityDetailsHeadingRow.append(toggleStateLabel));
        } else {
          if (entityDetailsComponent.type === "line-chart") {
            const lineChartStateLabel = document.createElement("span");
            ((lineChartStateLabel.textContent =
              entityStateValue?.state == null ||
              ["unknown", "unavailable"].includes(entityStateValue.state)
                ? "暂无数据"
                : "实时数据"),
              (lineChartStateLabelElement = lineChartStateLabel),
              entityDetailsHeadingRow.append(lineChartStateLabel));
          }
        }
      }
    }
    const entityDetailsCloseButton = document.createElement("button");
    ((entityDetailsCloseButton.type = "button"),
      entityDetailsCloseButton.setAttribute("aria-label", "关闭实体详情"),
      (entityDetailsCloseButton.textContent = "×"),
      entityDetailsHeading.append(entityDetailsHeadingRow, entityDetailsCloseButton));
    let currentEntityState = entityStateValue,
      coverVisualControllerElement: ComponentControllerElement | null = null,
      stateController = null,
      lightVisualButton = null,
      lightVisualSync = null,
      coverVisualButton = null,
      coverVisualSync = null,
      airerLightSync = null,
      curtainPosition = 0;
    const airerPositionCalibration = airerPositionCalibration2(
      this.entityMetadata,
      this.deviceMetadata,
      detailEntityIdText,
    );
    let isEntityPending = false,
      climateVisualButton = null,
      climateVisualSync = null,
      switchVisualButton = null,
      toggleController = null,
      isEntityDetailsPreviewToggleHandler = null,
      isTogglePending = false,
      toggleResetTimerId = null,
      toggleStatusText = "idle",
      bathHeaterLightEntityId = "",
      bathLightControl = null,
      waterHeaterExtensionControl = null,
      registeredEntityIdSet = new Set();
    const selectedRelatedIds = selectedRelatedEntityIds2(entityDetailsComponent);
    if (isLightEntity) {
      ((lightVisualButton = document.createElement("button")),
        (lightVisualButton.type = "button"),
        (lightVisualButton.className = "hb-light-visual"),
        (lightVisualButton.inert = isEntityDetailsPreview),
        lightVisualButton.setAttribute("aria-disabled", String(isEntityDetailsPreview)));
      const lightAuraElement = document.createElement("div");
      lightAuraElement.className = "hb-light-visual-aura";
      const lightLampElement = document.createElement("div");
      lightLampElement.className = "hb-light-visual-lamp";
      for (const lampPartName of ["cord", "shade", "bulb", "filament"]) {
        const lampPartElement = document.createElement("i");
        ((lampPartElement.className = "hb-light-visual-" + lampPartName),
          lampPartElement.setAttribute("aria-hidden", "true"),
          lightLampElement.append(lampPartElement));
      }
      const lightVisualStatusLabel = document.createElement("span");
      ((lightVisualStatusLabel.className = "hb-light-visual-status"),
        lightVisualButton.append(lightAuraElement, lightLampElement, lightVisualStatusLabel));
      const warmColorStop =
          Number(entityAttributes.min_color_temp_kelvin) ||
          (Number.isFinite(Number(entityAttributes.max_mireds))
            ? 1000000 / Number(entityAttributes.max_mireds)
            : 2000),
        coolColorStop =
          Number(entityAttributes.max_color_temp_kelvin) ||
          (Number.isFinite(Number(entityAttributes.min_mireds))
            ? 1000000 / Number(entityAttributes.min_mireds)
            : 6500),
        NaN7 =
          Number(entityAttributes.color_temp_kelvin) ||
          (Number.isFinite(Number(entityAttributes.color_temp))
            ? 1000000 / Number(entityAttributes.color_temp)
            : NaN),
        colorTemperatureKelvin = Number.isFinite(NaN7) ? NaN7 : (warmColorStop + coolColorStop) / 2,
        supportsColor = lightSupportsColor2(entityAttributes),
        lightVisualOptions = {
          isOn: entityStateValue?.state === "on",
          brightnessPercent: Number.isFinite(Number(entityAttributes.brightness))
            ? (Number(entityAttributes.brightness) / 255) * 100
            : 100,
          colorTemperatureKelvin: colorTemperatureKelvin,
          colorRgb: supportsColor ? lightColorRgb2(entityAttributes) : null,
        },
        applyLightVisual = () => {
          const brightnessPercent = Math.max(
              1,
              Math.min(100, Number(lightVisualOptions.brightnessPercent) || 1),
            ),
            clampedKelvin = Math.max(
              2000,
              Math.min(6500, Number(lightVisualOptions.colorTemperatureKelvin) || 3000),
            ),
            kelvinRatio = (clampedKelvin - 2000) / 4500,
            warmColorRgb = [255, 132, 42],
            coolColorRgb = [172, 225, 255],
            lightVisualColorCss =
              "rgb(" +
              (
                lightVisualOptions.colorRgb ||
                warmColorRgb.map((warmChannel, channelIndex) =>
                  Math.round(
                    warmChannel + (coolColorRgb[channelIndex] - warmChannel) * kelvinRatio,
                  ),
                )
              ).join(",") +
              ")";
          (lightVisualButton.classList.toggle("is-on", lightVisualOptions.isOn),
            lightVisualButton.style.setProperty("--hb-light-visual-color", lightVisualColorCss),
            lightVisualButton.style.setProperty(
              "--hb-light-visual-opacity",
              lightVisualOptions.isOn ? String(0.08 + (brightnessPercent / 100) * 0.92) : "0",
            ),
            lightVisualButton.style.setProperty(
              "--hb-light-visual-blur",
              Math.round(15 + brightnessPercent * 1.14) + "px",
            ),
            lightVisualButton.style.setProperty(
              "--hb-light-visual-scale",
              String(0.62 + (brightnessPercent / 100) * 1.05),
            ),
            (lightVisualStatusLabel.textContent = lightVisualOptions.isOn
              ? Math.round(brightnessPercent) + "%  ·  " + Math.round(clampedKelvin) + "K"
              : "灯光已关闭"),
            lightVisualButton.setAttribute("aria-label", lightVisualStatusLabel.textContent));
        };
      ((lightVisualSync = (updateLightState: ComponentPayload = {}) => {
        const lightAttributes = updateLightState.attributes || {};
        (typeof updateLightState.isOn == "boolean"
          ? (lightVisualOptions.isOn = updateLightState.isOn)
          : typeof updateLightState.state == "string" &&
            (lightVisualOptions.isOn = updateLightState.state === "on"),
          Number.isFinite(Number(updateLightState.brightnessPercent))
            ? (lightVisualOptions.brightnessPercent = Number(updateLightState.brightnessPercent))
            : Number.isFinite(Number(lightAttributes.brightness)) &&
              (lightVisualOptions.brightnessPercent =
                (Number(lightAttributes.brightness) / 255) * 100),
          Number.isFinite(Number(updateLightState.colorTemperatureKelvin))
            ? (lightVisualOptions.colorTemperatureKelvin = Number(
                updateLightState.colorTemperatureKelvin,
              ))
            : Number.isFinite(Number(lightAttributes.color_temp_kelvin))
              ? (lightVisualOptions.colorTemperatureKelvin = Number(
                  lightAttributes.color_temp_kelvin,
                ))
              : Number.isFinite(Number(lightAttributes.color_temp)) &&
                (lightVisualOptions.colorTemperatureKelvin =
                  1000000 / Number(lightAttributes.color_temp)),
          Object.hasOwn(updateLightState, "colorRgb")
            ? (lightVisualOptions.colorRgb = updateLightState.colorRgb)
            : updateLightState.attributes &&
              supportsColor &&
              (lightVisualOptions.colorRgb = lightColorRgb2(lightAttributes)),
          applyLightVisual());
      }),
        applyLightVisual());
    }
    if (isCoverEntity) {
      ((coverVisualButton = document.createElement("button")),
        (coverVisualButton.type = "button"),
        (coverVisualButton.className = "hb-cover-visual"),
        (coverVisualButton.inert = isEntityDetailsPreview),
        coverVisualButton.setAttribute("aria-disabled", String(isEntityDetailsPreview)));
      const coverRailElement = document.createElement("i");
      coverRailElement.className = "hb-cover-visual-rail";
      const coverPanelLeftElement = document.createElement("i");
      coverPanelLeftElement.className = "hb-cover-visual-panel left";
      const coverPanelRightElement = document.createElement("i");
      coverPanelRightElement.className = "hb-cover-visual-panel right";
      const coverSlatsElement = document.createElement("span");
      coverSlatsElement.className = "hb-cover-visual-slats";
      const coverSlatCount = 13;
      for (let coverSlatIndex = 0; coverSlatIndex < coverSlatCount; coverSlatIndex += 1) {
        const coverSlatElement = document.createElement("span");
        coverSlatElement.className = "hb-cover-visual-slat";
        const coverSlatDetailElement = document.createElement("i");
        coverSlatElement.style.setProperty("--hb-cover-slat-index", String(coverSlatIndex));
        const abs4 =
          coverDirection2 === "right"
            ? coverSlatCount - 1 - coverSlatIndex
            : coverDirection2 === "split"
              ? Math.abs((coverSlatCount - 1) / 2 - coverSlatIndex)
              : coverSlatIndex;
        coverSlatElement.style.setProperty("--hb-cover-slat-delay-index", String(abs4));
        const coverSlatShift =
          coverDirection2 === "left"
            ? -coverSlatIndex * 14.5
            : coverDirection2 === "right"
              ? (coverSlatCount - 1 - coverSlatIndex) * 14.5
              : coverSlatIndex <= (coverSlatCount - 1) / 2
                ? -coverSlatIndex * 14.5
                : (coverSlatCount - 1 - coverSlatIndex) * 14.5;
        (coverSlatElement.style.setProperty("--hb-cover-retracted-shift", coverSlatShift + "px"),
          coverSlatElement.append(coverSlatDetailElement),
          coverSlatsElement.append(coverSlatElement));
      }
      const coverWindowElement = document.createElement("i");
      ((coverWindowElement.className = "hb-cover-visual-window"),
        coverVisualButton.classList.toggle("is-dream", isEntityDetailsPreviewIsDreamCover),
        coverVisualButton.classList.toggle("is-airer", isAirerEntity),
        coverVisualButton.classList.add("direction-" + coverDirection2),
        coverVisualButton.append(
          coverWindowElement,
          coverRailElement,
          coverPanelLeftElement,
          coverPanelRightElement,
          coverSlatsElement,
        ),
        isAirerEntity && createAirerVisual(coverVisualButton),
        (airerLightSync = (nextLightState = airerLightStateValue) => {
          if (!isAirerEntity) return;
          airerLightStateValue = nextLightState || airerLightStateValue;
          const isAirerLightUnavailable =
              !airerLightEntityId ||
              ["unknown", "unavailable"].includes(String(airerLightStateValue?.state || "unknown")),
            isAirerLightOn = airerLightStateValue?.state === "on";
          (coverVisualButton.classList.toggle(
            "is-light-on",
            isAirerLightOn && !isAirerLightUnavailable,
          ),
            coverVisualButton.classList.toggle("is-light-unavailable", isAirerLightUnavailable),
            (coverVisualButton.disabled = isEntityDetailsPreview || isAirerLightUnavailable),
            coverVisualButton.setAttribute(
              "aria-pressed",
              String(isAirerLightOn && !isAirerLightUnavailable),
            ),
            coverVisualButton.setAttribute(
              "aria-label",
              isAirerLightUnavailable
                ? "晾衣机灯光实体不可用"
                : "晾衣机灯光" + (isAirerLightOn ? "已开启，点击关闭" : "已关闭，点击开启"),
            ));
        }),
        airerLightSync(),
        (coverVisualSync = ({ position: coverPosition = 0, state: coverState = "" } = {}) => {
          const clampedCoverPosition = Math.max(0, Math.min(100, Number(coverPosition) || 0)),
            coverPresentationState = coverPresentationState2(
              {
                state: coverState,
                attributes: {
                  current_position: clampedCoverPosition,
                },
              },
              isOpenDirection,
            ),
            physicalCoverStateValue = physicalCoverState2(
              coverState || isEntityDetailsPreviewEntityStateText,
              isOpenDirection,
            ),
            isEntityDetailsPreviewIsCoverOpen =
              physicalCoverStateValue === "open" || physicalCoverStateValue === "opening";
          ((curtainPosition = clampedCoverPosition),
            coverVisualButton.style.setProperty(
              "--hb-cover-open-position",
              clampedCoverPosition + "%",
            ),
            coverVisualButton.style.setProperty(
              "--hb-airer-drop",
              airerVisualDrop2(clampedCoverPosition) + "px",
            ),
            coverVisualButton.style.setProperty(
              "--hb-cover-panel-width",
              45.9 - clampedCoverPosition * 0.331 + "%",
            ),
            coverVisualButton.style.setProperty(
              "--hb-cover-single-panel-width",
              91.8 - clampedCoverPosition * 0.79 + "%",
            ),
            coverVisualButton.style.setProperty(
              "--hb-cover-slat-angle",
              clampedCoverPosition * 1.8 + "deg",
            ),
            coverVisualButton.classList.toggle("is-tilt-reversed", clampedCoverPosition > 50),
            coverVisualButton.classList.toggle(
              "is-tilt-center",
              Math.abs(clampedCoverPosition - 50) <= 2,
            ),
            coverVisualButton.classList.toggle(
              "is-open",
              isEntityDetailsPreviewIsDreamCover
                ? isEntityDetailsPreviewIsCoverOpen
                : coverPresentationState === "open" || coverPresentationState === "opening",
            ),
            coverVisualButton.classList.toggle(
              "is-moving",
              coverState === "opening" || coverState === "closing",
            ),
            coverVisualButton.setAttribute(
              "aria-pressed",
              String(
                isEntityDetailsPreviewIsDreamCover
                  ? isEntityDetailsPreviewIsCoverOpen
                  : coverPresentationState === "open" || coverPresentationState === "opening",
              ),
            ),
            isAirerEntity ||
              coverVisualButton.setAttribute(
                "aria-label",
                isEntityDetailsPreviewIsDreamCover
                  ? "" +
                      componentDialogTitle(entityDetailsComponent, "梦幻帘") +
                      dreamCurtainStatusText2(
                        coverState || isEntityDetailsPreviewEntityStateText,
                        clampedCoverPosition,
                        isOpenDirection,
                      )
                  : "" +
                      componentDialogTitle(entityDetailsComponent, "窗帘") +
                      (coverPresentationState === "open" || coverPresentationState === "opening"
                        ? "已打开，点击关闭"
                        : "已关闭，点击打开"),
              ));
        }),
        coverVisualSync({
          position: Number.isFinite(
            Number(
              entityAttributes[hasTiltPosition ? "current_tilt_position" : "current_position"],
            ),
          )
            ? Number(
                entityAttributes[hasTiltPosition ? "current_tilt_position" : "current_position"],
              )
            : entityStateValue?.state === "open"
              ? 100
              : 0,
          state: entityStateValue?.state,
        }),
        coverVisualButton.addEventListener("click", async () => {
          if (isEntityDetailsPreview || isEntityPending) return;
          if (
            ((isEntityPending = true),
            coverVisualButton.setAttribute("aria-busy", "true"),
            isAirerEntity)
          ) {
            const finalAirerState = airerLightStateValue;
            airerLightSync({
              ...(airerLightStateValue || {}),
              state: airerLightStateValue?.state === "on" ? "off" : "on",
            });
            try {
              await this.callEntityService("homeassistant", "toggle", airerLightEntityId);
            } catch (coverUpdateError) {
              (airerLightSync(finalAirerState), this.options.onError?.(coverUpdateError));
            } finally {
              ((isEntityPending = false), coverVisualButton.removeAttribute("aria-busy"));
            }
            return;
          }
          const currentCoverPosition = curtainPosition,
            isCurtainRetracted =
              coverVisualControllerElement?.isDreamCurtainRetracted?.() ??
              coverVisualButton.dataset.curtainRetracted === "true",
            isCoverPositionOpen = currentCoverPosition > COVER_CLOSED_POSITION_EPSILON;
          (isEntityDetailsPreviewIsDreamCover &&
            coverVisualControllerElement?.beginDreamCurtainMotion?.(!isCurtainRetracted),
            isEntityDetailsPreviewIsDreamCover ||
              coverVisualControllerElement?.beginCoverMotion?.(
                isCoverPositionOpen ? 0 : 100,
                isCoverPositionOpen ? "closing" : "opening",
              ));
          try {
            await this.callEntityService(
              "cover",
              isEntityDetailsPreviewIsDreamCover
                ? dreamCurtainToggleService2(isCurtainRetracted, closeServiceName, openServiceName)
                : isCoverPositionOpen
                  ? openServiceName
                  : closeServiceName,
              detailEntityIdText,
            );
          } catch (coverCommandError) {
            (isEntityDetailsPreviewIsDreamCover
              ? (coverVisualControllerElement?.cancelDreamCurtainMotion?.(),
                coverVisualControllerElement?.setDreamCurtainRetracted?.(isCurtainRetracted, false))
              : coverVisualControllerElement?.cancelCoverMotion?.(),
              coverVisualControllerElement?.syncCoverState?.(entityStateValue),
              coverVisualSync({
                position: currentCoverPosition,
                state: entityStateValue?.state,
              }),
              this.options.onError?.(coverCommandError));
          } finally {
            ((isEntityPending = false), coverVisualButton.removeAttribute("aria-busy"));
          }
        }));
    }
    if (isClimateEntity) {
      const climateModeLabels = {
        entityId: detailEntityIdText,
        entityMetadata: this.entityMetadata,
        entityTranslations: this.entityTranslations,
      };
      ((climateVisualButton = document.createElement("button")),
        (climateVisualButton.type = "button"),
        (climateVisualButton.className = "hb-climate-visual"),
        climateVisualButton.classList.toggle("is-bath-heater", climateDeviceType === "bath-heater"),
        climateVisualButton.classList.toggle(
          "is-water-heater",
          climateDeviceType === "water-heater",
        ),
        (climateVisualButton.inert = isEntityDetailsPreview),
        climateVisualButton.setAttribute("aria-disabled", String(isEntityDetailsPreview)));
      const climateVisualUnitElement = document.createElement("div");
      climateVisualUnitElement.className = "hb-climate-visual-unit";
      const climateVisualBrandLabel = document.createElement("span");
      ((climateVisualBrandLabel.className = "hb-climate-visual-brand"),
        (climateVisualBrandLabel.textContent =
          climateDeviceType === "bath-heater"
            ? "BATH HEATER"
            : climateDeviceType === "water-heater"
              ? "SMART WATER"
              : "SMART AIR"));
      const climateVisualDisplayLabel = document.createElement("strong");
      climateVisualDisplayLabel.className = "hb-climate-visual-display";
      const climateVisualVentElement = document.createElement("div");
      climateVisualVentElement.className = "hb-climate-visual-vent";
      for (let ventIndex = 0; ventIndex < 5; ventIndex += 1)
        climateVisualVentElement.append(document.createElement("i"));
      climateVisualUnitElement.append(
        climateVisualBrandLabel,
        climateVisualDisplayLabel,
        climateVisualVentElement,
      );
      const climateVisualAirflowElement = document.createElement("div");
      climateVisualAirflowElement.className = "hb-climate-visual-airflow";
      for (let airflowIndex = 0; airflowIndex < 3; airflowIndex += 1)
        climateVisualAirflowElement.append(document.createElement("i"));
      (climateVisualButton.append(climateVisualUnitElement, climateVisualAirflowElement),
        (climateVisualSync = ({
          mode: climateVisualMode = "off",
          visualMode: climateVisualModeKey = "off",
          running: isClimateVisualRunning = false,
          accentColor: climateAccentColor = "#65717a",
          targetTemperature: climateTargetTemperature,
        }: ClimateVisualSyncPayload = {}) => {
          const isClimateVisualOn = climateVisualModeKey !== "off";
          (climateVisualButton.classList.toggle("is-on", isClimateVisualOn),
            climateVisualButton.classList.toggle("is-running", isClimateVisualRunning),
            climateVisualButton.classList.toggle(
              "is-airflow-mode",
              climateDeviceType === "bath-heater" &&
                isClimateVisualOn &&
                bathHeaterModeUsesAirflow2(climateVisualMode),
            ),
            (climateVisualButton.dataset.visualMode = climateVisualModeKey),
            climateVisualButton.style.setProperty(
              "--hb-climate-visual-accent",
              climateAccentColor,
            ));
          const finite9 =
            climateTargetTemperature != null &&
            climateTargetTemperature !== "" &&
            Number.isFinite(Number(climateTargetTemperature));
          climateVisualDisplayLabel.textContent = isClimateVisualOn
            ? finite9
              ? Number(climateTargetTemperature) + "°"
              : climateModeLabel2(climateVisualMode, climateDeviceType, climateModeLabels)
            : "OFF";
        }));
    }
    if (isSwitchEntity) {
      const hn4 = createSwitchVisual({
        label: componentDialogTitle2,
        interactive: !isEntityDetailsPreview,
        momentary: isButtonEntity,
        onToggle: () => isEntityDetailsPreviewToggleHandler?.(),
      });
      ((switchVisualButton = hn4.visual),
        (toggleController = hn4.sync),
        toggleController(resolveEntityStateLabel(entityStateValue?.state), {
          unavailable: ["unknown", "unavailable"].includes(entityStateValue?.state),
        }));
    }
    const entityStateControl = document.createElement(
      isToggleable ? "button" : "div",
    ) as EntityStateControlElement;
    ((entityStateControl.className = "hb-entity-details-state"),
      isToggleable && (entityStateControl.type = "button"));
    const stateControlIcon = document.createElement("span");
    stateControlIcon.textContent = isToggleable ? "⏻" : "当前状态";
    const stateControlValueLabel = document.createElement("strong"),
      entityStateLabels = {
        off: "关闭",
        auto: "自动",
        cool: "制冷",
        dry: "除湿",
        heat: "制热",
        fan_only: "送风",
        heat_cool: "冷暖自动",
      };
    ((stateControlValueLabel.textContent = isToggleable
      ? entityStateValue?.state
        ? resolveEntityStateLabel(entityStateValue.state)
          ? "已开启"
          : "已关闭"
        : "状态未知"
      : isEntityDetailsPreviewEntityDomain === "climate"
        ? entityStateLabels[entityStateValue?.state] || entityStateValue?.state || "暂无状态"
        : (entityStateValue?.state ?? "暂无状态")),
      entityStateControl.classList.toggle("hb-light-details-power", isLightEntity),
      entityStateControl.classList.toggle("hb-climate-details-power", isClimateEntity),
      entityStateControl.classList.toggle("hb-switch-details-power", isSwitchEntity),
      entityStateControl.classList.toggle(
        "is-on",
        isToggleable && resolveEntityStateLabel(entityStateValue?.state),
      ),
      entityStateControl.append(stateControlIcon, stateControlValueLabel),
      isToggleable &&
        ((entityStateControl.inert = isEntityDetailsPreview),
        entityStateControl.setAttribute("aria-disabled", String(isEntityDetailsPreview)),
        (stateController = (
          isOnState,
          { unavailable: isStateUnavailable = false, syncClimate: shouldSyncClimate = true } = {},
        ) => {
          if (
            (entityStateControl.classList.toggle("is-on", isOnState),
            entityStateControl.classList.toggle("is-unavailable", isStateUnavailable),
            entityStateControl.setAttribute("aria-pressed", String(isOnState)),
            (entityStateControl.disabled = isStateUnavailable || isEntityDetailsPreview),
            (stateControlValueLabel.textContent = isStateUnavailable
              ? "当前不可用"
              : isButtonEntity
                ? toggleStatusText === "success"
                  ? "执行成功"
                  : isTogglePending
                    ? "执行中"
                    : "等待执行"
                : isOnState
                  ? "已开启"
                  : "已关闭"),
            entityStateControl.setAttribute(
              "aria-label",
              isStateUnavailable
                ? (isLightEntity
                    ? componentDialogTitle(entityDetailsComponent, "灯光")
                    : isClimateEntity
                      ? replace
                      : componentDialogTitle2) + "当前不可用"
                : isButtonEntity
                  ? "" +
                    componentDialogTitle2 +
                    (toggleStatusText === "success"
                      ? "执行成功"
                      : isTogglePending
                        ? "正在执行"
                        : "，点击执行")
                  : "" +
                    componentDialogTitle(
                      entityDetailsComponent,
                      isLightEntity ? "灯光" : isClimateEntity ? climateDeviceLabel : "开关",
                    ) +
                    (isOnState ? "已开启，点击关闭" : "已关闭，点击开启"),
            ),
            isLightEntity &&
              (lightVisualSync?.({
                isOn: isOnState,
              }),
              (entityStateLabelElement.textContent = isOnState ? "已开启" : "已关闭"),
              entityStateLabelElement.classList.toggle("is-on", isOnState),
              lightVisualButton.setAttribute("aria-pressed", String(isOnState)),
              lightVisualButton.setAttribute(
                "aria-label",
                "" +
                  componentDialogTitle(entityDetailsComponent, "灯光") +
                  (isOnState ? "已开启，点击关闭" : "已关闭，点击开启"),
              )),
            isClimateEntity && coverVisualControllerElement?.syncClimateState && shouldSyncClimate)
          ) {
            const climateCapabilities = normalizeClimateCapabilities2(
                currentEntityState || entityStateValue,
              ),
              fallbackClimateState =
                climateDeviceType === "water-heater"
                  ? climateCapabilities.operationModes.find(
                      (modeCandidate) =>
                        !["off", "空"].includes(String(modeCandidate).trim().toLowerCase()),
                    ) || "普通"
                  : climateCapabilities.hvacModes.find(
                      (hvacModeCandidateValue) => hvacModeCandidateValue !== "off",
                    ) || (climateDeviceType === "bath-heater" ? "heat" : "auto"),
              state3 =
                coverVisualControllerElement.dataset.lastClimateMode ||
                (entityStateValue?.state && entityStateValue.state !== "off"
                  ? entityStateValue.state
                  : fallbackClimateState);
            coverVisualControllerElement.syncClimateState({
              state: isOnState ? (climateDeviceType === "water-heater" ? "on" : state3) : "off",
              attributes: {
                ...(currentEntityState?.attributes || entityStateValue?.attributes || {}),
                operation_mode:
                  climateDeviceType === "water-heater"
                    ? isOnState
                      ? currentEntityState?.attributes?.operation_mode || fallbackClimateState
                      : "off"
                    : undefined,
                hvac_action:
                  climateDeviceType === "water-heater"
                    ? undefined
                    : isOnState
                      ? entityStateValue?.attributes?.hvac_action || state3
                      : "off",
              },
            });
          }
          (isClimateEntity &&
            ((climateStateLabelElement.textContent =
              climateDeviceType === "water-heater"
                ? waterHeaterStatusLabel2({
                    ...(currentEntityState || entityStateValue || {}),
                    state: isOnState ? "on" : "off",
                  })
                : isOnState
                  ? "已开启"
                  : "已关闭"),
            climateStateLabelElement.classList.toggle("is-on", isOnState),
            climateDeviceType === "bath-heater"
              ? (bathLightControl || climateVisualButton.setAttribute("aria-pressed", "false"),
                climateVisualButton.setAttribute("aria-label", replace + "，点击切换浴霸灯"))
              : (climateVisualButton.setAttribute("aria-pressed", String(isOnState)),
                climateVisualButton.setAttribute(
                  "aria-label",
                  "" + replace + (isOnState ? "已开启，点击关闭" : "已关闭，点击开启"),
                ))),
            isSwitchEntity &&
              (toggleController?.(isOnState, {
                pending: isTogglePending && toggleStatusText !== "success",
                success: toggleStatusText === "success",
                unavailable: isStateUnavailable,
              }),
              (buttonStateLabelElement.textContent = isStateUnavailable
                ? "当前不可用"
                : isButtonEntity
                  ? toggleStatusText === "success"
                    ? "执行成功"
                    : isTogglePending
                      ? "正在执行"
                      : "按下执行"
                  : isOnState
                    ? "已开启"
                    : "已关闭"),
              buttonStateLabelElement.classList.toggle(
                "is-on",
                (isButtonEntity ? isTogglePending || toggleStatusText === "success" : isOnState) &&
                  !isStateUnavailable,
              )));
        }),
        entityStateValue?.state &&
          stateController(resolveEntityStateLabel(entityStateValue.state), {
            unavailable: ["unknown", "unavailable"].includes(entityStateValue.state),
          }),
        (isEntityDetailsPreviewToggleHandler = async () => {
          if (isEntityDetailsPreview || isTogglePending || !currentEntityState?.state) return;
          isTogglePending = true;
          const activeVisualButton = isLightEntity
            ? lightVisualButton
            : isClimateEntity
              ? climateVisualButton
              : switchVisualButton;
          activeVisualButton?.setAttribute("aria-busy", "true");
          const contains2 = entityStateControl.classList.contains("is-on"),
            isToggleComplete = isButtonEntity || !contains2;
          stateController(isToggleComplete);
          try {
            if (isButtonEntity)
              (await this.callEntityService("button", "press", detailEntityIdText),
                (toggleStatusText = "success"),
                stateController(false),
                await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 900)));
            else {
              if (isClimateEntity) {
                if (!isToggleComplete && climateDeviceType === "bath-heater") {
                  const presetModeName = normalizeClimateCapabilities2(
                    currentEntityState,
                  ).presetModes.find((presetCandidate) =>
                    ["idle", "standby", "待机", "关闭"].includes(
                      String(presetCandidate).trim().toLowerCase(),
                    ),
                  );
                  presetModeName &&
                    (await this.callEntityService(
                      isEntityDetailsPreviewEntityDomain === "fan" ? "fan" : "climate",
                      "set_preset_mode",
                      detailEntityIdText,
                      {
                        preset_mode: presetModeName,
                      },
                    ));
                }
                const climatePowerCommand = climatePowerCommand2(
                  detailEntityIdText,
                  currentEntityState,
                  isToggleComplete,
                  climateDeviceType,
                  coverVisualControllerElement?.dataset.lastClimateMode || "",
                );
                await this.callEntityService(
                  climatePowerCommand.domain,
                  climatePowerCommand.service,
                  detailEntityIdText,
                  climatePowerCommand.data,
                );
              } else await this.callEntityService("homeassistant", "toggle", detailEntityIdText);
            }
          } catch (powerCommandError) {
            ((toggleStatusText = "idle"),
              stateController(contains2),
              this.options.onError?.(powerCommandError));
          } finally {
            ((isTogglePending = false),
              isButtonEntity
                ? ((toggleStatusText = "idle"), stateController(false))
                : isSwitchEntity &&
                  toggleController?.(entityStateControl.classList.contains("is-on")),
              activeVisualButton?.removeAttribute("aria-busy"));
          }
        }),
        entityStateControl.addEventListener("click", isEntityDetailsPreviewToggleHandler),
        isLightEntity &&
          lightVisualButton.addEventListener("click", isEntityDetailsPreviewToggleHandler),
        isClimateEntity &&
          climateVisualButton.addEventListener("click", () => {
            if (climateDeviceType === "bath-heater") {
              bathLightControl?.toggleBathLight
                ? bathLightControl.toggleBathLight()
                : this.options.onError?.(new Error("未找到与浴霸同设备的灯光实体。"));
              return;
            }
            isEntityDetailsPreviewToggleHandler();
          })));
    const createClimateControls = isClimateEntity
      ? (climateStateInput) =>
          this.createClimateDetailsControls(detailEntityIdText, climateStateInput, {
            interactive: !isEntityDetailsPreview,
            deviceType: climateDeviceType,
            onPowerChange: (powerState) =>
              stateController?.(powerState, {
                syncClimate: false,
              }),
            onVisualChange: ({
              mode: climateDetailMode,
              visualMode: climateDetailVisualMode,
              running: isClimateDetailRunning,
              accentColor: climateDetailAccent,
              accentSoft: climateDetailAccentSoft,
              targetTemperature: climateDetailTargetTemperature,
            }) => {
              (entityStateControl.classList.toggle("is-running", isClimateDetailRunning),
                entityStateControl.style.setProperty("--hb-climate-accent", climateDetailAccent),
                entityStateControl.style.setProperty(
                  "--hb-climate-accent-soft",
                  climateDetailAccentSoft,
                ),
                climateStateLabelElement.style.setProperty(
                  "--hb-climate-accent",
                  climateDetailAccent,
                ),
                climateDeviceType === "water-heater" &&
                  (climateStateLabelElement.textContent =
                    climateDetailVisualMode === "off"
                      ? "已关闭"
                      : isClimateDetailRunning
                        ? "正在加热"
                        : "保温中"),
                climateVisualSync?.({
                  mode: climateDetailMode,
                  visualMode: climateDetailVisualMode,
                  running: isClimateDetailRunning,
                  accentColor: climateDetailAccent,
                  targetTemperature: climateDetailTargetTemperature,
                }));
            },
            modeColors: {
              cool: entityDetailsComponent.properties?.airflowCoolColor || "#73c8ff",
              heat: entityDetailsComponent.properties?.airflowHeatColor || "#ff8a65",
              other: entityDetailsComponent.properties?.airflowOtherColor || "#dce2e6",
            },
          })
      : null;
    ((coverVisualControllerElement = isLightEntity
      ? this.createLightDetailsControls(detailEntityIdText, entityStateValue, {
          interactive: !isEntityDetailsPreview,
          onTurnOn: () => stateController?.(true),
          onVisualChange: (visualChangePayload) => lightVisualSync?.(visualChangePayload),
        })
      : isClimateEntity
        ? createClimateControls(entityStateValue)
        : isCoverEntity
          ? this.createCoverDetailsControls(detailEntityIdText, entityStateValue, {
              interactive: !isEntityDetailsPreview,
              dream: isEntityDetailsPreviewIsDreamCover,
              airer: isAirerEntity,
              tilt: hasTiltPosition,
              motorReversed: isOpenDirection,
              positionState: positionStateValue,
              positionCommandEntityId: positionCommandEntityId,
              positionCommandState: positionCommandStateValue,
              motorState: motorStateValue,
              airerActionEntityIds: motorActionEntityIds,
              positionCalibration: airerPositionCalibration,
              onVisualChange: ({ position: visualPosition, state: visualState }) => {
                (visualState && (isEntityDetailsPreviewEntityStateText = visualState),
                  coverVisualSync?.({
                    position: visualPosition,
                    state: visualState,
                  }));
                const coverVisualPresentationState = coverPresentationState2(
                    {
                      state: visualState,
                      attributes: {
                        current_position: visualPosition,
                      },
                    },
                    isOpenDirection,
                  ),
                  coverPositionLabels = {
                    open: "已打开",
                    closed: "已关闭",
                    opening: "正在打开",
                    closing: "正在关闭",
                  },
                  resolvedCoverState = physicalCoverState2(
                    isEntityDetailsPreviewEntityStateText,
                    isOpenDirection,
                  );
                ((coverStateLabelElement.textContent = isAirerEntity
                  ? entityStateText(coverVisualPresentationState) ||
                    Math.round(visualPosition) + "%"
                  : isEntityDetailsPreviewIsDreamCover
                    ? dreamCurtainStatusText2(
                        isEntityDetailsPreviewEntityStateText,
                        visualPosition,
                        isOpenDirection,
                      )
                    : coverPositionLabels[coverVisualPresentationState] ||
                      Math.round(visualPosition) + "%"),
                  coverStateLabelElement.classList.toggle(
                    "is-on",
                    isEntityDetailsPreviewIsDreamCover
                      ? resolvedCoverState === "open" || resolvedCoverState === "opening"
                      : coverVisualPresentationState === "open" ||
                          coverVisualPresentationState === "opening",
                  ));
              },
              onCurtainPositionChange: ({
                retracted: isCurtainRetractedValue,
                moving: isCurtainMoving,
              }) => {
                (coverVisualButton.classList.toggle(
                  "is-curtain-retracted",
                  isCurtainRetractedValue,
                ),
                  coverVisualButton.classList.toggle("is-curtain-moving", isCurtainMoving),
                  (coverVisualButton.dataset.curtainRetracted = String(isCurtainRetractedValue)),
                  isEntityDetailsPreviewIsDreamCover &&
                    ((coverStateLabelElement.textContent = dreamCurtainStatusFromRetraction2(
                      isCurtainRetractedValue,
                      isCurtainMoving,
                      curtainPosition,
                    )),
                    coverStateLabelElement.classList.toggle("is-on", isCurtainRetractedValue)));
              },
            })
          : null),
      isLightEntity &&
        coverVisualControllerElement?.classList.contains("has-color-picker") &&
        entityDetailsDialog.classList.add("color-picker-details"),
      isClimateEntity &&
        climateDeviceType === "water-heater" &&
        coverVisualControllerElement &&
        climateVisualButton &&
        (coverVisualControllerElement.prepend(climateVisualButton),
        coverVisualControllerElement.syncClimateGrid?.()));
    const profileLightEntityId =
      (isClimateEntity &&
        climateDeviceType === "bath-heater" &&
        detailDeviceProfile?.roles?.light) ||
      "";
    if (
      ((bathHeaterLightEntityId =
        (profileLightEntityId
          ? this.entityMetadata.get(profileLightEntityId)
          : isClimateEntity && climateDeviceType === "bath-heater"
            ? relatedDeviceDomainEntity2(this.entityMetadata, detailEntityIdText, "light")
            : null
        )?.entityId || ""),
      bathHeaterLightEntityId && coverVisualControllerElement)
    ) {
      const bathLightStateValue = this.states.get(bathHeaterLightEntityId),
        bathLightOptions = bathLightStateValue?.newState ||
          bathLightStateValue || {
            state: "unknown",
            attributes: {},
          };
      ((bathLightControl = this.createBathHeaterLightControl(
        bathHeaterLightEntityId,
        bathLightOptions,
        {
          interactive: !isEntityDetailsPreview,
          onStateChange: ({
            isOn: isBathLightOnValue,
            unavailable: isBathLightUnavailableValue,
          }) => {
            (climateVisualButton?.classList.toggle(
              "is-light-on",
              isBathLightOnValue && !isBathLightUnavailableValue,
            ),
              climateVisualButton?.setAttribute(
                "aria-pressed",
                String(isBathLightOnValue && !isBathLightUnavailableValue),
              ));
          },
        },
      )),
        coverVisualControllerElement.append(bathLightControl),
        coverVisualControllerElement.syncClimateGrid?.());
    }
    const refreshCatalogFn =
      isClimateEntity && (climateDeviceType === "water-heater" || selectedRelatedIds !== null)
        ? () => {
            const registeredEntityIds = registeredEntityIdSet,
              waterHeaterExtensionControls3 = this.createWaterHeaterExtensionControls(
                detailEntityIdText,
                {
                  component: entityDetailsComponent,
                  interactive: !isEntityDetailsPreview,
                  excludedEntityIds: bathHeaterLightEntityId ? [bathHeaterLightEntityId] : [],
                },
              );
            (waterHeaterExtensionControl?.remove(),
              (waterHeaterExtensionControl = waterHeaterExtensionControls3),
              (registeredEntityIdSet = new Set(
                waterHeaterExtensionControls3?.relatedEntityIds || [],
              )),
              coverVisualControllerElement?.classList.toggle(
                "has-multiline-water-heater-extensions",
                climateDeviceType === "water-heater" &&
                  Number(waterHeaterExtensionControls3?.dataset?.controlCount || 0) > 2,
              ),
              climateDeviceType !== "water-heater" &&
                entityDetailsCard.isConnected &&
                entityDetailsDialog.classList.toggle(
                  "has-related-extensions",
                  !!waterHeaterExtensionControls3,
                ),
              waterHeaterExtensionControls3 &&
                coverVisualControllerElement &&
                (climateDeviceType === "water-heater"
                  ? ((
                      coverVisualControllerElement.waterHeaterControlPanel ||
                      coverVisualControllerElement
                    ).append(waterHeaterExtensionControls3),
                    coverVisualControllerElement.syncClimateGrid?.())
                  : entityDetailsCard.isConnected &&
                    (entityDetailsCard.append(waterHeaterExtensionControls3),
                    entityDetailsDialog.classList.add("has-related-extensions"))));
            const stateHandlerMap = this.detailsStateSync?.handlers;
            if (stateHandlerMap) {
              for (const registeredHandlerEntity of registeredEntityIds)
                stateHandlerMap.delete(registeredHandlerEntity);
              for (const [
                extensionEntityId,
                extensionHandlers,
              ] of waterHeaterExtensionControls3?.stateHandlers || []) {
                stateHandlerMap.set(extensionEntityId, extensionHandlers);
                const extensionEntityState = this.states.get(extensionEntityId);
                if (extensionEntityState) {
                  for (const extensionHandler of extensionHandlers)
                    extensionHandler(extensionEntityState.newState || extensionEntityState);
                }
              }
            }
          }
        : null;
    refreshCatalogFn?.();
    let lineChartContainer: ComponentControllerElement | null =
        entityDetailsComponent.type === "line-chart"
          ? renderLineChartDetails2(entityDetailsComponent, {
              states: this.states,
              history: this.historySeries,
              renderNamespace: this.renderNamespace,
            })
          : null,
      lineChartCurrentVisualElement = null,
      lineChartCurrentValue = null,
      lineChartUnitLabel = null;
    const attributeList = document.createElement("dl");
    attributeList.className = "hb-entity-details-attributes";
    for (const [isEntityDetailsPreviewAttributeName, attributeValue] of Object.entries(
      entityAttributes,
    ).filter(([attributeKey]) => attributeKey !== "friendly_name")) {
      const attributeRow = document.createElement("div"),
        attributeTermElement = document.createElement("dt");
      attributeTermElement.textContent = isEntityDetailsPreviewAttributeName;
      const attributeDescriptionElement = document.createElement("dd");
      ((attributeDescriptionElement.textContent =
        typeof attributeValue == "string" ? attributeValue : JSON.stringify(attributeValue)),
        attributeRow.append(attributeTermElement, attributeDescriptionElement),
        attributeList.append(attributeRow));
    }
    if (lineChartContainer) {
      ((lineChartCurrentVisualElement = document.createElement("section")),
        (lineChartCurrentVisualElement.className = "hb-line-chart-current-visual"),
        lineChartCurrentVisualElement.style.setProperty(
          "--hb-chart-current-color",
          lineChartContainer.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
        ),
        (lineChartCurrentValue = document.createElement("strong")));
      const float2 = Number.parseFloat(entityStateValue?.state);
      ((lineChartCurrentValue.textContent = Number.isFinite(float2)
        ? formatLineChartValue2(float2, entityDetailsComponent.properties?.statePrecision)
        : entityStateValue?.state || "--"),
        (lineChartUnitLabel = document.createElement("small")),
        (lineChartUnitLabel.textContent = String(
          entityAttributes.unit_of_measurement || "实时数值",
        )),
        lineChartCurrentVisualElement.append(lineChartCurrentValue, lineChartUnitLabel),
        entityStateControl.style.setProperty(
          "--hb-chart-current-color",
          lineChartContainer.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
        ),
        (stateControlIcon.textContent = "●"),
        (stateControlValueLabel.textContent = "实时数据"),
        entityDetailsCard.append(
          entityDetailsHeading,
          lineChartCurrentVisualElement,
          lineChartContainer,
        ));
    } else {
      if (isClimateEntity)
        (entityDetailsCard.append(
          entityDetailsHeading,
          ...(climateDeviceType === "water-heater"
            ? [coverVisualControllerElement]
            : [climateVisualButton, coverVisualControllerElement]),
          ...(climateDeviceType !== "water-heater" && waterHeaterExtensionControl
            ? [waterHeaterExtensionControl]
            : []),
        ),
          entityDetailsDialog.classList.toggle(
            "has-related-extensions",
            climateDeviceType !== "water-heater" && !!waterHeaterExtensionControl,
          ));
      else {
        if (isLightEntity) {
          const lightDetailsLayout = document.createElement("div");
          lightDetailsLayout.className = "hb-light-details-layout";
          const lightDetailsPanel = document.createElement("section");
          ((lightDetailsPanel.className = "hb-light-details-panel"),
            lightDetailsPanel.append(
              ...(coverVisualControllerElement ? [coverVisualControllerElement] : []),
            ),
            lightDetailsLayout.append(lightDetailsPanel, lightVisualButton),
            entityDetailsCard.append(entityDetailsHeading, lightDetailsLayout));
        } else {
          if (isSwitchEntity) {
            const switchDetailsLayout = document.createElement("div");
            ((switchDetailsLayout.className = "hb-switch-details-layout"),
              switchDetailsLayout.append(switchVisualButton),
              entityDetailsCard.append(entityDetailsHeading, switchDetailsLayout));
          } else {
            if (isCoverEntity) {
              const coverDetailsLayout = document.createElement("div");
              coverDetailsLayout.className = "hb-cover-details-layout";
              const coverDetailsPanel = document.createElement("section");
              ((coverDetailsPanel.className = "hb-cover-details-panel"),
                coverDetailsPanel.append(
                  ...(coverVisualControllerElement ? [coverVisualControllerElement] : []),
                ),
                coverDetailsLayout.append(coverDetailsPanel, coverVisualButton),
                entityDetailsCard.append(entityDetailsHeading, coverDetailsLayout));
            } else {
              if (attributeList.childElementCount)
                entityDetailsCard.append(
                  entityDetailsHeading,
                  entityStateControl,
                  ...(coverVisualControllerElement ? [coverVisualControllerElement] : []),
                  attributeList,
                );
              else {
                const attributeEmptyHint = document.createElement("p");
                ((attributeEmptyHint.className = "hb-entity-details-empty"),
                  (attributeEmptyHint.textContent = "该实体暂无附加属性。"),
                  attributeList.replaceWith(attributeEmptyHint),
                  entityDetailsCard.append(
                    entityDetailsHeading,
                    entityStateControl,
                    ...(coverVisualControllerElement ? [coverVisualControllerElement] : []),
                    attributeEmptyHint,
                  ));
              }
            }
          }
        }
      }
    }
    entityDetailsDialog.append(entityDetailsCard);
    const entityDetailsOverlay = document.createElement("div");
    ((entityDetailsOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (entityDetailsOverlay.tabIndex = -1),
      entityDetailsOverlay.append(entityDetailsDialog),
      this.container.append(entityDetailsOverlay),
      (this.detailsDialog = entityDetailsDialog));
    const dialogScaleX = isClimateEntity
        ? 840
        : entityDetailsComponent.type === "line-chart"
          ? 780
          : isLightEntity || isCoverEntity
            ? 760
            : isSwitchEntity
              ? 620
              : 460,
      dialogScaleY = isClimateEntity
        ? climateDeviceType !== "water-heater" && waterHeaterExtensionControl
          ? 620
          : 540
        : isLightEntity || isCoverEntity
          ? 620
          : isSwitchEntity
            ? 500
            : 680;
    this.registerRuntimeDialogScale(
      entityDetailsOverlay,
      entityDetailsDialog,
      dialogScaleX,
      dialogScaleY,
    );
    let historyRefreshTimerId = 0;
    if (entityDetailsComponent.type === "line-chart" && lineChartContainer) {
      const refreshLineChart = () => {
          if (
            ((historyRefreshTimerId = 0),
            !lineChartContainer?.isConnected ||
              this.detailsStateSync?.dialog !== entityDetailsDialog)
          )
            return;
          const lineChartDetails = renderLineChartDetails2(entityDetailsComponent, {
            states: this.states,
            history: this.historySeries,
            renderNamespace: this.renderNamespace,
          });
          (lineChartContainer.cleanupLineChartHover?.(),
            lineChartContainer.replaceWith(lineChartDetails),
            (lineChartContainer = lineChartDetails),
            lineChartCurrentVisualElement.style.setProperty(
              "--hb-chart-current-color",
              lineChartContainer.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
            ));
        },
        scheduleHistoryRefresh = (refreshDelayMs = 700) => {
          historyRefreshTimerId ||
            (historyRefreshTimerId = window.setTimeout(
              refreshLineChart,
              Math.max(0, Number(refreshDelayMs) || 0),
            ));
        };
      this.detailsStateSync = {
        dialog: entityDetailsDialog,
        entityId: detailEntityIdText,
        refreshHistory: () => scheduleHistoryRefresh(0),
        apply: (chartState) => {
          const float3 = Number.parseFloat(chartState?.state);
          ((lineChartCurrentValue.textContent = Number.isFinite(float3)
            ? formatLineChartValue2(float3, entityDetailsComponent.properties?.statePrecision)
            : chartState?.state || "--"),
            (lineChartUnitLabel.textContent = String(
              chartState?.attributes?.unit_of_measurement || "实时数值",
            )),
            (lineChartStateLabelElement.textContent =
              chartState?.state == null || ["unknown", "unavailable"].includes(chartState.state)
                ? "暂无数据"
                : "实时数据"),
            lineChartContainer.syncLineChartState?.(chartState),
            lineChartCurrentVisualElement.style.setProperty(
              "--hb-chart-current-color",
              lineChartContainer.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
            ));
        },
      };
    } else {
      if (isToggleable && stateController) {
        const applyEntityState = (nextEntityState) => {
            if (
              ((currentEntityState = nextEntityState),
              isClimateEntity && createClimateControls && coverVisualControllerElement)
            ) {
              const climateStructureKey = climateControlStructureKey2(
                detailEntityIdText,
                nextEntityState,
                climateDeviceType,
              );
              if (
                coverVisualControllerElement.dataset.climateStructureKey !== climateStructureKey
              ) {
                const climateControlsElement = createClimateControls(nextEntityState);
                (climateControlsElement.classList.toggle(
                  "has-multiline-water-heater-extensions",
                  coverVisualControllerElement.classList.contains(
                    "has-multiline-water-heater-extensions",
                  ),
                ),
                  climateControlsElement.classList.add("is-runtime-hydrated"),
                  climateDeviceType === "water-heater" &&
                    climateVisualButton &&
                    climateControlsElement.prepend(climateVisualButton),
                  bathLightControl &&
                    (climateControlsElement.append(bathLightControl),
                    climateControlsElement.syncClimateGrid?.()),
                  waterHeaterExtensionControl &&
                    climateDeviceType === "water-heater" &&
                    ((
                      climateControlsElement.waterHeaterControlPanel || climateControlsElement
                    ).append(waterHeaterExtensionControl),
                    climateControlsElement.syncClimateGrid?.()),
                  coverVisualControllerElement.replaceWith(climateControlsElement),
                  (coverVisualControllerElement = climateControlsElement));
              }
            }
            (nextEntityState?.state &&
              stateController(
                resolveEntityStateLabel(nextEntityState.state, nextEntityState.attributes),
                {
                  unavailable: ["unknown", "unavailable"].includes(nextEntityState.state),
                },
              ),
              coverVisualControllerElement?.syncLightState?.(nextEntityState),
              coverVisualControllerElement?.syncClimateState?.(nextEntityState));
          },
          entityHandlersByEntityId = new Map([[detailEntityIdText, [applyEntityState]]]);
        if (
          (bathHeaterLightEntityId &&
            bathLightControl &&
            entityHandlersByEntityId.set(bathHeaterLightEntityId, [
              (bathLightStateArg) => bathLightControl.syncBathLightState?.(bathLightStateArg),
            ]),
          waterHeaterExtensionControl?.stateHandlers)
        ) {
          for (const [handlerEntityIdValue, handlerFn] of waterHeaterExtensionControl.stateHandlers)
            entityHandlersByEntityId.set(handlerEntityIdValue, handlerFn);
        }
        if (
          ((this.detailsStateSync = {
            dialog: entityDetailsDialog,
            handlers: entityHandlersByEntityId,
            refreshEntityCatalog: refreshCatalogFn,
          }),
          isClimateEntity &&
            coverVisualControllerElement?.querySelector(".hb-climate-details-loading"))
        ) {
          const requestStartedAt = Date.now();
          toggleResetTimerId = window.setInterval(() => {
            const latestEntityState = this.states.get(detailEntityIdText),
              currentEntityStateValue = latestEntityState?.newState || latestEntityState;
            (currentEntityStateValue && applyEntityState(currentEntityStateValue),
              (!coverVisualControllerElement?.querySelector(".hb-climate-details-loading") ||
                Date.now() - requestStartedAt >= 30000) &&
                (window.clearInterval(toggleResetTimerId), (toggleResetTimerId = null)));
          }, 120);
        }
      } else {
        if (isCoverEntity) {
          const coverHandlersByEntityId = new Map([
            [
              detailEntityIdText,
              [(coverStateArg) => coverVisualControllerElement?.syncCoverState?.(coverStateArg)],
            ],
          ]);
          (airerLightEntityId && coverHandlersByEntityId.set(airerLightEntityId, [airerLightSync]),
            positionEntityId &&
              coverHandlersByEntityId.set(positionEntityId, [
                (coverPositionArg) =>
                  coverVisualControllerElement?.syncCoverPositionState?.(coverPositionArg),
              ]),
            positionCommandEntityId &&
              coverHandlersByEntityId.set(positionCommandEntityId, [
                (coverPositionCommandState) => {
                  (coverVisualControllerElement?.syncCoverPositionCommandState?.(
                    coverPositionCommandState,
                  ),
                    positionEntityId ||
                      coverVisualControllerElement?.syncCoverPositionState?.(
                        coverPositionCommandState,
                      ));
                },
              ]),
            motorEntityId &&
              coverHandlersByEntityId.set(motorEntityId, [
                (motorStateArg) =>
                  coverVisualControllerElement?.syncAirerMotorState?.(motorStateArg),
              ]),
            (this.detailsStateSync = {
              dialog: entityDetailsDialog,
              handlers: coverHandlersByEntityId,
            }));
        }
      }
    }
    (entityDetailsCloseButton.addEventListener("click", () => entityDetailsDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(
        entityDetailsOverlay,
        entityDetailsDialog,
        entityDetailsCard,
      ),
      entityDetailsOverlay.addEventListener("keydown", (entityDetailsOverlayKeyEvent) => {
        entityDetailsOverlayKeyEvent.key === "Escape" && entityDetailsDialog.close();
      }),
      entityDetailsDialog.addEventListener(
        "close",
        () => {
          (window.clearTimeout(historyRefreshTimerId),
            window.clearInterval(toggleResetTimerId),
            (toggleResetTimerId = null),
            coverVisualControllerElement?.cleanupLightDetails?.(),
            coverVisualControllerElement?.cleanupClimateDetails?.(),
            coverVisualControllerElement?.cleanupCoverDetails?.(),
            lineChartContainer?.cleanupLineChartHover?.(),
            this.clearRuntimeDialogScale(entityDetailsDialog),
            this.detailsDialog === entityDetailsDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === entityDetailsDialog && (this.detailsStateSync = null),
            entityDetailsOverlay.remove());
        },
        {
          once: true,
        },
      ),
      entityDetailsDialog.show(),
      entityDetailsDialog.focus({
        preventScroll: true,
      }));
  }
  ["resize"]() {
    if (!this.viewport || !this.document) return;
    const clientWidth2 = this.container.clientWidth,
      clientHeight2 = this.container.clientHeight;
    if (!clientWidth2 || !clientHeight2) return;
    const canvasScaleX = clientWidth2 / this.document.canvas.width,
      canvasScaleY = clientHeight2 / this.document.canvas.height,
      scaleMode = this.options.scaleMode || this.document.canvas.scaleMode || "contain",
      fitScale =
        scaleMode === "cover"
          ? Math.max(canvasScaleX, canvasScaleY)
          : Math.min(canvasScaleX, canvasScaleY),
      appliedScaleXValue = scaleMode === "stretch" ? canvasScaleX : fitScale,
      appliedScaleYValue = scaleMode === "stretch" ? canvasScaleY : fitScale;
    ((this.appliedScaleX = appliedScaleXValue),
      (this.appliedScaleY = appliedScaleYValue),
      (this.canvas.style.transform =
        "scale(" + appliedScaleXValue + ", " + appliedScaleYValue + ")"),
      (this.viewport.style.width = this.document.canvas.width * appliedScaleXValue + "px"),
      (this.viewport.style.height = this.document.canvas.height * appliedScaleYValue + "px"),
      (this.container.dataset.viewportAspect = (clientWidth2 / clientHeight2).toFixed(3)),
      (this.container.dataset.renderScale = Math.min(
        appliedScaleXValue,
        appliedScaleYValue,
      ).toFixed(4)));
    for (const [componentHostKey, componentHost] of this.componentHosts)
      this.updateTransformHandleScale(componentHost, this.componentRecords.get(componentHostKey));
    (this.updateMultiSelectionHandleScale(
      this.canvas.querySelector(":scope > .hb-multi-selection-bounds"),
    ),
      this.updateRuntimeDialogScale());
  }
  ["pauseRuntimeFlowLines"]() {
    this.runtimeSnapshotReady = false;
    for (const [componentRecordKey, componentRecordEntry] of this.componentRecords || [])
      componentRecordEntry.type === "flow-line" &&
        componentRecordEntry.properties?.controlMode === "entity-sign" &&
        this.componentHosts
          ?.get(componentRecordKey)
          ?.querySelector(".hb-flow-line")
          ?.syncFlowLineState?.(undefined);
  }
  ["disconnectRuntime"]() {
    (this.pauseRuntimeFlowLines(),
      (this.socketGeneration += 1),
      window.clearTimeout(this.reconnectTimer),
      (this.reconnectTimer = null),
      window.clearTimeout(this.runtimeHydrationRetryTimer),
      (this.runtimeHydrationRetryTimer = null));
    const socket = this.socket;
    if (
      ((this.socket = null),
      (this.runtimeSubscription = null),
      !socket || socket.readyState >= WebSocket.CLOSING)
    )
      return;
    if (socket.readyState !== WebSocket.CONNECTING) {
      socket.close();
      return;
    }
    let socketReconnectTimerId;
    const handleSocketClose = () => {
        (window.clearTimeout(socketReconnectTimerId),
          socket.removeEventListener("open", handleSocketOpen),
          socket.removeEventListener("close", handleSocketClose));
      },
      handleSocketOpen = () => {
        (handleSocketClose(), socket.readyState < WebSocket.CLOSING && socket.close());
      };
    (socket.addEventListener("open", handleSocketOpen, {
      once: true,
    }),
      socket.addEventListener("close", handleSocketClose, {
        once: true,
      }),
      (socketReconnectTimerId = window.setTimeout(handleSocketOpen, 12000)));
  }
  ["connectRuntime"]({ force: isForcedConnect = false } = {}) {
    if (!this.document || this.destroyed) {
      this.disconnectRuntime();
      return;
    }
    const page = this.page || this.document.pages?.[0],
      sharedComponentsById = new Map(
        (this.document.sharedComponents || []).map((sharedComponent) => [
          sharedComponent.id,
          sharedComponent,
        ]),
      ),
      pageComponents = [
        ...(page?.sharedComponentIds || [])
          .map((isForcedConnectSharedComponentId) =>
            sharedComponentsById.get(isForcedConnectSharedComponentId),
          )
          .filter(Boolean),
        ...(page?.components || []),
      ],
      runtimeEntityIdSet = collectEntityIds2(pageComponents),
      activePopupEntry = this.activePopupId
        ? (this.document.customPopups || []).find(
            (popupModule) => String(popupModule.id || "") === this.activePopupId,
          )
        : null;
    for (const moduleRecord of activePopupEntry?.modules || [])
      moduleRecord.entityId &&
        !isVirtualEntityId2(moduleRecord.entityId) &&
        runtimeEntityIdSet.add(moduleRecord.entityId);
    for (const eventEntityId of [...runtimeEntityIdSet]) {
      if (this.entityMetadata.get(eventEntityId)?.domain !== "event") continue;
      const presenceComponentRecord = collectComponents2(
        pageComponents,
        (presenceComponentCandidate) =>
          presenceComponentCandidate.type === "presence-sensor" &&
          presenceComponentCandidate.bindings?.entity?.entityId === eventEntityId,
      )[0];
      if (!presenceComponentRecord) continue;
      const presenceMotionConfig = presenceMotionEventConfig2(
        eventEntityId,
        this.states.get(eventEntityId),
        this.entityMetadata,
        this.states,
        presenceComponentRecord.properties,
      );
      for (const motionCompanionEntityId of presenceMotionConfig.companionEntityIds)
        runtimeEntityIdSet.add(motionCompanionEntityId);
    }
    for (const candidateSensorEntityId of [...runtimeEntityIdSet]) {
      const sensorMetadata = this.entityMetadata.get(candidateSensorEntityId);
      if (
        sensorMetadata?.domain !== "sensor" ||
        !sensorMetadata.deviceId ||
        !["state", "status", "task_status"].includes(sensorMetadata.translationKey)
      )
        continue;
      const vacuumMetadata = [...this.entityMetadata.values()].find(
        (vacuumMetadataCandidate) =>
          vacuumMetadataCandidate.deviceId === sensorMetadata.deviceId &&
          vacuumMetadataCandidate.domain === "vacuum" &&
          entityMetadataIsAvailable2(vacuumMetadataCandidate),
      );
      vacuumMetadata?.entityId && runtimeEntityIdSet.add(vacuumMetadata.entityId);
    }
    for (const vacuumRuntimeEntityId of [...runtimeEntityIdSet]) {
      if (this.entityMetadata.get(vacuumRuntimeEntityId)?.domain !== "vacuum") continue;
      const slice7 = vacuumRuntimeEntityId.slice(vacuumRuntimeEntityId.indexOf(".") + 1),
        cleaningModeEntity = relatedDeviceEntity2(
          this.entityMetadata,
          vacuumRuntimeEntityId,
          "select",
          "cleaning_mode",
          "select." + slice7 + "_cleaning_mode",
        );
      cleaningModeEntity?.entityId && runtimeEntityIdSet.add(cleaningModeEntity.entityId);
      const batteryEntity = relatedVacuumBatteryEntity2(
        this.entityMetadata,
        this.states,
        vacuumRuntimeEntityId,
      );
      batteryEntity?.entityId && runtimeEntityIdSet.add(batteryEntity.entityId);
      for (const statusEntityRecord of relatedVacuumStatusEntities2(
        this.entityMetadata,
        vacuumRuntimeEntityId,
      ))
        runtimeEntityIdSet.add(statusEntityRecord.entityId);
    }
    for (const coverEntityId of [...runtimeEntityIdSet]) {
      if (
        (this.entityMetadata.get(coverEntityId)?.domain ||
          String(coverEntityId || "").split(".", 1)[0]) !== "cover"
      )
        continue;
      const motorReverseEntity = relatedCoverMotorReverseEntity2(
        this.entityMetadata,
        coverEntityId,
      );
      motorReverseEntity?.entityId && runtimeEntityIdSet.add(motorReverseEntity.entityId);
      const airerLightEntity = relatedAirerLightEntity2(this.entityMetadata, coverEntityId);
      airerLightEntity?.entityId && runtimeEntityIdSet.add(airerLightEntity.entityId);
      const airerPositionEntity = relatedAirerPositionNumberEntity2(
        this.entityMetadata,
        coverEntityId,
      );
      airerPositionEntity?.entityId && runtimeEntityIdSet.add(airerPositionEntity.entityId);
      const airerCurrentPositionEntity = relatedAirerCurrentPositionSensor2(
        this.entityMetadata,
        coverEntityId,
      );
      airerCurrentPositionEntity?.entityId &&
        runtimeEntityIdSet.add(airerCurrentPositionEntity.entityId);
      const airerMotorSpeedEntity = relatedAirerMotorSpeedSensor2(
        this.entityMetadata,
        coverEntityId,
      );
      airerMotorSpeedEntity?.entityId && runtimeEntityIdSet.add(airerMotorSpeedEntity.entityId);
      const airerMotorActionEntities = relatedAirerMotorActionEntities2(
        this.entityMetadata,
        coverEntityId,
      );
      for (const motorActionEntity of Object.values(airerMotorActionEntities))
        motorActionEntity?.entityId && runtimeEntityIdSet.add(motorActionEntity.entityId);
    }
    for (const climateEntityId of [...runtimeEntityIdSet]) {
      const climateMetadata = this.entityMetadata.get(climateEntityId);
      if (!["climate", "fan"].includes(String(climateMetadata?.domain || ""))) continue;
      const relatedLightEntity = relatedDeviceDomainEntity2(
        this.entityMetadata,
        climateEntityId,
        "light",
      );
      relatedLightEntity?.entityId && runtimeEntityIdSet.add(relatedLightEntity.entityId);
    }
    for (const isForcedConnectWaterHeaterEntityId of [...runtimeEntityIdSet])
      if (this.entityMetadata.get(isForcedConnectWaterHeaterEntityId)?.domain === "water_heater") {
        for (const waterHeaterEntity of relatedWaterHeaterEntities2(
          this.entityMetadata,
          isForcedConnectWaterHeaterEntityId,
        ))
          runtimeEntityIdSet.add(waterHeaterEntity.entityId);
      }
    for (const profileEntityId of [...runtimeEntityIdSet]) {
      const entityDeviceProfile = this.deviceProfile(profileEntityId);
      if (entityDeviceProfile)
        for (const profileRole of [
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
          "memory2",
        ]) {
          const profileRoleEntityId = entityDeviceProfile.roles?.[profileRole];
          profileRoleEntityId && runtimeEntityIdSet.add(profileRoleEntityId);
        }
    }
    const collectedEntityIds = [...runtimeEntityIdSet];
    if (!collectedEntityIds.length) {
      (this.disconnectRuntime(), (this.runtimeHydrationRetryAttempt = 0));
      return;
    }
    if (collectedEntityIds.length > maxRuntimeEntitySubscriptions) {
      this.disconnectRuntime();
      const entityCountText = String(collectedEntityIds.length);
      this.runtimeEntityLimitSignature !== entityCountText &&
        ((this.runtimeEntityLimitSignature = entityCountText),
        this.options.onError?.(
          new Error(
            "当前项目需要实时订阅 " +
              collectedEntityIds.length +
              " 个实体，已超过 " +
              maxRuntimeEntitySubscriptions +
              " 个上限。请减少统计或控件中绑定的实体。",
          ),
        ));
      return;
    }
    this.runtimeEntityLimitSignature = "";
    const entitySignature = JSON.stringify([...collectedEntityIds].sort()),
      runtimeSubscription = this.runtimeSubscription,
      isSocketConnecting = this.socket?.readyState === WebSocket.CONNECTING,
      isSocketOpen = this.socket?.readyState === WebSocket.OPEN;
    if (
      !isForcedConnect &&
      runtimeSubscription &&
      (isSocketConnecting || (isSocketOpen && runtimeSubscription.signature === entitySignature))
    ) {
      ((runtimeSubscription.entityIds = collectedEntityIds),
        (runtimeSubscription.runtimeComponents = pageComponents),
        (runtimeSubscription.signature = entitySignature),
        isSocketOpen &&
          this.scheduleRuntimeHydrationRetry(runtimeSubscription, this.socketGeneration));
      return;
    }
    (runtimeSubscription?.signature !== entitySignature && (this.runtimeHydrationRetryAttempt = 0),
      this.disconnectRuntime());
    const socketGeneration = this.socketGeneration,
      runtimeSubscriptionOptions = {
        entityIds: collectedEntityIds,
        runtimeComponents: pageComponents,
        signature: entitySignature,
      };
    this.runtimeSubscription = runtimeSubscriptionOptions;
    const webSocketProtocol = window.location.protocol === "https:" ? "wss" : "ws",
      webSocket = new WebSocket(
        webSocketProtocol + "://" + window.location.host + "/api/v1/ws/runtime",
      );
    ((this.socket = webSocket),
      webSocket.addEventListener("open", () => {
        socketGeneration === this.socketGeneration &&
          (this.reconnectAttempt > 0 &&
            window.HomeOSLog?.report("success", "实时连接", "实时状态连接已恢复", {
              phase: "websocket-reconnected",
              path: "/api/v1/ws/runtime",
            }),
          (this.reconnectAttempt = 0),
          webSocket.send(
            JSON.stringify({
              type: "subscribe",
              entityIds: runtimeSubscriptionOptions.entityIds,
            }),
          ));
      }),
      webSocket.addEventListener("message", (socketMessageEvent) => {
        if (socketGeneration !== this.socketGeneration) return;
        const { entityIds: subscriptionEntityIds } = runtimeSubscriptionOptions;
        let runtimeMessage;
        try {
          runtimeMessage = JSON.parse(socketMessageEvent.data);
        } catch (runtimeMessageError) {
          window.HomeOSLog?.error(
            runtimeMessageError,
            {
              phase: "websocket-message",
              path: "/api/v1/ws/runtime",
            },
            "实时状态消息格式异常",
          );
          return;
        }
        if (runtimeMessage.type === "snapshot") {
          this.runtimeSnapshotReady = true;
          const snapshotStates = runtimeMessage.states || [],
            restoredEntityIdSet = new Set(
              [...this.removedRuntimeEntityIds].filter((removedRuntimeEntityId) =>
                snapshotStates.some(
                  (snapshotState) =>
                    String(snapshotState?.entityId || "") === removedRuntimeEntityId,
                ),
              ),
            );
          for (const restoredEntityId of restoredEntityIdSet)
            this.historyRequestPolicy?.success(restoredEntityId);
          (this.historyRequestPolicy?.authenticated(),
            window.dispatchEvent?.(
              new CustomEvent("hb-runtime-ready", {
                detail: {
                  entityIds: [...restoredEntityIdSet],
                },
              }),
            ));
          const activeEntityIdSet = new Set(
            snapshotStates
              .map((snapshotEntry) => String(snapshotEntry?.entityId || ""))
              .filter(Boolean),
          );
          for (const subscriptionEntityId of subscriptionEntityIds)
            activeEntityIdSet.has(subscriptionEntityId) ||
              (this.removedRuntimeEntityIds.add(subscriptionEntityId),
              this.states.delete(subscriptionEntityId));
          for (const cachedEntityId of [...this.states.keys()])
            activeEntityIdSet.has(cachedEntityId) || this.states.delete(cachedEntityId);
          for (const incomingState of snapshotStates)
            this.optimisticStateIsConfirmed(incomingState.entityId, incomingState) &&
              (this.rememberLightVisualState(incomingState.entityId, incomingState),
              this.removedRuntimeEntityIds.delete(incomingState.entityId),
              this.states.set(incomingState.entityId, incomingState),
              this.applyRuntimeStateHandlers(
                incomingState.entityId,
                incomingState.newState || incomingState,
              ));
          (this.options.onRuntimeStateChange?.(snapshotStates), this.tryOpenPendingEntityDetails());
          for (const mapState of snapshotStates) this.refreshVacuumMapEntity(mapState.entityId);
          if (this.detailsStateSync?.handlers)
            for (const [registeredEntityId, entityStateHandlers] of this.detailsStateSync
              .handlers) {
              const isForcedConnectEntityStateSnapshot = this.states.get(registeredEntityId);
              if (isForcedConnectEntityStateSnapshot) {
                for (const entityHandler of entityStateHandlers)
                  entityHandler(
                    isForcedConnectEntityStateSnapshot.newState ||
                      isForcedConnectEntityStateSnapshot,
                  );
              }
            }
          else {
            const detailsSyncState = this.detailsStateSync
              ? this.states.get(this.detailsStateSync.entityId)
              : null;
            this.detailsStateSync &&
              detailsSyncState &&
              this.detailsStateSync.apply(detailsSyncState.newState || detailsSyncState);
          }
          (this.refreshRuntimeComponents([...activeEntityIdSet, ...this.removedRuntimeEntityIds]),
            snapshotStates.some(
              (stateNeedingHydration) =>
                !lineChartRuntimeStateNeedsHydration2(stateNeedingHydration),
            ) &&
              (window.clearTimeout(this.runtimeHydrationRetryTimer),
              (this.runtimeHydrationRetryTimer = null),
              (this.runtimeHydrationRetryAttempt = 0)),
            this.scheduleRuntimeHydrationRetry(runtimeSubscriptionOptions, socketGeneration));
        } else {
          if (runtimeMessage.type === "state_removed") {
            const removedEntityId = String(runtimeMessage.entityId || "");
            if (!removedEntityId) return;
            const removedStateOptions = {
              type: "state_changed",
              entityId: removedEntityId,
              domain: removedEntityId.split(".", 1)[0],
              state: "unavailable",
              attributes: {},
              available: false,
            };
            if (
              (this.removedRuntimeEntityIds.add(removedEntityId),
              this.states.delete(removedEntityId),
              this.options.onRuntimeStateChange?.([]),
              this.tryOpenPendingEntityDetails(),
              this.detailsStateSync?.handlers?.has(removedEntityId))
            ) {
              for (const stateHandlerFn of this.detailsStateSync.handlers.get(removedEntityId))
                stateHandlerFn(removedStateOptions);
            } else
              this.detailsStateSync?.entityId === removedEntityId &&
                this.detailsStateSync.apply(removedStateOptions);
            (this.applyRuntimeStateHandlers(removedEntityId, removedStateOptions),
              this.refreshRuntimeComponents([removedEntityId]));
            for (const componentId of this.runtimeEntityComponentIndex.get(removedEntityId) || []) {
              const componentEntry = this.componentRecords.get(componentId);
              ["line-chart", "camera", "vacuum-map"].includes(componentEntry?.type) &&
                this.refreshRuntimeComponent(componentId);
            }
            this.refreshVacuumMapEntity(removedEntityId);
          } else {
            if (runtimeMessage.type === "resync_required")
              socketGeneration === this.socketGeneration &&
                !this.destroyed &&
                this.connectRuntime({
                  force: true,
                });
            else {
              if (runtimeMessage.type === "state_changed") {
                if (!this.optimisticStateIsConfirmed(runtimeMessage.entityId, runtimeMessage))
                  return;
                if (
                  (this.removedRuntimeEntityIds.has(runtimeMessage.entityId) &&
                    (this.historyRequestPolicy?.success(runtimeMessage.entityId),
                    window.dispatchEvent?.(
                      new CustomEvent("hb-runtime-ready", {
                        detail: {
                          entityIds: [runtimeMessage.entityId],
                        },
                      }),
                    )),
                  this.rememberLightVisualState(runtimeMessage.entityId, runtimeMessage),
                  this.removedRuntimeEntityIds.delete(runtimeMessage.entityId),
                  this.states.set(runtimeMessage.entityId, runtimeMessage),
                  this.options.onRuntimeStateChange?.([runtimeMessage]),
                  this.tryOpenPendingEntityDetails(),
                  this.refreshVacuumMapEntity(runtimeMessage.entityId),
                  this.detailsStateSync?.handlers?.has(runtimeMessage.entityId))
                ) {
                  for (const detailsHandler of this.detailsStateSync.handlers.get(
                    runtimeMessage.entityId,
                  ))
                    detailsHandler(runtimeMessage.newState || runtimeMessage);
                } else
                  this.detailsStateSync?.entityId === runtimeMessage.entityId &&
                    this.detailsStateSync.apply(runtimeMessage.newState || runtimeMessage);
                (this.applyRuntimeStateHandlers(
                  runtimeMessage.entityId,
                  runtimeMessage.newState || runtimeMessage,
                ),
                  this.scheduleRuntimeRender(runtimeMessage.entityId));
              }
            }
          }
        }
      }),
      webSocket.addEventListener("close", (socketCloseEvent) => {
        if (socketGeneration !== this.socketGeneration || this.destroyed) return;
        if (
          (this.pauseRuntimeFlowLines(),
          (this.socket = null),
          (this.runtimeSubscription = null),
          window.clearTimeout(this.runtimeHydrationRetryTimer),
          (this.runtimeHydrationRetryTimer = null),
          window.HomeOSLog?.report(
            "warning",
            "实时连接",
            "实时状态连接已断开（" +
              socketCloseEvent.code +
              "）" +
              ([4400, 4401, 4403].includes(socketCloseEvent.code) ? "" : "，正在重连"),
            {
              code: socketCloseEvent.code,
              phase: "websocket-disconnected",
              path: "/api/v1/ws/runtime",
            },
          ),
          socketCloseEvent.code === 4401)
        ) {
          const startsWith4 =
            (window.HomeOSEmbed?.path || window.location.pathname).startsWith("/display/") ||
            (window.HomeOSEmbed?.path || window.location.pathname).startsWith("/homeos/");
          window.location.assign(
            startsWith4
              ? "/pair?next=" +
                  encodeURIComponent(
                    "" +
                      (window.HomeOSEmbed?.path || window.location.pathname) +
                      window.location.search,
                  )
              : "/login",
          );
          return;
        }
        if (socketCloseEvent.code === 4403) {
          window.location.replace("/license");
          return;
        }
        if (socketCloseEvent.code === 4400) {
          const socketErrorText =
            socketCloseEvent.reason === "too many entities"
              ? "当前项目的实时订阅实体超过 " +
                maxRuntimeEntitySubscriptions +
                " 个，已停止重连。请减少统计或控件中绑定的实体。"
              : "实时状态订阅请求无效，已停止自动重连。";
          this.options.onError?.(new Error(socketErrorText));
          return;
        }
        const reconnectDelayMs = Math.min(1000 * 2 ** this.reconnectAttempt, 15000);
        ((this.reconnectAttempt += 1),
          (this.reconnectTimer = window.setTimeout(() => this.connectRuntime(), reconnectDelayMs)));
      }),
      webSocket.addEventListener("error", () => {
        webSocket.readyState === WebSocket.OPEN && webSocket.close();
      }));
  }
  ["scheduleRuntimeHydrationRetry"](subscription, socketGenerationValue) {
    const isSubscriptionActive = () => {
      const { entityIds: pendingEntityIds, runtimeComponents: pendingRuntimeComponents } =
          subscription,
        hydrationEntityIdSet = new Set(
          collectComponents2(
            pendingRuntimeComponents,
            (lineChartComponent) => lineChartComponent.type === "line-chart",
          )
            .map((componentWithEntity) =>
              String(componentWithEntity.bindings?.entity?.entityId || ""),
            )
            .filter(Boolean),
        );
      return (
        pendingEntityIds.filter(
          (hydrationEntityId) =>
            hydrationEntityIdSet.has(hydrationEntityId) &&
            lineChartRuntimeStateNeedsHydration2(this.states.get(hydrationEntityId)),
        ).length > 0
      );
    };
    if (!isSubscriptionActive()) {
      (window.clearTimeout(this.runtimeHydrationRetryTimer),
        (this.runtimeHydrationRetryTimer = null),
        (this.runtimeHydrationRetryAttempt = 0));
      return;
    }
    if (this.runtimeHydrationRetryTimer || !(this.runtimeHydrationRetryAttempt < 5)) return;
    this.runtimeHydrationRetryAttempt += 1;
    const hydrationRetryDelayMs = Math.min(
      10000,
      500 * 2 ** (this.runtimeHydrationRetryAttempt - 1),
    );
    this.runtimeHydrationRetryTimer = window.setTimeout(() => {
      ((this.runtimeHydrationRetryTimer = null),
        socketGenerationValue === this.socketGeneration &&
          !this.destroyed &&
          (isSubscriptionActive()
            ? this.connectRuntime({
                force: true,
              })
            : (this.runtimeHydrationRetryAttempt = 0)));
    }, hydrationRetryDelayMs);
  }
  ["refreshHistorySeries"]() {
    if (!this.document || this.destroyed || document.visibilityState === "hidden") return;
    const join = [
      this.historyDocumentGeneration,
      this.page?.path || "",
      this.activePopupId || "",
      this.historyPopupGeneration,
    ].join(":");
    return this.historyRefreshCoordinator.request(join, () => this.refreshHistorySeriesPass());
  }
  ["scheduleHistoryRetry"]() {
    if (
      this.destroyed ||
      isDocumentHidden() ||
      this.historyRetryTimer ||
      this.historyRetryAttempt >= 4
    )
      return;
    const historyRetryAttempt = this.historyRetryAttempt,
      historyRetryDelayMs = Math.min(8000, 1000 * 2 ** historyRetryAttempt);
    ((this.historyRetryAttempt += 1),
      (this.historyRetryTimer = window.setTimeout(() => {
        ((this.historyRetryTimer = 0), this.refreshHistorySeries());
      }, historyRetryDelayMs)));
  }
  async ["refreshHistorySeriesPass"]() {
    if (!this.document || this.destroyed || document.visibilityState === "hidden") return;
    const historyDocumentGeneration = this.historyDocumentGeneration,
      historyPopupGeneration = this.historyPopupGeneration,
      pagePathValue = this.page?.path || "",
      historyRequestByEntityId = new Map(),
      registerHistoryRequests = (components, requestDefaults) => {
        const historyComponents = collectComponents2(
          components,
          (historyComponentFilter) =>
            historyComponentFilter.type === "line-chart" ||
            historyComponentFilter.type === "presence-sensor",
        );
        for (const historyComponent of historyComponents) {
          const historyEntityId = historyComponent.bindings?.entity?.entityId;
          if (!historyEntityId) continue;
          const isPresenceComponent = historyComponent.type === "presence-sensor",
            minUpdateInterval = Math.max(
              30,
              Math.min(
                86400,
                Number(
                  isPresenceComponent ? 300 : historyComponent.properties?.updateInterval || 600,
                ),
              ),
            ),
            minHistoryHours = Math.max(
              1,
              Math.min(
                168,
                Number(
                  isPresenceComponent
                    ? historyComponent.properties?.historyHours || 24
                    : historyComponent.properties?.hours || 24,
                ),
              ),
            ),
            existingRequest = historyRequestByEntityId.get(historyEntityId);
          historyRequestByEntityId.set(historyEntityId, {
            interval: Math.min(existingRequest?.interval ?? minUpdateInterval, minUpdateInterval),
            hours: Math.max(existingRequest?.hours ?? minHistoryHours, minHistoryHours),
            documentGeneration: historyDocumentGeneration,
            shared: !!(existingRequest?.shared || requestDefaults.shared),
            pagePath: existingRequest?.pagePath ?? requestDefaults.pagePath ?? null,
            popupId: existingRequest?.popupId ?? requestDefaults.popupId ?? null,
            popupGeneration: historyPopupGeneration,
          });
        }
      };
    (registerHistoryRequests(this.document.sharedComponents || [], {
      shared: true,
    }),
      registerHistoryRequests(this.page?.components || [], {
        pagePath: pagePathValue,
      }));
    const historyPopupEntry = this.activePopupId
        ? (this.document.customPopups || []).find(
            (historyPopupModule) => String(historyPopupModule.id || "") === this.activePopupId,
          )
        : null,
      pendingHistoryRequests = [];
    for (const lineChartModule of historyPopupEntry?.modules || [])
      lineChartModule.type === "line-chart" &&
        lineChartModule.entityId &&
        pendingHistoryRequests.push({
          type: "line-chart",
          bindings: {
            entity: {
              entityId: lineChartModule.entityId,
            },
          },
          properties: syncedLineChartProperties2(
            this.document,
            this.page,
            lineChartModule.entityId,
            lineChartModule.properties,
          ),
        });
    registerHistoryRequests(pendingHistoryRequests, {
      popupId: this.activePopupId || null,
    });
    const requestTimestamp = Date.now();
    let hasHistoryChanged = false,
      shouldRetryHistory = false;
    this.historyRequestPolicy.retain(new Set(historyRequestByEntityId.keys()));
    const requestEntries = [...historyRequestByEntityId],
      getHistoryRequestSnapshot = () => ({
        documentGeneration: this.historyDocumentGeneration,
        pagePath: this.page?.path || "",
        popupId: this.activePopupId || null,
        popupGeneration: this.historyPopupGeneration,
      }),
      fetchHistorySeries = async () => {
        for (; requestEntries.length;) {
          const [shift2, shift3] = requestEntries.shift();
          if (
            this.destroyed ||
            isDocumentHidden() ||
            !historyRequestStillRelevant2(shift3, getHistoryRequestSnapshot()) ||
            !this.historyRequestPolicy.canRequest(shift2)
          )
            continue;
          const cachedSeries = this.historySeries.get(shift2),
            cachedSeriesEntry = this.historySeriesCache.get(
              historySeriesCacheKey2(shift2, shift3.hours),
            ),
            combinedSeries = [cachedSeries, cachedSeriesEntry]
              .filter(
                (seriesEntry) =>
                  seriesEntry &&
                  seriesEntry.hours === shift3.hours &&
                  Array.isArray(seriesEntry.points),
              )
              .sort(
                (seriesEntryA, seriesEntryB) => seriesEntryB.fetchedAt - seriesEntryA.fetchedAt,
              )[0];
          if (
            combinedSeries &&
            requestTimestamp - combinedSeries.fetchedAt < shift3.interval * 1000
          ) {
            cachedSeries !== combinedSeries &&
              (this.historySeries.set(shift2, combinedSeries), (hasHistoryChanged = true));
            continue;
          }
          if (this.historyFetches.has(shift2)) continue;
          this.historyFetches.add(shift2);
          const abortController =
            typeof AbortController == "function" ? new AbortController() : null;
          abortController && this.historyAbortControllers.add(abortController);
          const historyFetchTimer = window.setTimeout(
            () => abortController?.abort(),
            HISTORY_FETCH_TIMEOUT_MS2,
          );
          try {
            const historyResponse = await fetch(
              "/api/v1/ha/history?entityId=" +
                encodeURIComponent(shift2) +
                "&hours=" +
                shift3.hours,
              {
                credentials: "same-origin",
                headers: {
                  Accept: "application/json",
                },
                ...(abortController
                  ? {
                      signal: abortController.signal,
                    }
                  : {}),
              },
            );
            if (!historyResponse.ok) {
              if (
                !historyRequestStillRelevant2(shift3, getHistoryRequestSnapshot()) ||
                this.destroyed
              )
                continue;
              shouldRetryHistory =
                Number.isFinite(
                  this.historyRequestPolicy.failure(shift2, historyResponse.status),
                ) || shouldRetryHistory;
              continue;
            }
            const json = await historyResponse.json();
            if (
              this.destroyed ||
              isDocumentHidden() ||
              !historyRequestStillRelevant2(shift3, getHistoryRequestSnapshot())
            )
              continue;
            if (!Array.isArray(json.points)) throw new Error("历史数据格式异常");
            this.historyRequestPolicy?.success(shift2);
            const historySeriesOptions = {
              points: json.points,
              hours: shift3.hours,
              fetchedAt: Date.now(),
            };
            (this.historySeries.set(shift2, historySeriesOptions),
              cacheHistorySeries2(this.historySeriesCache, shift2, historySeriesOptions),
              (hasHistoryChanged = true));
          } catch (historyFetchError) {
            if (
              this.destroyed ||
              isDocumentHidden() ||
              abortController?.signal.reason === "lifecycle" ||
              !historyRequestStillRelevant2(shift3, getHistoryRequestSnapshot())
            )
              continue;
            (this.historyRequestPolicy.failure(shift2),
              historyFetchError?.name === "AbortError" &&
                window.HomeOSLog?.report("warning", "网络请求", "历史曲线请求超时", {
                  entityId: shift2,
                  phase: "history-timeout",
                  path: "/api/v1/ha/history",
                  durationMs: HISTORY_FETCH_TIMEOUT_MS2,
                }),
              (shouldRetryHistory = true));
          } finally {
            (window.clearTimeout(historyFetchTimer),
              this.historyFetches.delete(shift2),
              this.historyAbortControllers.delete(abortController));
          }
        }
      };
    if (
      (await Promise.all(
        Array.from(
          {
            length: Math.min(2, requestEntries.length),
          },
          () => fetchHistorySeries(),
        ),
      ),
      shouldRetryHistory && !this.destroyed
        ? this.scheduleHistoryRetry()
        : (this.historyRetryAttempt = 0),
      hasHistoryChanged && !this.destroyed)
    ) {
      this.detailsStateSync?.refreshHistory?.();
      for (const historyChartRefresher of this.historyChartRefreshers) historyChartRefresher();
    }
  }
  ["destroy"]() {
    this.destroyed = true;
    for (const destroyHistoryAbortController of this.historyAbortControllers)
      destroyHistoryAbortController.abort("lifecycle");
    ((this.activePopupId = null),
      (this.historyDocumentGeneration += 1),
      (this.historyPopupGeneration += 1),
      this.disconnectRuntime(),
      window.clearTimeout(this.reconnectTimer),
      window.clearTimeout(this.runtimeRenderTimer),
      window.clearTimeout(this.historyRetryTimer),
      window.clearTimeout(this.runtimeHydrationRetryTimer),
      this.cancelPendingEntityDetails(),
      window.clearInterval(this.historyPollTimer),
      this.runtimeStaticImageCache.stop(),
      this.runtimeEffectImageLoader.stop(),
      this.runtimeVacuumMapImagePreloader.stop(),
      (this.reconnectTimer = null),
      (this.historyRetryTimer = 0),
      (this.runtimeHydrationRetryTimer = null),
      (this.runtimeHydrationRetryAttempt = 0),
      this.cleanupComponents(),
      this.closeRuntimeDialog(),
      (this.pendingEntityDetails = null),
      (this.runtimeDialogScaleContext = null),
      this.resizeObserver.disconnect(),
      window.visualViewport?.removeEventListener("resize", this.boundResize),
      window.removeEventListener("orientationchange", this.boundResize),
      window.removeEventListener("online", this.boundReconnect),
      document.removeEventListener("visibilitychange", this.boundVisibilityChange),
      this.container.removeEventListener("click", this.boundRuntimeButtonSound, true),
      this.container.replaceChildren());
  }
}
