import { vacuumMapAvailable as vacuumMapAvailable2 } from "./vacuum-map-state.js?v=20260929-map-availability-v1";
import { popupPlacement as popupPlacement2 } from "../modules/interaction3d/popup-placement.js?v=20260925-canvas-scale-v2";
import {
  cameraPopupLayout as cameraPopupLayout2,
  cameraPreviewRatio as cameraPreviewRatio2,
} from "../modules/interaction3d/camera-popup-layout.js";
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
} from "./registry.js?v=20260926-integration-v1-20260930-flow-line-sign-v1-20260930-percentage-text-offset-v1";
import { randomUuid as randomUuid2 } from "../utils/random-id.js?v=20260724-revert-hold-popup-shield-v324";
import { popupLayoutMetrics as popupLayoutMetrics2 } from "../popup-layout.js?v=20260821-electric-bed-combo-v2";
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
} from "./climate.js?v=20260812-presence-phase-v79-20260904-climate-capability-options-v6";
import {
  applyXiaomiDeviceProfile as applyXiaomiDeviceProfile2,
  resolveXiaomiDeviceProfile as resolveXiaomiDeviceProfile2,
} from "./device-profiles.js?v=20260821-electric-bed-sync-v4";
import {
  relatedEntityLabel as relatedEntityLabel2,
  relatedEntityNeedsConfirmation as relatedEntityNeedsConfirmation2,
  relatedEntityOptions as relatedEntityOptions2,
  relatedEntitySelectService as relatedEntitySelectService2,
  relatedPopupContext as relatedPopupContext2,
  selectedRelatedEntities as selectedRelatedEntities2,
  selectedRelatedEntityIds as selectedRelatedEntityIds2,
} from "../related-entities.js?v=20260825-bath-heater-primary-v1";
import {
  entityPowerIsOn as entityPowerIsOn2,
  entityPowerTarget as entityPowerTarget2,
  entityToggleCommand as entityToggleCommand2,
  optimisticToggleState as optimisticToggleState2,
} from "./entity-power.js?v=20260813-generic-device-power-v2";
import {
  ICON_VISIBILITY_VIRTUAL_KIND as ICON_VISIBILITY_VIRTUAL_KIND2,
  isVirtualEntityId as isVirtualEntityId2,
  parseVirtualEntityId as parseVirtualEntityId2,
} from "../virtual-entities.js?v=20260822-icon-visibility-v1";
import { componentActionIsSupported as componentActionIsSupported2 } from "../action-rules.js?v=20260831-action-rules-v1-20260930-flow-line-sign-v1";
import {
  airflowCanvasOffsetBounds as airflowCanvasOffsetBounds2,
  airflowLayerGeometry as airflowLayerGeometry2,
  groupedComponentLocalDelta as groupedComponentLocalDelta2,
  rotateMultiSelectionTransforms as rotateMultiSelectionTransforms2,
} from "./transform-geometry.js?v=20260901-renderer-transform-geometry-v1";
import {
  componentHostZIndex as componentHostZIndex2,
  effectCropRectangle as effectCropRectangle2,
  effectCroppedLayerGeometry as effectCroppedLayerGeometry2,
  effectFadeDuration as effectFadeDuration2,
  effectLayerDimensions as effectLayerDimensions2,
  effectReferenceImageTransform as effectReferenceImageTransform2,
  effectSourceDimensions as effectSourceDimensions2,
  normalizeIconButtonEffectComponent as normalizeIconButtonEffectComponent2,
} from "./effect-geometry.js?v=20260901-renderer-effect-geometry-v2";
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
} from "./light-runtime.js?v=20260926-rgb-edge-v1";
import { entityMetadataIsAvailable as entityMetadataIsAvailable2 } from "./entity-metadata.js?v=20260901-renderer-entity-metadata-v1";
import {
  relatedVacuumStatusEntities as relatedVacuumStatusEntities2,
  vacuumStatus as vacuumStatus2,
  relatedVacuumBatteryEntity as relatedVacuumBatteryEntity2,
  vacuumActionService as vacuumActionService2,
  vacuumBatteryPercent as vacuumBatteryPercent2,
  vacuumSupportedActions as vacuumSupportedActions2,
} from "./vacuum-runtime.js?v=20260925-vacuum-state-v2";
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
} from "./cover-runtime.js?v=20260901-renderer-cover-runtime-v1-20260908-environment-v1-20260908-lighting-mode-v1-20260908-range-dialog-v3-20260908-range-controls-v1-20260908-batch-center-v1-20260908-add-device-dialog-v1";
import {
  playFixedDeviceDropEntrance as playFixedDeviceDropEntrance2,
  playMediaSpeakerEntrance as playMediaSpeakerEntrance2,
  playStableRuntimeDialogEntrance as playStableRuntimeDialogEntrance2,
  runtimeDialogUsesStableMotion as runtimeDialogUsesStableMotion2,
} from "./runtime-dialog-motion.js?v=20260901-renderer-dialog-motion-v1-finish-cleanup-v1-apple-native-v1";
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
} from "./runtime-caches.js?v=20260924-entity-request-policy-v1";
import {
  collectComponents as collectComponents2,
  collectEntityIds as collectEntityIds2,
  lineChartRuntimeStateNeedsHydration as lineChartRuntimeStateNeedsHydration2,
  syncedLineChartProperties as syncedLineChartProperties2,
} from "./runtime-document.js?v=20260901-renderer-runtime-document-v1";
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
const un = 1000,
  mn = 0.76,
  gs = 0.7,
  fs = 1.6,
  bs = 2,
  ys = 2.12;
export function runtimeDialogLayout({
  layerWidth: v1,
  layerHeight: v2,
  layoutWidth: v3,
  layoutHeight: v4,
  fillAvailable: v5 = false,
  tightFill: v6 = false,
  targetOccupancy: v7 = mn,
}) {
  const max = Math.max(1, Number(v1) || 1),
    max2 = Math.max(1, Number(v2) || 1),
    max3 = Math.max(1, Number(v3) || 1),
    max4 = Math.max(1, Number(v4) || 1),
    min = v6
      ? Math.min(40, Math.max(24, Math.min(max, max2) * 0.03))
      : v5
        ? Math.min(80, Math.max(32, Math.min(max, max2) * 0.075))
        : Math.min(64, Math.max(24, Math.min(max, max2) * 0.05)),
    max5 = Math.max(1, max - min * 2),
    max6 = Math.max(1, max2 - min * 2),
    min2 = Math.min(max5 / max3, max6 / max4),
    max7 = Math.max(0.2, Math.min(1, Number(v7) || mn)),
    min3 = Math.min((max * max7) / max3, (max2 * max7) / max4),
    min4 = Math.min(fs, min3),
    min5 = Math.min(v5 ? (v6 ? ys : bs) : min4, min2);
  return {
    availableWidth: max5,
    availableHeight: max6,
    fitScale: min2,
    preferredScale: min4,
    safeInset: min,
    scale: Math.max(0.08, min5),
  };
}
export function runtimeDialogViewport({
  layerLeft: v8 = 0,
  layerTop: v9 = 0,
  layerWidth: v10,
  layerHeight: v11,
  dashboardLeft: v12,
  dashboardTop: v13,
  dashboardWidth: v14,
  dashboardHeight: v15,
}) {
  const num = Number(v8) || 0,
    num2 = Number(v9) || 0,
    max8 = Math.max(1, Number(v10) || 1),
    max9 = Math.max(1, Number(v11) || 1),
    v16 = num + max8,
    v17 = num2 + max9,
    v18 = Number.isFinite(Number(v12)) ? Number(v12) : num,
    v19 = Number.isFinite(Number(v13)) ? Number(v13) : num2,
    max10 = Math.max(1, Number(v14) || max8),
    max11 = Math.max(1, Number(v15) || max9),
    max12 = Math.max(num, v18),
    max13 = Math.max(num2, v19),
    min6 = Math.min(v16, v18 + max10),
    min7 = Math.min(v17, v19 + max11),
    max14 = Math.max(1, min6 - max12),
    max15 = Math.max(1, min7 - max13);
  return {
    width: max14,
    height: max15,
    centerX: max12 - num + max14 / 2,
    centerY: max13 - num2 + max15 / 2,
  };
}
function Si(arg1) {
  arg1.id = "component-" + randomUuid2();
  for (const v20 of arg1.children || []) Si(v20);
  return arg1;
}
function Ci(arg2) {
  const text2 = navigator.userAgentData?.platform || navigator.platform || "",
    test = /mac|iphone|ipad|ipod/i.test(text2);
  return arg2.altKey || arg2.ctrlKey || (test && arg2.metaKey);
}
function ke(arg3, arg4) {
  return componentActionIsSupported2(arg3, arg4);
}
export function componentDialogTitle(arg5, arg6) {
  const options = arg5?.properties || {};
  return String(options.label || "").trim() || arg6;
}
export function popupModuleDialogTitle(arg7, arg8, v21 = "") {
  return (
    String(arg7?.title || "").trim() ||
    String(v21 || "").trim() ||
    String(arg8?.attributes?.friendly_name || "").trim() ||
    String(arg7?.entityId || "").trim()
  );
}
function xi(arg9) {
  const ownerDocument = arg9.ownerDocument,
    element = ownerDocument.createElement("span");
  element.className = "hb-airer-visual";
  const element2 = ownerDocument.createElement("i");
  element2.className = "hb-airer-visual-glow";
  const element3 = ownerDocument.createElement("span");
  element3.className = "hb-airer-visual-body";
  const element4 = ownerDocument.createElement("i");
  ((element4.className = "hb-airer-visual-lamp"), element3.append(element4));
  const element5 = ownerDocument.createElement("span");
  ((element5.className = "hb-airer-visual-lifts"),
    element5.append(ownerDocument.createElement("i"), ownerDocument.createElement("i")));
  const element6 = ownerDocument.createElement("span");
  element6.className = "hb-airer-visual-rack";
  for (let num3 = 0; num3 < 4; num3 += 1) element6.append(ownerDocument.createElement("i"));
  (element.append(element2, element3, element5, element6), arg9.append(element));
}
function pn(arg10) {
  return (
    {
      open: "已升起",
      closed: "已下降",
      opening: "正在升起",
      closing: "正在下降",
    }[arg10] || ""
  );
}
function hn({
  label: v22 = "开关",
  interactive: v23 = true,
  onToggle: v24 = null,
  compact: v25 = false,
  momentary: v26 = false,
} = {}) {
  const element7 = document.createElement("button");
  ((element7.type = "button"),
    (element7.className = "hb-switch-visual"),
    element7.classList.toggle("is-momentary", v26),
    (element7.inert = !v23),
    element7.setAttribute("aria-disabled", String(!v23)));
  const element8 = document.createElement("i");
  element8.className = "hb-switch-visual-aura";
  const element9 = document.createElement("span");
  element9.className = "hb-switch-visual-plate";
  const element10 = document.createElement("i");
  element10.className = "hb-switch-visual-indicator";
  const element11 = document.createElement("span");
  element11.className = "hb-switch-visual-rocker";
  const element12 = document.createElement("i");
  ((element12.className = "hb-switch-visual-mark off"), (element12.textContent = "○"));
  const element13 = document.createElement("i");
  ((element13.className = "hb-switch-visual-mark on"),
    (element13.textContent = "┃"),
    element11.append(element12, element13),
    element9.append(element10, element11),
    element7.append(element8, element9));
  const element14 = v25 ? document.createElement("span") : null,
    element15 = v25 ? document.createElement("strong") : null,
    element16 = v25 ? document.createElement("output") : null;
  v25 &&
    ((element14.className = "hb-switch-visual-copy"),
    (element15.className = "hb-switch-visual-copy-label"),
    (element16.className = "hb-switch-visual-copy-state"),
    (element15.textContent = v22),
    element14.append(element15, element16),
    element7.append(element14),
    element7.classList.add("is-compact"));
  const v27 = (
    arg11,
    { unavailable: v28 = false, pending: v29 = false, success: v30 = false } = {},
  ) => {
    const v31 = (v26 ? v29 : !!arg11) && !v28;
    (element7.classList.toggle("is-on", v31),
      element7.classList.toggle("is-unavailable", v28),
      element7.classList.toggle("is-pending", v29),
      element7.classList.toggle("is-success", v30),
      element7.setAttribute("aria-pressed", String(v31)),
      element7.setAttribute("aria-busy", String(v29)),
      element7.setAttribute(
        "aria-label",
        v28
          ? v22 + "当前不可用"
          : v26
            ? "" + v22 + (v30 ? "执行成功" : v29 ? "正在执行" : "，点击执行")
            : "" + v22 + (v31 ? "已开启，点击关闭" : "已关闭，点击开启"),
      ),
      element16 &&
        (element16.textContent = v28
          ? "当前不可用"
          : v26
            ? v30
              ? "执行成功"
              : v29
                ? "执行中"
                : "点击执行"
            : v31
              ? "运行中"
              : "已关闭"));
  };
  return (
    element7.addEventListener("click", () => {
      v23 &&
        !element7.classList.contains("is-pending") &&
        !element7.classList.contains("is-unavailable") &&
        v24?.();
    }),
    {
      visual: element7,
      sync: v27,
    }
  );
}
function gn(arg12, arg13, v32 = 0) {
  const v33 = (arg14) => {
      const trim = String(arg14 || "").trim(),
        v34 = /^#[0-9a-f]{3}$/i.test(trim)
          ? "#" +
            trim
              .slice(1)
              .split("")
              .map((arg15) => "" + arg15 + arg15)
              .join("")
          : trim;
      return /^#[0-9a-f]{6}$/i.test(v34) ? v34 : null;
    },
    v35 = v33(arg12),
    v36 = v33(arg13);
  if (!v35 || !v36) return arg12;
  const max16 = Math.max(0, Math.min(1, Number(v32) || 0)),
    v37 = (arg16, arg17) => Number.parseInt(arg16.slice(arg17, arg17 + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((arg18) => Math.round(v37(v35, arg18) + (v37(v36, arg18) - v37(v35, arg18)) * max16))
      .map((arg19) => arg19.toString(16).padStart(2, "0"))
      .join("")
  );
}
export class PanelRenderer {
  constructor(arg20, v38 = {}) {
    ((this.container = arg20),
      (this.options = {
        ...v38,
        onError: (arg21) => {
          (window.HABridgeLog?.error(arg21, {
            phase: "runtime-operation",
          }),
            v38.onError?.(arg21));
        },
      }),
      (this.boundRuntimeButtonSound = (arg22) => {
        if (this.options.editable) return;
        const closest =
          typeof Element < "u" && arg22.target instanceof Element
            ? arg22.target.closest('button, [role="button"]')
            : null;
        !closest ||
          !this.container.contains(closest) ||
          this.options.onRuntimeButtonPress?.(closest);
      }),
      this.container.addEventListener("click", this.boundRuntimeButtonSound, true),
      (this.renderNamespace = "renderer-" + randomUuid2().replace(/[^a-z0-9]/gi, "")),
      (this.document = null),
      (this.page = null),
      (this.states = v38.runtimeStateCache instanceof Map ? v38.runtimeStateCache : new Map()),
      (this.virtualEntityStates =
        v38.virtualEntityStateCache instanceof Map ? v38.virtualEntityStateCache : new Map()),
      (this.entityMetadata = new Map()),
      (this.deviceMetadata = new Map()),
      (this.entityCatalogReady = false),
      (this.entityTranslations = {}),
      (this.historySeries = new Map()),
      (this.historySeriesCache =
        v38.historySeriesCache instanceof Map ? v38.historySeriesCache : new Map()),
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
      this.resizeObserver.observe(arg20),
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
          for (const v39 of this.historyAbortControllers) v39.abort("lifecycle");
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
  ["setDocument"](arg23, v40 = null) {
    this.destroyed = false;
    const map = this.options.editable
        ? new Map(
            [...this.componentHosts].filter(
              ([v41, v42]) =>
                (this.componentRecords.get(v41)?.type === "floorplan-auto-diagram" &&
                  v42.querySelector(".hb-floorplan-auto-diagram-preview")) ||
                (this.document?.projectId === arg23.projectId &&
                  this.componentRecords.get(v41)?.type === "interaction3d" &&
                  v42.parentElement === this.canvas),
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
      for (const v43 of this.historyAbortControllers) v43.abort("lifecycle");
      (this.historyRequestPolicy.resume(),
        this.historySeries.clear(),
        this.historyFetches.clear(),
        (this.historyDocumentGeneration += 1),
        (this.historyPopupGeneration += 1),
        this.removedRuntimeEntityIds.clear(),
        (this.document = this.options.editable ? structuredClone(arg23) : arg23),
        (this.vacuumMapEntityIds = new Set(
          collectComponents2(
            [
              ...(this.document.sharedComponents || []),
              ...this.document.pages.flatMap((arg24) => arg24.components || []),
            ],
            (arg25) => arg25.type === "vacuum-map",
          )
            .map((arg26) => String(arg26.bindings?.entity?.entityId || ""))
            .filter((arg27) => arg27.startsWith("image.")),
        )));
      const v44 = this.document.pages.find((arg28) => arg28.path === v40),
        v45 = this.document.pages.find((arg29) => arg29.path === this.document.defaultPagePath);
      if (
        ((this.page = v44 || v45 || this.document.pages[0]),
        this.render(map),
        this.preloadStaticImages(),
        !this.options.editable)
      ) {
        const filter = collectComponents2(
          [
            ...(this.document.sharedComponents || []),
            ...this.document.pages.flatMap((arg30) => arg30.components || []),
          ],
          (arg31) =>
            arg31.type === "camera" &&
            arg31.properties?.mediaVisible !== false &&
            arg31.properties?.displayMode !== "snapshot",
        )
          .map((arg32) => String(arg32.bindings?.entity?.entityId || ""))
          .filter(Boolean);
        prewarmCameraMedia2(filter);
      }
      (this.connectRuntime(), this.refreshHistorySeries());
    } finally {
      this.replacingDocument = replacingDocument;
    }
  }
  ["refreshBuiltinAssets"](v46 = []) {
    const v47 = setBuiltinAssetVersions2(v46);
    return (v47 && this.document && (this.renderComponents(true), this.preloadStaticImages()), v47);
  }
  ["preloadStaticImages"]() {
    if (!this.document || !this.page) return;
    const v48 = (arg33) =>
        collectComponents2(arg33, (arg34) => arg34.type === "image" && arg34.properties?.assetId)
          .map((arg35) => staticAssetImageSource2(arg35.properties.assetId))
          .filter(Boolean),
      map2 = new Map((this.document.sharedComponents || []).map((arg36) => [arg36.id, arg36])),
      filter2 = (this.page.sharedComponentIds || [])
        .map((arg37) => map2.get(arg37))
        .filter(Boolean),
      v49 = v48([...(this.page.components || []), ...filter2]),
      v50 = v48([
        ...(this.document.sharedComponents || []),
        ...this.document.pages.flatMap((arg38) => arg38.components || []),
      ]);
    this.runtimeStaticImageCache.setSources(v50, v49);
  }
  ["setEntityCatalog"](v51 = [], v52 = {}, v53 = []) {
    ((this.entityMetadata = new Map(
      (v51 || []).map((arg39) => [String(arg39.entityId || ""), arg39]).filter(([v54]) => v54),
    )),
      (this.deviceMetadata = new Map(
        (v53 || []).map((arg40) => [String(arg40.deviceId || ""), arg40]).filter(([v55]) => v55),
      )),
      (this.entityTranslations = v52 && typeof v52 == "object" ? v52 : {}),
      (this.entityCatalogReady = true),
      this.tryOpenPendingEntityDetails(),
      this.document &&
        (this.detailsStateSync?.refreshEntityCatalog?.(),
        this.renderComponents(true),
        this.connectRuntime()));
  }
  ["deviceProfile"](arg41) {
    return resolveXiaomiDeviceProfile2(
      arg41,
      this.entityMetadata,
      this.deviceMetadata,
      this.states,
    );
  }
  ["runtimeEntityId"](arg42) {
    return String(arg42 || "");
  }
  ["iconVisibilityPageKey"]() {
    return String(this.page?.path || this.page?.id || "current-page");
  }
  ["iconVisibilityState"]() {
    return this.virtualEntityStates.get(this.iconVisibilityPageKey()) !== false;
  }
  ["toggleVirtualEntity"](arg43) {
    const v56 = parseVirtualEntityId2(arg43);
    if (!v56 || v56.kind !== ICON_VISIBILITY_VIRTUAL_KIND2) throw new Error("虚拟实体不存在。");
    if (![...this.componentRecords.values()].some((arg44) => arg44.type === "icon-button-effect"))
      throw new Error("当前页面没有图标按钮（效果）。");
    const iconVisibilityPageKey = this.iconVisibilityPageKey(),
      v57 = !this.iconVisibilityState();
    (this.virtualEntityStates.set(iconVisibilityPageKey, v57),
      this.states.set(arg43, {
        entityId: arg43,
        state: v57 ? "on" : "off",
        attributes: {},
      }),
      this.renderComponents(true));
  }
  ["waterHeaterDetailsReady"](arg45) {
    if (!this.entityCatalogReady) return false;
    const v58 = this.states.get(arg45),
      options2 = (v58?.newState || v58)?.attributes || {},
      v59 = Number(options2.temperature),
      v60 = Number(options2.min_temp),
      v61 = Number(options2.max_temp);
    return Number.isFinite(v59) && Number.isFinite(v60) && Number.isFinite(v61) && v61 > v60;
  }
  ["cancelPendingEntityDetails"]() {
    (window.clearTimeout(this.pendingEntityDetails?.timer),
      window.clearTimeout(this.pendingEntityDetails?.retryTimer),
      (this.pendingEntityDetails = null));
  }
  ["deferEntityDetailsUntilReady"](arg46, arg47, v62 = "water-heater") {
    this.cancelPendingEntityDetails();
    const options3 = {
        component: structuredClone(arg46),
        preview: arg47,
        reason: v62,
        retryTimer: null,
        timer: null,
      },
      v63 = v62 === "catalog" || v62 === "electric-bed-catalog";
    if (v63) {
      const v64 = () => {
        if (this.pendingEntityDetails !== options3) return;
        const runtimeEntityId = this.runtimeEntityId(
          options3.component?.bindings?.entity?.entityId,
        );
        if (
          !this.entityCatalogReady ||
          (v62 === "electric-bed-catalog" &&
            this.deviceProfile(runtimeEntityId)?.deviceType !== "electric-bed")
        ) {
          options3.retryTimer = window.setTimeout(v64, 260);
          return;
        }
        (this.cancelPendingEntityDetails(),
          this.showEntityDetails(options3.component, {
            preview: options3.preview,
          }));
      };
      options3.retryTimer = window.setTimeout(v64, 260);
    }
    ((options3.timer = window.setTimeout(
      () => {
        this.pendingEntityDetails === options3 &&
          (this.cancelPendingEntityDetails(),
          v63 &&
            this.detailsDialog?.classList.contains("electric-bed-loading-details") &&
            this.detailsDialog.close(),
          v63
            ? this.options.onError?.(new Error("设备信息正在加载，请稍后重试。"))
            : this.options.onError?.(new Error("热水器状态正在加载，请稍后重试。")));
      },
      v63 ? 10000 : 3000,
    )),
      (this.pendingEntityDetails = options3));
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
  ["profiledComponent"](arg48, v65 = arg48?.bindings?.entity?.entityId || "") {
    return applyXiaomiDeviceProfile2(
      arg48,
      this.deviceProfile(this.runtimeEntityId(v65)) || this.deviceProfile(v65),
    );
  }
  ["powerEntityId"](arg49, v66 = arg49?.bindings?.entity?.entityId || "") {
    const runtimeEntityId3 = this.runtimeEntityId(v66),
      deviceProfile = this.deviceProfile(runtimeEntityId3) || this.deviceProfile(v66),
      v67 = entityPowerTarget2(runtimeEntityId3, arg49, deviceProfile);
    if (v67 !== runtimeEntityId3) return this.runtimeEntityId(v67);
    const v68 = relatedPopupContext2(arg49, this.entityMetadata, this.deviceMetadata, this.states);
    if (arg49?.type !== "air-conditioner" && v68?.deviceType === "bath-heater") {
      const v69 = v68.siblings?.find(
        (arg50) => arg50.domain === "light" && entityMetadataIsAvailable2(arg50),
      );
      if (v69?.entityId) return this.runtimeEntityId(v69.entityId);
    }
    return runtimeEntityId3;
  }
  ["runtimePowerComponent"](arg51, v70 = arg51?.bindings?.entity?.entityId || "") {
    const profiledComponent = this.profiledComponent(arg51, v70),
      runtimeEntityId4 = this.runtimeEntityId(v70),
      powerEntityId = this.powerEntityId(profiledComponent, v70);
    return !powerEntityId || (powerEntityId === runtimeEntityId4 && runtimeEntityId4 === v70)
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
  ["navigate"](arg52) {
    const v71 = this.document?.pages.find((arg53) => arg53.path === arg52);
    v71 &&
      (v71 !== this.page && this.closeRuntimeDialog(),
      (this.page = v71),
      window.clearTimeout(this.runtimeHydrationRetryTimer),
      (this.runtimeHydrationRetryTimer = null),
      (this.runtimeHydrationRetryAttempt = 0),
      this.preloadStaticImages(),
      this.renderComponents(),
      this.connectRuntime(),
      this.refreshHistorySeries(),
      this.options.onPageChange?.(v71));
  }
  ["setSelectedComponent"](arg54) {
    this.setSelectedComponents(arg54 ? [arg54] : [], arg54);
  }
  ["setSelectedComponents"](arg55, v72 = null) {
    ((this.selectedComponentIds = new Set(
      (arg55 || []).filter((arg56) => !!this.componentRecords.get(arg56)),
    )),
      (this.selectedComponentId = this.selectedComponentIds.has(v72)
        ? v72
        : this.selectedComponentIds.values().next().value || null),
      this.syncSelection());
  }
  ["setActiveGroup"](v73 = null) {
    ((this.activeGroupId = v73 && this.componentRecords.get(v73)?.type === "group" ? v73 : null),
      this.syncActiveGroup());
  }
  ["syncActiveGroup"]() {
    if (this.canvas) {
      this.canvas.classList.toggle("hb-editing-group", !!this.activeGroupId);
      for (const [v74, element17] of this.componentHosts)
        element17.classList.toggle(
          "hb-active-edit-group",
          v74 === this.activeGroupId && element17.parentElement === this.canvas,
        );
    }
  }
  ["setComponentSelectionLayer"](arg57, v75 = "button") {
    arg57 &&
      (v75 === "airflow"
        ? this.componentSelectionLayers.set(arg57, "airflow")
        : v75 === "effect"
          ? this.componentSelectionLayers.set(arg57, "effect")
          : v75 === "perspective"
            ? this.componentSelectionLayers.set(arg57, "perspective")
            : this.componentSelectionLayers.delete(arg57),
      this.syncSelection());
  }
  ["setComponentPreviewState"](arg58, v76 = "auto") {
    (v76 === "on" || v76 === "off"
      ? this.componentPreviewStates.set(arg58, v76)
      : this.componentPreviewStates.delete(arg58),
      this.previewComponentProperties(arg58));
  }
  ["previewComponentTransform"](arg59, v77 = {}) {
    const element18 = this.componentRecords.get(arg59),
      element19 = this.componentHosts.get(arg59);
    !element18 ||
      !element19 ||
      ((element18.position = {
        ...(element18.position || {}),
      }),
      (element18.style = {
        ...(element18.style || {}),
      }),
      Number.isFinite(v77.x) &&
        ((element18.position.x = v77.x), (element19.style.left = v77.x + "px")),
      Number.isFinite(v77.y) &&
        ((element18.position.y = v77.y), (element19.style.top = v77.y + "px")),
      Number.isFinite(v77.width) &&
        ((element18.position.width = v77.width), (element19.style.width = v77.width + "px")),
      Number.isFinite(v77.height) &&
        ((element18.position.height = v77.height), (element19.style.height = v77.height + "px")),
      Number.isFinite(v77.rotation) && (element18.position.rotation = v77.rotation),
      Number.isFinite(v77.scale) && (element18.style.scale = v77.scale),
      (Number.isFinite(v77.rotation) || Number.isFinite(v77.scale)) &&
        (element19.style.transform =
          "rotate(" +
          Number(element18.position.rotation || 0) +
          "deg) scale(" +
          Number(element18.style.scale || 1) +
          ")"),
      this.syncComponentSelectionOverlay(arg59),
      this.updateTransformHandleScale(element19, element18));
  }
  ["previewComponentProperties"](arg60, v78 = {}) {
    const v79 = this.componentRecords.get(arg60),
      element20 = this.componentHosts.get(arg60);
    if (!v79 || !element20) return;
    if (
      ((v79.properties = {
        ...(v79.properties || {}),
        ...v78,
      }),
      v79.type === "camera" &&
        Object.hasOwn(v78, "label") &&
        this.detailsDialog?.dataset?.componentId === arg60)
    ) {
      const selector = this.detailsDialog.querySelector(".hb-camera-preview-heading strong");
      selector && (selector.textContent = componentDialogTitle(v79, "摄像头实时预览"));
    }
    if (Number.isFinite(v78.opacity)) {
      const selector2 = element20.querySelector(".hb-image-component");
      selector2 && (selector2.style.opacity = String(Math.max(0, Math.min(1, v78.opacity))));
      const selector3 = element20.querySelector(".hb-vacuum-map-component");
      selector3 && (selector3.style.opacity = String(Math.max(0, Math.min(1, v78.opacity))));
    }
    if (v79.type === "light-statistics") {
      this.refreshRuntimeComponent(arg60);
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
    if (this.options.editable && list.includes(v79.type)) {
      this.refreshEditorComponent(arg60);
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
      ].includes(v79.type)
    ) {
      this.renderComponents();
      return;
    }
    if (v79.type === "navigation-button") {
      const v80 = [...element20.children].find(
          (arg61) => !arg61.classList.contains("hb-selection-bounds"),
        ),
        options4 = {
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
          previewState: this.componentPreviewStates.get(arg60) || "auto",
          isIconVisible: (arg62) => this.iconVisibilityState(arg62),
          navigate: (arg63) => this.navigate(arg63),
          cleanup: (arg64) => this.cleanups.push(arg64),
        },
        element21 = renderRegisteredComponent2(this.profiledComponent(v79), options4),
        v81 = Number(this.document.canvas.componentScale || 1);
      (v81 !== 1 &&
        ((element21.style.width = 100 / v81 + "%"),
        (element21.style.height = 100 / v81 + "%"),
        (element21.style.transform = "scale(" + v81 + ")"),
        (element21.style.transformOrigin = "top left")),
        v80 ? v80.replaceWith(element21) : element20.prepend(element21));
    }
  }
  ["syncSelection"]() {
    (this.canvas?.querySelectorAll(".hb-multi-selection-bounds").forEach((arg65) => arg65.remove()),
      this.canvas
        ?.querySelectorAll(".hb-component-selection-overlay")
        .forEach((arg66) => arg66.remove()),
      this.componentSelectionOverlays.clear());
    for (const element22 of this.componentAirflowLayers.values())
      element22
        .querySelectorAll(":scope > .hb-selection-bounds")
        .forEach((arg67) => arg67.remove());
    for (const [v82, element23] of this.componentHosts) {
      const v83 = this.componentRecords.get(v82),
        editable = this.options.editable && this.selectedComponentIds.has(v82),
        v84 = v83?.type === "floorplan-auto-diagram" && v83.properties?.generated !== true;
      if (
        ((element23.hidden = v84 ? !editable : v83?.style?.visible === false),
        element23.classList.toggle("selected", editable),
        element23.classList.toggle(
          "selection-primary",
          editable && v82 === this.selectedComponentId,
        ),
        element23.classList.toggle(
          "hb-light-statistics-selection-host",
          editable && this.selectedComponentIds.size === 1 && v83?.type === "light-statistics",
        ),
        element23
          .querySelectorAll(":scope > .hb-selection-bounds, :scope > .hb-transform-handle")
          .forEach((arg68) => arg68.remove()),
        !editable)
      )
        continue;
      const v85 =
          this.selectedComponentIds.size === 1 &&
          v82 === this.selectedComponentId &&
          v83?.type === "air-conditioner" &&
          this.componentSelectionLayers.get(v82) === "airflow",
        v86 =
          this.selectedComponentIds.size === 1 &&
          v82 === this.selectedComponentId &&
          v83?.type === "icon-button-effect" &&
          this.componentSelectionLayers.get(v82) === "effect",
        v87 =
          this.selectedComponentIds.size === 1 &&
          v82 === this.selectedComponentId &&
          v83?.type === "presence-sensor" &&
          v83?.properties?.sensorKind === "door-window" &&
          this.componentSelectionLayers.get(v82) === "perspective";
      if (v85) this.appendAirflowTransformHandles(this.componentAirflowLayers.get(v82), v83);
      else {
        if (
          v86 &&
          this.componentEffectLayers.get(v82) &&
          !this.componentEffectLayers.get(v82).hidden
        )
          this.appendEffectSelectionBounds(this.componentEffectLayers.get(v82), v83);
        else {
          if (v87) {
            const componentSelectionOverlay =
              this.createComponentSelectionOverlay(element23, v83) || element23;
            this.appendDoorWindowPerspectiveHandles(element23, v83, componentSelectionOverlay);
          } else {
            const v88 = this.selectedComponentIds.size === 1,
              componentSelectionOverlay2 = v88
                ? this.createComponentSelectionOverlay(element23, v83)
                : element23;
            this.appendTransformHandles(
              element23,
              v83,
              v88,
              componentSelectionOverlay2 || element23,
            );
          }
        }
      }
    }
    this.selectedComponentIds.size > 1 && this.appendMultiSelectionBounds();
  }
  ["selectedScaleRecords"]() {
    const map3 = [...this.selectedComponentIds].map((arg69) => ({
        component: this.componentRecords.get(arg69),
        host: this.componentHosts.get(arg69),
      })),
      value2 = map3[0]?.host?.parentElement || null;
    return map3.length < 2 ||
      map3.some(
        (arg70) =>
          !arg70.component ||
          !arg70.host ||
          arg70.host.parentElement !== value2 ||
          arg70.component.properties?.layoutMode === "fill",
      )
      ? []
      : map3;
  }
  ["componentParentTransform"](arg71) {
    let value3 = this.componentParentIds?.get(arg71) || null,
      num4 = 0,
      num5 = 1;
    const set = new Set();
    for (; value3 && !set.has(value3);) {
      set.add(value3);
      const v89 = this.componentRecords.get(value3);
      if (!v89) break;
      ((num4 += Number(v89.position?.rotation || 0)),
        (num5 *= Math.max(0.01, Math.min(5, Number(v89.style?.scale || 1)))),
        (value3 = this.componentParentIds?.get(value3) || null));
    }
    return {
      rotation: num4,
      scale: num5,
    };
  }
  ["componentTransformChain"](arg72) {
    const list2 = [];
    let v90 = arg72;
    const set2 = new Set();
    for (; v90 && !set2.has(v90);) {
      set2.add(v90);
      const v91 = this.componentRecords.get(v90);
      if (!v91) break;
      (list2.push(v91), (v90 = this.componentParentIds?.get(v90) || null));
    }
    return list2;
  }
  ["componentWorldTransform"](arg73) {
    return this.componentTransformChain(arg73).reduce(
      (arg74, arg75) => ({
        rotation: arg74.rotation + Number(arg75.position?.rotation || 0),
        scale: arg74.scale * Math.max(0.01, Math.min(5, Number(arg75.style?.scale || 1))),
      }),
      {
        rotation: 0,
        scale: 1,
      },
    );
  }
  ["worldPointToComponentLocal"](arg76, arg77, arg78) {
    let options5 = {
      x: Number(arg77 || 0),
      y: Number(arg78 || 0),
    };
    const reverse = this.componentTransformChain(arg76).reverse();
    for (const v92 of reverse) {
      const options6 = v92.position || {},
        v93 = Number(options6.width || 100),
        v94 = Number(options6.height || 100),
        max17 = Math.max(0.01, Math.min(5, Number(v92.style?.scale || 1))),
        v95 = (Number(options6.rotation || 0) * Math.PI) / 180,
        cos = Math.cos(v95),
        sin = Math.sin(v95),
        v96 = Number(options6.x || 0) + v93 / 2,
        v97 = Number(options6.y || 0) + v94 / 2,
        v98 = (options5.x - v96) / max17,
        v99 = (options5.y - v97) / max17;
      options5 = {
        x: v93 / 2 + v98 * cos + v99 * sin,
        y: v94 / 2 - v98 * sin + v99 * cos,
      };
    }
    return options5;
  }
  ["componentLocalPointToWorld"](arg79, arg80, arg81) {
    let options7 = {
      x: Number(arg80 || 0),
      y: Number(arg81 || 0),
    };
    for (const v100 of this.componentTransformChain(arg79)) {
      const options8 = v100.position || {},
        v101 = Number(options8.width || 100),
        v102 = Number(options8.height || 100),
        max18 = Math.max(0.01, Math.min(5, Number(v100.style?.scale || 1))),
        v103 = (Number(options8.rotation || 0) * Math.PI) / 180,
        v104 = (options7.x - v101 / 2) * max18,
        v105 = (options7.y - v102 / 2) * max18;
      options7 = {
        x: Number(options8.x || 0) + v101 / 2 + v104 * Math.cos(v103) - v105 * Math.sin(v103),
        y: Number(options8.y || 0) + v102 / 2 + v104 * Math.sin(v103) + v105 * Math.cos(v103),
      };
    }
    return options7;
  }
  ["componentVisualBounds"](arg82, v106 = null) {
    const options9 = arg82.position || {},
      max19 = Math.max(0.01, Number(options9.width || 100)),
      max20 = Math.max(0.01, Number(options9.height || 100));
    let v107 = max19,
      v108 = max20,
      num6 = 0,
      num7 = 0;
    if (arg82.type === "light-statistics" && v106) {
      const selector4 = v106.querySelector(":scope > .hb-selection-bounds"),
        list3 = selector4
          ? [
              Number.parseFloat(selector4.style.left),
              Number.parseFloat(selector4.style.top),
              Number.parseFloat(selector4.style.width),
              Number.parseFloat(selector4.style.height),
            ]
          : [];
      list3.every(Number.isFinite) &&
        list3[2] > 0 &&
        list3[3] > 0 &&
        ([num6, num7, v107, v108] = list3);
    }
    const max21 = Math.max(0.01, Math.min(5, Number(arg82.style?.scale || 1))),
      v109 = (Number(options9.rotation || 0) * Math.PI) / 180,
      v110 = v107 * max21,
      v111 = v108 * max21,
      v112 = (Math.abs(Math.cos(v109)) * v110 + Math.abs(Math.sin(v109)) * v111) / 2,
      v113 = (Math.abs(Math.sin(v109)) * v110 + Math.abs(Math.cos(v109)) * v111) / 2,
      v114 = Number(options9.x || 0) + max19 / 2,
      v115 = Number(options9.y || 0) + max20 / 2,
      v116 = Number(options9.x || 0) + num6 + v107 / 2,
      v117 = Number(options9.y || 0) + num7 + v108 / 2,
      v118 = (v116 - v114) * max21,
      v119 = (v117 - v115) * max21,
      v120 = v114 + v118 * Math.cos(v109) - v119 * Math.sin(v109),
      v121 = v115 + v118 * Math.sin(v109) + v119 * Math.cos(v109);
    return {
      left: v120 - v112,
      top: v121 - v113,
      right: v120 + v112,
      bottom: v121 + v113,
    };
  }
  ["scaleRecordsBounds"](arg83) {
    const map4 = arg83.map((arg84) => this.componentVisualBounds(arg84.component, arg84.host));
    return {
      left: Math.min(...map4.map((arg85) => arg85.left)),
      top: Math.min(...map4.map((arg86) => arg86.top)),
      right: Math.max(...map4.map((arg87) => arg87.right)),
      bottom: Math.max(...map4.map((arg88) => arg88.bottom)),
    };
  }
  ["refreshMultiSelectionBounds"]() {
    const element24 = this.canvas?.querySelector(".hb-multi-selection-bounds");
    if (!element24 || !this.selectedComponentIds || this.selectedComponentIds.size < 2) return;
    const edScaleRecords = this.selectedScaleRecords();
    if (!edScaleRecords.length) {
      element24.remove();
      return;
    }
    const scaleRecordsBounds = this.scaleRecordsBounds(edScaleRecords);
    (Object.assign(element24.style, {
      left: scaleRecordsBounds.left + "px",
      top: scaleRecordsBounds.top + "px",
      width: Math.max(1, scaleRecordsBounds.right - scaleRecordsBounds.left) + "px",
      height: Math.max(1, scaleRecordsBounds.bottom - scaleRecordsBounds.top) + "px",
    }),
      this.updateMultiSelectionHandleScale(element24));
  }
  ["updateMultiSelectionHandleScale"](arg89) {
    if (!arg89) return;
    const min8 = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1),
      value4 = arg89.parentElement?.dataset?.componentId || null,
      scale = value4 ? this.componentWorldTransform(value4).scale : 1,
      v122 = 1 / Math.max(0.001, min8 * scale);
    (arg89.style.setProperty("--hb-ui-scale", String(v122)),
      arg89.style.setProperty("--hb-handle-outset", 30 * v122 + "px"));
    const boundingClientRect = arg89.getBoundingClientRect();
    arg89.classList.toggle(
      "handles-outside",
      boundingClientRect.width < 132 || boundingClientRect.height < 112,
    );
  }
  ["appendMultiSelectionBounds"]() {
    const edScaleRecords2 = this.selectedScaleRecords();
    if (!edScaleRecords2.length) return;
    const scaleRecordsBounds2 = this.scaleRecordsBounds(edScaleRecords2),
      element25 = document.createElement("div");
    ((element25.className = "hb-selection-bounds hb-multi-selection-bounds"),
      Object.assign(element25.style, {
        left: scaleRecordsBounds2.left + "px",
        top: scaleRecordsBounds2.top + "px",
        width: Math.max(1, scaleRecordsBounds2.right - scaleRecordsBounds2.left) + "px",
        height: Math.max(1, scaleRecordsBounds2.bottom - scaleRecordsBounds2.top) + "px",
      }));
    for (const v123 of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const element26 = document.createElement("i");
      ((element26.className = "hb-corner-marker hb-corner-" + v123),
        element26.setAttribute("aria-hidden", "true"),
        element25.append(element26));
    }
    const element27 = document.createElement("button");
    ((element27.type = "button"),
      (element27.className = "hb-transform-handle hb-resize-handle"),
      (element27.title = "拖动整体缩放"),
      element27.addEventListener("pointerdown", (arg90) =>
        this.startComponentsScale(arg90, edScaleRecords2, scaleRecordsBounds2, element25),
      ));
    const element28 = document.createElement("button");
    ((element28.type = "button"),
      (element28.className = "hb-transform-handle hb-rotate-handle"),
      (element28.title = "拖动整体旋转"),
      element28.addEventListener("pointerdown", (arg91) =>
        this.startComponentsRotate(arg91, edScaleRecords2, scaleRecordsBounds2, element25),
      ),
      element25.append(element27, element28),
      (edScaleRecords2[0]?.host?.parentElement || this.canvas).append(element25),
      this.updateMultiSelectionHandleScale(element25));
  }
  ["previewComponentsTransform"](arg92, v124 = this.selectedComponentId) {
    for (const vector of arg92 || []) {
      const element29 = this.componentRecords.get(vector.componentId),
        element30 = this.componentHosts.get(vector.componentId);
      !element29 ||
        !element30 ||
        ((element29.position = {
          ...(element29.position || {}),
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
          (element29.style = {
            ...(element29.style || {}),
            scale: vector.scale,
          }),
        Number.isFinite(vector.rotation) && (element29.position.rotation = vector.rotation),
        Number.isFinite(vector.x) && (element30.style.left = vector.x + "px"),
        Number.isFinite(vector.y) && (element30.style.top = vector.y + "px"),
        (Number.isFinite(vector.scale) || Number.isFinite(vector.rotation)) &&
          (element30.style.transform =
            "rotate(" +
            Number(element29.position?.rotation || 0) +
            "deg) scale(" +
            Number(element29.style?.scale || 1) +
            ")"));
    }
    (this.syncSelection(), this.options.onComponentsTransformPreview?.(arg92, v124));
  }
  ["startComponentsScale"](arg93, arg94, arg95, arg96) {
    (arg93.preventDefault(), arg93.stopPropagation());
    const boundingClientRect2 = arg96.getBoundingClientRect(),
      v125 = boundingClientRect2.left + boundingClientRect2.width / 2,
      v126 = boundingClientRect2.top + boundingClientRect2.height / 2,
      max22 = Math.max(1, Math.hypot(arg93.clientX - v125, arg93.clientY - v126)),
      v127 = (arg95.left + arg95.right) / 2,
      v128 = (arg95.top + arg95.bottom) / 2,
      map5 = arg94.map((arg97) => {
        const options10 = arg97.component.position || {},
          v129 = Number(options10.width || 100),
          v130 = Number(options10.height || 100);
        return {
          ...arg97,
          width: v129,
          height: v130,
          centerX: Number(options10.x || 0) + v129 / 2,
          centerY: Number(options10.y || 0) + v130 / 2,
          scale: Math.max(0.01, Math.min(5, Number(arg97.component.style?.scale || 1))),
        };
      }),
      max23 = Math.max(...map5.map((arg98) => 0.01 / arg98.scale)),
      min9 = Math.min(...map5.map((arg99) => 5 / arg99.scale));
    let num8 = 1,
      list4 = [],
      v131 = false;
    const pointerId = arg93.pointerId;
    arg93.currentTarget.setPointerCapture(pointerId);
    const v132 = (arg100) => {
        if (arg100.pointerId !== pointerId) return;
        const hypot = Math.hypot(arg100.clientX - v125, arg100.clientY - v126);
        ((num8 = Math.max(max23, Math.min(min9, hypot / max22))),
          (list4 = map5.map((arg101) => {
            const v133 = v127 + (arg101.centerX - v127) * num8,
              v134 = v128 + (arg101.centerY - v128) * num8,
              v135 = arg101.scale * num8,
              v136 = v133 - arg101.width / 2,
              v137 = v134 - arg101.height / 2;
            return (
              (arg101.component.position = {
                ...(arg101.component.position || {}),
                x: v136,
                y: v137,
              }),
              (arg101.component.style = {
                ...(arg101.component.style || {}),
                scale: v135,
              }),
              (arg101.host.style.left = v136 + "px"),
              (arg101.host.style.top = v137 + "px"),
              (arg101.host.style.transform =
                "rotate(" +
                Number(arg101.component.position?.rotation || 0) +
                "deg) scale(" +
                v135 +
                ")"),
              {
                componentId: arg101.component.id,
                x: v136,
                y: v137,
                scale: v135,
              }
            );
          })),
          Object.assign(arg96.style, {
            left: v127 + (arg95.left - v127) * num8 + "px",
            top: v128 + (arg95.top - v128) * num8 + "px",
            width: Math.max(1, (arg95.right - arg95.left) * num8) + "px",
            height: Math.max(1, (arg95.bottom - arg95.top) * num8) + "px",
          }),
          this.updateMultiSelectionHandleScale(arg96),
          this.options.onComponentsTransformPreview?.(list4, this.selectedComponentId));
      },
      v138 = (v139 = null) => {
        v131 ||
          (v139?.pointerId != null && v139.pointerId !== pointerId) ||
          ((v131 = true),
          window.removeEventListener("pointermove", v132, true),
          window.removeEventListener("pointerup", v138, true),
          window.removeEventListener("pointercancel", v138, true),
          window.removeEventListener("blur", v138),
          num8 !== 1 &&
            list4.length &&
            this.options.onComponentsTransform?.(list4, this.selectedComponentId));
      };
    (window.addEventListener("pointermove", v132, true),
      window.addEventListener("pointerup", v138, true),
      window.addEventListener("pointercancel", v138, true),
      window.addEventListener("blur", v138));
  }
  ["startComponentsRotate"](arg102, arg103, arg104, arg105) {
    (arg102.preventDefault(), arg102.stopPropagation());
    const boundingClientRect3 = arg105.getBoundingClientRect(),
      v140 = boundingClientRect3.left + boundingClientRect3.width / 2,
      v141 = boundingClientRect3.top + boundingClientRect3.height / 2,
      v142 = (arg104.left + arg104.right) / 2,
      v143 = (arg104.top + arg104.bottom) / 2,
      map6 = arg103.map((arg106) => {
        const options11 = arg106.component.position || {},
          v144 = Number(options11.width || 100),
          v145 = Number(options11.height || 100);
        return {
          ...arg106,
          componentId: arg106.component.id,
          width: v144,
          height: v145,
          centerX: Number(options11.x || 0) + v144 / 2,
          centerY: Number(options11.y || 0) + v145 / 2,
          rotation: Number(options11.rotation || 0),
        };
      });
    let atan2 = Math.atan2(arg102.clientY - v141, arg102.clientX - v140),
      num9 = 0,
      list5 = [],
      v146 = false;
    const pointerId2 = arg102.pointerId;
    arg102.currentTarget.setPointerCapture(pointerId2);
    const v147 = (arg107) => {
        if (arg107.pointerId !== pointerId2) return;
        const atan22 = Math.atan2(arg107.clientY - v141, arg107.clientX - v140);
        let v148 = atan22 - atan2;
        (v148 > Math.PI ? (v148 -= Math.PI * 2) : v148 < -Math.PI && (v148 += Math.PI * 2),
          (num9 += (v148 * 180) / Math.PI),
          (atan2 = atan22),
          (list5 = rotateMultiSelectionTransforms2(map6, v142, v143, num9)));
        for (const vector2 of list5) {
          const v149 = map6.find((arg108) => arg108.componentId === vector2.componentId);
          v149 &&
            ((v149.component.position = {
              ...(v149.component.position || {}),
              x: vector2.x,
              y: vector2.y,
              rotation: vector2.rotation,
            }),
            (v149.host.style.left = vector2.x + "px"),
            (v149.host.style.top = vector2.y + "px"),
            (v149.host.style.transform =
              "rotate(" +
              vector2.rotation +
              "deg) scale(" +
              Number(v149.component.style?.scale || 1) +
              ")"));
        }
        ((arg105.style.transform = "rotate(" + num9 + "deg)"),
          (arg105.style.transformOrigin = "center center"),
          this.options.onComponentsTransformPreview?.(list5, this.selectedComponentId));
      },
      v150 = (v151 = null) => {
        v146 ||
          (v151?.pointerId != null && v151.pointerId !== pointerId2) ||
          ((v146 = true),
          window.removeEventListener("pointermove", v147, true),
          window.removeEventListener("pointerup", v150, true),
          window.removeEventListener("pointercancel", v150, true),
          window.removeEventListener("blur", v150),
          num9 !== 0 &&
            list5.length &&
            this.options.onComponentsTransform?.(list5, this.selectedComponentId));
      };
    (window.addEventListener("pointermove", v147, true),
      window.addEventListener("pointerup", v150, true),
      window.addEventListener("pointercancel", v150, true),
      window.addEventListener("blur", v150));
  }
  ["cleanupComponents"](v152 = false, v153 = new Set()) {
    (clearTimeout(this.stagePrewarmTimer),
      this.retainedInteraction3d &&
        !v153.has(this.retainedInteraction3d.component.id) &&
        this.releaseRetainedInteraction3d());
    for (const v154 of this.cleanups.splice(0)) v154();
    for (const v155 of [...this.componentCleanups.keys()])
      v153.has(v155) || this.cleanupRenderedComponent(v155);
    if (!v152) {
      for (const v156 of this.cameraCleanups.values()) for (const v157 of v156.splice(0)) v157();
      this.cameraCleanups.clear();
    }
  }
  ["registerComponentCleanup"](arg109, arg110) {
    !arg109 ||
      typeof arg110 != "function" ||
      (this.componentCleanups.has(arg109) || this.componentCleanups.set(arg109, []),
      this.componentCleanups.get(arg109).push(arg110));
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
          if (window.HABridgeDisplayBoot?.pending || document.hidden) {
            this.scheduleInteraction3dPrewarm();
            return;
          }
          const map7 = new Map(
              (this.document.sharedComponents || []).map((arg111) => [arg111.id, arg111]),
            ),
            v158 = (arg112) => [
              ...(arg112.components || []),
              ...(arg112.sharedComponentIds || [])
                .map((arg113) => map7.get(arg113))
                .filter(Boolean),
            ];
          if (
            collectComponents2(v158(this.page), (arg114) => arg114.type === "interaction3d").length
          )
            return;
          const v159 = this.document.pages
            .filter((arg115) => arg115 !== this.page)
            .flatMap(v158)
            .find(
              (arg116) =>
                arg116.type === "interaction3d" &&
                arg116.style?.visible !== false &&
                arg116.properties?.sceneId,
            );
          if (!v159) return;
          this.prewarmingStageId = v159.id;
          try {
            this.renderComponent(v159, this.canvas);
          } finally {
            this.prewarmingStageId = null;
          }
          const element31 = this.componentHosts.get(v159.id);
          ((element31.inert = true),
            (element31.style.opacity = "0"),
            (element31.style.pointerEvents = "none"),
            element31.setAttribute("aria-hidden", "true"),
            (this.retainedInteraction3d = {
              component: structuredClone(v159),
              host: element31,
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
  ["cleanupRenderedComponent"](arg117) {
    const list6 = this.componentCleanups.get(arg117) || [];
    this.componentCleanups.delete(arg117);
    for (const v160 of list6.splice(0)) v160();
  }
  ["render"](v161 = null) {
    const v162 = !!(
      v161?.size &&
      this.canvas?.isConnected &&
      this.viewport?.isConnected &&
      [...v161.values()].some((arg118) => arg118.parentElement === this.canvas)
    );
    (v162 || (this.cleanupComponents(), this.container.replaceChildren()),
      (this.container.dataset.uiPack = this.document?.uiPack?.id || "ui.base"),
      (this.container.dataset.uiTheme = this.document?.theme?.name || ""));
    for (const v163 of this.themeVariableNames) this.container.style.removeProperty(v163);
    this.themeVariableNames.clear();
    for (const [v164, v165] of Object.entries(this.document?.theme?.variables || {})) {
      const v166 = String(v164).startsWith("--") ? String(v164) : "--" + v164;
      /^--[a-zA-Z0-9_-]+$/.test(v166) &&
        (this.container.style.setProperty(v166, String(v165)), this.themeVariableNames.add(v166));
    }
    if (!v162) {
      const element32 = document.createElement("div");
      element32.className =
        "hb-renderer-viewport" + (this.options.editable ? "" : " hb-runtime-no-select");
      const element33 = document.createElement("div");
      ((element33.className = "hb-renderer-canvas"),
        element32.append(element33),
        this.container.append(element32),
        (this.viewport = element32),
        (this.canvas = element33));
    }
    ((this.viewport.className =
      "hb-renderer-viewport" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (this.canvas.style.width = this.document.canvas.width + "px"),
      (this.canvas.style.height = this.document.canvas.height + "px"),
      (this.canvas.style.background =
        this.document.canvas.background?.type === "color"
          ? this.document.canvas.background.color || "#0b1116"
          : ""),
      this.renderComponents(v162, v161),
      this.resize());
  }
  ["renderComponents"](v167 = false, v168 = null) {
    if (!this.canvas || !this.page) return;
    const map8 = new Map(
        (this.document.sharedComponents || []).map((arg119) => [arg119.id, arg119]),
      ),
      filter3 = (this.page.sharedComponentIds || [])
        .map((arg120) => map8.get(arg120))
        .filter(Boolean),
      set3 = new Set(
        collectComponents2([...(this.page.components || []), ...filter3], () => true).map(
          (arg121) => arg121.id,
        ),
      );
    this.states.set("virtual.icon_visibility.current", {
      entityId: "virtual.icon_visibility.current",
      state: this.iconVisibilityState() ? "on" : "off",
      attributes: {},
    });
    const map9 = new Map([
        ...(v167
          ? [...this.componentHosts].filter(([v169]) =>
              ["camera", "vacuum-map", "floorplan-auto-diagram"].includes(
                this.componentRecords.get(v169)?.type,
              ),
            )
          : []),
        ...(v168 && typeof v168[Symbol.iterator] == "function" ? v168 : []),
      ]),
      map10 = new Map(
        collectComponents2([...(this.page.components || []), ...filter3], () => true).map(
          (arg122) => [arg122.id, arg122],
        ),
      ),
      filter4 = [...map10.values()].filter((arg123) => arg123.type === "interaction3d"),
      array =
        !this.options?.editable && !this.replacingDocument && Array.isArray(this.document.pages),
      map11 = array
        ? new Map(
            collectComponents2(
              [
                ...(this.document.sharedComponents || []),
                ...this.document.pages.flatMap((arg124) => arg124.components || []),
              ],
              (arg125) => arg125.type === "interaction3d",
            ).map((arg126) => [arg126.id, arg126]),
          )
        : new Map(),
      v170 = (arg127, arg128) =>
        arg128?.type === "interaction3d" &&
        arg127.properties?.sceneId === arg128.properties?.sceneId &&
        arg127.properties?.lightingMode === arg128.properties?.lightingMode;
    let retainedInteraction3d2 = this.retainedInteraction3d;
    if (
      (retainedInteraction3d2 &&
        (!array ||
          retainedInteraction3d2.host.parentElement !== this.canvas ||
          !v170(retainedInteraction3d2.component, map11.get(retainedInteraction3d2.component.id)) ||
          filter4.some((arg129) => arg129.id !== retainedInteraction3d2.component.id)) &&
        (this.releaseRetainedInteraction3d(), (retainedInteraction3d2 = null)),
      array && !retainedInteraction3d2 && !filter4.length)
    )
      for (const [v171, element34] of this.componentHosts) {
        const v172 = this.componentRecords.get(v171);
        if (!(
          v172?.type !== "interaction3d" ||
          element34.parentElement !== this.canvas ||
          !v170(v172, map11.get(v171))
        )) {
          ((retainedInteraction3d2 = {
            component: structuredClone(v172),
            host: element34,
            timer: null,
          }),
            (this.retainedInteraction3d = retainedInteraction3d2),
            (element34.hidden = true),
            (element34.inert = true),
            element34.querySelector(".hb-interaction3d-host")?.setInteraction3dPageVisible?.(false),
            (retainedInteraction3d2.timer = setTimeout(() => {
              this.retainedInteraction3d === retainedInteraction3d2 &&
                this.releaseRetainedInteraction3d();
            }, 120000)));
          break;
        }
      }
    retainedInteraction3d2 &&
      map9.set(retainedInteraction3d2.component.id, retainedInteraction3d2.host);
    for (const [v173, element35] of this.componentHosts)
      (v167 || array) &&
        this.componentRecords.get(v173)?.type === "interaction3d" &&
        element35.parentElement === this.canvas &&
        set3.has(v173) &&
        map9.set(v173, element35);
    const set4 = new Set();
    for (const [v174] of map9) {
      if (retainedInteraction3d2?.component.id === v174) {
        set4.add(v174);
        continue;
      }
      this.componentRecords.get(v174)?.type === "interaction3d" &&
        (map10.get(v174)?.type === "interaction3d" ? set4.add(v174) : map9.delete(v174));
    }
    const map12 = new Map(
      [...this.canvas.querySelectorAll(".hb-icon-button-effect-layer[data-effect-for]")].map(
        (arg130) => [arg130.dataset.effectFor, arg130],
      ),
    );
    this.cleanupComponents(v167, set4);
    const set5 = new Set(
      [...map9.values()].filter(
        (arg131) =>
          arg131.parentElement === this.canvas &&
          (set3.has(arg131.dataset.componentId) || arg131 === retainedInteraction3d2?.host) &&
          (arg131.querySelector(".hb-floorplan-auto-diagram-preview") ||
            set4.has(arg131.dataset.componentId)),
      ),
    );
    if (set5.size) {
      for (const v175 of [...this.canvas.children]) set5.has(v175) || v175.remove();
    } else this.canvas.replaceChildren();
    (this.componentHosts.clear(),
      this.componentRecords.clear(),
      this.componentAirflowLayers.clear(),
      this.componentEffectLayers.clear(),
      this.componentSelectionOverlays.clear(),
      this.runtimeEntityComponentIndex.clear(),
      this.componentParentIds.clear());
    for (const v176 of this.page.components || [])
      this.renderComponent(v176, this.canvas, 0, map9, map12);
    for (const v177 of filter3) this.renderComponent(v177, this.canvas, 100000, map9, map12);
    (retainedInteraction3d2 &&
      map10.has(retainedInteraction3d2.component.id) &&
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
  ["registerRuntimeStateHandler"](arg132, arg133, v178 = null) {
    const v179 = String(arg132 || "");
    if (!v179 || typeof arg133 != "function") return;
    (this.runtimeStateHandlers.has(v179) || this.runtimeStateHandlers.set(v179, new Set()),
      this.runtimeStateHandlers.get(v179).add(arg133));
    const v180 = () => {
      const v181 = this.runtimeStateHandlers.get(v179);
      (v181?.delete(arg133), v181?.size === 0 && this.runtimeStateHandlers.delete(v179));
    };
    v178 ? this.registerComponentCleanup(v178, v180) : this.cleanups.push(v180);
  }
  ["registerHistoryChartRefresher"](arg134, v182 = null) {
    if (typeof arg134 != "function") return;
    this.historyChartRefreshers.add(arg134);
    const v183 = () => this.historyChartRefreshers.delete(arg134);
    v182 ? this.registerComponentCleanup(v182, v183) : this.cleanups.push(v183);
  }
  ["applyRuntimeStateHandlers"](arg135, arg136) {
    for (const v184 of this.runtimeStateHandlers.get(String(arg135 || "")) || []) v184(arg136);
  }
  ["runtimeEntityIdsForComponent"](arg137) {
    const vector3 = collectEntityIds2([
        {
          ...arg137,
          children: [],
        },
      ]),
      text3 = arg137?.bindings?.entity?.entityId || "";
    if (text3) {
      vector3.add(text3);
      const powerEntityId2 = this.powerEntityId(arg137, text3);
      powerEntityId2 && vector3.add(powerEntityId2);
      const deviceProfile2 = this.deviceProfile(text3);
      for (const v185 of Object.values(deviceProfile2?.roles || {})) v185 && vector3.add(v185);
    }
    return [...vector3].map((arg138) => String(arg138 || "")).filter(Boolean);
  }
  ["indexRuntimeComponent"](arg139) {
    for (const v186 of this.runtimeEntityIdsForComponent(arg139))
      (this.runtimeEntityComponentIndex.has(v186) ||
        this.runtimeEntityComponentIndex.set(v186, new Set()),
        this.runtimeEntityComponentIndex.get(v186).add(arg139.id));
  }
  ["unindexRuntimeComponent"](arg140) {
    for (const [v187, v188] of this.runtimeEntityComponentIndex)
      (v188.delete(arg140), v188.size || this.runtimeEntityComponentIndex.delete(v187));
  }
  ["runtimeComponentContent"](arg141) {
    return (
      [...(arg141?.children || [])].find(
        (arg142) =>
          !arg142.classList.contains("hb-component") &&
          !arg142.classList.contains("hb-runtime-action-hitbox") &&
          !arg142.classList.contains("hb-selection-bounds") &&
          !arg142.classList.contains("hb-transform-handle"),
      ) || null
    );
  }
  ["refreshRuntimeComponent"](arg143) {
    const v189 = this.componentRecords.get(arg143),
      element36 = this.componentHosts.get(arg143);
    if (!v189 || !element36 || !element36.isConnected) return;
    if (v189.type === "interaction3d") {
      element36.querySelector(".hb-interaction3d-host")?.updateInteraction3d?.(v189, this.document);
      return;
    }
    this.cleanupRenderedComponent(arg143);
    const options12 = {
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
        previewState: this.componentPreviewStates.get(arg143) || "auto",
        isIconVisible: (arg144) => this.iconVisibilityState(arg144),
        navigate: (arg145) => this.navigate(arg145),
        callEntityService: (...v190) => this.callEntityService(...v190),
        openCameraPreview: (arg146, arg147, arg148) =>
          this.openInteraction3dCameraPreview(arg146, arg147, arg148),
        openVacuumDetails: (arg149, arg150, arg151) =>
          this.openInteraction3dVacuumDetails(arg149, arg150, arg151),
        runVacuumRoom: (arg152) =>
          this.dispatchAction(
            {
              id: v189.id + ":room:" + arg152.id,
              type: "device-button",
              properties: {
                label: arg152.label,
              },
              bindings: {
                entity: {
                  entityId: arg152.entityId,
                },
              },
            },
            {
              type: "toggle",
              data: {},
            },
          ),
        onError: (arg153) => this.options.onError?.(arg153),
        registerRuntimeStateHandler: (arg154, arg155) =>
          this.registerRuntimeStateHandler(arg154, arg155, arg143),
        runtimeStateReady: () => this.runtimeSnapshotReady === true,
        invalidate: () => this.refreshRuntimeComponent(arg143),
        cleanup: (arg156) => this.registerComponentCleanup(arg143, arg156),
      },
      element37 = renderRegisteredComponent2(this.runtimePowerComponent(v189), options12),
      v191 = Number(this.document.canvas.componentScale || 1);
    v191 !== 1 &&
      ((element37.style.width = 100 / v191 + "%"),
      (element37.style.height = 100 / v191 + "%"),
      (element37.style.transform = "scale(" + v191 + ")"),
      (element37.style.transformOrigin = "top left"));
    const runtimeComponentContent = this.runtimeComponentContent(element36);
    if (
      (runtimeComponentContent
        ? runtimeComponentContent.replaceWith(element37)
        : element36.prepend(element37),
      v189.type === "title-button" || v189.type === "light-statistics")
    ) {
      const selector5 = element36.querySelector(":scope > .hb-runtime-action-hitbox");
      if (selector5) {
        const lightStatisticsSelectionBounds =
          v189.type === "light-statistics"
            ? this.updateLightStatisticsSelectionBounds(element36, v189, selector5)
            : this.updateTitleButtonSelectionBounds(element36, v189, selector5);
        selector5.hidden = !lightStatisticsSelectionBounds;
      }
    }
    if (v189.type === "light-statistics") {
      const selector6 =
        this.componentSelectionOverlays
          .get(arg143)
          ?.querySelector(":scope > .hb-selection-bounds") ||
        element36.querySelector(":scope > .hb-selection-bounds");
      (selector6 &&
        (this.updateLightStatisticsSelectionBounds(element36, v189, selector6) ||
          Object.assign(selector6.style, {
            left: "0",
            top: "0",
            width: "100%",
            height: "100%",
          }),
        this.updateTransformHandleScale(element36, v189, selector6)),
        this.refreshMultiSelectionBounds());
    }
  }
  ["refreshEditorComponent"](arg157) {
    if (!this.options.editable) return false;
    const v192 = this.componentRecords.get(arg157),
      element38 = this.componentHosts.get(arg157);
    if (!v192 || !element38?.isConnected) return false;
    const parentElement = element38.parentElement;
    if (!parentElement) return false;
    const num10 =
      parentElement === this.canvas && (this.page.sharedComponentIds || []).includes(v192.id)
        ? 100000
        : 0;
    if (v192.type === "interaction3d" || v192.type === "group")
      return (
        this.renderComponent(v192, parentElement, num10, new Map([[v192.id, element38]])),
        this.syncSelection(),
        true
      );
    if (v192.type === "floorplan-auto-diagram") {
      const v193 =
          v192.properties?.previewReady === true &&
          (v192.properties?.generated !== true || v192.properties?.previewing === true),
        selector7 = element38.querySelector(".hb-floorplan-auto-diagram-preview");
      if (!!selector7 === v193) {
        const options13 = v192.position || {},
          v194 = parentElement === this.canvas && v192.properties?.layoutMode === "fill",
          options14 = v194
            ? {
                ...options13,
                x: 0,
                y: 0,
                width: Number(this.document.canvas?.width || 2778),
                height: Number(this.document.canvas?.height || 1940),
                rotation: 0,
              }
            : options13,
          max24 = Math.max(0.01, Math.min(5, Number(v192.style?.scale || 1))),
          v195 = num10 + Number(options14.zIndex || 1),
          v196 = componentHostZIndex2(v192, v195, parentElement === this.canvas);
        (Object.assign(element38.style, {
          left: (options14.x || 0) + "px",
          top: (options14.y || 0) + "px",
          width: (options14.width || 100) + "px",
          height: (options14.height || 100) + "px",
          zIndex: String(v196),
          transform:
            "rotate(" + (options14.rotation || 0) + "deg) scale(" + (v194 ? 1 : max24) + ")",
        }),
          element38.style.setProperty("--hb-component-z", String(v196)),
          element38.classList.toggle("layout-fill", v194));
        const selector8 = element38.querySelector(".hb-floorplan-auto-diagram-preview-hint"),
          v197 = v192.properties?.interactionMode === "view";
        return (
          selector7?.classList.toggle("is-view-mode", v197),
          selector7?.classList.toggle("is-position-mode", !v197),
          selector8 &&
            (selector8.textContent = v197
              ? "拖动旋转 · 右键平移 · 滚轮缩放"
              : "拖动控件调整位置，右下角调整大小"),
          this.syncSelection(),
          this.updateTransformHandleScale(element38, v192),
          true
        );
      }
    }
    const nextSibling = element38.nextSibling;
    this.cleanupRenderedComponent(arg157);
    for (const v198 of this.cameraCleanups.get(arg157)?.splice(0) || []) v198();
    (this.cameraCleanups.delete(arg157),
      this.componentEffectLayers.get(arg157)?.remove(),
      this.componentEffectLayers.delete(arg157),
      this.componentAirflowLayers.get(arg157)?.remove(),
      this.componentAirflowLayers.delete(arg157),
      element38.remove(),
      this.renderComponent(v192, parentElement, num10));
    const v199 = this.componentHosts.get(arg157);
    return (
      v199 &&
        nextSibling?.parentElement === parentElement &&
        parentElement.insertBefore(v199, nextSibling),
      this.syncSelection(),
      true
    );
  }
  ["refreshRuntimeComponents"](arg158) {
    const set6 = new Set();
    for (const v200 of arg158 || [])
      for (const v201 of this.runtimeEntityComponentIndex.get(String(v200 || "")) || [])
        set6.add(v201);
    if (!set6.size) return;
    const set7 = new Set([
        "icon-button-effect",
        "icon-button",
        "device-button",
        "navigation-button",
        "air-conditioner",
        "scene-mode",
      ]),
      set8 = new Set(
        [...set6].filter((arg159) => set7.has(this.componentRecords.get(arg159)?.type)),
      );
    set8.size && this.updateOptimisticToggleVisuals("", set8);
    for (const v202 of set6) {
      const v203 = this.componentRecords.get(v202);
      if (!(
        !v203 ||
        set7.has(v203.type) ||
        ["line-chart", "camera", "vacuum-map"].includes(v203.type)
      )) {
        if (v203.type === "flow-line") {
          this.componentHosts
            .get(v202)
            ?.querySelector(".hb-flow-line")
            ?.syncFlowLineState?.(this.states.get(v203.bindings?.entity?.entityId));
          continue;
        }
        this.refreshRuntimeComponent(v202);
      }
    }
  }
  ["applyEditorComponentUpdates"](arg160, arg161, v204 = []) {
    if (!this.options.editable || !this.document || !Array.isArray(v204)) return false;
    const filter5 = v204
      .map((arg162) => ({
        componentId: String(arg162?.componentId || ""),
        component: arg162?.component,
      }))
      .filter((arg163) => arg163.componentId && arg163.component);
    if (
      filter5.length !== v204.length ||
      filter5.some(({ componentId: v205, component: v206 }) => {
        const v207 = this.componentRecords.get(v205);
        return !v207 || !this.componentHosts.get(v205)?.isConnected || v207.type !== v206.type;
      })
    )
      return false;
    const set9 = new Set();
    for (const { componentId: v208 } of filter5) {
      const v209 = this.componentRecords.get(v208);
      for (const v210 of this.runtimeEntityIdsForComponent(v209)) set9.add(v210);
    }
    ((this.document = arg160),
      (this.page =
        this.document.pages?.find((arg164) => arg164.path === arg161) ||
        this.document.pages?.find((arg165) => arg165.path === this.document.defaultPagePath) ||
        this.document.pages?.[0] ||
        null));
    for (const { componentId: v211, component: v212 } of filter5) {
      const element39 = this.componentRecords.get(v211);
      this.unindexRuntimeComponent(v211);
      const { children: v213, ...v214 } = v212;
      for (const v215 of Object.keys(element39)) delete element39[v215];
      (Object.assign(element39, structuredClone(v214)),
        v213 && (element39.children = v213.map((arg166) => this.componentRecords.get(arg166.id))),
        this.indexRuntimeComponent(element39));
    }
    const set10 = new Set(filter5.map(({ componentId: v216 }) => v216));
    for (const { componentId: v217 } of filter5) {
      const element40 = this.componentRecords.get(v217);
      if (element40.type === "group") {
        for (const v218 of collectComponents2(element40.children || [], (arg167) =>
          ["icon-button-effect", "interaction3d", "floorplan-auto-diagram"].includes(arg167.type),
        ))
          set10.add(v218.id);
      }
    }
    for (const v219 of set10) this.refreshEditorComponent(v219);
    this.syncSelection();
    const set11 = new Set();
    for (const { componentId: v220 } of filter5)
      for (const v221 of this.runtimeEntityIdsForComponent(this.componentRecords.get(v220)))
        set11.add(v221);
    return (
      (set9.size !== set11.size || [...set9].some((arg168) => !set11.has(arg168))) &&
        this.connectRuntime(),
      true
    );
  }
  ["scheduleRuntimeRender"](arg169, v222 = 120) {
    this.destroyed ||
      !this.document ||
      !arg169 ||
      (this.runtimeRenderEntityIds.add(String(arg169)),
      window.clearTimeout(this.runtimeRenderTimer),
      (this.runtimeRenderTimer = window.setTimeout(
        () => {
          this.runtimeRenderTimer = 0;
          const list7 = [...this.runtimeRenderEntityIds];
          (this.runtimeRenderEntityIds.clear(),
            this.destroyed || this.refreshRuntimeComponents(list7));
        },
        Math.max(0, Number(v222) || 0),
      )));
  }
  ["setEffectLayerActive"](arg170, arg171, v223 = 0) {
    if (!arg170) return;
    arg171 &&
      this.runtimeEffectImageLoader.promote(
        arg170.querySelector(":scope > img[data-effect-source]"),
      );
    const v224 = arg170.classList.contains("active") !== arg171;
    (window.clearTimeout(arg170.hbTransitionTimer),
      arg170.classList.remove("is-transitioning"),
      v224 && v223 > 0 && (arg170.classList.add("is-transitioning"), arg170.offsetWidth),
      arg170.classList.toggle("active", arg171),
      v224 &&
        v223 > 0 &&
        (arg170.hbTransitionTimer = window.setTimeout(
          () => {
            (arg170.classList.remove("is-transitioning"), (arg170.hbTransitionTimer = null));
          },
          v223 * 1000 + 80,
        )));
  }
  ["syncEffectLayerLightVisual"](arg172, arg173) {
    if (!arg173 || arg172?.type !== "icon-button-effect") return;
    const options15 = arg172.properties || {},
      v225 = String(arg172?.bindings?.entity?.entityId || "");
    arg173.classList.toggle(
      "awaiting-light-visual",
      iconButtonEffectLightVisualAwaiting2(arg172, {
        editable: this.options.editable,
        states: this.states,
        pendingOptimisticState: this.pendingOptimisticStates.get(v225),
      }),
    );
    const v226 = iconButtonEffectLightVisualState2(arg172, {
        states: this.states,
      }),
      v227 = Number(options15.effectOpacity ?? 1),
      max25 = Number.isFinite(v227) ? Math.max(0, Math.min(1, v227)) : 1;
    arg173.style.setProperty("--hb-effect-image-opacity", String(max25 * v226.opacity));
    const selector9 = arg173.querySelector(":scope > img");
    selector9 && (selector9.style.filter = v226.filter);
  }
  ["cachedLightVisualState"](arg174) {
    const v228 = String(arg174 || "");
    if (!v228.startsWith("light.")) return null;
    const v229 = this.confirmedLightVisualStates.get(v228);
    if (v229) return v229;
    try {
      const v230 = JSON.parse(
        window.localStorage?.getItem("ha-bridge:light-visual:" + v228) || "null",
      );
      if (!v230?.attributes || Date.now() - Number(v230.at || 0) > 720 * 60 * 60 * 1000)
        return null;
      const options16 = {
        entityId: v228,
        state: "on",
        attributes: v230.attributes,
      };
      return (this.confirmedLightVisualStates.set(v228, options16), options16);
    } catch {
      return null;
    }
  }
  ["rememberLightVisualState"](arg175, arg176) {
    const v231 = String(arg175 || ""),
      v232 = arg176?.newState || arg176;
    if (!v231.startsWith("light.") || !v232?.attributes) return;
    const attributes = v232.attributes,
      v233 = (arg177) =>
        attributes[arg177] !== null &&
        attributes[arg177] !== undefined &&
        attributes[arg177] !== "" &&
        Number.isFinite(Number(attributes[arg177]));
    if (!v233("brightness") && !v233("color_temp_kelvin") && !v233("color_temp")) return;
    const options17 = {
      ...(this.cachedLightVisualState(v231)?.attributes || {}),
    };
    for (const v234 of [
      "brightness",
      "color_temp_kelvin",
      "color_temp",
      "color_mode",
      "supported_color_modes",
    ])
      attributes[v234] !== null &&
        attributes[v234] !== undefined &&
        attributes[v234] !== "" &&
        (options17[v234] = Array.isArray(attributes[v234])
          ? [...attributes[v234]]
          : attributes[v234]);
    const options18 = {
      entityId: v231,
      state: "on",
      attributes: options17,
    };
    this.confirmedLightVisualStates.set(v231, options18);
    try {
      window.localStorage?.setItem(
        "ha-bridge:light-visual:" + v231,
        JSON.stringify({
          at: Date.now(),
          attributes: options17,
        }),
      );
    } catch {}
  }
  ["optimisticStateIsConfirmed"](arg178, arg179) {
    const v235 = this.pendingOptimisticStates.get(String(arg178 || ""));
    if (!v235) return true;
    if (Date.now() >= v235.expiresAt)
      return (this.pendingOptimisticStates.delete(String(arg178 || "")), true);
    const v236 = [...this.componentRecords.values()].find((arg180) => {
      const v237 = arg180.bindings?.entity?.entityId;
      return v237 && this.powerEntityId(arg180, v237) === String(arg178);
    });
    return entityPowerIsOn2(String(arg178 || ""), arg179?.newState || arg179, v236 || {}) ===
      v235.desiredActive
      ? v235.desiredActive === true &&
        v236?.type === "icon-button-effect" &&
        iconButtonEffectLightVisualAwaiting2(v236, {
          states: new Map([[String(arg178 || ""), arg179?.newState || arg179]]),
        })
        ? false
        : (this.rememberLightVisualState?.(arg178, arg179),
          this.pendingOptimisticStates.delete(String(arg178 || "")),
          true)
      : false;
  }
  ["updateOptimisticToggleVisuals"](arg181, v238 = null) {
    for (const [v239, v240] of this.componentRecords) {
      const v241 = v240.bindings?.entity?.entityId,
        powerEntityId3 = v241 ? this.powerEntityId(v240, v241) : "";
      if (!v241 || (v238 ? !v238.has(v239) : powerEntityId3 !== arg181)) continue;
      if (v240.type === "scene-mode") {
        this.componentHosts
          .get(v239)
          ?.querySelector(".hb-scene-mode")
          ?.sceneModeController?.update(
            this.states.get(v241),
            this.componentPreviewStates.get(v239) || "auto",
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
        ].includes(v240.type)
      )
        continue;
      const v242 = this.states.get(powerEntityId3),
        startsWith = String(powerEntityId3 || "").startsWith("cover."),
        v243 =
          startsWith && coverComponentIsDream2(v240, powerEntityId3, v242, this.entityMetadata),
        runtimePowerComponent = this.runtimePowerComponent(v240, v241),
        v244 = startsWith
          ? v243
            ? runtimeEntityStateIsActive2(v242)
            : runtimeCoverStateIsActive2(v242)
          : entityPowerIsOn2(powerEntityId3, v242, runtimePowerComponent),
        text4 = this.componentPreviewStates.get(v239) || "auto",
        v245 =
          text4 === "on"
            ? true
            : text4 === "off"
              ? false
              : startsWith &&
                  coverMotorIsReversedForComponent2(
                    v240,
                    this.entityMetadata,
                    this.states,
                    powerEntityId3,
                  )
                ? !v244
                : v244,
        element41 = this.componentHosts.get(v239);
      if ((this.cleanupRenderedComponent(v239), element41 && v240.type === "icon-button-effect")) {
        const selector10 = element41.querySelector(":scope > .hb-icon-button-effect"),
          options19 = {
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
            previewState: this.componentPreviewStates.get(v239) || "auto",
            isIconVisible: (arg182) => this.iconVisibilityState(arg182),
            navigate: (arg183) => this.navigate(arg183),
            invalidate: () => this.updateOptimisticToggleVisuals("", new Set([v239])),
            cleanup: (arg184) => this.registerComponentCleanup(v239, arg184),
          },
          element42 = renderRegisteredComponent2(runtimePowerComponent, options19),
          v246 = Number(this.document.canvas.componentScale || 1);
        (v246 !== 1 &&
          ((element42.style.width = 100 / v246 + "%"),
          (element42.style.height = 100 / v246 + "%"),
          (element42.style.transform = "scale(" + v246 + ")"),
          (element42.style.transformOrigin = "top left")),
          selector10 ? selector10.replaceWith(element42) : element41.prepend(element42));
      }
      if (element41 && ["icon-button", "device-button", "navigation-button"].includes(v240.type)) {
        const selector11 =
            v240.type === "navigation-button"
              ? element41.querySelector(":scope > .hb-navigation-button")
              : element41.querySelector(":scope > .hb-icon-button"),
          options20 = {
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
            previewState: this.componentPreviewStates.get(v239) || "auto",
            isIconVisible: (arg185) => this.iconVisibilityState(arg185),
            navigate: (arg186) => this.navigate(arg186),
            invalidate: () => this.updateOptimisticToggleVisuals("", new Set([v239])),
            cleanup: (arg187) => this.registerComponentCleanup(v239, arg187),
          },
          element43 = renderRegisteredComponent2(runtimePowerComponent, options20),
          v247 = Number(this.document.canvas.componentScale || 1);
        if (
          (v247 !== 1 &&
            ((element43.style.width = 100 / v247 + "%"),
            (element43.style.height = 100 / v247 + "%"),
            (element43.style.transform = "scale(" + v247 + ")"),
            (element43.style.transformOrigin = "top left")),
          selector11 ? selector11.replaceWith(element43) : element41.prepend(element43),
          v240.type === "device-button")
        ) {
          const selector12 = element41.querySelector(":scope > .hb-runtime-action-hitbox");
          selector12 &&
            (selector12.hidden = !this.updateDeviceButtonSelectionBounds(
              element41,
              v240,
              selector12,
            ));
        }
      }
      if (element41 && v240.type === "air-conditioner") {
        const options21 = {
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
            previewState: this.componentPreviewStates.get(v239) || "auto",
            isIconVisible: (arg188) => this.iconVisibilityState(arg188),
            navigate: (arg189) => this.navigate(arg189),
            invalidate: () => this.updateOptimisticToggleVisuals("", new Set([v239])),
            cleanup: (arg190) => this.registerComponentCleanup(v239, arg190),
          },
          selector13 = element41.querySelector(":scope > .hb-air-conditioner"),
          element44 = renderRegisteredComponent2(runtimePowerComponent, options21),
          v248 = Number(this.document.canvas.componentScale || 1);
        (v248 !== 1 &&
          ((element44.style.width = 100 / v248 + "%"),
          (element44.style.height = 100 / v248 + "%"),
          (element44.style.transform = "scale(" + v248 + ")"),
          (element44.style.transformOrigin = "top left")),
          selector13 ? selector13.replaceWith(element44) : element41.prepend(element44),
          this.componentAirflowLayers.get(v239)?.remove(),
          this.componentAirflowLayers.delete(v239));
        const element45 = renderAirConditionerAirflowLayer2(runtimePowerComponent, options21);
        if (element45) {
          const v249 = element41.parentElement !== this.canvas,
            v250 = airflowLayerGeometry2(v240, {
              grouped: v249,
            }),
            v251 = Number(
              element41.style.getPropertyValue("--hb-component-z") || v240.position?.zIndex || 1,
            );
          ((element45.dataset.airflowFor = v239),
            (element45.hidden = v240.style?.visible === false),
            Object.assign(element45.style, {
              left: v250.left + "px",
              top: v250.top + "px",
              width: v250.width + "px",
              height: v250.height + "px",
              zIndex: String(v251),
              transform: "rotate(" + v250.rotation + "deg) scale(" + v250.scale + ")",
            }),
            v249 ? element41.append(element45) : this.canvas.insertBefore(element45, element41),
            this.componentAirflowLayers.set(v239, element45),
            this.options.editable &&
              this.selectedComponentIds.size === 1 &&
              this.selectedComponentId === v239 &&
              this.componentSelectionLayers.get(v239) === "airflow" &&
              this.syncSelection());
        }
      }
      if (v240.type !== "icon-button-effect") continue;
      const v252 = this.componentEffectLayers.get(v239);
      (this.syncEffectLayerLightVisual(v240, v252),
        this.setEffectLayerActive(v252, v245, effectFadeDuration2(v240)));
    }
  }
  ["refreshVacuumMapEntity"](arg191) {
    if (this.options.liveMedia === false || !/^(image|camera)\./.test(String(arg191 || ""))) return;
    const v253 = this.states.get(arg191),
      v254 = vacuumMapImageSource2(arg191, v253);
    let v255 = false;
    for (const [v256, v257] of this.componentRecords) {
      if (v257.type !== "vacuum-map" || v257.bindings?.entity?.entityId !== arg191) continue;
      const v258 = this.componentHosts.get(v256)?.querySelector(".hb-vacuum-map-image");
      v258 && ((v255 = true), v258.hbSyncVacuumMap?.());
    }
    !v255 &&
      arg191.startsWith("image.") &&
      vacuumMapAvailable2(v253) &&
      this.options.liveMedia !== false &&
      this.vacuumMapEntityIds.has(arg191) &&
      this.runtimeVacuumMapImagePreloader.enqueue(v254);
  }
  ["applyOptimisticToggle"](arg192, v259 = null) {
    const v260 = arg192,
      powerEntityId4 = this.powerEntityId(v259, v260),
      v261 = this.states.get(powerEntityId4),
      options22 = v261?.newState ||
        v261 || {
          entityId: powerEntityId4,
          attributes: {},
        },
      startsWith2 = String(powerEntityId4 || "").startsWith("cover."),
      v262 = startsWith2 && coverComponentIsDream2(v259, powerEntityId4, v261, this.entityMetadata),
      runtimePowerComponent2 = this.runtimePowerComponent(v259, v260),
      v263 = !(startsWith2
        ? v262
          ? runtimeEntityStateIsActive2(v261)
          : runtimeCoverStateIsActive2(v261)
        : entityPowerIsOn2(powerEntityId4, v261, runtimePowerComponent2)),
      options23 = startsWith2
        ? {
            ...options22,
            state: v263 ? "open" : "closed",
            ...(v262
              ? {}
              : {
                  attributes: {
                    ...(options22.attributes || {}),
                    current_position: v263 ? 100 : 0,
                  },
                }),
          }
        : optimisticToggleState2(powerEntityId4, options22, runtimePowerComponent2);
    if (v263 && String(powerEntityId4 || "").startsWith("light.")) {
      const cachedLightVisualState = this.cachedLightVisualState(powerEntityId4);
      cachedLightVisualState?.attributes &&
        (options23.attributes = {
          ...(options23.attributes || {}),
          ...cachedLightVisualState.attributes,
        });
    }
    const options24 = v261?.newState
        ? {
            ...v261,
            newState: options23,
          }
        : options23,
      v264 = String(powerEntityId4 || ""),
      options25 = {
        desiredActive: v263,
        expiresAt: Date.now() + 8000,
      };
    this.pendingOptimisticStates.set(v264, options25);
    const setTimeout2 = window.setTimeout(() => {
      this.pendingOptimisticStates.get(v264) === options25 &&
        (this.pendingOptimisticStates.delete(v264),
        this.states.get(powerEntityId4) === options24 &&
          (v261 === undefined
            ? this.states.delete(powerEntityId4)
            : this.states.set(powerEntityId4, v261),
          this.updateOptimisticToggleVisuals(powerEntityId4)));
    }, 8000);
    return (
      this.states.set(powerEntityId4, options24),
      this.updateOptimisticToggleVisuals(powerEntityId4),
      () => {
        (window.clearTimeout(setTimeout2),
          this.pendingOptimisticStates.get(v264) === options25 &&
            this.pendingOptimisticStates.delete(v264),
          this.states.get(powerEntityId4) === options24 &&
            (v261 === undefined
              ? this.states.delete(powerEntityId4)
              : this.states.set(powerEntityId4, v261),
            this.updateOptimisticToggleVisuals(powerEntityId4)));
      }
    );
  }
  ["renderComponent"](arg193, v265 = this.canvas, v266 = 0, v267 = null, v268 = null) {
    const v269 = normalizeIconButtonEffectComponent2(arg193),
      runtimePowerComponent3 = this.runtimePowerComponent(v269),
      value5 = [
        "camera",
        "vacuum-map",
        "floorplan-auto-diagram",
        "interaction3d",
        "group",
      ].includes(arg193.type)
        ? v267?.get(arg193.id)
        : null;
    if (value5) {
      const options26 = arg193.position || {},
        includes =
          v265 === this.canvas &&
          ["floorplan-auto-diagram", "interaction3d"].includes(arg193.type) &&
          arg193.properties?.layoutMode === "fill",
        options27 = includes
          ? {
              ...options26,
              x: 0,
              y: 0,
              width: Number(this.document.canvas?.width || 2778),
              height: Number(this.document.canvas?.height || 1940),
              rotation: 0,
            }
          : options26,
        max26 = Math.max(0.01, Math.min(5, Number(arg193.style?.scale || 1))),
        v270 = v266 + Number(options27.zIndex || 1);
      if (
        (Object.assign(value5.style, {
          left: (options27.x || 0) + "px",
          top: (options27.y || 0) + "px",
          width: (options27.width || 100) + "px",
          height: (options27.height || 100) + "px",
          zIndex: String(v270),
          transform:
            "rotate(" + (options27.rotation || 0) + "deg) scale(" + (includes ? 1 : max26) + ")",
        }),
        value5.style.setProperty("--hb-component-z", String(v270)),
        (value5.hidden = arg193.style?.visible === false),
        value5.classList.toggle("layout-fill", includes),
        arg193.type === "interaction3d" &&
          value5
            .querySelector(".hb-interaction3d-host")
            ?.updateInteraction3d?.(arg193, this.document),
        arg193.type === "floorplan-auto-diagram")
      ) {
        const v271 = arg193.properties?.interactionMode === "view",
          selector14 = value5.querySelector(".hb-floorplan-auto-diagram-preview"),
          selector15 = value5.querySelector(".hb-floorplan-auto-diagram-preview-hint");
        (selector14?.classList.toggle("is-view-mode", v271),
          selector14?.classList.toggle("is-position-mode", !v271),
          selector15 &&
            (selector15.textContent = v271
              ? "拖动旋转 · 右键平移 · 滚轮缩放"
              : "拖动控件调整位置，右下角调整大小"));
      }
      (this.componentHosts.set(arg193.id, value5), this.componentRecords.set(arg193.id, arg193));
      const v272 = v265?.dataset?.componentId;
      (v272 && this.componentParentIds.set(arg193.id, v272),
        this.indexRuntimeComponent(arg193),
        value5.parentElement !== v265 && v265.append(value5));
      return;
    }
    const element46 = document.createElement("div");
    ((element46.className =
      "hb-component hb-component-" + arg193.type.replace(/[^a-z0-9_-]/gi, "-")),
      (element46.dataset.componentId = arg193.id));
    const options28 = arg193.position || {},
      includes2 =
        v265 === this.canvas &&
        ["image", "floorplan-auto-diagram", "interaction3d"].includes(arg193.type) &&
        arg193.properties?.layoutMode === "fill",
      options29 = includes2
        ? {
            ...options28,
            x: 0,
            y: 0,
            width: Number(this.document.canvas?.width || 2778),
            height: Number(this.document.canvas?.height || 1940),
            rotation: 0,
          }
        : options28,
      max27 = Math.max(0.01, Math.min(5, Number(arg193.style?.scale || 1))),
      v273 = v266 + Number(options29.zIndex || 1),
      v274 = componentHostZIndex2(arg193, v273, v265 === this.canvas);
    (Object.assign(element46.style, {
      left: (options29.x || 0) + "px",
      top: (options29.y || 0) + "px",
      width: (options29.width || 100) + "px",
      height: (options29.height || 100) + "px",
      zIndex: String(v274),
      transform:
        "rotate(" + (options29.rotation || 0) + "deg) scale(" + (includes2 ? 1 : max27) + ")",
    }),
      element46.style.setProperty("--hb-component-z", String(v274)),
      (element46.hidden = arg193.style?.visible === false),
      arg193.type === "flow-line" &&
        !this.options.editable &&
        (element46.style.pointerEvents = "none"),
      arg193.type === "icon-button-effect" &&
        arg193.properties?.buttonVisible === false &&
        arg193.properties?.hiddenContentClickable !== true &&
        !this.options.editable &&
        (element46.style.pointerEvents = "none"),
      element46.classList.toggle("layout-fill", includes2),
      this.componentHosts.set(arg193.id, element46),
      this.componentRecords.set(arg193.id, arg193));
    const v275 = v265?.dataset?.componentId;
    (v275 && this.componentParentIds.set(arg193.id, v275), this.indexRuntimeComponent(arg193));
    const options30 = {
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
      previewState: this.componentPreviewStates.get(arg193.id) || "auto",
      prewarmStage: this.prewarmingStageId === arg193.id,
      isIconVisible: (arg194) => this.iconVisibilityState(arg194),
      navigate: (arg195) => this.navigate(arg195),
      callEntityService: (...v276) => this.callEntityService(...v276),
      openCameraPreview: (arg196, arg197, arg198) =>
        this.openInteraction3dCameraPreview(arg196, arg197, arg198),
      openVacuumDetails: (arg199, arg200, arg201) =>
        this.openInteraction3dVacuumDetails(arg199, arg200, arg201),
      runVacuumRoom: (arg202) =>
        this.dispatchAction(
          {
            id: arg193.id + ":room:" + arg202.id,
            type: "device-button",
            properties: {
              label: arg202.label,
            },
            bindings: {
              entity: {
                entityId: arg202.entityId,
              },
            },
          },
          {
            type: "toggle",
            data: {},
          },
        ),
      onError: (arg203) => this.options.onError?.(arg203),
      registerRuntimeStateHandler: (arg204, arg205) =>
        this.registerRuntimeStateHandler(arg204, arg205, arg193.id),
      runtimeStateReady: () => this.runtimeSnapshotReady === true,
      invalidate: () => this.renderComponents(true),
      cleanup: (arg206) => {
        ["camera", "vacuum-map"].includes(arg193.type)
          ? (this.cameraCleanups.has(arg193.id) || this.cameraCleanups.set(arg193.id, []),
            this.cameraCleanups.get(arg193.id).push(arg206))
          : this.registerComponentCleanup(arg193.id, arg206);
      },
    };
    if (arg193.type === "icon-button-effect") {
      const element47 = renderIconButtonEffectLayer2(runtimePowerComponent3, options30);
      if (element47) {
        const value6 = v268?.get(arg193.id) || null,
          element48 = value6 || element47,
          selector16 = element47.querySelector("img"),
          selector17 = element48.querySelector("img"),
          contains = element47.classList.contains("active");
        if (value6 && selector17 && selector16) {
          element48.classList.toggle(
            "awaiting-light-visual",
            element47.classList.contains("awaiting-light-visual"),
          );
          const text5 = selector16.dataset.effectSource || "";
          if (text5) selector17.dataset.effectSource = text5;
          else {
            delete selector17.dataset.effectSource;
            const attribute = selector16.getAttribute("src");
            attribute && (selector17.src = attribute);
          }
          ((selector17.alt = selector16.alt),
            (selector17.draggable = false),
            (selector17.decoding = "async"),
            (selector17.style.objectFit = selector16.style.objectFit),
            (selector17.style.mixBlendMode = selector16.style.mixBlendMode));
          for (const v277 of [
            "effectOriginalWidth",
            "effectOriginalHeight",
            "effectCropX",
            "effectCropY",
            "effectCropWidth",
            "effectCropHeight",
          ])
            selector16.dataset[v277] !== undefined
              ? (selector17.dataset[v277] = selector16.dataset[v277])
              : delete selector17.dataset[v277];
        }
        const options31 = runtimePowerComponent3.properties || {},
          v278 = Number(this.document.canvas?.width || 2778),
          v279 = Number(this.document.canvas?.height || 1940),
          v280 = options31.effectLayoutMode === "fill",
          v281 = v265 !== this.canvas;
        ((element48.dataset.effectFor = arg193.id),
          (element48.hidden = arg193.style?.visible === false));
        const v282 = () => {
          const v283 = effectSourceDimensions2(options31, selector17, v278, v279),
            vector4 = effectCropRectangle2(selector17, v283),
            value7 =
              !v280 && !v283.pendingNaturalSize
                ? effectReferenceImageTransform2(
                    this.page,
                    arg193,
                    v283.width,
                    v283.height,
                    v278,
                    v279,
                  )
                : null,
            max28 = Math.max(0.01, Math.min(5, Number(options31.effectScale || 1))),
            min10 = v280
              ? Math.min(v278 / v283.width, v279 / v283.height)
              : (value7?.scale || 1) * max28,
            num11 = v280 ? 0 : Number(options31.effectRotation || 0),
            v284 = Number(options31.effectLeft ?? 50) / 100,
            v285 = Number(options31.effectTop ?? 50) / 100,
            v286 = v280 ? v278 / 2 : v278 * v284,
            v287 = v280 ? v279 / 2 : v279 * v285,
            v288 = effectCroppedLayerGeometry2({
              centerX: v286,
              centerY: v287,
              originalWidth: v283.width,
              originalHeight: v283.height,
              cropX: vector4.x,
              cropY: vector4.y,
              cropWidth: vector4.width,
              cropHeight: vector4.height,
              scale: min10,
              rotation: num11,
            });
          let v289 = v288;
          if (v281) {
            const v290 = v288.left + v288.width / 2,
              v291 = v288.top + v288.height / 2,
              v292 = v265?.dataset?.componentId,
              worldPointToComponentLocal = v292
                ? this.worldPointToComponentLocal(v292, v290, v291)
                : {
                    x: v290,
                    y: v291,
                  },
              componentWorldTransform = v292
                ? this.componentWorldTransform(v292)
                : {
                    scale: 1,
                    rotation: 0,
                  };
            v289 = {
              ...v288,
              left: worldPointToComponentLocal.x - v288.width / 2,
              top: worldPointToComponentLocal.y - v288.height / 2,
              scale: v288.scale / Math.max(0.0001, componentWorldTransform.scale),
              rotation: v288.rotation - componentWorldTransform.rotation,
            };
          }
          return (
            Object.assign(element48.style, {
              left: v289.left + "px",
              top: v289.top + "px",
              width: v288.width + "px",
              height: v288.height + "px",
              visibility: v283.pendingNaturalSize ? "hidden" : "",
              zIndex: String(v281 ? v273 - 0.1 : v273),
              transform: "rotate(" + v289.rotation + "deg) scale(" + v289.scale + ")",
            }),
            v283
          );
        };
        (v282().pendingNaturalSize &&
          selector17 &&
          selector17.addEventListener(
            "load",
            () => {
              element48.isConnected && v282();
            },
            {
              once: true,
            },
          ),
          (v281 ? v265 : v280 ? this.canvas : v265).append(element48),
          this.componentEffectLayers.set(arg193.id, element48));
        const text6 = selector17?.dataset.effectSource || "";
        if (
          (text6 &&
            this.runtimeEffectImageLoader.enqueue(selector17, text6, {
              active: contains,
            }),
          value6)
        ) {
          const text7 = selector16?.style.filter || "none",
            propertyValue = element47.style.getPropertyValue("--hb-effect-image-opacity"),
            propertyValue2 = element47.style.getPropertyValue("--hb-effect-fade-duration"),
            propertyValue3 = element47.style.getPropertyValue(
              "--hb-effect-visual-transition-duration",
            ),
            opacity = element47.style.opacity,
            transition = element47.style.transition;
          (selector17?.offsetWidth,
            selector17 && (selector17.style.filter = text7),
            (element48.style.opacity = opacity),
            (element48.style.transition = transition),
            element48.style.setProperty("--hb-effect-image-opacity", propertyValue),
            element48.style.setProperty("--hb-effect-fade-duration", propertyValue2),
            element48.style.setProperty("--hb-effect-visual-transition-duration", propertyValue3),
            this.setEffectLayerActive(element48, contains, effectFadeDuration2(arg193)));
        }
      }
    }
    if (arg193.type === "air-conditioner") {
      const element49 = renderAirConditionerAirflowLayer2(runtimePowerComponent3, options30);
      if (element49) {
        ((element49.dataset.airflowFor = arg193.id),
          (element49.hidden = arg193.style?.visible === false));
        const v293 = v265 !== this.canvas,
          v294 = airflowLayerGeometry2(arg193, {
            grouped: v293,
          });
        (Object.assign(element49.style, {
          left: v294.left + "px",
          top: v294.top + "px",
          width: v294.width + "px",
          height: v294.height + "px",
          zIndex: String(v273),
          transform: "rotate(" + v294.rotation + "deg) scale(" + v294.scale + ")",
        }),
          (v293 ? element46 : v265).append(element49),
          this.componentAirflowLayers.set(arg193.id, element49));
      }
    }
    const element50 =
        arg193.type === "group"
          ? (() => {
              const element51 = document.createElement("div");
              return ((element51.className = "hb-group-container"), element51);
            })()
          : renderRegisteredComponent2(runtimePowerComponent3, options30),
      v295 = Number(this.document.canvas.componentScale || 1);
    if (
      (v295 !== 1 &&
        ((element50.style.width = 100 / v295 + "%"),
        (element50.style.height = 100 / v295 + "%"),
        (element50.style.transform = "scale(" + v295 + ")"),
        (element50.style.transformOrigin = "top left")),
      element46.append(element50),
      arg193.type === "line-chart")
    ) {
      let element52 = element50;
      const v296 = () => {
        if (!element52?.isConnected) return;
        const element53 = renderRegisteredComponent2(runtimePowerComponent3, options30);
        (v295 !== 1 &&
          ((element53.style.width = 100 / v295 + "%"),
          (element53.style.height = 100 / v295 + "%"),
          (element53.style.transform = "scale(" + v295 + ")"),
          (element53.style.transformOrigin = "top left")),
          element52.cleanupLineChartHover?.(),
          element52.replaceWith(element53),
          (element52 = element53));
      };
      (this.registerRuntimeStateHandler(
        arg193.bindings?.entity?.entityId,
        (arg207) => {
          (element52.syncLineChartState?.(arg207),
            element52.classList.contains("history-loading") && v296());
        },
        arg193.id,
      ),
        this.registerHistoryChartRefresher(v296, arg193.id));
    }
    if (this.options.editable)
      (element46.classList.add("editable"),
        element46.addEventListener("pointerdown", (arg208) =>
          this.startComponentMove(arg208, arg193, element46),
        ));
    else {
      const call = Object.prototype.hasOwnProperty.call(arg193.actions || {}, "tap"),
        options32 =
          arg193.type === "camera" && arg193.bindings?.entity?.entityId && !call
            ? {
                ...arg193,
                actions: {
                  tap: {
                    type: "more-info",
                    data: {
                      popupSource: "current",
                    },
                  },
                  ...(arg193.actions || {}),
                },
              }
            : arg193;
      if (
        (arg193.type === "light-statistics" &&
          element46.classList.add("hb-runtime-fitted-hit-area"),
        arg193.type !== "scene-mode" &&
          Object.values(options32.actions || {}).some((arg209) => ke(options32, arg209)))
      ) {
        element46.classList.add("interactive");
        let element54 = element46;
        (["title-button", "device-button", "light-statistics"].includes(arg193.type) &&
          ((element54 = document.createElement("span")),
          (element54.className = "hb-runtime-action-hitbox"),
          element54.setAttribute("aria-hidden", "true"),
          element46.classList.add("hb-runtime-fitted-hit-area"),
          element46.append(element54)),
          this.bindRuntimeActions(element54, options32));
      }
    }
    v265.append(element46);
    const selector18 = element46.querySelector(":scope > .hb-runtime-action-hitbox");
    if (selector18) {
      const titleButtonSelectionBounds =
        arg193.type === "title-button"
          ? this.updateTitleButtonSelectionBounds(element46, arg193, selector18)
          : arg193.type === "light-statistics"
            ? this.updateLightStatisticsSelectionBounds(element46, arg193, selector18)
            : this.updateDeviceButtonSelectionBounds(element46, arg193, selector18);
      selector18.hidden = !titleButtonSelectionBounds;
    }
    for (const v297 of arg193.children || []) this.renderComponent(v297, element46, 0, v267, v268);
  }
  ["startComponentMove"](arg210, arg211, arg212, v298 = arg212) {
    if (
      !this.options.editable ||
      !this.selectedComponentIds.has(arg211.id) ||
      arg211.properties?.layoutMode === "fill" ||
      arg210.button !== 0 ||
      arg210.target.closest(".hb-transform-handle")
    )
      return;
    (arg210.preventDefault(), arg210.stopPropagation());
    const clientX = arg210.clientX,
      clientY = arg210.clientY,
      map13 = [...this.selectedComponentIds]
        .map((arg213) => ({
          component: this.componentRecords.get(arg213),
          host: this.componentHosts.get(arg213),
        }))
        .filter((arg214) => arg214.component && arg214.host)
        .map((arg215) => ({
          ...arg215,
          initialX: Number(arg215.component.position?.x || 0),
          initialY: Number(arg215.component.position?.y || 0),
          width: Number(arg215.component.position?.width || 100),
          height: Number(arg215.component.position?.height || 100),
          parentId: this.componentParentIds.get(arg215.component.id) || null,
          parentTransform: this.componentParentTransform(arg215.component.id),
          worldCenter: this.componentLocalPointToWorld(
            arg215.component.id,
            Number(arg215.component.position?.width || 100) / 2,
            Number(arg215.component.position?.height || 100) / 2,
          ),
        }));
    if (
      !map13.some((arg216) => arg216.component.id === arg211.id) ||
      map13.some((arg217) => arg217.component.properties?.layoutMode === "fill")
    )
      return;
    let ci = Ci(arg210),
      v299 =
        !ci &&
        map13.length === 1 &&
        arg211.type === "air-conditioner" &&
        this.componentSelectionLayers.get(arg211.id) !== "airflow";
    const v300 = Number(arg211.properties?.airflowOffsetX ?? -75),
      v301 = Number(arg211.properties?.airflowOffsetY ?? 34);
    let v302 = v300,
      v303 = v301;
    const v304 = Number(this.document?.canvas?.width || 2778),
      v305 = Number(this.document?.canvas?.height || 1940),
      reduce = map13.reduce(
        (arg218, arg219) => ({
          minX: Math.max(arg218.minX, Math.min(0, -arg219.worldCenter.x)),
          maxX: Math.min(arg218.maxX, Math.max(0, v304 - arg219.worldCenter.x)),
          minY: Math.max(arg218.minY, Math.min(0, -arg219.worldCenter.y)),
          maxY: Math.min(arg218.maxY, Math.max(0, v305 - arg219.worldCenter.y)),
        }),
        {
          minX: -Infinity,
          maxX: Infinity,
          minY: -Infinity,
          maxY: Infinity,
        },
      ),
      v306 = Number(arg211.position?.x || 0),
      v307 = Number(arg211.position?.y || 0);
    let v308 = v306,
      v309 = v307,
      list8 = map13,
      list9 = [],
      map14 = map13.map((arg220) => ({
        componentId: arg220.component.id,
        x: arg220.initialX,
        y: arg220.initialY,
      })),
      v310 = arg211.id,
      v311 = false,
      text8 = "",
      v312 = false;
    const pointerId3 = arg210.pointerId;
    (v298.setPointerCapture(pointerId3),
      map13.forEach((arg221) => arg221.host.classList.add("moving")));
    const v313 = (arg222) => {
        if (arg222.pointerId !== pointerId3) return;
        if (!v298.hasPointerCapture?.(pointerId3) && v298.isConnected)
          try {
            v298.setPointerCapture(pointerId3);
          } catch {}
        !ci && Ci(arg222) && ((ci = true), (v299 = false));
        let v314 = arg222.clientX - clientX,
          v315 = arg222.clientY - clientY;
        if (ci && !v311) {
          if (Math.hypot(v314, v315) < 3) return;
          ((list9 = map13.map((arg223) => {
            const si = Si(structuredClone(arg223.component));
            return (
              (si.position = {
                ...(si.position || {}),
                zIndex: Number(si.position?.zIndex || 1) + 1,
              }),
              this.renderComponent(si, arg223.host.parentElement),
              {
                sourceComponentId: arg223.component.id,
                copiedComponent: si,
              }
            );
          })),
            (list8 = list9.map((arg224, arg225) => ({
              component: arg224.copiedComponent,
              host: this.componentHosts.get(arg224.copiedComponent.id),
              initialX: map13[arg225].initialX,
              initialY: map13[arg225].initialY,
              width: map13[arg225].width,
              height: map13[arg225].height,
              parentId: map13[arg225].parentId,
              parentTransform: map13[arg225].parentTransform,
            }))),
            (v310 =
              list9.find((arg226) => arg226.sourceComponentId === arg211.id)?.copiedComponent.id ||
              list9[0]?.copiedComponent.id),
            (v311 = true),
            map13.forEach((arg227) => arg227.host.classList.remove("moving")),
            list8.forEach((arg228) => arg228.host?.classList.add("moving")),
            (this.selectedComponentId = v310),
            (this.selectedComponentIds = new Set(list8.map((arg229) => arg229.component.id))));
        }
        arg222.shiftKey
          ? (!text8 &&
              Math.hypot(v314, v315) >= 1 &&
              (text8 = Math.abs(v314) >= Math.abs(v315) ? "horizontal" : "vertical"),
            text8 === "horizontal" && (v315 = 0),
            text8 === "vertical" && (v314 = 0))
          : (text8 = "");
        const max29 = Math.max(
            reduce.minX,
            Math.min(reduce.maxX, v314 / (this.appliedScaleX || 1)),
          ),
          max30 = Math.max(reduce.minY, Math.min(reduce.maxY, v315 / (this.appliedScaleY || 1))),
          v316 = map13.find((arg230) => arg230.component.id === arg211.id) || map13[0],
          vector5 = groupedComponentLocalDelta2(max29, max30, v316.parentTransform);
        ((v308 = v306 + vector5.x),
          (v309 = v307 + vector5.y),
          v299 &&
            ((v302 = v300 - (vector5.x / Math.max(1, Number(arg211.position?.width || 100))) * 100),
            (v303 = v301 - (vector5.y / Math.max(1, Number(arg211.position?.height || 100))) * 100),
            (arg211.properties = {
              ...(arg211.properties || {}),
              airflowOffsetX: v302,
              airflowOffsetY: v303,
            }),
            this.options.onComponentPropertiesPreview?.(arg211.id, {
              airflowOffsetX: v302,
              airflowOffsetY: v303,
            })));
        const map15 = list8.map((arg231) => {
          const vector6 = groupedComponentLocalDelta2(max29, max30, arg231.parentTransform);
          return {
            componentId: arg231.component.id,
            x: arg231.initialX + vector6.x,
            y: arg231.initialY + vector6.y,
          };
        });
        map14 = map15;
        for (const vector7 of map15) {
          const element55 = this.componentHosts.get(vector7.componentId);
          element55 &&
            ((element55.style.left = vector7.x + "px"), (element55.style.top = vector7.y + "px"));
          const element56 = this.componentSelectionOverlays.get(vector7.componentId);
          element56 &&
            ((element56.style.left = vector7.x + "px"), (element56.style.top = vector7.y + "px"));
        }
        v311 ||
          (map15.length > 1
            ? this.options.onComponentsTransformPreview?.(map15, arg211.id)
            : this.options.onComponentTransformPreview?.(arg211.id, {
                x: v308,
                y: v309,
              }));
      },
      v317 = (v318 = null) => {
        if (
          !v312 &&
          !(v318?.pointerId != null && v318.pointerId !== pointerId3) &&
          ((v312 = true),
          list8.forEach((arg232) => arg232.host?.classList.remove("moving")),
          map13.forEach((arg233) => arg233.host.classList.remove("moving")),
          window.removeEventListener("pointermove", v313, true),
          window.removeEventListener("pointerup", v317, true),
          window.removeEventListener("pointercancel", v317, true),
          window.removeEventListener("blur", v317),
          v308 !== v306 || v309 !== v307)
        ) {
          if (v311)
            (list8.forEach((arg234) => {
              const v319 = map14.find((arg235) => arg235.componentId === arg234.component.id);
              arg234.component.position = {
                ...(arg234.component.position || {}),
                x: v319?.x ?? arg234.initialX,
                y: v319?.y ?? arg234.initialY,
              };
            }),
              this.options.onComponentsDuplicate?.(list9, arg211.id, v310));
          else {
            if (map13.length > 1) {
              const map16 = map14.map((arg236) => {
                const v320 = map13.find((arg237) => arg237.component.id === arg236.componentId);
                return (
                  v320 &&
                    (v320.component.position = {
                      ...(v320.component.position || {}),
                      x: arg236.x,
                      y: arg236.y,
                    }),
                  arg236
                );
              });
              this.options.onComponentsTransform?.(map16, arg211.id);
            } else
              ((arg211.position = {
                ...(arg211.position || {}),
                x: v308,
                y: v309,
              }),
                this.options.onComponentTransform?.(arg211.id, {
                  x: v308,
                  y: v309,
                  ...(v299
                    ? {
                        airflowOffsetX: v302,
                        airflowOffsetY: v303,
                      }
                    : {}),
                }));
          }
        }
      };
    (window.addEventListener("pointermove", v313, true),
      window.addEventListener("pointerup", v317, true),
      window.addEventListener("pointercancel", v317, true),
      window.addEventListener("blur", v317));
  }
  ["createComponentSelectionOverlay"](arg238, arg239) {
    if (
      !arg238 ||
      !arg239 ||
      !arg238.parentElement ||
      (arg238.parentElement !== this.canvas && !arg238.hidden)
    )
      return null;
    const parentElement2 = arg238.parentElement,
      element57 = document.createElement("div");
    return (
      (element57.className = "hb-component-selection-overlay"),
      arg239.type === "light-statistics" &&
        element57.classList.add("hb-light-statistics-selection-overlay"),
      arg239.type === "floorplan-auto-diagram" &&
        arg239.properties?.interactionMode === "view" &&
        element57.classList.add("hb-floorplan-auto-diagram-view-overlay"),
      (element57.dataset.selectionFor = arg239.id),
      Object.assign(element57.style, {
        left: arg238.style.left,
        top: arg238.style.top,
        width: arg238.style.width,
        height: arg238.style.height,
        transform: arg238.style.transform,
      }),
      arg239.type !== "light-statistics" &&
        element57.addEventListener("pointerdown", (arg240) =>
          this.startComponentMove(arg240, arg239, arg238, element57),
        ),
      parentElement2.append(element57),
      this.componentSelectionOverlays.set(arg239.id, element57),
      element57
    );
  }
  ["createAirflowSelectionOverlay"](arg241, arg242) {
    if (!arg241 || !arg242 || !arg241.parentElement) return null;
    const element58 = document.createElement("div");
    return (
      (element58.className = "hb-component-selection-overlay hb-airflow-selection-overlay"),
      (element58.dataset.selectionFor = arg242.id),
      Object.assign(element58.style, {
        left: arg241.style.left,
        top: arg241.style.top,
        width: arg241.style.width,
        height: arg241.style.height,
        transform: arg241.style.transform,
      }),
      arg241.parentElement.append(element58),
      this.componentSelectionOverlays.set(arg242.id, element58),
      element58
    );
  }
  ["syncAirflowLayerGeometry"](arg243, arg244, v321 = null) {
    if (!arg243 || !arg244) return;
    const v322 = airflowLayerGeometry2(arg244, {
        grouped: arg243.parentElement !== this.canvas,
      }),
      options33 = {
        left: v322.left + "px",
        top: v322.top + "px",
        width: v322.width + "px",
        height: v322.height + "px",
        transform: "rotate(" + v322.rotation + "deg) scale(" + v322.scale + ")",
      };
    (Object.assign(arg243.style, options33), v321 && Object.assign(v321.style, options33));
  }
  ["appendEffectSelectionBounds"](arg245, arg246) {
    if (!arg245 || !arg246 || !arg245.parentElement) return;
    const element59 = document.createElement("div");
    ((element59.className = "hb-component-selection-overlay hb-effect-selection-overlay"),
      (element59.dataset.selectionFor = arg246.id),
      Object.assign(element59.style, {
        left: arg245.style.left,
        top: arg245.style.top,
        width: arg245.style.width,
        height: arg245.style.height,
        transform: arg245.style.transform,
        pointerEvents: "none",
      }));
    const element60 = document.createElement("div");
    element60.className = "hb-selection-bounds hb-effect-selection-bounds";
    for (const v323 of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const element61 = document.createElement("i");
      ((element61.className = "hb-corner-marker hb-corner-" + v323),
        element61.setAttribute("aria-hidden", "true"),
        element60.append(element61));
    }
    (element59.append(element60),
      arg245.parentElement.append(element59),
      this.componentSelectionOverlays.set(arg246.id, element59),
      this.updateTransformHandleScale(arg245, arg246, element60));
  }
  ["syncComponentSelectionOverlay"](arg247) {
    const element62 = this.componentSelectionOverlays.get(arg247),
      element63 = this.componentHosts.get(arg247);
    !element62 ||
      !element63 ||
      element62.classList.contains("hb-airflow-selection-overlay") ||
      element62.classList.contains("hb-effect-selection-overlay") ||
      Object.assign(element62.style, {
        left: element63.style.left,
        top: element63.style.top,
        width: element63.style.width,
        height: element63.style.height,
        transform: element63.style.transform,
      });
  }
  ["appendTransformHandles"](arg248, arg249, v324 = true, v325 = arg248) {
    if (!arg248 || !arg249) return;
    const element64 = document.createElement("div");
    element64.className = "hb-selection-bounds";
    for (const v326 of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const element65 = document.createElement("i");
      ((element65.className = "hb-corner-marker hb-corner-" + v326),
        element65.setAttribute("aria-hidden", "true"),
        element64.append(element65));
    }
    if (v324 && arg249.properties?.layoutMode !== "fill") {
      const element66 = document.createElement("button");
      ((element66.type = "button"),
        (element66.className = "hb-transform-handle hb-resize-handle"),
        (element66.title = "拖动缩放"),
        element66.addEventListener("pointerdown", (arg250) =>
          this.startComponentScale(arg250, arg249, arg248, element64),
        ));
      const element67 = document.createElement("button");
      ((element67.type = "button"),
        (element67.className = "hb-transform-handle hb-rotate-handle"),
        (element67.title = "拖动旋转"),
        element67.addEventListener("pointerdown", (arg251) =>
          this.startComponentRotate(arg251, arg249, arg248, element64),
        ),
        element64.append(element66, element67));
    }
    (v325.append(element64),
      arg249.type === "light-statistics" &&
        v325.classList?.contains("hb-light-statistics-selection-overlay") &&
        element64.addEventListener("pointerdown", (arg252) =>
          this.startComponentMove(arg252, arg249, arg248, element64),
        ),
      this.updateImageSelectionBounds(arg248, arg249, element64),
      this.updateTextSelectionBounds(arg248, arg249, element64),
      this.updateTitleButtonSelectionBounds(arg248, arg249, element64),
      this.updateDeviceButtonSelectionBounds(arg248, arg249, element64));
    const lightStatisticsSelectionBounds2 = this.updateLightStatisticsSelectionBounds(
      arg248,
      arg249,
      element64,
    );
    (arg249.type === "light-statistics" &&
      !lightStatisticsSelectionBounds2 &&
      Object.assign(element64.style, {
        left: "0",
        top: "0",
        width: "100%",
        height: "100%",
      }),
      this.updateAirConditionerButtonSelectionBounds(arg248, arg249, element64),
      this.updateTransformHandleScale(arg248, arg249, element64));
  }
  ["withSelectionMeasurementHost"](arg253, arg254) {
    const list10 = [];
    let element68 = arg253;
    for (; element68 && element68 !== this.canvas;)
      (element68.hidden && (list10.push(element68), (element68.hidden = false)),
        (element68 = element68.parentElement));
    try {
      return arg254();
    } finally {
      for (const v327 of list10) v327.hidden = true;
    }
  }
  ["selectionElementIsVisible"](arg255) {
    if (!arg255 || arg255.hidden) return false;
    const v328 = window.getComputedStyle?.(arg255);
    return v328?.display === "none" || v328?.visibility === "hidden"
      ? false
      : Number(arg255.offsetWidth || arg255.getBoundingClientRect?.().width || 0) > 0 &&
          Number(arg255.offsetHeight || arg255.getBoundingClientRect?.().height || 0) > 0;
  }
  ["selectionElementBox"](arg256, arg257) {
    let num12 = 0,
      num13 = 0,
      element69 = arg256;
    const set12 = new Set();
    for (; element69 && element69 !== arg257 && !set12.has(element69);)
      (set12.add(element69),
        (num12 += Number(element69.offsetLeft || 0)),
        (num13 += Number(element69.offsetTop || 0)),
        (element69 = element69.offsetParent || element69.parentElement));
    const v329 = arg256.getBoundingClientRect?.(),
      v330 = Number(arg256.offsetWidth || v329?.width || 0),
      v331 = Number(arg256.offsetHeight || v329?.height || 0);
    return {
      left: num12,
      top: num13,
      width: v330,
      height: v331,
    };
  }
  ["applyDoorWindowPerspective"](arg258, arg259, arg260) {
    const v332 = arg258?.querySelector(".hb-door-window-visual");
    if (!v332 || !arg259) return;
    const max31 = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
      max32 = Math.max(1, Number(arg259.position?.width || 100) / max31),
      max33 = Math.max(1, Number(arg259.position?.height || 100) / max31);
    v332.style.transform = doorWindowPerspectiveMatrix2(max32, max33, arg260);
  }
  ["updateDoorWindowPerspectiveHandles"](arg261, arg262) {
    if (!arg261) return;
    const v333 = doorWindowPerspectiveCorners2(arg262);
    (arg261
      .querySelector(".hb-door-window-perspective-guide polygon")
      ?.setAttribute(
        "points",
        [0, 1, 2, 3].map((arg263) => v333[arg263 * 2] + "," + v333[arg263 * 2 + 1]).join(" "),
      ),
      arg261.querySelectorAll(".hb-door-window-perspective-handle").forEach((arg264) => {
        const v334 = Number(arg264.dataset.perspectiveCornerIndex || 0);
        ((arg264.style.left = v333[v334 * 2] * 100 + "%"),
          (arg264.style.top = v333[v334 * 2 + 1] * 100 + "%"));
      }));
  }
  ["appendDoorWindowPerspectiveHandles"](arg265, arg266, v335 = arg265) {
    if (!arg265 || !arg266 || arg266.properties?.sensorKind !== "door-window") return;
    const v336 = doorWindowPerspectiveCorners2(arg266.properties?.perspectiveCorners),
      element70 = document.createElement("div");
    element70.className = "hb-selection-bounds hb-door-window-perspective-bounds";
    const elementNS = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    (elementNS.classList.add("hb-door-window-perspective-guide"),
      elementNS.setAttribute("viewBox", "0 0 1 1"),
      elementNS.setAttribute("preserveAspectRatio", "none"),
      elementNS.append(document.createElementNS("http://www.w3.org/2000/svg", "polygon")),
      element70.append(elementNS));
    const list11 = ["左上角", "右上角", "右下角", "左下角"];
    for (let num14 = 0; num14 < 4; num14 += 1) {
      const element71 = document.createElement("button");
      ((element71.type = "button"),
        (element71.className = "hb-door-window-perspective-handle"),
        (element71.dataset.perspectiveCornerIndex = String(num14)),
        (element71.title = "拖动" + list11[num14] + "调整透视"),
        element71.setAttribute("aria-label", element71.title),
        element71.addEventListener("pointerdown", (arg267) =>
          this.startDoorWindowPerspective(arg267, arg266, arg265, element70, num14),
        ),
        element70.append(element71));
    }
    (v335.append(element70),
      this.updateDoorWindowPerspectiveHandles(element70, v336),
      this.updateTransformHandleScale(arg265, arg266, element70));
  }
  ["startDoorWindowPerspective"](arg268, arg269, arg270, arg271, arg272) {
    if (arg268.button !== 0) return;
    (arg268.preventDefault(), arg268.stopPropagation());
    const pointerId4 = arg268.pointerId,
      clientX2 = arg268.clientX,
      clientY2 = arg268.clientY,
      v337 = doorWindowPerspectiveCorners2(arg269.properties?.perspectiveCorners),
      v338 = v337[arg272 * 2],
      v339 = v337[arg272 * 2 + 1],
      max34 = Math.max(1, Number(arg269.position?.width || 100)),
      max35 = Math.max(1, Number(arg269.position?.height || 100)),
      componentWorldTransform2 = this.componentWorldTransform(arg269.id),
      scale2 = componentWorldTransform2.scale,
      v340 = (componentWorldTransform2.rotation * Math.PI) / 180,
      cos2 = Math.cos(v340),
      sin2 = Math.sin(v340);
    let v341 = v337,
      v342 = false;
    const v343 = (arg273) => {
        if (arg273.pointerId !== pointerId4) return;
        const v344 = (arg273.clientX - clientX2) / Math.max(0.001, this.appliedScaleX || 1),
          v345 = (arg273.clientY - clientY2) / Math.max(0.001, this.appliedScaleY || 1),
          v346 = (cos2 * v344 + sin2 * v345) / scale2,
          v347 = (-sin2 * v344 + cos2 * v345) / scale2,
          slice = v337.slice();
        ((slice[arg272 * 2] = v338 + v346 / max34),
          (slice[arg272 * 2 + 1] = v339 + v347 / max35),
          (v341 = doorWindowPerspectiveCorners2(slice)),
          (arg269.properties = {
            ...(arg269.properties || {}),
            perspectiveCorners: v341,
          }),
          this.applyDoorWindowPerspective(arg270, arg269, v341),
          this.updateDoorWindowPerspectiveHandles(arg271, v341),
          this.options.onComponentPropertiesPreview?.(arg269.id, {
            perspectiveCorners: v341,
          }));
      },
      v348 = (v349 = null) => {
        v342 ||
          (v349?.pointerId != null && v349.pointerId !== pointerId4) ||
          ((v342 = true),
          window.removeEventListener("pointermove", v343, true),
          window.removeEventListener("pointerup", v348, true),
          window.removeEventListener("pointercancel", v348, true),
          window.removeEventListener("blur", v348),
          JSON.stringify(v341) !== JSON.stringify(v337) &&
            this.options.onComponentProperties?.(arg269.id, {
              perspectiveCorners: v341,
            }));
      };
    (window.addEventListener("pointermove", v343, true),
      window.addEventListener("pointerup", v348, true),
      window.addEventListener("pointercancel", v348, true),
      window.addEventListener("blur", v348));
  }
  ["appendAirflowTransformHandles"](arg274, arg275) {
    if (!arg274 || !arg275) return;
    const airflowSelectionOverlay = this.createAirflowSelectionOverlay(arg274, arg275);
    if (!airflowSelectionOverlay) return;
    const element72 = document.createElement("div");
    element72.className = "hb-selection-bounds hb-airflow-selection-bounds";
    for (const v350 of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const element73 = document.createElement("i");
      ((element73.className = "hb-corner-marker hb-corner-" + v350),
        element73.setAttribute("aria-hidden", "true"),
        element72.append(element73));
    }
    const element74 = document.createElement("button");
    ((element74.type = "button"),
      (element74.className = "hb-transform-handle hb-resize-handle"),
      (element74.title = "拖动缩放出风效果"),
      element74.addEventListener("pointerdown", (arg276) =>
        this.startAirflowScale(arg276, arg275, arg274, element72, airflowSelectionOverlay),
      ));
    const element75 = document.createElement("button");
    ((element75.type = "button"),
      (element75.className = "hb-transform-handle hb-rotate-handle"),
      (element75.title = "拖动旋转出风效果"),
      element75.addEventListener("pointerdown", (arg277) =>
        this.startAirflowRotate(arg277, arg275, arg274, element72, airflowSelectionOverlay),
      ),
      element72.append(element74, element75),
      element72.addEventListener("pointerdown", (arg278) =>
        this.startAirflowMove(arg278, arg275, arg274, element72, airflowSelectionOverlay),
      ),
      airflowSelectionOverlay.append(element72),
      this.updateAirflowHandleScale(arg275, element72));
  }
  ["startAirflowMove"](arg279, arg280, arg281, arg282, arg283) {
    if (arg279.button !== 0 || arg279.target.closest(".hb-transform-handle")) return;
    (arg279.preventDefault(), arg279.stopPropagation());
    const clientX3 = arg279.clientX,
      clientY3 = arg279.clientY,
      max36 = Math.max(1, Number(arg280.position?.width || 100)),
      max37 = Math.max(1, Number(arg280.position?.height || 100)),
      v351 = Number(arg280.properties?.airflowOffsetX ?? -75),
      v352 = Number(arg280.properties?.airflowOffsetY ?? 34),
      v353 = airflowCanvasOffsetBounds2(arg280, this.document?.canvas);
    let v354 = v351,
      v355 = v352,
      text9 = "",
      v356 = false;
    const pointerId5 = arg279.pointerId;
    arg282.setPointerCapture(pointerId5);
    const v357 = (arg284) => {
        if (arg284.pointerId !== pointerId5) return;
        if (!arg282.hasPointerCapture?.(pointerId5) && arg282.isConnected)
          try {
            arg282.setPointerCapture(pointerId5);
          } catch {}
        let v358 = arg284.clientX - clientX3,
          v359 = arg284.clientY - clientY3;
        arg284.shiftKey
          ? (!text9 &&
              Math.hypot(v358, v359) >= 1 &&
              (text9 = Math.abs(v358) >= Math.abs(v359) ? "horizontal" : "vertical"),
            text9 === "horizontal" && (v359 = 0),
            text9 === "vertical" && (v358 = 0))
          : (text9 = "");
        const v360 = v358 / Math.max(0.001, this.appliedScaleX || 1),
          v361 = v359 / Math.max(0.001, this.appliedScaleY || 1),
          vector8 = groupedComponentLocalDelta2(
            v360,
            v361,
            this.componentParentTransform(arg280.id),
          );
        ((v354 = Math.max(v353.minX, Math.min(v353.maxX, v351 + (vector8.x / max36) * 100))),
          (v355 = Math.max(v353.minY, Math.min(v353.maxY, v352 + (vector8.y / max37) * 100))),
          (arg280.properties = {
            ...(arg280.properties || {}),
            airflowOffsetX: v354,
            airflowOffsetY: v355,
          }),
          this.syncAirflowLayerGeometry(arg281, arg280, arg283),
          this.options.onComponentPropertiesPreview?.(arg280.id, {
            airflowOffsetX: v354,
            airflowOffsetY: v355,
          }));
      },
      v362 = (v363 = null) => {
        v356 ||
          (v363?.pointerId != null && v363.pointerId !== pointerId5) ||
          ((v356 = true),
          window.removeEventListener("pointermove", v357, true),
          window.removeEventListener("pointerup", v362, true),
          window.removeEventListener("pointercancel", v362, true),
          window.removeEventListener("blur", v362),
          (v354 !== v351 || v355 !== v352) &&
            this.options.onComponentProperties?.(arg280.id, {
              airflowOffsetX: v354,
              airflowOffsetY: v355,
            }));
      };
    (window.addEventListener("pointermove", v357, true),
      window.addEventListener("pointerup", v362, true),
      window.addEventListener("pointercancel", v362, true),
      window.addEventListener("blur", v362));
  }
  ["updateAirflowHandleScale"](arg285, arg286) {
    if (!arg285 || !arg286) return;
    const min11 = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1),
      max38 = Math.max(0.01, Math.min(5, Number(arg285.properties?.airflowScale || 1))),
      scale3 = this.componentParentTransform(arg285.id).scale,
      v364 = 1 / Math.max(0.001, min11 * max38 * scale3);
    (arg286.style.setProperty("--hb-ui-scale", String(v364)),
      arg286.style.setProperty("--hb-handle-outset", 30 * v364 + "px"));
    const boundingClientRect4 = arg286.getBoundingClientRect();
    arg286.classList.toggle(
      "handles-outside",
      boundingClientRect4.width < 132 || boundingClientRect4.height < 112,
    );
  }
  ["startAirflowScale"](arg287, arg288, arg289, arg290, arg291) {
    (arg287.preventDefault(), arg287.stopPropagation());
    const boundingClientRect5 = arg290.getBoundingClientRect(),
      v365 = boundingClientRect5.left + boundingClientRect5.width / 2,
      v366 = boundingClientRect5.top + boundingClientRect5.height / 2,
      max39 = Math.max(1, Math.hypot(arg287.clientX - v365, arg287.clientY - v366)),
      max40 = Math.max(0.01, Math.min(5, Number(arg288.properties?.airflowScale || 1)));
    let v367 = max40,
      v368 = false;
    const currentTarget = arg287.currentTarget;
    currentTarget.setPointerCapture(arg287.pointerId);
    const v369 = () => {
        (this.syncAirflowLayerGeometry(arg289, arg288, arg291),
          this.updateAirflowHandleScale(arg288, arg290));
      },
      v370 = (arg292) => {
        const hypot2 = Math.hypot(arg292.clientX - v365, arg292.clientY - v366);
        ((v367 = Math.max(0.01, Math.min(5, (max40 * hypot2) / max39))),
          (arg288.properties = {
            ...(arg288.properties || {}),
            airflowScale: v367,
          }),
          v369(),
          this.options.onComponentPropertiesPreview?.(arg288.id, {
            airflowScale: v367,
          }));
      },
      v371 = () => {
        v368 ||
          ((v368 = true),
          currentTarget.removeEventListener("pointermove", v370),
          currentTarget.removeEventListener("pointerup", v371),
          currentTarget.removeEventListener("pointercancel", v371),
          currentTarget.removeEventListener("lostpointercapture", v371),
          v367 !== max40 &&
            this.options.onComponentProperties?.(arg288.id, {
              airflowScale: v367,
            }));
      };
    (currentTarget.addEventListener("pointermove", v370),
      currentTarget.addEventListener("pointerup", v371),
      currentTarget.addEventListener("pointercancel", v371),
      currentTarget.addEventListener("lostpointercapture", v371));
  }
  ["startAirflowRotate"](arg293, arg294, arg295, arg296, arg297) {
    (arg293.preventDefault(), arg293.stopPropagation());
    const boundingClientRect6 = arg296.getBoundingClientRect(),
      v372 = boundingClientRect6.left + boundingClientRect6.width / 2,
      v373 = boundingClientRect6.top + boundingClientRect6.height / 2,
      atan23 = Math.atan2(arg293.clientY - v373, arg293.clientX - v372),
      v374 = Number(arg294.properties?.airflowRotation || 0);
    let v375 = v374,
      v376 = false;
    const currentTarget2 = arg293.currentTarget;
    currentTarget2.setPointerCapture(arg293.pointerId);
    const v377 = (arg298) => {
        const atan24 = Math.atan2(arg298.clientY - v373, arg298.clientX - v372);
        ((v375 = v374 + ((atan24 - atan23) * 180) / Math.PI),
          (arg294.properties = {
            ...(arg294.properties || {}),
            airflowRotation: v375,
          }),
          this.syncAirflowLayerGeometry(arg295, arg294, arg297),
          this.options.onComponentPropertiesPreview?.(arg294.id, {
            airflowRotation: v375,
          }));
      },
      v378 = () => {
        v376 ||
          ((v376 = true),
          currentTarget2.removeEventListener("pointermove", v377),
          currentTarget2.removeEventListener("pointerup", v378),
          currentTarget2.removeEventListener("pointercancel", v378),
          currentTarget2.removeEventListener("lostpointercapture", v378),
          v375 !== v374 &&
            this.options.onComponentProperties?.(arg294.id, {
              airflowRotation: v375,
            }));
      };
    (currentTarget2.addEventListener("pointermove", v377),
      currentTarget2.addEventListener("pointerup", v378),
      currentTarget2.addEventListener("pointercancel", v378),
      currentTarget2.addEventListener("lostpointercapture", v378));
  }
  ["updateAirConditionerButtonSelectionBounds"](arg299, arg300, arg301) {
    if (!arg299 || arg300?.type !== "air-conditioner" || !arg301) return;
    const options34 = arg300.properties || {},
      max41 = Math.max(1, Number(arg300.position?.width || 100)),
      max42 = Math.max(1, Number(arg300.position?.height || 100)),
      max43 = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
      list12 = [],
      v379 = (arg302, arg303, arg304, arg305) => {
        const v380 = Number(arg302);
        return Math.max(arg303, Math.min(arg304, Number.isFinite(v380) ? v380 : arg305));
      },
      v381 = (arg306, arg307, arg308, arg309) => {
        list12.push({
          left: arg306 - arg308 / 2,
          top: arg307 - arg309 / 2,
          right: arg306 + arg308 / 2,
          bottom: arg307 + arg309 / 2,
        });
      },
      v382 = (arg310, arg311, arg312, arg313) => {
        const max44 = Math.max(arg313, Number(arg310?.offsetWidth || 0) * max43),
          max45 = Math.max(arg313, Number(arg310?.offsetHeight || 0) * max43),
          v383 = (max41 * v379(arg311, -100, 200, 0)) / 100,
          v384 = (max42 * v379(arg312, -100, 200, 50)) / 100;
        list12.push({
          left: v383,
          top: v384 - max45 / 2,
          right: v383 + max44,
          bottom: v384 + max45 / 2,
        });
      },
      v385 = (max42 * v379(options34.badgeSize, 1, 100, 28)) / 100;
    if (
      (options34.iconVisible !== false &&
        v381(
          (max41 * v379(options34.iconLeft, -100, 200, 20)) / 100,
          (max42 * v379(options34.iconTop, -100, 200, 50)) / 100,
          v385,
          v385,
        ),
      options34.mainTextVisible !== false &&
        v382(
          arg299.querySelector(":scope > .hb-air-conditioner .hb-air-conditioner-text strong"),
          options34.mainTextLeft,
          options34.mainTextTop,
          (max42 * v379(options34.mainSize, 6, 120, 21)) / 100,
        ),
      options34.secondaryTextVisible !== false &&
        v382(
          arg299.querySelector(":scope > .hb-air-conditioner .hb-air-conditioner-text small"),
          options34.secondaryTextLeft,
          options34.secondaryTextTop,
          (max42 * v379(options34.secondarySize, 5, 80, 12)) / 100,
        ),
      !list12.length)
    ) {
      Object.assign(arg301.style, {
        left: "0px",
        top: "0px",
        width: max41 + "px",
        height: max42 + "px",
      });
      return;
    }
    const num15 = 4,
      v386 = Math.min(...list12.map((arg314) => arg314.left)) - num15,
      v387 = Math.min(...list12.map((arg315) => arg315.top)) - num15,
      v388 = Math.max(...list12.map((arg316) => arg316.right)) + num15,
      v389 = Math.max(...list12.map((arg317) => arg317.bottom)) + num15;
    Object.assign(arg301.style, {
      left: v386 + "px",
      top: v387 + "px",
      width: Math.max(1, v388 - v386) + "px",
      height: Math.max(1, v389 - v387) + "px",
    });
  }
  ["updateDeviceButtonSelectionBounds"](arg318, arg319, arg320) {
    if (!arg318 || arg319?.type !== "device-button" || !arg320) return false;
    const options35 = arg319.properties || {},
      v390 = options35.hiddenContentClickable === true,
      max46 = Math.max(1, Number(arg319.position?.width || 100)),
      max47 = Math.max(1, Number(arg319.position?.height || 100)),
      max48 = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
      list13 = [],
      v391 = (arg321, arg322, arg323, arg324) => {
        const v392 = Number(arg321);
        return Math.max(arg322, Math.min(arg323, Number.isFinite(v392) ? v392 : arg324));
      },
      v393 = (arg325, arg326, arg327, arg328) => {
        ![arg325, arg326, arg327, arg328].every(Number.isFinite) ||
          arg327 <= 0 ||
          arg328 <= 0 ||
          list13.push({
            left: arg325 - arg327 / 2,
            top: arg326 - arg328 / 2,
            right: arg325 + arg327 / 2,
            bottom: arg326 + arg328 / 2,
          });
      },
      v394 = (arg329, arg330, arg331, arg332) => {
        const max49 = Math.max(arg332, Number(arg329?.offsetWidth || 0) * max48),
          max50 = Math.max(arg332, Number(arg329?.offsetHeight || 0) * max48),
          v395 = (max46 * v391(arg330, -100, 200, 0)) / 100,
          v396 = (max47 * v391(arg331, -100, 200, 50)) / 100;
        list13.push({
          left: v395,
          top: v396 - max50 / 2,
          right: v395 + max49,
          bottom: v396 + max50 / 2,
        });
      },
      v397 = (max47 * v391(options35.badgeSize ?? options35.iconSize, 1, 100, 28)) / 100;
    if (
      ((options35.iconVisible !== false || v390) &&
        v393(
          (max46 * v391(options35.iconLeft, -100, 200, 20)) / 100,
          (max47 * v391(options35.iconTop, -100, 200, 50)) / 100,
          v397,
          v397,
        ),
      (options35.mainTextVisible !== false || v390) &&
        v394(
          arg318.querySelector(":scope > .hb-icon-button .hb-icon-button-text strong"),
          options35.mainTextLeft,
          options35.mainTextTop,
          (max47 * v391(options35.mainSize, 6, 120, 21)) / 100,
        ),
      (options35.secondaryTextVisible !== false || v390) &&
        v394(
          arg318.querySelector(":scope > .hb-icon-button .hb-icon-button-text small"),
          options35.secondaryTextLeft,
          options35.secondaryTextTop,
          (max47 * v391(options35.secondarySize, 5, 80, 12)) / 100,
        ),
      !list13.length)
    )
      return false;
    const num16 = 4,
      v398 = Math.min(...list13.map((arg333) => arg333.left)) - num16,
      v399 = Math.min(...list13.map((arg334) => arg334.top)) - num16,
      v400 = Math.max(...list13.map((arg335) => arg335.right)) + num16,
      v401 = Math.max(...list13.map((arg336) => arg336.bottom)) + num16;
    return (
      Object.assign(arg320.style, {
        left: v398 + "px",
        top: v399 + "px",
        width: Math.max(1, v400 - v398) + "px",
        height: Math.max(1, v401 - v399) + "px",
      }),
      true
    );
  }
  ["updateTitleButtonSelectionBounds"](arg337, arg338, arg339) {
    if (!arg337 || arg338?.type !== "title-button" || !arg339) return false;
    const options36 = arg338.properties || {},
      v402 = options36.hiddenContentClickable === true,
      max51 = Math.max(1, Number(arg338.position?.width || 100)),
      max52 = Math.max(1, Number(arg338.position?.height || 100)),
      max53 = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
      list14 = [],
      v403 = (arg340, arg341, arg342, arg343) => {
        ![arg340, arg341, arg342, arg343].every(Number.isFinite) ||
          arg342 <= 0 ||
          arg343 <= 0 ||
          list14.push({
            left: arg340,
            top: arg341,
            right: arg340 + arg342,
            bottom: arg341 + arg343,
          });
      },
      v404 = (arg344, arg345, arg346, arg347) => {
        const v405 = Number(arg344);
        return Math.max(arg345, Math.min(arg346, Number.isFinite(v405) ? v405 : arg347));
      };
    if (options36.frameVisible !== false || v402) {
      const v406 = v404(options36.frameSize, 10, 300, 100) / 100,
        v407 = max52 * 0.45 * v406,
        v408 = max51 / 2 + (max51 * v404(options36.frameOffsetX, -100, 100, 0)) / 100,
        v409 = max52 / 2 + (max52 * v404(options36.frameOffsetY, -100, 100, 0)) / 100,
        v410 = (max51 * v404(options36.frameSpacing, 0, 300, 100)) / 200,
        v411 = max52 * 0.12,
        v412 = v404(options36.frameWidth, 0, 12, 1.5);
      (v403(v408 - v410 - v412 / 2, v409 - v407 / 2 - v412 / 2, v411 + v412, v407 + v412),
        v403(v408 + v410 - v411 - v412 / 2, v409 - v407 / 2 - v412 / 2, v411 + v412, v407 + v412));
    }
    if (options36.mainTextVisible !== false || v402) {
      const selector19 = arg337.querySelector(":scope > .hb-title-button .hb-title-button-main"),
        v413 = (max52 * v404(options36.mainSize, 8, 200, 34)) / 100;
      v403(
        (max51 * v404(options36.mainTextLeft, -100, 200, 5.5)) / 100,
        (max52 * v404(options36.mainTextTop, -100, 200, 45)) / 100 - v413 / 2,
        Math.max(v413, Number(selector19?.offsetWidth || 0) * max53),
        Math.max(v413, Number(selector19?.offsetHeight || 0) * max53),
      );
    }
    if (options36.secondaryTextVisible !== false || v402) {
      const selector20 = arg337.querySelector(
          ":scope > .hb-title-button .hb-title-button-secondary",
        ),
        v414 = (max52 * v404(options36.secondarySize, 6, 100, 12)) / 100,
        max54 = Math.max(v414, Number(selector20?.offsetHeight || 0) * max53);
      v403(
        (max51 * v404(options36.secondaryTextLeft, -100, 200, 54)) / 100,
        (max52 * v404(options36.secondaryTextTop, -100, 200, 43)) / 100 - max54 / 2,
        Math.max(v414, Number(selector20?.offsetWidth || 0) * max53),
        max54,
      );
    }
    if ((options36.iconVisible !== false || v402) && options36.icon) {
      const v415 = (max52 * v404(options36.iconSize, 1, 100, 30)) / 100;
      v403(
        (max51 * v404(options36.iconLeft, -100, 200, 50)) / 100 - v415 / 2,
        (max52 * v404(options36.iconTop, -100, 200, 45)) / 100 - v415 / 2,
        v415,
        v415,
      );
    }
    if (options36.markerVisible !== false || v402) {
      const v416 = (max52 * v404(options36.markerSize, 2, 60, 10)) / 100,
        v417 = (max51 * v404(options36.markerLeft, -100, 200, 1.8)) / 100,
        v418 = (max52 * v404(options36.markerTop, -100, 200, 84)) / 100;
      v403(v417 - v416 * 0.58, v418, v416 * 1.16, v416);
    }
    if (!list14.length) return false;
    const num17 = 4,
      v419 = Math.min(...list14.map((arg348) => arg348.left)) - num17,
      v420 = Math.min(...list14.map((arg349) => arg349.top)) - num17,
      v421 = Math.max(...list14.map((arg350) => arg350.right)) + num17,
      v422 = Math.max(...list14.map((arg351) => arg351.bottom)) + num17;
    return (
      Object.assign(arg339.style, {
        left: v419 + "px",
        top: v420 + "px",
        width: Math.max(1, v421 - v419) + "px",
        height: Math.max(1, v422 - v420) + "px",
      }),
      true
    );
  }
  ["updateLightStatisticsSelectionBounds"](arg352, arg353, arg354) {
    if (!arg352 || arg353?.type !== "light-statistics" || !arg354 || arg352.hidden) return false;
    const selector21 = arg352.querySelector(":scope > .hb-light-statistics");
    if (!selector21) return false;
    const filter6 = [...selector21.children].filter((arg355) =>
      arg355.hidden || Number(arg355.offsetWidth || 0) <= 0 || Number(arg355.offsetHeight || 0) <= 0
        ? false
        : window.getComputedStyle?.(arg355).display !== "none",
    );
    if (!filter6.length) return false;
    const max55 = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
      num18 = 4,
      v423 = (Math.min(...filter6.map((arg356) => arg356.offsetLeft)) - num18) * max55,
      v424 = (Math.min(...filter6.map((arg357) => arg357.offsetTop)) - num18) * max55,
      v425 =
        (Math.max(...filter6.map((arg358) => arg358.offsetLeft + arg358.offsetWidth)) + num18) *
        max55,
      v426 =
        (Math.max(...filter6.map((arg359) => arg359.offsetTop + arg359.offsetHeight)) + num18) *
        max55;
    return (
      Object.assign(arg354.style, {
        left: v423 + "px",
        top: v424 + "px",
        width: Math.max(1, v425 - v423) + "px",
        height: Math.max(1, v426 - v424) + "px",
      }),
      true
    );
  }
  ["updateTextSelectionBounds"](arg360, arg361, arg362) {
    return !arg360 || !["time", "date", "weather"].includes(arg361?.type) || !arg362
      ? false
      : this.withSelectionMeasurementHost(arg360, () => {
          const selector22 = arg360.querySelector(
            ":scope > .hb-time-component, :scope > .hb-date-component, :scope > .hb-weather-component",
          );
          if (!selector22) return false;
          const filter7 = (
              arg361.type === "time"
                ? [
                    ...selector22.querySelectorAll(
                      ":scope > .hb-time-value, :scope > .hb-time-period",
                    ),
                  ]
                : arg361.type === "date"
                  ? [
                      ...selector22.querySelectorAll(
                        ":scope > .hb-date-primary, :scope > .hb-date-lunar",
                      ),
                    ]
                  : [
                      ...selector22.querySelectorAll(
                        ":scope > .hb-weather-icon, :scope > .hb-weather-content > strong, :scope > .hb-weather-content > small",
                      ),
                    ]
            ).filter((arg363) => this.selectionElementIsVisible(arg363)),
            max56 = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
            max57 = Math.max(1, Number(arg361.position?.width || 100)),
            max58 = Math.max(1, Number(arg361.position?.height || 100));
          if (!filter7.length) {
            const min12 = Math.min(32, Math.max(20, Math.min(max57, max58) * 0.2));
            return (
              Object.assign(arg362.style, {
                left: (max57 - min12) / 2 + "px",
                top: (max58 - min12) / 2 + "px",
                width: min12 + "px",
                height: min12 + "px",
              }),
              false
            );
          }
          const map17 = filter7.map((arg364) => this.selectionElementBox(arg364, arg360)),
            num19 = 3,
            v427 = (Math.min(...map17.map((arg365) => arg365.left)) - num19) * max56,
            v428 = (Math.min(...map17.map((arg366) => arg366.top)) - num19) * max56,
            v429 = (Math.max(...map17.map((arg367) => arg367.left + arg367.width)) + num19) * max56,
            v430 = (Math.max(...map17.map((arg368) => arg368.top + arg368.height)) + num19) * max56;
          return (
            Object.assign(arg362.style, {
              left: v427 + "px",
              top: v428 + "px",
              width: Math.max(1, v429 - v427) + "px",
              height: Math.max(1, v430 - v428) + "px",
            }),
            true
          );
        });
  }
  async ["updateImageSelectionBounds"](arg369, arg370, arg371) {
    const selector23 = arg369.querySelector(":scope > .hb-image-component");
    if (
      !selector23 ||
      ((!selector23.complete || !selector23.naturalWidth) &&
        (await new Promise((arg372) => {
          (selector23.addEventListener("load", arg372, {
            once: true,
          }),
            selector23.addEventListener("error", arg372, {
              once: true,
            }));
        })),
      !arg369.isConnected ||
        !arg371.isConnected ||
        !selector23.naturalWidth ||
        !selector23.naturalHeight)
    )
      return;
    const v431 = Number(arg370.position?.width || 100),
      v432 = Number(arg370.position?.height || 100),
      v433 = selector23.naturalWidth / selector23.naturalHeight,
      v434 = v431 / v432,
      v435 = v433 >= v434 ? v431 : v432 * v433,
      v436 = v433 >= v434 ? v431 / v433 : v432,
      v437 = (v431 - v435) / 2,
      v438 = (v432 - v436) / 2;
    Object.assign(arg371.style, {
      left: (v437 / v431) * 100 + "%",
      top: (v438 / v432) * 100 + "%",
      width: (v435 / v431) * 100 + "%",
      height: (v436 / v432) * 100 + "%",
    });
  }
  ["updateTransformHandleScale"](arg373, arg374, v439 = null) {
    if (!arg373 || !arg374) return;
    const min13 = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1),
      max59 = Math.max(0.01, Math.min(5, Number(arg374.style?.scale || 1))),
      scale4 = this.componentParentTransform(arg374.id).scale,
      v440 = 1 / Math.max(0.001, min13 * max59 * scale4),
      selector24 =
        v439 ||
        this.componentSelectionOverlays
          .get(arg374.id)
          ?.querySelector(":scope > .hb-selection-bounds") ||
        arg373.querySelector(":scope > .hb-selection-bounds");
    if (!selector24) return;
    (selector24.style.setProperty("--hb-ui-scale", String(v440)),
      selector24.style.setProperty("--hb-handle-outset", 30 * v440 + "px"));
    const boundingClientRect7 = selector24.getBoundingClientRect();
    selector24.classList.toggle(
      "handles-outside",
      boundingClientRect7.width < 132 || boundingClientRect7.height < 112,
    );
  }
  ["startComponentScale"](arg375, arg376, arg377, arg378) {
    (arg375.preventDefault(), arg375.stopPropagation());
    const boundingClientRect8 = arg378?.getBoundingClientRect() || arg377.getBoundingClientRect(),
      v441 = boundingClientRect8.left + boundingClientRect8.width / 2,
      v442 = boundingClientRect8.top + boundingClientRect8.height / 2,
      max60 = Math.max(1, Math.hypot(arg375.clientX - v441, arg375.clientY - v442)),
      max61 = Math.max(0.01, Math.min(5, Number(arg376.style?.scale || 1)));
    let v443 = max61,
      v444 = false;
    const pointerId6 = arg375.pointerId;
    arg375.currentTarget.setPointerCapture(pointerId6);
    const v445 = (arg379) => {
        if (arg379.pointerId !== pointerId6) return;
        const hypot3 = Math.hypot(arg379.clientX - v441, arg379.clientY - v442);
        ((v443 = Math.max(0.01, Math.min(5, (max61 * hypot3) / max60))),
          (arg376.style = {
            ...(arg376.style || {}),
            scale: v443,
          }),
          (arg377.style.transform =
            "rotate(" + Number(arg376.position?.rotation || 0) + "deg) scale(" + v443 + ")"));
        const v446 = this.componentSelectionOverlays.get(arg376.id);
        (v446 && (v446.style.transform = arg377.style.transform),
          this.updateTransformHandleScale(arg377, arg376, arg378),
          this.options.onComponentTransformPreview?.(arg376.id, {
            scale: v443,
          }));
      },
      v447 = (v448 = null) => {
        v444 ||
          (v448?.pointerId != null && v448.pointerId !== pointerId6) ||
          ((v444 = true),
          window.removeEventListener("pointermove", v445, true),
          window.removeEventListener("pointerup", v447, true),
          window.removeEventListener("pointercancel", v447, true),
          window.removeEventListener("blur", v447),
          (arg376.style = {
            ...(arg376.style || {}),
            scale: v443,
          }),
          v443 !== max61 &&
            this.options.onComponentTransform?.(arg376.id, {
              scale: v443,
            }));
      };
    (window.addEventListener("pointermove", v445, true),
      window.addEventListener("pointerup", v447, true),
      window.addEventListener("pointercancel", v447, true),
      window.addEventListener("blur", v447));
  }
  ["startComponentRotate"](arg380, arg381, arg382, arg383) {
    (arg380.preventDefault(), arg380.stopPropagation());
    const boundingClientRect9 = arg383?.getBoundingClientRect() || arg382.getBoundingClientRect(),
      v449 = boundingClientRect9.left + boundingClientRect9.width / 2,
      v450 = boundingClientRect9.top + boundingClientRect9.height / 2,
      atan25 = Math.atan2(arg380.clientY - v450, arg380.clientX - v449),
      v451 = Number(arg381.position?.rotation || 0);
    let v452 = v451,
      v453 = false;
    const pointerId7 = arg380.pointerId;
    arg380.currentTarget.setPointerCapture(pointerId7);
    const v454 = (arg384) => {
        if (arg384.pointerId !== pointerId7) return;
        const atan26 = Math.atan2(arg384.clientY - v450, arg384.clientX - v449);
        ((v452 = v451 + ((atan26 - atan25) * 180) / Math.PI),
          (arg382.style.transform =
            "rotate(" + v452 + "deg) scale(" + Number(arg381.style?.scale || 1) + ")"));
        const v455 = this.componentSelectionOverlays.get(arg381.id);
        (v455 && (v455.style.transform = arg382.style.transform),
          this.options.onComponentTransformPreview?.(arg381.id, {
            rotation: v452,
          }));
      },
      v456 = (v457 = null) => {
        v453 ||
          (v457?.pointerId != null && v457.pointerId !== pointerId7) ||
          ((v453 = true),
          window.removeEventListener("pointermove", v454, true),
          window.removeEventListener("pointerup", v456, true),
          window.removeEventListener("pointercancel", v456, true),
          window.removeEventListener("blur", v456),
          (arg381.position = {
            ...(arg381.position || {}),
            rotation: v452,
          }),
          v452 !== v451 &&
            this.options.onComponentTransform?.(arg381.id, {
              rotation: v452,
            }));
      };
    (window.addEventListener("pointermove", v454, true),
      window.addEventListener("pointerup", v456, true),
      window.addEventListener("pointercancel", v456, true),
      window.addEventListener("blur", v456));
  }
  ["bindRuntimeActions"](arg385, arg386) {
    let value8 = null,
      value9 = null,
      value10 = null,
      v458 = false,
      value11 = null,
      value12 = null,
      num20 = 0,
      value13 = null,
      v459;
    const tap = ke(arg386, arg386.actions?.tap) ? arg386.actions.tap : null,
      doubleTap = ke(arg386, arg386.actions?.doubleTap) ? arg386.actions.doubleTap : null,
      hold = ke(arg386, arg386.actions?.hold) ? arg386.actions.hold : null,
      v460 = !!(tap?.type && tap.type !== "none"),
      v461 = !!(doubleTap?.type && doubleTap.type !== "none"),
      v462 = !!(hold?.type && hold.type !== "none"),
      v463 = () => {
        this.options.onRuntimeButtonPress?.(arg385);
      },
      v464 = () => {
        if (value13 || tap?.type !== "toggle") return;
        const v465 = arg386.bindings?.entity?.entityId;
        v465 &&
          !isVirtualEntityId2(v465) &&
          ((v459 = this.states.get(this.powerEntityId(arg386, v465))),
          (value13 = this.applyOptimisticToggle(v465, arg386)));
      },
      v466 = () => {
        (value13?.(), (value13 = null), (v459 = undefined));
      },
      v467 = () => {
        const v468 = value13,
          v469 = v459;
        ((value13 = null),
          (v459 = undefined),
          v460 &&
            this.runAction(arg386, tap, {
              optimisticAlreadyApplied: !!v468,
              optimisticRollback: v468,
              optimisticPreviousState: v469,
            }));
      };
    ((arg385.style.touchAction = "manipulation"),
      arg385.addEventListener("contextmenu", (arg387) => arg387.preventDefault()),
      arg385.addEventListener("selectstart", (arg388) => arg388.preventDefault()),
      arg385.addEventListener("dragstart", (arg389) => arg389.preventDefault()),
      arg385.addEventListener("pointerdown", (arg390) => {
        ((v458 = false),
          (value11 = {
            pointerId: arg390.pointerId,
            pointerType: arg390.pointerType || "mouse",
            x: arg390.clientX,
            y: arg390.clientY,
            moved: false,
          }),
          v462 &&
            (value10 = window.setTimeout(() => {
              ((v458 = true),
                (value12 = null),
                window.clearTimeout(value9),
                v463(),
                this.runAction(arg386, hold));
            }, 400)));
      }));
    const v470 = () => window.clearTimeout(value10);
    (arg385.addEventListener("pointermove", (arg391) => {
      !value11 ||
        value11.pointerId !== arg391.pointerId ||
        Math.hypot(arg391.clientX - value11.x, arg391.clientY - value11.y) <= 18 ||
        ((value11.moved = true), v470());
    }),
      arg385.addEventListener("pointerup", (arg392) => {
        v470();
        const value14 = value11?.pointerId === arg392.pointerId ? value11 : null;
        if (
          ((value11 = null), !value14 || value14.pointerType === "mouse" || value14.moved || v458)
        )
          return;
        (arg392.preventDefault(), (num20 = performance.now() + 700), (v460 || v461) && v463());
        const now2 = performance.now();
        if (
          v461 &&
          value12 &&
          now2 - value12.time <= 180 &&
          Math.hypot(arg392.clientX - value12.x, arg392.clientY - value12.y) <= 34
        ) {
          (window.clearTimeout(value9),
            v466(),
            (value12 = null),
            this.runAction(arg386, doubleTap));
          return;
        }
        ((value12 = {
          time: now2,
          x: arg392.clientX,
          y: arg392.clientY,
        }),
          v461
            ? (v464(),
              window.clearTimeout(value9),
              (value9 = window.setTimeout(() => {
                (v467(), (value12 = null));
              }, 180)))
            : (v460 && this.runAction(arg386, tap), (value12 = null)));
      }),
      arg385.addEventListener("pointercancel", () => {
        (v470(), (value11 = null));
      }),
      arg385.addEventListener("click", () => {
        performance.now() < num20 ||
          v458 ||
          ((v460 || v461) && v463(),
          v461
            ? (v464(),
              window.clearTimeout(value8),
              (value8 = window.setTimeout(() => {
                v467();
              }, 180)))
            : v460 && this.runAction(arg386, tap));
      }),
      arg385.addEventListener("dblclick", () => {
        (window.clearTimeout(value8), v466(), v461 && this.runAction(arg386, doubleTap));
      }),
      this.cleanups.push(() => {
        (window.clearTimeout(value8),
          window.clearTimeout(value9),
          window.clearTimeout(value10),
          v466());
      }));
  }
  ["runAction"](arg393, arg394, v471 = {}) {
    !arg394?.type ||
      arg394.type === "none" ||
      this.dispatchAction(arg393, arg394, v471).catch((arg395) => {
        (window.HABridgeLog?.error(arg395, {
          componentId: arg393.id,
          entityId: arg393.bindings?.entity?.entityId || "",
          phase: "component-action",
        }),
          this.options.onError?.(arg395));
      });
  }
  ["previewAction"](arg396, arg397) {
    arg397?.type === "more-info" &&
      this.showActionPopup(arg396, arg397, {
        preview: true,
      });
  }
  ["popupComponentForEntity"](arg398, v472 = "") {
    let v473 = String(arg398 || ""),
      v474 = v473.split(".")[0];
    const deviceProfile3 = this.deviceProfile(v473);
    deviceProfile3?.deviceType === "air-purifier" &&
      deviceProfile3.roles?.fan &&
      v474 !== "fan" &&
      ((v473 = deviceProfile3.roles.fan), (v474 = "fan"));
    const text10 = deviceProfile3?.roles?.climate || deviceProfile3?.roles?.fan || "";
    ["air-conditioner", "bath-heater"].includes(deviceProfile3?.deviceType) &&
      text10 &&
      !["climate", "light"].includes(v474) &&
      ((v473 = text10), (v474 = v473.split(".")[0]));
    const v475 = this.entityMetadata.get(v473);
    if (
      v474 === "sensor" &&
      v475?.deviceId &&
      ["state", "status", "task_status"].includes(v475.translationKey)
    ) {
      const v476 = [...this.entityMetadata.values()].find(
        (arg399) =>
          arg399.deviceId === v475.deviceId &&
          arg399.domain === "vacuum" &&
          entityMetadataIsAvailable2(arg399),
      );
      v476?.entityId && ((v473 = v476.entityId), (v474 = "vacuum"));
    }
    const text11 =
      deviceProfile3?.deviceType === "electric-bed"
        ? "electric-bed"
        : deviceProfile3?.deviceType === "air-purifier" && v474 === "fan"
          ? "air-purifier"
          : (["air-conditioner", "bath-heater"].includes(deviceProfile3?.deviceType) &&
                ["climate", "fan"].includes(v474)) ||
              v474 === "climate"
            ? "air-conditioner"
            : v474 === "water_heater"
              ? "water-heater"
              : v474 === "camera"
                ? "camera"
                : v474 === "media_player"
                  ? "media-player"
                  : ["fan", "select", "number", "input_number"].includes(v474)
                    ? "device-button"
                    : ["light", "switch", "input_boolean"].includes(v474)
                      ? "icon-button"
                      : v474 === "sensor"
                        ? "line-chart"
                        : v474 === "vacuum"
                          ? "vacuum-control"
                          : "device-button";
    return {
      id: "popup-" + v473,
      type: text11,
      bindings: {
        entity: {
          entityId: v473,
        },
      },
      properties: {
        label: v472 || "",
        ...(["air-conditioner", "bath-heater"].includes(deviceProfile3?.deviceType)
          ? {
              deviceType: deviceProfile3.deviceType,
            }
          : {}),
        ...(deviceProfile3?.deviceType === "air-purifier"
          ? {
              deviceType: "air-purifier",
            }
          : {}),
        ...(deviceProfile3?.deviceType === "electric-bed"
          ? {
              deviceType: "electric-bed",
            }
          : {}),
        ...(deviceProfile3?.coverKind
          ? {
              coverKind: deviceProfile3.coverKind,
            }
          : {}),
      },
      actions: {},
    };
  }
  ["showActionPopup"](arg400, arg401, { preview: v477 = false } = {}) {
    const text12 = arg401?.data?.popupSource || "current";
    if (text12 === "custom") {
      const v478 = (this.document?.customPopups || []).find(
        (arg402) => arg402.id === arg401.data?.popupId,
      );
      if (!v478) throw new Error("选择的组合弹窗不存在。");
      this.showCustomPopup(v478, {
        preview: v477,
      });
      return;
    }
    const v479 = arg400?.bindings?.entity?.entityId,
      includes3 =
        String(v479 || "").split(".", 1)[0] === "cover" ||
        ["camera", "line-chart", "air-conditioner", "icon-button"].includes(arg400?.type);
    let popupComponentForEntity =
      text12 === "entity"
        ? this.popupComponentForEntity(
            arg401.data?.entityId,
            componentDialogTitle(arg400, arg401.data?.title || arg401.data?.entityId),
          )
        : includes3
          ? arg400
          : this.popupComponentForEntity(v479, componentDialogTitle(arg400, ""));
    if (
      (text12 !== "entity" &&
        popupComponentForEntity !== arg400 &&
        arg400?.properties?.relatedEntities &&
        (popupComponentForEntity = {
          ...popupComponentForEntity,
          properties: {
            ...(popupComponentForEntity.properties || {}),
            relatedEntities: structuredClone(arg400.properties.relatedEntities),
          },
        }),
      !popupComponentForEntity?.bindings?.entity?.entityId)
    )
      throw new Error("该弹窗没有可用实体。");
    popupComponentForEntity.type === "camera"
      ? this.showCameraPreview(popupComponentForEntity, {
          preview: v477,
        })
      : this.showEntityDetails(popupComponentForEntity, {
          preview: v477,
        });
  }
  async ["dispatchAction"](
    arg403,
    arg404,
    {
      optimisticAlreadyApplied: v480 = false,
      optimisticRollback: v481 = null,
      optimisticPreviousState: v482,
    } = {},
  ) {
    if (arg404.type === "toggle") {
      const v483 = arg403.bindings?.entity?.entityId;
      if (!v483) throw new Error("该控件没有关联实体。");
      if (isVirtualEntityId2(v483)) {
        this.toggleVirtualEntity(v483);
        return;
      }
      const powerEntityId5 =
          typeof this.powerEntityId == "function" ? this.powerEntityId(arg403, v483) : v483,
        v484 = powerEntityId5.split(".", 1)[0];
      if (["button", "script"].includes(v484)) {
        const v485 = entityToggleCommand2(powerEntityId5, this.states.get(powerEntityId5), arg403);
        await this.callEntityService(v485.domain, v485.service, powerEntityId5, v485.data);
        return;
      }
      const v486 = v480 ? v482 : this.states.get(powerEntityId5),
        optimisticToggle = v480
          ? v481 || (() => {})
          : this.applyOptimisticToggle(powerEntityId5, arg403);
      try {
        if (v484 === "cover") {
          const map18 = new Map(this.states);
          (v486 === undefined ? map18.delete(powerEntityId5) : map18.set(powerEntityId5, v486),
            await this.callEntityService(
              "cover",
              coverToggleServiceForComponent2(arg403, this.entityMetadata, map18, powerEntityId5),
              powerEntityId5,
            ));
        } else {
          if (["climate", "fan", "water_heater", "media_player"].includes(v484)) {
            const runtimePowerComponent4 =
                typeof this.runtimePowerComponent == "function"
                  ? this.runtimePowerComponent(arg403, v483)
                  : arg403,
              v487 = entityToggleCommand2(powerEntityId5, v486, runtimePowerComponent4);
            await this.callEntityService(v487.domain, v487.service, powerEntityId5, v487.data);
          } else await this.callEntityService("homeassistant", "toggle", powerEntityId5);
        }
      } catch (v488) {
        throw (optimisticToggle(), v488);
      }
      return;
    }
    if (arg404.type === "more-info") {
      this.showActionPopup(arg403, arg404);
      return;
    }
    if (arg404.type === "navigate") {
      if (!arg404.target || !this.document?.pages?.some((arg405) => arg405.path === arg404.target))
        throw new Error("跳转的页面不存在。");
      this.navigate(arg404.target);
    }
  }
  async ["callEntityService"](arg406, arg407, arg408, v489 = {}) {
    const v490 = await fetch("/api/v1/ha/services/call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        domain: arg406,
        service: arg407,
        entityId: arg408,
        data: v489,
      }),
      hbLogContext: {
        entityId: arg408,
        service: arg406 + "." + arg407,
        phase: "device-control",
      },
    });
    if (!v490.ok) {
      const v491 = await v490.json().catch(() => ({})),
        error = new Error(
          typeof v491.detail == "string" ? v491.detail : v491.detail?.message || "实体操作失败。",
        );
      throw window.HABridgeLog?.linkError(error, v490) || error;
    }
  }
  async ["browseMedia"](arg409, v492 = "media-source://", v493 = "") {
    const v494 = await fetch("/api/v1/ha/media/browse", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          entityId: arg409,
          mediaContentId: v492,
          mediaContentType: v493,
        }),
      }),
      v495 = await v494.json().catch(() => ({}));
    if (!v494.ok) throw new Error(v495.detail || "媒体目录读取失败。");
    return v495.result || {};
  }
  ["createMediaBrowserControl"](arg410, { preview: v496 = false } = {}) {
    const element76 = document.createElement("section");
    element76.className = "hb-media-browser";
    const element77 = document.createElement("button");
    ((element77.type = "button"),
      (element77.className = "hb-media-browser-trigger"),
      (element77.innerHTML = '<span aria-hidden="true"></span>'),
      element77.setAttribute("aria-label", "选择本地媒体"),
      element77.setAttribute("title", "选择本地媒体"),
      element77.setAttribute("aria-expanded", "false"),
      (element77.disabled = v496));
    const element78 = document.createElement("div");
    ((element78.className = "hb-media-browser-panel"), (element78.hidden = true));
    const element79 = document.createElement("div");
    element79.className = "hb-media-browser-toolbar";
    const element80 = document.createElement("button");
    ((element80.type = "button"),
      (element80.className = "hb-media-browser-back"),
      (element80.textContent = "返回"),
      (element80.hidden = true));
    const element81 = document.createElement("strong");
    ((element81.className = "hb-media-browser-location"), (element81.textContent = "媒体库"));
    const element82 = document.createElement("span");
    element82.className = "hb-media-browser-status";
    const element83 = document.createElement("button");
    ((element83.type = "button"),
      (element83.className = "hb-media-browser-close"),
      (element83.textContent = "×"),
      element83.setAttribute("aria-label", "关闭媒体选择"),
      element79.append(element80, element81, element82, element83));
    const element84 = document.createElement("div");
    ((element84.className = "hb-media-browser-list"),
      element78.append(element79, element84),
      element76.append(element77));
    let text13 = "media-source://",
      text14 = "",
      list15 = [],
      v497 = false,
      v498 = false;
    const v499 = (v500 = "") => {
        element82.textContent = v500;
      },
      v501 = () => {
        ((element78.hidden = true), element77.setAttribute("aria-expanded", "false"));
      },
      v502 = (arg411) => {
        ((v497 = !!arg411),
          (element77.disabled = v496 || v497 || !v498),
          (element80.disabled = v497),
          element84.querySelectorAll("button").forEach((arg412) => {
            arg412.disabled = v497;
          }));
      },
      v503 = (arg413) =>
        String(arg413?.title || arg413?.name || arg413?.media_content_id || "未命名媒体"),
      v504 = async (arg414, v505 = "", { pushHistory: v506 = true } = {}) => {
        if (!(v497 || v496 || !v498)) {
          (v502(true), v499("读取中…"));
          try {
            const browseMedia = await this.browseMedia(arg410, arg414, v505);
            (v506 &&
              text13 !== arg414 &&
              list15.push({
                id: text13,
                type: text14,
                title: element81.textContent,
              }),
              (text13 = arg414),
              (text14 = v505 || ""),
              (element81.textContent = v503(browseMedia) || "媒体库"),
              (element80.hidden = list15.length === 0),
              element84.replaceChildren());
            const children2 = Array.isArray(browseMedia?.children) ? browseMedia.children : [];
            if (!children2.length) {
              const element85 = document.createElement("p");
              ((element85.className = "hb-media-browser-empty"),
                (element85.textContent = "此处没有可播放的媒体。"),
                element84.append(element85));
            }
            (children2.forEach((arg415) => {
              const element86 = document.createElement("div");
              element86.className = "hb-media-browser-item";
              const element87 = document.createElement("span");
              ((element87.className = "hb-media-browser-item-title"),
                (element87.textContent = v503(arg415)));
              const element88 = document.createElement("button");
              element88.type = "button";
              const v507 = !!(arg415?.can_expand || arg415?.children),
                v508 = !!arg415?.can_play;
              ((element88.textContent = v507 ? "打开" : "播放"),
                (element88.disabled = !v507 && !v508),
                element88.addEventListener("click", async () => {
                  if (v507) {
                    await v504(arg415.media_content_id, arg415.media_content_type || "", {
                      pushHistory: true,
                    });
                    return;
                  }
                  if (!(!v508 || v497)) {
                    (v502(true), v499("发送播放…"));
                    try {
                      (await this.callEntityService("media_player", "play_media", arg410, {
                        media_content_id: arg415.media_content_id,
                        media_content_type: arg415.media_content_type || "music",
                      }),
                        v499(""));
                    } catch (v509) {
                      (v499(v509.message || "播放失败"), this.options.onError?.(v509));
                    } finally {
                      v502(false);
                    }
                  }
                }),
                element86.append(element87, element88),
                element84.append(element86));
            }),
              (element78.hidden = false),
              element77.setAttribute("aria-expanded", "true"),
              v499(children2.length ? children2.length + " 项" : ""));
          } catch (v510) {
            const list16 = String(v510?.message || "媒体目录读取失败");
            (v499(list16.includes("Media directory does not exist") ? "此目录暂无媒体" : list16),
              element84.replaceChildren());
            const element89 = document.createElement("p");
            ((element89.className = "hb-media-browser-empty"),
              (element89.textContent = list16.includes("Media directory does not exist")
                ? "此目录暂无可用媒体。"
                : list16),
              element84.append(element89),
              (element78.hidden = false),
              element77.setAttribute("aria-expanded", "true"));
          } finally {
            v502(false);
          }
        }
      };
    return (
      element77.addEventListener("click", () => {
        if (!element78.hidden) {
          v501();
          return;
        }
        v504(text13, text14, {
          pushHistory: false,
        });
      }),
      element83.addEventListener("click", v501),
      element80.addEventListener("click", async () => {
        const pop = list15.pop();
        pop &&
          (await v504(pop.id, pop.type, {
            pushHistory: false,
          }),
          (element81.textContent = pop.title || "媒体库"),
          (element80.hidden = list15.length === 0));
      }),
      {
        root: element76,
        panel: element78,
        sync: (arg416) => {
          ((v498 = !!(Number(arg416?.attributes?.supported_features || 0) & 512)),
            (element76.hidden = !v498),
            v498 || v501(),
            (element77.disabled = v496 || v497 || !v498));
        },
        cleanup: () => {
          (element76.remove(), element78.remove());
        },
      }
    );
  }
  ["registerRuntimeDialogScale"](arg417, arg418, arg419, arg420) {
    const v511 = runtimeDialogUsesStableMotion2();
    (arg417.classList.toggle("hb-runtime-stable-motion", v511),
      arg417.classList.toggle(
        "hb-runtime-simplified-motion",
        v511 && arg418.classList.contains("hb-custom-popup-dialog"),
      ));
    const options37 = {
      dialogLayer: arg417,
      dialog: arg418,
      designWidth: Math.max(1, Number(arg419) || 1),
      designHeight: Math.max(1, Number(arg420) || 1),
      fillAvailable:
        arg418.dataset.runtimeDialogLayout === "fill" ||
        arg418.classList.contains("media-player-details"),
      tightFill: arg418.classList.contains("media-player-details"),
      targetOccupancy: arg418.dataset.runtimeDialogLayout === "compact" ? gs : mn,
      measureFrame: 0,
      layoutObserver: null,
      entranceAnimations: [],
    };
    ((this.runtimeDialogScaleContext = options37),
      arg418.classList.add("hb-runtime-scaled-dialog"),
      (arg418.style.width = options37.designWidth + "px"),
      (arg418.style.minWidth = options37.designWidth + "px"),
      (arg418.style.maxWidth = "none"),
      (arg418.style.height = "auto"),
      (arg418.style.minHeight = "0"),
      (arg418.style.maxHeight = "none"),
      (arg418.style.boxSizing = "border-box"),
      arg418.style.setProperty("--hb-runtime-dialog-design-height", options37.designHeight + "px"));
    const selector25 = arg418.querySelector(":scope > .hb-custom-popup-card");
    (selector25 &&
      ((selector25.style.width = options37.designWidth + "px"),
      (selector25.style.minWidth = options37.designWidth + "px"),
      (selector25.style.maxWidth = "none")),
      this.updateRuntimeDialogScale(),
      (options37.measureFrame = window.requestAnimationFrame(() => {
        ((options37.measureFrame = 0),
          this.runtimeDialogScaleContext === options37 &&
            (this.updateRuntimeDialogScale(),
            arg418.open &&
              (options37.entranceAnimations = playStableRuntimeDialogEntrance2(arg417, arg418))));
      })),
      (options37.layoutObserver = new ResizeObserver(() => {
        this.runtimeDialogScaleContext !== options37 ||
          options37.measureFrame ||
          (options37.measureFrame = window.requestAnimationFrame(() => {
            ((options37.measureFrame = 0),
              this.runtimeDialogScaleContext === options37 && this.updateRuntimeDialogScale());
          }));
      })),
      options37.layoutObserver.observe(arg418),
      selector25 && options37.layoutObserver.observe(selector25));
  }
  ["updateRuntimeDialogScale"]() {
    const runtimeDialogScaleContext = this.runtimeDialogScaleContext;
    if (
      !runtimeDialogScaleContext?.dialog?.isConnected ||
      !runtimeDialogScaleContext.dialogLayer?.isConnected
    )
      return;
    const boundingClientRect10 = runtimeDialogScaleContext.dialogLayer.getBoundingClientRect(),
      v512 = this.viewport?.getBoundingClientRect(),
      runtimeDialogViewport2 = runtimeDialogViewport({
        layerLeft: boundingClientRect10.left,
        layerTop: boundingClientRect10.top,
        layerWidth:
          boundingClientRect10.width ||
          runtimeDialogScaleContext.dialogLayer.clientWidth ||
          this.container.clientWidth,
        layerHeight:
          boundingClientRect10.height ||
          runtimeDialogScaleContext.dialogLayer.clientHeight ||
          this.container.clientHeight,
        dashboardLeft: v512?.left,
        dashboardTop: v512?.top,
        dashboardWidth: v512?.width,
        dashboardHeight: v512?.height,
      }),
      width = runtimeDialogViewport2.width,
      height = runtimeDialogViewport2.height,
      max62 = Math.max(
        Number(runtimeDialogScaleContext.dialog.offsetWidth || 0),
        Number(runtimeDialogScaleContext.dialog.scrollWidth || 0),
      ),
      max63 = Math.max(
        Number(runtimeDialogScaleContext.dialog.offsetHeight || 0),
        Number(runtimeDialogScaleContext.dialog.scrollHeight || 0),
      ),
      designWidth = max62 > 1 ? max62 : runtimeDialogScaleContext.designWidth,
      designHeight = max63 > 1 ? max63 : runtimeDialogScaleContext.designHeight,
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
  ["clearRuntimeDialogScale"](arg421) {
    if (this.runtimeDialogScaleContext?.dialog === arg421) {
      (window.cancelAnimationFrame(this.runtimeDialogScaleContext.measureFrame || 0),
        this.runtimeDialogScaleContext.layoutObserver?.disconnect());
      for (const v513 of this.runtimeDialogScaleContext.entranceAnimations || []) v513.cancel();
      (arg421.classList.remove("hb-runtime-scaled-dialog"),
        (this.runtimeDialogScaleContext = null));
    }
  }
  ["closeRuntimeDialog"](v514 = this.detailsDialog, { preservePending: v515 = false } = {}) {
    (v515 || this.cancelPendingEntityDetails(),
      v514 &&
        (v514.open ? v514.close() : v514.dispatchEvent(new Event("close")),
        v514.isConnected && v514.remove(),
        this.detailsDialog === v514 && (this.detailsDialog = null),
        this.detailsStateSync?.dialog === v514 && (this.detailsStateSync = null)));
  }
  ["bindRuntimeDialogOutsideDismiss"](arg422, arg423, arg424) {
    const v516 = performance.now() + 320;
    arg422.addEventListener("click", (arg425) => {
      arg424.contains(arg425.target) ||
        (arg425.preventDefault(),
        arg425.stopPropagation(),
        !(performance.now() < v516) && arg423.close());
    });
  }
  ["openInteraction3dCameraPreview"](arg426, arg427, v517 = {}) {
    this.showCameraPreview(
      {
        id: "camera:" + arg426.id,
        type: "camera",
        properties: {
          label: arg426.label,
        },
        bindings: {
          entity: {
            entityId: arg426.entityId,
          },
        },
      },
      {
        interaction3d: v517,
      },
    );
    const detailsDialog = this.detailsDialog;
    return (
      detailsDialog?.addEventListener("close", arg427, {
        once: true,
      }),
      {
        updateLayout: () => detailsDialog?.resizeInteraction3d?.(),
        close: () => {
          (detailsDialog?.removeEventListener("close", arg427), detailsDialog?.close());
        },
        contains: (arg428) => detailsDialog?.contains(arg428),
      }
    );
  }
  ["showCameraPreview"](arg429, { preview: v518 = false, interaction3d: v519 = null } = {}) {
    const v520 = arg429.bindings?.entity?.entityId;
    if (!v520) throw new Error("该摄像头控件没有关联实体。");
    this.closeRuntimeDialog();
    const element90 = document.createElement("dialog");
    ((element90.className = "hb-camera-preview-dialog fit-media-ratio"),
      (element90.dataset.componentId = arg429.id || ""));
    const element91 = document.createElement("div");
    element91.className = "hb-camera-preview-card";
    const element92 = document.createElement("div");
    element92.className = "hb-camera-preview-heading";
    const element93 = document.createElement("div"),
      element94 = document.createElement("strong");
    element94.textContent = componentDialogTitle(arg429, "摄像头实时预览");
    const element95 = document.createElement("span");
    ((element95.className = "hb-camera-preview-status"),
      (element95.textContent = v519 ? "正在加载画面" : "正在连接"),
      element95.classList.add("is-connecting"),
      element93.append(element94, element95));
    const element96 = document.createElement("button");
    ((element96.type = "button"),
      element96.setAttribute("aria-label", "关闭摄像头预览"),
      (element96.textContent = "×"),
      element92.append(element93, element96));
    const element97 = document.createElement("section");
    ((element97.className = "hb-camera-device-visual"),
      element97.setAttribute("aria-hidden", "true"));
    const element98 = document.createElement("i");
    element98.className = "hb-camera-device-mount";
    const element99 = document.createElement("i");
    element99.className = "hb-camera-device-arm";
    const element100 = document.createElement("div");
    element100.className = "hb-camera-device-body";
    const element101 = document.createElement("i");
    element101.className = "hb-camera-device-lens";
    const element102 = document.createElement("i");
    ((element102.className = "hb-camera-device-led"),
      element100.append(element101, element102),
      element97.append(element98, element99, element100));
    let num21 = 0,
      value15 = null,
      num22 = 0;
    const v521 = (arg430, v522 = 0) =>
        "translateX(-50%) perspective(260px) rotateY(" +
        arg430 +
        "deg) rotateZ(" +
        arg430 * 0.035 +
        "deg) translateY(" +
        v522 +
        "px)",
      v523 = () => {
        if (!element100.isConnected) return;
        const filter8 = [-22, -16, -9, -4, 0, 6, 12, 18, 23].filter(
            (arg431) => Math.abs(arg431 - num22) >= 7,
          ),
          num23 = filter8[Math.floor(Math.random() * filter8.length)] ?? 0,
          num24 = Math.sign(num23 - num22) || 1,
          abs = Math.abs(num23 - num22),
          round = Math.round(430 + abs * 18 + Math.random() * 320),
          v524 = num23 + num24 * (1.4 + Math.random() * 2.2),
          v525 = Math.random() * 1.4 - 0.7;
        (element101.style.setProperty("--hb-camera-lens-shift", (num23 / 23) * 2.5 + "px"),
          value15?.cancel(),
          (value15 = element100.animate(
            [
              {
                transform: v521(num22, 0),
                offset: 0,
              },
              {
                transform: v521(v524, v525),
                offset: 0.78,
              },
              {
                transform: v521(num23, v525 * 0.35),
                offset: 1,
              },
            ],
            {
              duration: round,
              easing: "cubic-bezier(.2,.72,.22,1)",
              fill: "forwards",
            },
          )),
          value15.addEventListener(
            "finish",
            () => {
              ((num22 = num23),
                (element100.style.transform = v521(num22, v525 * 0.35)),
                value15?.cancel(),
                (value15 = null));
              const v526 =
                Math.random() < 0.22 ? 180 + Math.random() * 260 : 680 + Math.random() * 1500;
              num21 = window.setTimeout(v523, v526);
            },
            {
              once: true,
            },
          ));
      };
    !v519 &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches &&
      (num21 = window.setTimeout(v523, 620));
    const element103 = document.createElement("div");
    ((element103.className = "hb-camera-preview-stage"), element103.classList.add("is-connecting"));
    const element104 = document.createElement("i");
    ((element104.className = "hb-camera-preview-reveal-veil"),
      element104.setAttribute("aria-hidden", "true"));
    const element105 = document.createElement("i");
    ((element105.className = "hb-camera-preview-scan-line"),
      element105.setAttribute("aria-hidden", "true"),
      element103.append(element104, element105));
    const v527 = !!v519,
      v528 = arg429.properties?.mediaVisible !== false;
    (element103.classList.toggle("is-16-9", !v527),
      element103.classList.toggle("media-hidden", !v528));
    const list17 = [];
    let v529 = false;
    const v530 = () => {
        v529 ||
          ((v529 = true),
          (element95.textContent = "实时画面"),
          element95.classList.remove("is-connecting", "is-unavailable"),
          element95.classList.add("is-live"),
          element97.classList.remove("is-unavailable"),
          element97.classList.add("is-live"),
          element103.classList.remove("is-connecting", "is-unavailable", "is-revealing"),
          element103.classList.add("is-ready"));
      },
      v531 = () => {
        ((element95.textContent = "画面不可用"),
          element95.classList.remove("is-connecting", "is-live"),
          element95.classList.add("is-unavailable"),
          element97.classList.remove("is-live"),
          element97.classList.add("is-unavailable"),
          element103.classList.remove("is-connecting", "is-revealing"),
          element103.classList.add("is-unavailable"));
      };
    let v532 = v519 ? cameraPreviewRatio2(v520) : 16 / 9;
    const v533 = () => {
      if (v519) {
        ((element103.style.aspectRatio = String(v532)), element90.resizeInteraction3d?.());
        return;
      }
      const max64 = Math.max(280, this.container.clientWidth - 32),
        max65 = Math.max(180, Math.min(625, this.container.clientHeight - 88)),
        min14 = Math.min(760, max64, max65 * v532),
        v534 = min14 / v532;
      ((element90.style.width = Math.max(280, min14) + "px"),
        (element103.style.aspectRatio = String(v532)),
        (element103.style.borderRadius = "16px"));
    };
    if (v528 && !v518) {
      const element106 = document.createElement("span");
      ((element106.textContent = "正在载入摄像头实时预览"), element103.append(element106));
      const v535 = mountCameraMedia2({
          container: element103,
          entityId: v520,
          label: element94.textContent,
          objectFit: v519 ? "contain" : "fill",
          placeholder: element106,
          onReady: v530,
          onUnavailable: v531,
          cleanup: (arg432) => list17.push(arg432),
        }),
        v536 = (arg433, arg434) => {
          !v527 ||
            !Number.isFinite(arg433) ||
            !Number.isFinite(arg434) ||
            arg433 <= 0 ||
            arg434 <= 0 ||
            ((v532 = arg433 / arg434), cameraPreviewRatio2(v520, v532), v533());
        },
        v537 = () => v536(v535.video.videoWidth, v535.video.videoHeight),
        v538 = () => v536(v535.image.naturalWidth, v535.image.naturalHeight);
      (v535.video.addEventListener("loadedmetadata", v537),
        v535.video.addEventListener("resize", v537),
        v535.image.addEventListener("load", v538),
        list17.push(() => v535.video.removeEventListener("loadedmetadata", v537)),
        list17.push(() => v535.video.removeEventListener("resize", v537)),
        list17.push(() => v535.image.removeEventListener("load", v538)));
    } else {
      if (v518) {
        ((element95.textContent = "预览模式"),
          element95.classList.remove("is-connecting"),
          element103.classList.remove("is-connecting"),
          element103.classList.add("is-ready"));
        const element107 = document.createElement("span");
        ((element107.textContent = "预览模式不获取摄像头实时画面"), element103.append(element107));
      } else {
        ((element95.textContent = "画面已隐藏"),
          element95.classList.remove("is-connecting"),
          element103.classList.remove("is-connecting"),
          element103.classList.add("is-ready"));
        const element108 = document.createElement("span");
        ((element108.textContent = "摄像头画面已隐藏"), element103.append(element108));
      }
    }
    (window.addEventListener("resize", v533),
      list17.push(() => window.removeEventListener("resize", v533)),
      v533(),
      element91.append(element92, ...(v519 ? [] : [element97]), element103),
      element90.append(element91));
    const element109 = document.createElement("div");
    if (
      ((element109.className =
        "hb-renderer-runtime-dialog-layer" +
        (this.options.editable ? "" : " hb-runtime-no-select")),
      (element109.tabIndex = -1),
      element109.append(element90),
      this.container.append(element109),
      (this.detailsDialog = element90),
      v519)
    ) {
      (element109.classList.add("i3d-vacuum-dialog-layer"),
        element90.classList.add("i3d-vacuum-details", "i3d-camera-details"));
      const container = v519.root || this.container;
      (container.append(element109),
        element90.style.setProperty(
          "--i3d-panel-opacity",
          String(
            Math.max(
              0,
              Math.min(100, Number.isFinite(v519.popupOpacity) ? v519.popupOpacity : 74),
            ) / 100,
          ),
        ));
      const v539 = () => {
        const v540 = v519.getPresentationLayout?.(),
          v541 = v540?.fixedUi === true && v540?.sourceWidth > 0 && v540?.sourceHeight > 0,
          sourceWidth = v541
            ? v540.sourceWidth
            : v540?.width > 0
              ? v540.width
              : container.clientWidth,
          sourceHeight = v541
            ? v540.sourceHeight
            : v540?.height > 0
              ? v540.height
              : container.clientHeight,
          v542 = container.clientWidth / Math.max(1, sourceWidth),
          v543 = container.clientHeight / Math.max(1, sourceHeight),
          v544 = () =>
            Math.ceil(
              parseFloat(window.getComputedStyle?.(element92)?.height) ||
                element92.offsetHeight ||
                58,
            );
        let v545 = cameraPopupLayout2(sourceWidth, sourceHeight, v532, v544());
        ((element90.style.width = v545.panelWidth + "px"),
          (v545 = cameraPopupLayout2(sourceWidth, sourceHeight, v532, v544())));
        const { panelWidth: v546, mediaHeight: v547, top: v548 } = v545,
          v549 = popupPlacement2({
            width: sourceWidth,
            height: sourceHeight,
            panelWidth: v546,
            panelHeight: v547 + v544() + 26,
            defaultScale: 2,
            defaultTop: v541 ? v545.top : v548,
            settings: v519.getPopupLayout?.(),
          }),
          v550 = v549.top * v543;
        ((element90.style.width = v546 + "px"),
          (element103.style.height = v547 + "px"),
          (element90.style.top = v550 + "px"),
          (element90.style.right = v549.right * v542 + "px"),
          (element90.style.transform =
            "scale(" + v549.scale * v542 + "," + v549.scale * v543 + ")"),
          (element90.style.maxHeight = "none"));
      };
      element90.resizeInteraction3d = v539;
      const resizeObserver = new ResizeObserver(v539);
      (resizeObserver.observe(container),
        resizeObserver.observe(element92),
        list17.push(() => resizeObserver.disconnect()),
        v539());
    } else this.registerRuntimeDialogScale(element109, element90, 760, 680);
    (element96.addEventListener("click", () => element90.close()),
      this.bindRuntimeDialogOutsideDismiss(element109, element90, element91),
      element109.addEventListener("keydown", (arg435) => {
        arg435.key === "Escape" && element90.close();
      }),
      element90.addEventListener(
        "close",
        () => {
          (window.clearTimeout(num21), value15?.cancel());
          for (const v551 of list17.splice(0)) v551();
          (this.clearRuntimeDialogScale(element90),
            this.detailsDialog === element90 && (this.detailsDialog = null),
            element109.remove());
        },
        {
          once: true,
        },
      ),
      element90.show(),
      element90.resizeInteraction3d?.());
  }
  ["createCapabilityDetailsControls"](
    arg436,
    arg437,
    { interactive: v552 = true, variant: v553 = "", selectLabel: v554 = "模式" } = {},
  ) {
    const element110 = document.createElement("section");
    ((element110.className =
      "hb-capability-details-controls" + (v553 ? " hb-capability-details-controls--" + v553 : "")),
      (element110.inert = !v552));
    const v555 = String(arg436 || "").split(".", 1)[0];
    let options38 = arg437 || {
      entityId: arg436,
      state: "unknown",
      attributes: {},
    };
    const text15 =
        v555 === "fan"
          ? resolveClimateDeviceType2(
              {
                properties: {},
              },
              options38,
              arg436,
            )
          : "generic",
      options39 = {
        entityId: arg436,
        entityMetadata: this.entityMetadata,
        entityTranslations: this.entityTranslations,
      },
      v556 = () => options38?.attributes || {},
      v557 = () =>
        ["unknown", "unavailable"].includes(String(options38?.state || "").toLowerCase()),
      list18 = [],
      includes4 = ["fan", "switch", "input_boolean"].includes(v555),
      hn2 = hn({
        label: "电源",
        interactive: v552,
        compact: v553 === "air-purifier",
        onToggle: async () => {
          if (!v552 || v557()) return;
          const v558 = String(options38?.state || "").toLowerCase() === "off",
            v559 = options38;
          ((options38 = {
            ...options38,
            state: v558 ? "on" : "off",
          }),
            fn1(options38));
          try {
            await this.callEntityService(
              v555 === "fan" ? "fan" : "homeassistant",
              v555 === "fan" ? (v558 ? "turn_on" : "turn_off") : "toggle",
              arg436,
            );
          } catch (v560) {
            ((options38 = v559), fn1(v559), this.options.onError?.(v560));
          }
        },
      });
    (hn2.visual.classList.add("hb-capability-power"), includes4 && element110.append(hn2.visual));
    const v561 = (arg438, arg439, arg440, arg441, arg442, v562 = v555) => {
        const list19 = [
          ...new Set((arg439 || []).map((arg443) => String(arg443 ?? "").trim()).filter(Boolean)),
        ];
        if (
          !list19.length &&
          !(["electric-bed", "electric-bed-memory"].includes(v553) && v555 === "select")
        )
          return;
        const element111 = document.createElement("section");
        element111.className = "hb-capability-option-group";
        const element112 = document.createElement("strong");
        element112.textContent = arg438;
        const element113 = document.createElement("div");
        if (
          ((element113.className = "hb-capability-options"),
          ["electric-bed", "electric-bed-memory"].includes(v553) && v555 === "select")
        ) {
          const element114 = document.createElement("div");
          element114.className = "hb-electric-bed-select";
          const element115 = document.createElement("button");
          ((element115.type = "button"),
            (element115.className = "hb-electric-bed-select-trigger"),
            element115.setAttribute("aria-label", arg438),
            element115.setAttribute("aria-haspopup", "listbox"),
            element115.setAttribute("aria-expanded", "false"));
          const element116 = document.createElement("span"),
            element117 = document.createElement("i");
          (element117.setAttribute("aria-hidden", "true"),
            element115.append(element116, element117));
          const element118 = document.createElement("div");
          ((element118.className = "hb-electric-bed-select-menu"),
            (element118.id =
              "hb-bed-select-" +
              String(this.renderNamespace || "runtime").replace(/[^a-z0-9_-]/gi, "-") +
              "-" +
              arg436.replace(/[^a-z0-9_-]/gi, "-")),
            element118.setAttribute("role", "listbox"),
            element118.setAttribute("popover", "auto"),
            (element118.hidden = true),
            element115.setAttribute("aria-controls", element118.id));
          let v563 = false;
          const v564 = () => {
              try {
                return element118.matches(":popover-open");
              } catch {
                return element118.dataset.open === "true";
              }
            },
            v565 = () => {
              if (!v564() && element118.hidden) return;
              const boundingClientRect11 = element115.getBoundingClientRect(),
                innerWidth = window.innerWidth,
                innerHeight = window.innerHeight,
                min15 = Math.min(
                  Math.max(boundingClientRect11.width, 150),
                  Math.max(150, innerWidth - 20),
                );
              ((element118.style.width = min15 + "px"),
                (element118.style.maxHeight =
                  Math.min(306, Math.max(96, innerHeight - 20)) + "px"));
              const min16 = Math.min(element118.scrollHeight || 0, 306),
                v566 = innerHeight - boundingClientRect11.bottom - 10,
                v567 = boundingClientRect11.top - 10,
                max66 =
                  v566 < Math.min(min16, 160) && v567 > v566
                    ? Math.max(10, boundingClientRect11.top - min16 - 5)
                    : Math.min(innerHeight - min16 - 10, boundingClientRect11.bottom + 5);
              ((element118.style.left =
                Math.max(10, Math.min(boundingClientRect11.left, innerWidth - min15 - 10)) + "px"),
                (element118.style.top = Math.max(10, max66) + "px"));
            },
            v568 = () => {
              (v564() && typeof element118.hidePopover == "function" && element118.hidePopover(),
                (element118.hidden = true),
                (element118.dataset.open = "false"),
                element115.setAttribute("aria-expanded", "false"));
            },
            v569 = (v570 = false) => {
              element115.disabled ||
                ((element118.hidden = false),
                typeof element118.showPopover == "function"
                  ? element118.showPopover()
                  : (element118.dataset.open = "true"),
                element115.setAttribute("aria-expanded", "true"),
                v565(),
                v570 &&
                  (
                    element118.querySelector('[aria-selected="true"]') ||
                    element118.querySelector('[role="option"]')
                  )?.focus());
            },
            v571 = async (arg444) => {
              if (!v552 || v563 || !arg444 || v557()) return;
              const v572 = options38;
              ((v563 = true),
                v568(),
                (options38 = {
                  ...options38,
                  state: arg441 === "select_option" ? arg444 : options38.state,
                  attributes: {
                    ...v556(),
                    [arg442]: arg444,
                  },
                }),
                fn1(options38));
              try {
                await this.callEntityService(v562, arg441, arg436, {
                  [arg442]: arg444,
                });
              } catch (v573) {
                ((options38 = v572), fn1(v572), this.options.onError?.(v573));
              } finally {
                ((v563 = false), fn1(options38));
              }
            },
            v574 = (arg445, arg446) => {
              element118.replaceChildren(
                ...arg445.map((arg447) => {
                  const element119 = document.createElement("button");
                  ((element119.type = "button"),
                    (element119.className = "hb-electric-bed-select-option"),
                    element119.setAttribute("role", "option"),
                    (element119.dataset.value = arg447),
                    (element119.textContent = arg447));
                  const v575 = arg447 === String(arg446 ?? "");
                  return (
                    element119.classList.toggle("active", v575),
                    element119.setAttribute("aria-selected", String(v575)),
                    element119.addEventListener("click", () => v571(arg447)),
                    element119
                  );
                }),
              );
              const text16 = arg445.includes(String(arg446 ?? ""))
                ? String(arg446)
                : arg445[0] || "读取中…";
              ((element116.textContent = text16), (element116.title = text16));
            };
          (element115.addEventListener("click", () => {
            v564() || element118.dataset.open === "true" ? v568() : v569();
          }),
            element115.addEventListener("keydown", (arg448) => {
              ["ArrowDown", "ArrowUp", "Enter", " "].includes(arg448.key) &&
                (arg448.preventDefault(), v569(true));
            }),
            element118.addEventListener("keydown", (arg449) => {
              const list20 = [...element118.querySelectorAll('[role="option"]')],
                indexOf = list20.indexOf(document.activeElement);
              if (arg449.key === "Escape") (arg449.preventDefault(), v568(), element115.focus());
              else {
                if (arg449.key === "ArrowDown" || arg449.key === "ArrowUp") {
                  arg449.preventDefault();
                  const num25 = arg449.key === "ArrowDown" ? 1 : -1;
                  list20[(indexOf + num25 + list20.length) % list20.length]?.focus();
                } else
                  (arg449.key === "Enter" || arg449.key === " ") &&
                    (arg449.preventDefault(), document.activeElement?.click());
              }
            }),
            element118.addEventListener("toggle", (arg450) => {
              const v576 = arg450.newState === "open";
              ((element118.hidden = !v576),
                (element118.dataset.open = String(v576)),
                element115.setAttribute("aria-expanded", String(v576)),
                v576 && v565());
            }),
            element114.append(element115, element118),
            element111.append(element112, element114),
            element110.append(element111),
            list18.push({
              type: "bed-select",
              service: arg441,
              dataKey: arg442,
              trigger: element115,
              menu: element118,
              renderOptions: v574,
              closeMenu: v568,
              isPending: () => v563,
            }));
          return;
        }
        const list21 = [];
        for (const v577 of list19) {
          const element120 = document.createElement("button");
          element120.type = "button";
          const options40 = {
            auto: "自动",
            sleep: "睡眠",
            favorite: "喜爱",
            none: "标准",
            manual: "手动",
            silent: "静音",
          };
          ((element120.textContent =
            v553 === "air-purifier" && arg438 === "运行模式"
              ? options40[v577.toLowerCase()] || v577
              : v555 === "fan" && text15 === "bath-heater" && arg438 === "运行模式"
                ? climateModeLabel2(v577, "bath-heater", options39)
                : v577),
            (element120.dataset.value = v577),
            element120.classList.toggle("active", v577 === String(arg440 ?? "")),
            element120.addEventListener("click", async () => {
              if (!v552) return;
              list21.forEach((arg451) => {
                arg451.disabled = true;
              });
              const v578 = options38;
              ((options38 = {
                ...options38,
                state: arg441 === "select_option" ? v577 : options38.state,
                attributes: {
                  ...v556(),
                  [arg442]: v577,
                },
              }),
                fn1(options38));
              try {
                await this.callEntityService(v562, arg441, arg436, {
                  [arg442]: v577,
                });
              } catch (v579) {
                ((options38 = v578), fn1(v578), this.options.onError?.(v579));
              } finally {
                list21.forEach((arg452) => {
                  arg452.disabled = false;
                });
              }
            }),
            list21.push(element120),
            element113.append(element120));
        }
        (element111.append(element112, element113),
          element110.append(element111),
          list18.push({
            type: "options",
            service: arg441,
            dataKey: arg442,
            buttons: list21,
          }));
      },
      v580 = Number(v556().percentage);
    if (v555 === "fan" && Number.isFinite(v580)) {
      if (v553 === "air-purifier") {
        const element121 = document.createElement("section");
        element121.className = "hb-capability-option-group hb-air-purifier-speed-group";
        const element122 = document.createElement("strong");
        element122.textContent = "风速";
        const element123 = document.createElement("div");
        element123.className = "hb-capability-options hb-air-purifier-speed-options";
        const map19 = [
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
        ].map((arg453) => {
          const element124 = document.createElement("button");
          return (
            (element124.type = "button"),
            (element124.textContent = arg453.label),
            (element124.dataset.percentage = String(arg453.value)),
            element124.addEventListener("click", async () => {
              if (!v552 || v557()) return;
              map19.forEach((arg454) => {
                arg454.disabled = true;
              });
              const v581 = options38;
              ((options38 = {
                ...options38,
                attributes: {
                  ...v556(),
                  percentage: arg453.value,
                },
              }),
                fn1(options38));
              try {
                await this.callEntityService("fan", "set_percentage", arg436, {
                  percentage: arg453.value,
                });
              } catch (v582) {
                ((options38 = v581), fn1(v581), this.options.onError?.(v582));
              } finally {
                map19.forEach((arg455) => {
                  arg455.disabled = false;
                });
              }
            }),
            element123.append(element124),
            element124
          );
        });
        (element121.append(element122, element123),
          element110.append(element121),
          list18.push({
            type: "percentage-options",
            buttons: map19,
          }));
      } else {
        const element125 = document.createElement("section");
        element125.className = "hb-capability-range-group";
        const element126 = document.createElement("div");
        element126.className = "hb-capability-range-heading";
        const element127 = document.createElement("strong");
        element127.textContent = "风速";
        const element128 = document.createElement("output");
        element126.append(element127, element128);
        const element129 = document.createElement("input");
        ((element129.type = "range"),
          (element129.min = "0"),
          (element129.max = "100"),
          (element129.step = "1"),
          (element129.value = String(v580)),
          element129.addEventListener("change", async () => {
            if (!v552 || v557()) return;
            element129.disabled = true;
            const v583 = options38,
              v584 = Number(element129.value);
            ((options38 = {
              ...options38,
              attributes: {
                ...v556(),
                percentage: v584,
              },
            }),
              fn1(options38));
            try {
              await this.callEntityService("fan", "set_percentage", arg436, {
                percentage: v584,
              });
            } catch (v585) {
              ((options38 = v583), fn1(v583), this.options.onError?.(v585));
            } finally {
              element129.disabled = false;
            }
          }),
          element125.append(element126, element129),
          element110.append(element125),
          list18.push({
            type: "range",
            input: element129,
            output: element128,
            dataKey: "percentage",
          }));
      }
    }
    if (
      (v555 === "fan" &&
        v561("运行模式", v556().preset_modes, v556().preset_mode, "set_preset_mode", "preset_mode"),
      v555 === "select" &&
        v561(v554, v556().options, options38?.state, "select_option", "option", "select"),
      ["number", "input_number"].includes(v555))
    ) {
      const num26 = Number.isFinite(Number(v556().min)) ? Number(v556().min) : 0,
        num27 = Number.isFinite(Number(v556().max)) ? Number(v556().max) : 100,
        num28 =
          Number.isFinite(Number(v556().step)) && Number(v556().step) > 0 ? Number(v556().step) : 1,
        element130 = document.createElement("section");
      element130.className = "hb-capability-range-group";
      const element131 = document.createElement("div");
      element131.className = "hb-capability-range-heading";
      const element132 = document.createElement("strong");
      element132.textContent = v556().unit_of_measurement
        ? "数值（" + v556().unit_of_measurement + "）"
        : "数值";
      const element133 = document.createElement("output");
      element131.append(element132, element133);
      const element134 = document.createElement("input");
      ((element134.type = "range"),
        (element134.min = String(num26)),
        (element134.max = String(num27)),
        (element134.step = String(num28)),
        (element134.value = String(Number(options38?.state) || num26)),
        element134.addEventListener("change", async () => {
          if (!v552 || v557()) return;
          element134.disabled = true;
          const v586 = options38,
            v587 = Number(element134.value);
          ((options38 = {
            ...options38,
            state: String(v587),
          }),
            fn1(options38));
          try {
            await this.callEntityService(v555, "set_value", arg436, {
              value: v587,
            });
          } catch (v588) {
            ((options38 = v586), fn1(v586), this.options.onError?.(v588));
          } finally {
            element134.disabled = false;
          }
        }),
        element130.append(element131, element134),
        element110.append(element130),
        list18.push({
          type: "range",
          input: element134,
          output: element133,
          dataKey: "state",
        }));
    }
    function fn1(arg456) {
      options38 = arg456 || options38;
      const lowerCase = String(options38?.state || "").toLowerCase(),
        v589 =
          v555 === "fan"
            ? !["off", "unknown", "unavailable"].includes(lowerCase)
            : lowerCase === "on",
        v590 = v553 !== "air-purifier" || v589;
      includes4 &&
        hn2.sync(v589, {
          unavailable: v557(),
        });
      for (const v591 of list18)
        if (v591.type === "options") {
          const v592 = v591.service === "select_option" ? options38?.state : v556()[v591.dataKey];
          v591.buttons.forEach((arg457) =>
            arg457.classList.toggle("active", v590 && arg457.dataset.value === String(v592 ?? "")),
          );
        } else {
          if (v591.type === "bed-select") {
            const list22 = [
                ...new Set(
                  (v556().options || [])
                    .map((arg458) => String(arg458 ?? "").trim())
                    .filter(Boolean),
                ),
              ],
              v593 = v591.service === "select_option" ? options38?.state : v556()[v591.dataKey];
            (v591.renderOptions(list22, v593),
              (v591.trigger.disabled = !v552 || v591.isPending() || !list22.length || v557()),
              v591.trigger.disabled && v591.closeMenu());
          } else {
            if (v591.type === "select") {
              const list23 = [
                ...new Set(
                  (v556().options || [])
                    .map((arg459) => String(arg459 ?? "").trim())
                    .filter(Boolean),
                ),
              ];
              if (list23.length) {
                const map20 = [...v591.input.options].map((arg460) => arg460.value);
                (map20.length !== list23.length ||
                  map20.some((arg461, arg462) => arg461 !== list23[arg462])) &&
                  v591.input.replaceChildren(
                    ...list23.map((arg463) => {
                      const element135 = document.createElement("option");
                      return (
                        (element135.value = arg463),
                        (element135.textContent = arg463),
                        element135
                      );
                    }),
                  );
              }
              const v594 =
                v591.service === "select_option" ? options38?.state : v556()[v591.dataKey];
              (v594 != null &&
                [...v591.input.options].some((arg464) => arg464.value === String(v594)) &&
                (v591.input.value = String(v594)),
                (v591.input.disabled = !v552 || !list23.length || v557()));
            } else {
              if (v591.type === "percentage-options") {
                const v595 = Number(v556().percentage),
                  num29 =
                    v595 <= 0 || !Number.isFinite(v595)
                      ? 0
                      : v595 <= 49
                        ? 33
                        : v595 <= 82
                          ? 66
                          : 100;
                v591.buttons.forEach((arg465) =>
                  arg465.classList.toggle(
                    "active",
                    v590 && Number(arg465.dataset.percentage) === num29,
                  ),
                );
              } else {
                if (["number", "input_number"].includes(v555)) {
                  const num30 = Number.isFinite(Number(v556().min)) ? Number(v556().min) : 0,
                    num31 = Number.isFinite(Number(v556().max)) ? Number(v556().max) : 100,
                    num32 =
                      Number.isFinite(Number(v556().step)) && Number(v556().step) > 0
                        ? Number(v556().step)
                        : 1;
                  ((v591.input.min = String(num30)),
                    (v591.input.max = String(num31)),
                    (v591.input.step = String(num32)));
                }
                const v596 =
                  v591.dataKey === "state"
                    ? Number(options38?.state)
                    : Number(v556()[v591.dataKey]);
                (Number.isFinite(v596) && (v591.input.value = String(v596)),
                  (v591.output.textContent = Number.isFinite(v596)
                    ? "" + v596 + (v556().unit_of_measurement || "%")
                    : "--"));
              }
            }
          }
        }
    }
    return (
      (element110.syncCapabilityState = fn1),
      (element110.cleanupCapabilityDetails = () => {
        for (const v597 of list18) v597.closeMenu?.();
      }),
      fn1(options38),
      element110
    );
  }
  ["showCapabilityDetails"](arg466, { preview: v598 = false, title: v599 = "" } = {}) {
    const v600 = arg466.bindings?.entity?.entityId;
    if (!v600) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    const options41 = this.states.get(v600)?.newState ||
        this.states.get(v600) || {
          entityId: v600,
          state: "unknown",
          attributes: {},
        },
      deviceProfile4 = this.deviceProfile(v600),
      v601 = deviceProfile4?.deviceType === "air-purifier",
      element136 = document.createElement("dialog");
    element136.className =
      "hb-entity-details-dialog capability-details" + (v601 ? " air-purifier-details" : "");
    const element137 = document.createElement("div");
    element137.className = "hb-entity-details-card";
    const element138 = document.createElement("div");
    element138.className = "hb-entity-details-heading";
    const element139 = document.createElement("div"),
      element140 = document.createElement("strong");
    element140.textContent =
      v599 || arg466.properties?.label || options41.attributes?.friendly_name || v600;
    const element141 = document.createElement("span");
    ((element141.textContent = options41.state === "unavailable" ? "当前不可用" : "设备控制"),
      element139.append(element140, element141));
    const element142 = document.createElement("button");
    ((element142.type = "button"),
      (element142.textContent = "×"),
      element142.setAttribute("aria-label", "关闭弹窗"),
      element138.append(element139, element142));
    const element143 = document.createElement("div");
    element143.className = "hb-capability-details-body";
    const capabilityDetailsControls = this.createCapabilityDetailsControls(v600, options41, {
      interactive: !v598,
      variant: v601 ? "air-purifier" : "",
    });
    (element143.append(capabilityDetailsControls),
      element137.append(element138, element143),
      element136.append(element137));
    const options42 = {
        pm25: "PM2.5",
        airQuality: "空气质量",
        temperature: "温度",
        humidity: "湿度",
        filterLife: "滤芯寿命",
      },
      slice2 = v601
        ? ["pm25", "airQuality", "temperature", "humidity", "filterLife"]
            .map((arg467) => ({
              role: arg467,
              id: deviceProfile4.roles?.[arg467],
            }))
            .filter(({ id: v602 }) => v602)
            .map(({ role: v603, id: v604 }) => ({
              role: v603,
              item: this.entityMetadata.get(v604),
            }))
            .filter(
              ({ item: v605 }) =>
                ["sensor", "binary_sensor"].includes(v605?.domain) &&
                entityMetadataIsAvailable2(v605),
            )
            .slice(0, 5)
        : [],
      map21 = new Map();
    if (slice2.length) {
      const element144 = document.createElement("div");
      element144.className = "hb-capability-metrics";
      for (const { role: v606, item: v607 } of slice2) {
        const element145 = document.createElement("div");
        element145.className = "hb-capability-metric hb-capability-metric--" + v606;
        const element146 = document.createElement("small");
        element146.textContent = options42[v606] || v607.name || v607.originalName || v607.entityId;
        const element147 = document.createElement("strong");
        (element145.append(element146, element147),
          element144.append(element145),
          map21.set(v607.entityId, element147));
      }
      element143.prepend(element144);
    }
    const element148 = document.createElement("div");
    ((element148.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (element148.tabIndex = -1),
      element148.append(element136),
      this.container.append(element148),
      (this.detailsDialog = element136));
    const v608 = (arg468) => {
        (capabilityDetailsControls.syncCapabilityState?.(arg468),
          (element141.textContent = ["unknown", "unavailable"].includes(
            String(arg468?.state || "").toLowerCase(),
          )
            ? "当前不可用"
            : "设备控制"));
      },
      map22 = new Map([[v600, [v608]]]);
    for (const { item: v609 } of slice2) {
      const v610 = (arg469) => {
        const element149 = map21.get(v609.entityId);
        element149 &&
          (element149.textContent =
            arg469?.state === "unknown" || arg469?.state === "unavailable"
              ? "--"
              : (
                  (arg469?.state ?? "--") +
                  " " +
                  (arg469?.attributes?.unit_of_measurement || "")
                ).trim());
      };
      (v610(this.states.get(v609.entityId)?.newState || this.states.get(v609.entityId)),
        map22.set(v609.entityId, [v610]));
    }
    ((this.detailsStateSync = {
      dialog: element136,
      handlers: map22,
    }),
      this.registerRuntimeDialogScale(element148, element136, v601 ? 620 : 560, v601 ? 560 : 500),
      element142.addEventListener("click", () => element136.close()),
      this.bindRuntimeDialogOutsideDismiss(element148, element136, element137),
      element148.addEventListener("keydown", (arg470) => {
        arg470.key === "Escape" && element136.close();
      }),
      element136.addEventListener(
        "close",
        () => {
          (capabilityDetailsControls.cleanupCapabilityDetails?.(),
            this.clearRuntimeDialogScale(element136),
            this.detailsDialog === element136 && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === element136 && (this.detailsStateSync = null),
            element148.remove());
        },
        {
          once: true,
        },
      ),
      element136.show());
  }
  ["showAirPurifierDetails"](arg471, { preview: v611 = false, title: v612 = "" } = {}) {
    const v613 = arg471.bindings?.entity?.entityId;
    if (!v613) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    const deviceProfile5 = this.deviceProfile(v613),
      v614 = selectedRelatedEntityIds2(arg471);
    let options43 = this.states.get(v613)?.newState ||
      this.states.get(v613) || {
        entityId: v613,
        state: "unknown",
        attributes: {},
      };
    const element150 = document.createElement("dialog");
    element150.className = "hb-entity-details-dialog air-purifier-details capability-details";
    const element151 = document.createElement("div");
    element151.className = "hb-entity-details-card";
    const element152 = document.createElement("div");
    element152.className = "hb-entity-details-heading";
    const element153 = document.createElement("div"),
      element154 = document.createElement("strong");
    element154.textContent =
      v612 || componentDialogTitle(arg471, options43.attributes?.friendly_name || "空气净化器");
    const element155 = document.createElement("span");
    element153.append(element154, element155);
    const element156 = document.createElement("button");
    ((element156.type = "button"),
      (element156.className = "hb-air-purifier-visual"),
      (element156.inert = v611),
      element156.setAttribute("aria-label", "切换空气净化器电源"));
    const element157 = document.createElement("i");
    element157.className = "hb-air-purifier-visual-aura";
    const element158 = document.createElement("span");
    element158.className = "hb-air-purifier-visual-airflow";
    for (let num33 = 0; num33 < 4; num33 += 1) element158.append(document.createElement("i"));
    const element159 = document.createElement("span");
    element159.className = "hb-air-purifier-visual-body";
    const element160 = document.createElement("i");
    element160.className = "hb-air-purifier-visual-top";
    const element161 = document.createElement("i");
    element161.className = "hb-air-purifier-visual-vent";
    const element162 = document.createElement("span");
    element162.className = "hb-air-purifier-visual-display";
    const element163 = document.createElement("strong");
    (element162.append(element163),
      element159.append(element160, element161, element162),
      element156.append(element157, element158, element159));
    const element164 = document.createElement("button");
    ((element164.type = "button"),
      (element164.textContent = "×"),
      element164.setAttribute("aria-label", "关闭弹窗"),
      element152.append(element153, element156, element164));
    const element165 = document.createElement("div");
    element165.className = "hb-air-purifier-layout";
    const element166 = document.createElement("section");
    element166.className = "hb-air-purifier-summary";
    const element167 = document.createElement("div");
    element167.className = "hb-air-purifier-gauge-wrap";
    const element168 = document.createElement("div");
    element168.className = "hb-air-purifier-gauge is-quality";
    const element169 = document.createElement("i");
    element169.className = "hb-air-purifier-gauge-orbit";
    const element170 = document.createElement("i");
    element170.className = "hb-air-purifier-arc-cap start";
    const element171 = document.createElement("i");
    element171.className = "hb-air-purifier-arc-cap end";
    const element172 = document.createElement("div");
    element172.className = "hb-air-purifier-gauge-content";
    const element173 = document.createElement("small");
    element173.textContent = "室内空气质量";
    const element174 = document.createElement("strong"),
      element175 = document.createElement("span"),
      element176 = document.createElement("small");
    element176.textContent = "";
    const element177 = document.createElement("span");
    ((element177.textContent = "设备状态 --"),
      element174.append(element175, element176),
      element172.append(element173, element174, element177),
      element168.append(element170, element171, element172),
      element167.append(element169, element168));
    const element178 = document.createElement("div");
    ((element178.className = "hb-air-purifier-secondary-metrics"),
      element166.append(element167, element178));
    const capabilityDetailsControls2 = this.createCapabilityDetailsControls(v613, options43, {
        interactive: !v611,
        variant: "air-purifier",
      }),
      element179 = document.createElement("section");
    ((element179.className = "hb-air-purifier-controls-pane"),
      element179.append(capabilityDetailsControls2),
      element165.append(element166, element179),
      element151.append(element152, element165),
      element150.append(element151));
    const filter9 = [
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
        .map((arg472) => ({
          ...arg472,
          candidates: arg472.roles
            .map((arg473) => ({
              role: arg473,
              id: deviceProfile5?.roles?.[arg473],
            }))
            .filter(
              ({ id: v615 }, arg474, arg475) =>
                v615 && arg475.findIndex((arg476) => arg476.id === v615) === arg474,
            )
            .map((arg477) => ({
              ...arg477,
              item: this.entityMetadata.get(arg477.id),
            }))
            .filter(
              ({ item: v616 }) => v616?.domain === "sensor" && entityMetadataIsAvailable2(v616),
            ),
        }))
        .filter(({ candidates: v617 }) => v617.length),
      v618 = (arg478) => {
        const v619 = Number(arg478?.state);
        return ["unknown", "unavailable"].includes(String(arg478?.state || "").toLowerCase()) ||
          !Number.isFinite(v619)
          ? null
          : v619;
      },
      v620 = (arg479) =>
        this.states.get(arg479?.id)?.newState || this.states.get(arg479?.id) || null,
      v621 = (arg480) =>
        arg480.candidates.find((arg481) => v618(v620(arg481)) != null) ||
        arg480.candidates[0] ||
        null,
      v622 = Array.from(
        {
          length: 3,
        },
        () => {
          const element180 = document.createElement("div");
          element180.className = "hb-air-purifier-secondary-metric";
          const element181 = document.createElement("small"),
            element182 = document.createElement("strong");
          return (
            element180.append(element181, element182),
            element178.append(element180),
            {
              item: element180,
              label: element181,
              value: element182,
            }
          );
        },
      );
    element178.hidden = true;
    const options44 = {
        pm25: "μg/m³",
        pm10: "μg/m³",
        hcho: "mg/m³",
        filterLife: "%",
        filterLeftTime: "h",
        temperature: "°C",
        humidity: "%",
      },
      v623 = (arg482, arg483) => {
        if (["unknown", "unavailable"].includes(String(arg482?.state || "").toLowerCase()))
          return "--";
        const options45 = {
            hours: "小时",
            hour: "小时",
            days: "天",
            day: "天",
          },
          text17 = arg482?.attributes?.unit_of_measurement || options44[arg483] || "",
          v624 = options45[String(text17).toLowerCase()] || text17;
        return "" + (arg482?.state ?? "--") + (v624 ? " " + v624 : "");
      },
      map23 = new Map(),
      v625 = (arg484, arg485) => {
        arg484 && (map23.has(arg484) || map23.set(arg484, []), map23.get(arg484).push(arg485));
      },
      flatMap = filter9.flatMap((arg486) => arg486.candidates.map((arg487) => arg487.id)),
      text18 = deviceProfile5?.roles?.airQuality || "",
      waterHeaterExtensionControls =
        v614 !== null
          ? this.createWaterHeaterExtensionControls(v613, {
              component: arg471,
              interactive: !v611,
              excludedEntityIds: [...flatMap, ...(text18 ? [text18] : [])],
            })
          : null;
    if (waterHeaterExtensionControls) {
      (element151.append(waterHeaterExtensionControls),
        element150.classList.add("has-related-extensions"));
      for (const [v626, v627] of waterHeaterExtensionControls.stateHandlers || [])
        map23.set(v626, v627);
    }
    const options46 = {
      excellent: "空气优",
      good: "空气良",
      moderate: "一般",
      fair: "一般",
      poor: "较差",
      unhealthy: "较差",
      very_poor: "很差",
    };
    let value16 = text18 ? this.states.get(text18)?.newState || this.states.get(text18) : null,
      v628 = false;
    const v629 = filter9.find((arg488) => arg488.key === "pm25"),
      v630 = () => {
        const value17 = v629 ? v621(v629) : null,
          v631 = v618(v620(value17));
        return v631 == null
          ? {
              text: "--",
              level: "unknown",
            }
          : v631 <= 35
            ? {
                text: "空气优",
                level: "excellent",
              }
            : v631 <= 75
              ? {
                  text: "空气良",
                  level: "good",
                }
              : v631 <= 115
                ? {
                    text: "轻度污染",
                    level: "warning",
                  }
                : {
                    text: "空气较差",
                    level: "poor",
                  };
      },
      v632 = () => {
        const trim2 = String(value16?.state || "").trim(),
          lowerCase2 = trim2.toLowerCase();
        let text19 = ["unknown", "unavailable", ""].includes(lowerCase2)
            ? ""
            : options46[lowerCase2] || trim2,
          text20 = "good";
        (text19
          ? /very.?poor|severe|很差|重度|严重/.test(lowerCase2) ||
            /poor|unhealthy|较差|中度/.test(lowerCase2)
            ? (text20 = "poor")
            : /moderate|fair|一般|轻度|污染/.test(lowerCase2)
              ? (text20 = "warning")
              : /excellent|优/.test(lowerCase2) && (text20 = "excellent")
          : ({ text: text19, level: text20 } = v630()),
          (element175.textContent = text19 || "--"),
          (element176.textContent = ""),
          element168.style.setProperty(
            "--hb-air-purifier-progress",
            {
              excellent: 72,
              good: 58,
              warning: 42,
              poor: 26,
              unknown: 0,
            }[text20] + "%",
          ),
          element168.classList.toggle("is-warning", text20 === "warning"),
          element168.classList.toggle("is-poor", text20 === "poor"));
        const text21 =
            {
              excellent: "#76cfa1",
              good: "#76cfa1",
              warning: "#e4b15f",
              poor: "#db7770",
              unknown: "#7d8990",
            }[text20] || "#76cfa1",
          text22 =
            {
              excellent: "rgba(118,207,161,.13)",
              good: "rgba(118,207,161,.13)",
              warning: "rgba(228,177,95,.15)",
              poor: "rgba(219,119,112,.15)",
              unknown: "rgba(125,137,144,.13)",
            }[text20] || "rgba(118,207,161,.13)";
        (element150.style.setProperty("--hb-air-purifier-accent", text21),
          element150.style.setProperty("--hb-air-purifier-accent-soft", text22));
      },
      v633 = (arg489) => {
        ((value16 = arg489), v632());
      },
      v634 = (arg490) => {
        options43 = arg490 || options43;
        const lowerCase3 = String(options43?.state || "").toLowerCase(),
          includes5 = ["unknown", "unavailable"].includes(lowerCase3),
          v635 = !includes5 && lowerCase3 !== "off";
        ((v628 = v635),
          (element163.textContent = v635 ? "ON" : "OFF"),
          (element155.textContent = includes5 ? "当前不可用" : v635 ? "已开启" : "已关闭"),
          (element177.textContent = includes5 ? "设备不可用" : v635 ? "净化中" : "已关闭"),
          element155.classList.toggle("is-on", v635),
          element156.classList.toggle("is-on", v635),
          element156.classList.toggle("is-unavailable", includes5),
          element168.classList.toggle("is-running", v635),
          element169.classList.toggle("is-running", v635),
          element156.setAttribute("aria-pressed", String(v635)),
          capabilityDetailsControls2.syncCapabilityState?.(options43));
      },
      v636 = () => {
        const slice3 = filter9
          .map((arg491) => ({
            metric: arg491,
            selected: v621(arg491),
          }))
          .filter(({ selected: v637 }) => v618(v620(v637)) != null)
          .slice(0, v622.length);
        (v622.forEach((arg492, arg493) => {
          const v638 = slice3[arg493];
          if (
            ((arg492.item.hidden = !v638),
            (arg492.item.className =
              "hb-air-purifier-secondary-metric" +
              (v638 ? " hb-air-purifier-secondary-metric--" + v638.metric.key : "")),
            !v638)
          ) {
            ((arg492.label.textContent = ""), (arg492.value.textContent = ""));
            return;
          }
          const v639 = v638.selected?.role || v638.metric.key;
          ((arg492.label.textContent =
            v638.metric.key === "filter" && v639 === "filterLeftTime"
              ? "滤芯剩余时间"
              : v638.metric.label),
            (arg492.value.textContent = v623(v620(v638.selected), v639)));
        }),
          (element178.hidden = slice3.length === 0));
      };
    (v634(options43), v625(v613, v634));
    for (const v640 of filter9) {
      const v641 = () => {
        (v636(), v640.key === "pm25" && v632());
      };
      v641();
      for (const v642 of v640.candidates) v625(v642.id, v641);
    }
    (v633(value16),
      v625(text18, v633),
      element156.addEventListener("click", () =>
        capabilityDetailsControls2.querySelector(".hb-capability-power")?.click(),
      ));
    const element183 = document.createElement("div");
    ((element183.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (element183.tabIndex = -1),
      element183.append(element150),
      this.container.append(element183),
      (this.detailsDialog = element150),
      (this.detailsStateSync = {
        dialog: element150,
        handlers: map23,
      }),
      this.registerRuntimeDialogScale(
        element183,
        element150,
        920,
        waterHeaterExtensionControls ? 620 : 540,
      ),
      element164.addEventListener("click", () => element150.close()),
      this.bindRuntimeDialogOutsideDismiss(element183, element150, element151),
      element183.addEventListener("keydown", (arg494) => {
        arg494.key === "Escape" && element150.close();
      }),
      element150.addEventListener(
        "close",
        () => {
          (capabilityDetailsControls2.cleanupCapabilityDetails?.(),
            this.clearRuntimeDialogScale(element150),
            this.detailsDialog === element150 && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === element150 && (this.detailsStateSync = null),
            element183.remove());
        },
        {
          once: true,
        },
      ),
      element150.show());
  }
  ["showMediaPlayerDetails"](arg495, { preview: v643 = false } = {}) {
    const v644 = arg495.bindings?.entity?.entityId;
    if (!v644) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    let options47 = this.states.get(v644)?.newState ||
      this.states.get(v644) || {
        entityId: v644,
        state: "unknown",
        attributes: {},
      };
    const element184 = document.createElement("dialog");
    element184.className = "hb-entity-details-dialog media-player-details capability-details";
    const element185 = document.createElement("div");
    element185.className = "hb-entity-details-card";
    const element186 = document.createElement("div");
    element186.className = "hb-entity-details-heading";
    const element187 = document.createElement("div"),
      element188 = document.createElement("strong");
    element188.textContent = componentDialogTitle(
      arg495,
      options47.attributes?.friendly_name || "媒体",
    );
    const element189 = document.createElement("span");
    element187.append(element188, element189);
    const element190 = document.createElement("div");
    ((element190.className = "hb-media-speaker-visual"),
      element190.setAttribute("aria-hidden", "true"));
    const element191 = document.createElement("i");
    element191.className = "hb-media-speaker-body";
    const element192 = document.createElement("img");
    ((element192.className = "hb-media-speaker-artwork"),
      (element192.alt = ""),
      (element192.hidden = true));
    const element193 = document.createElement("i");
    ((element193.className = "hb-media-speaker-light"),
      element190.append(element191, element192, element193),
      element186.append(element187, element190));
    const element194 = document.createElement("div");
    element194.className = "hb-media-player-details-body";
    const element195 = document.createElement("section");
    element195.className = "hb-media-player-now-playing";
    const element196 = document.createElement("img");
    ((element196.className = "hb-media-player-artwork"),
      (element196.alt = ""),
      (element196.hidden = true));
    const element197 = document.createElement("div");
    element197.className = "hb-media-player-copy";
    const element198 = document.createElement("strong"),
      element199 = document.createElement("span"),
      element200 = document.createElement("div");
    ((element200.className = "hb-media-player-progress"), (element200.hidden = true));
    const element201 = document.createElement("progress");
    ((element201.max = 1), (element201.value = 0));
    const element202 = document.createElement("span"),
      element203 = document.createElement("time"),
      element204 = document.createElement("time");
    (element202.append(element203, element204),
      element200.append(element201, element202),
      element197.append(element198, element199, element200),
      element195.append(element196, element197));
    const element205 = document.createElement("div");
    element205.className = "hb-media-player-actions";
    const v645 = (arg496, arg497, v646 = {}) => {
        const element206 = document.createElement("button");
        return (
          (element206.type = "button"),
          (element206.textContent = arg496),
          element206.addEventListener("click", async () => {
            if (!v643) {
              element206.disabled = true;
              try {
                await this.callEntityService("media_player", arg497, v644, v646);
              } catch (v647) {
                this.options.onError?.(v647);
              } finally {
                element206.disabled = false;
              }
            }
          }),
          element205.append(element206),
          element206
        );
      },
      v648 = v645("上一曲", "media_previous_track"),
      element207 = v645("播放", "media_play_pause"),
      v649 = v645("下一曲", "media_next_track"),
      mediaBrowserControl = this.createMediaBrowserControl(v644, {
        preview: v643,
      }),
      element208 = document.createElement("section");
    element208.className = "hb-capability-range-group";
    const element209 = document.createElement("div");
    element209.className = "hb-capability-range-heading";
    const element210 = document.createElement("strong");
    element210.textContent = "音量";
    const element211 = document.createElement("output");
    element209.append(element210, element211);
    const element212 = document.createElement("input");
    ((element212.type = "range"),
      (element212.min = "0"),
      (element212.max = "1"),
      (element212.step = ".01"),
      (element212.disabled = v643),
      element208.append(element209, element212),
      element195.append(mediaBrowserControl.root),
      element194.append(element195, element205, element208));
    let text23 = "",
      value18 = null,
      value19 = null,
      value20 = null,
      value21 = null,
      v650 = false,
      value22 = null,
      value23 = null,
      value24 = null,
      num34 = 0,
      value25 = null,
      v651 = false;
    const v652 = (arg498) => {
        const max67 = Math.max(0, Math.floor(Number(arg498) || 0)),
          floor = Math.floor(max67 / 60),
          padStart = String(max67 % 60).padStart(2, "0");
        return floor + ":" + padStart;
      },
      v653 = () => {
        if (!Number.isFinite(value24) || value24 <= 0) {
          element200.hidden = true;
          return;
        }
        let num35 = Number.isFinite(num34) ? num34 : 0;
        (v651 && Number.isFinite(value25) && (num35 += Math.max(0, (Date.now() - value25) / 1000)),
          (num35 = Math.max(0, Math.min(value24, num35))),
          (element200.hidden = false),
          (element201.max = value24),
          (element201.value = num35),
          (element203.textContent = v652(num35)),
          (element204.textContent = v652(value24)));
      },
      setInterval = window.setInterval(v653, 1000),
      v654 = (arg499, arg500) =>
        Number.isFinite(arg499) && Number.isFinite(arg500) && Math.abs(arg499 - arg500) <= 0.005,
      v655 = (arg501) => {
        ((value18 = Math.max(0, Math.min(1, Number(arg501) || 0))),
          (element212.value = String(value18)),
          (element211.textContent = Math.round(value18 * 100) + "%"));
      },
      v656 = async () => {
        if ((window.clearTimeout(value22), (value22 = null), v650 || value21 === null)) return;
        const v657 = value21;
        ((value21 = null), (v650 = true));
        try {
          await this.callEntityService("media_player", "volume_set", v644, {
            volume_level: v657,
          });
        } catch (v658) {
          ((value21 = null),
            (value20 = null),
            window.clearTimeout(value23),
            value19 !== null && v655(value19),
            this.options.onError?.(v658));
        } finally {
          ((v650 = false),
            value21 !== null && !v654(value21, v657) && (value22 = window.setTimeout(v656, 140)));
        }
      },
      v659 = () => {
        const max68 = Math.max(0, Math.min(1, Number(element212.value) || 0));
        ((value20 = max68),
          (value21 = max68),
          window.clearTimeout(value23),
          v650 || (window.clearTimeout(value22), (value22 = window.setTimeout(v656, 120))));
      };
    (element196.addEventListener("error", () => {
      ((element196.hidden = true), element195.classList.remove("has-artwork"));
    }),
      element196.addEventListener("load", () => {
        ((element196.hidden = false), element195.classList.add("has-artwork"));
      }),
      element192.addEventListener("error", () => {
        ((element192.hidden = true), element190.classList.remove("has-artwork"));
      }),
      element192.addEventListener("load", () => {
        ((element192.hidden = false), element190.classList.add("has-artwork"));
      }),
      element212.addEventListener("input", () => v655(element212.value)),
      element212.addEventListener("change", v659));
    const v660 = (arg502) => {
      options47 = arg502 || options47;
      const options48 = options47.attributes || {},
        options49 = {
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
        lowerCase4 = String(options47.state || "unknown").toLowerCase(),
        v661 = Number(options48.supported_features || 0);
      (mediaBrowserControl.sync(options47),
        (element189.textContent = options49[lowerCase4] || options47.state || "未知状态"),
        element190.classList.toggle("is-playing", lowerCase4 === "playing"),
        element190.classList.toggle("is-paused", lowerCase4 === "paused"),
        element190.classList.toggle(
          "is-off",
          ["off", "unavailable", "unknown"].includes(lowerCase4),
        ),
        (element198.textContent =
          options48.media_title ||
          options48.media_series_title ||
          options48.app_name ||
          options48.source ||
          "暂无播放内容"),
        (element199.textContent =
          [options48.media_artist, options48.media_album_name].filter(Boolean).join(" · ") ||
          options48.media_content_type ||
          "媒体播放器"),
        (element207.textContent = lowerCase4 === "playing" ? "暂停" : "播放"),
        (element207.disabled = v643 || ["off", "unavailable", "unknown"].includes(lowerCase4)),
        (v648.disabled = v643 || !(v661 & 16)),
        (v649.disabled = v643 || !(v661 & 32)),
        (value24 = Number.isFinite(Number(options48.media_duration))
          ? Number(options48.media_duration)
          : null),
        (num34 = Number.isFinite(Number(options48.media_position))
          ? Number(options48.media_position)
          : 0));
      const v662 = Date.parse(String(options48.media_position_updated_at || ""));
      ((value25 = Number.isFinite(v662) ? v662 : null), (v651 = lowerCase4 === "playing"), v653());
      const v663 = Number(options48.volume_level);
      ((element208.hidden = !Number.isFinite(v663)),
        Number.isFinite(v663) &&
          (value20 === null
            ? ((value19 = v663), v655(v663))
            : v654(v663, value20)
              ? ((value19 = v663),
                v655(value20),
                window.clearTimeout(value23),
                (value23 = window.setTimeout(() => {
                  value20 = null;
                }, 1800)))
              : window.clearTimeout(value23)));
      const text24 =
        [options48.entity_picture_local, options48.entity_picture, options48.media_image_url]
          .map((arg503) => String(arg503 || "").trim())
          .find(
            (arg504) =>
              arg504.startsWith("/api/media_player_proxy/") ||
              arg504.startsWith("/api/image_proxy/"),
          ) || "";
      text24 !== text23 &&
        ((text23 = text24),
        (element196.hidden = !text23),
        element195.classList.toggle("has-artwork", !!text23),
        (element192.hidden = !text23),
        element190.classList.toggle("has-artwork", !!text23),
        text23
          ? ((element196.src = text23), (element192.src = text23))
          : (element196.removeAttribute("src"), element192.removeAttribute("src")));
    };
    (v660(options47),
      element185.append(element186, element194, mediaBrowserControl.panel),
      element184.append(element185));
    const element213 = document.createElement("div");
    ((element213.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (element213.tabIndex = -1),
      element213.append(element184),
      this.container.append(element213),
      (this.detailsDialog = element184),
      (this.detailsStateSync = {
        dialog: element184,
        handlers: new Map([[v644, [v660]]]),
      }),
      this.registerRuntimeDialogScale(element213, element184, 540, 368),
      this.bindRuntimeDialogOutsideDismiss(element213, element184, element185),
      element213.addEventListener("keydown", (arg505) => {
        arg505.key === "Escape" && element184.close();
      }));
    let value26 = null;
    (element184.addEventListener(
      "close",
      () => {
        (value26?.cancel(),
          mediaBrowserControl.cleanup?.(),
          window.clearInterval(setInterval),
          window.clearTimeout(value22),
          window.clearTimeout(value23),
          this.clearRuntimeDialogScale(element184),
          this.detailsDialog === element184 && (this.detailsDialog = null),
          this.detailsStateSync?.dialog === element184 && (this.detailsStateSync = null),
          element213.remove());
      },
      {
        once: true,
      },
    ),
      element184.show(),
      (value26 = playMediaSpeakerEntrance2(element190)));
  }
  ["showCustomPopup"](arg506, { preview: v664 = false } = {}) {
    (this.closeRuntimeDialog(),
      (this.historyPopupGeneration += 1),
      (this.activePopupId = String(arg506?.id || "")),
      this.connectRuntime());
    const element214 = document.createElement("dialog");
    element214.className = "hb-custom-popup-dialog";
    const element215 = document.createElement("div");
    element215.className = "hb-custom-popup-card";
    const list24 = arg506.modules || [],
      v665 = popupLayoutMetrics2(list24, arg506.layout),
      popupWidth = v665.popupWidth,
      popupHeight = v665.popupHeight;
    ((element214.dataset.runtimeDialogLayout =
      v665.rows === 1 && v665.columns === 2 ? "compact" : "fill"),
      (element215.style.width = popupWidth + "px"),
      (element215.style.height = popupHeight + "px"),
      (element215.style.maxHeight = "none"));
    const element216 = document.createElement("div");
    element216.className = "hb-custom-popup-heading";
    const element217 = document.createElement("div"),
      element218 = document.createElement("strong");
    ((element218.textContent = arg506.name || "组合弹窗"), element217.append(element218));
    const element219 = document.createElement("button");
    ((element219.type = "button"),
      (element219.textContent = "×"),
      element219.setAttribute("aria-label", "关闭组合弹窗"),
      element216.append(element217, element219));
    const element220 = document.createElement("div");
    ((element220.className = "hb-custom-popup-grid"),
      (element220.style.gridTemplateColumns = "repeat(" + v665.columns + ", minmax(0, 1fr))"),
      (element220.style.gridTemplateRows = "repeat(" + v665.rows + ", minmax(0, 1fr))"));
    const list25 = [],
      list26 = [],
      list27 = [],
      list28 = [],
      list29 = [],
      map24 = new Map(),
      v666 = (arg507, arg508) => {
        (map24.has(arg507) || map24.set(arg507, []), map24.get(arg507).push(arg508));
      };
    for (const [v667, v668] of list24.entries()) {
      const options50 =
          v668.type === "capability-device"
            ? {
                ...v668,
                type: "generic",
              }
            : v668,
        v669 = String(options50.entityId || ""),
        deviceProfile6 = this.deviceProfile(v669),
        v670 = applyXiaomiDeviceProfile2(
          {
            bindings: {
              entity: {
                entityId: options50.entityId,
              },
            },
            properties: {
              ...(options50.properties || {}),
              deviceType: options50.deviceType || options50.properties?.deviceType || "auto",
            },
          },
          deviceProfile6,
        ),
        options51 = deviceProfile6
          ? {
              ...options50,
              properties: v670.properties,
              deviceType: v670.properties?.deviceType || options50.deviceType,
            }
          : options50,
        options52 = v665.placements[v667] || {
          x: 0,
          y: v667,
          width: 1,
          height: 1,
        },
        num36 = [
          "climate",
          "air-purifier",
          "water-heater",
          "media-player",
          "camera",
          "line-chart",
        ].includes(options51.type)
          ? 2
          : options52.width,
        entityId = v669 || options51.entityId,
        v671 = this.states.get(entityId),
        v672 = v671?.newState || v671,
        element221 = document.createElement("section");
      ((element221.className =
        "hb-custom-popup-module hb-custom-popup-module--" + (options51.type || "generic")),
        (element221.style.gridColumn = options52.x + 1 + " / span " + num36),
        (element221.style.gridRow = options52.y + 1 + " / span " + options52.height));
      const element222 = document.createElement("div");
      element222.className = "hb-custom-popup-module-heading";
      const element223 = document.createElement("strong");
      element223.textContent = popupModuleDialogTitle(options51, v672);
      const element224 = document.createElement("span");
      element224.className = "hb-custom-popup-module-status type-" + (options51.type || "generic");
      const options53 = {
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
        ((element224.textContent = options53[options51.type] || options53.generic),
        element222.append(element223, element224),
        element221.append(element222),
        options51.type === "electric-bed" && deviceProfile6?.deviceType !== "electric-bed")
      ) {
        element221.classList.add("hb-custom-popup-module--electric-bed");
        const element225 = document.createElement("section");
        element225.className =
          "hb-custom-electric-bed-loading hb-climate-details-loading is-loading";
        const element226 = document.createElement("i");
        element226.setAttribute("aria-hidden", "true");
        const element227 = document.createElement("strong");
        ((element227.textContent = "—"),
          element225.append(element226, element227),
          element221.append(element225));
      } else {
        if (options51.type === "electric-bed") {
          element221.classList.add("hb-custom-popup-module--electric-bed");
          const options54 = (deviceProfile6 || this.deviceProfile(entityId))?.roles || {},
            v673 = (arg509) => {
              const v674 = this.states.get(arg509);
              return (
                v674?.newState ||
                v674 || {
                  entityId: arg509,
                  state: "unknown",
                  attributes: {},
                }
              );
            },
            element228 = document.createElement("div");
          element228.className = "hb-custom-electric-bed-body";
          const element229 = document.createElement("section");
          element229.className = "hb-electric-bed-visual";
          const element230 = document.createElement("div");
          element230.className = "hb-electric-bed-model";
          for (const v675 of ["mattress", "back", "waist", "legs", "base"]) {
            const element231 = document.createElement("i");
            ((element231.className = "hb-electric-bed-" + v675), element230.append(element231));
          }
          const v676 = (arg510, arg511) => {
              const element232 = document.createElement("span");
              element232.className = "hb-electric-bed-angle-readout " + arg510;
              const element233 = document.createElement("strong"),
                element234 = document.createElement("small");
              return (
                (element234.textContent = arg511),
                element232.append(element233, element234),
                {
                  item: element232,
                  value: element233,
                }
              );
            },
            v677 = v676("back", "靠背"),
            v678 = v676("waist", "腰部"),
            v679 = v676("legs", "腿部");
          element229.append(element230, v677.item, v678.item, v679.item);
          const element235 = document.createElement("section");
          element235.className = "hb-electric-bed-control hb-electric-bed-mode";
          const element236 = document.createElement("section");
          element236.className = "hb-electric-bed-memory";
          const element237 = document.createElement("section");
          element237.className = "hb-electric-bed-angle-controls";
          const v680 = String(options54.mode || ""),
            slice4 = [options54.memory1, options54.memory2].filter(Boolean).slice(0, 2),
            filter10 = [
              ["backrest", "靠背角度", "back"],
              ["leg", "腿部角度", "legs"],
              ["waist", "腰部角度", "waist"],
            ]
              .map(([v681, v682, v683]) => ({
                role: v681,
                label: v682,
                visualClass: v683,
                entityId: String(options54[v681] || ""),
              }))
              .filter((arg512) => arg512.entityId),
            v684 = (arg513, arg514, arg515, v685 = "") => {
              const element238 = document.createElement("section");
              element238.className = "hb-electric-bed-control";
              const element239 = document.createElement("strong");
              element239.textContent = arg514;
              const capabilityDetailsControls3 = this.createCapabilityDetailsControls(
                arg515,
                v673(arg515),
                {
                  interactive: !v664,
                  variant: v685,
                },
              );
              (capabilityDetailsControls3.classList.add("hb-electric-bed-capability"),
                element238.append(element239, capabilityDetailsControls3),
                arg513.append(element238),
                list25.push(() => capabilityDetailsControls3.cleanupCapabilityDetails?.()),
                v666(arg515, (arg516) => capabilityDetailsControls3.syncCapabilityState?.(arg516)));
            };
          if (v680) v684(element235, "模式", v680, "electric-bed");
          else {
            const element240 = document.createElement("strong");
            element240.textContent = "模式";
            const element241 = document.createElement("select");
            ((element241.className = "hb-capability-select"),
              (element241.disabled = true),
              element241.append(new Option("未识别到模式实体")),
              element235.append(element240, element241));
          }
          const element242 = document.createElement("strong");
          element242.textContent = "记忆姿势";
          const element243 = document.createElement("div");
          element243.className = "hb-electric-bed-memory-list";
          for (let num37 = 0; num37 < 2; num37 += 1) {
            const v686 = String(slice4[num37] || ""),
              value27 = v686 ? this.entityMetadata.get(v686) : null;
            if (v686.split(".", 1)[0] === "select") {
              v684(element243, "记忆姿势 " + (num37 + 1), v686, "electric-bed-memory");
              continue;
            }
            const element244 = document.createElement("button");
            ((element244.type = "button"),
              (element244.className = "hb-electric-bed-memory-button"),
              (element244.textContent =
                value27?.name || value27?.originalName || "记忆姿势 " + (num37 + 1)),
              (element244.disabled = v664 || !v686),
              element244.addEventListener("click", async () => {
                if (!(v664 || !v686 || element244.disabled)) {
                  element244.disabled = true;
                  try {
                    (await this.callEntityService("button", "press", v686),
                      element244.classList.add("is-success"),
                      window.setTimeout(() => element244.classList.remove("is-success"), 900));
                  } catch (v687) {
                    this.options.onError?.(v687);
                  } finally {
                    element244.disabled = v664 || !v686;
                  }
                }
              }),
              element243.append(element244));
          }
          element236.append(element242, element243);
          for (const v688 of filter10) v684(element237, v688.label, v688.entityId);
          const v689 = () => {
            const options55 = {
                backrest: v673(options54.backrest),
                leg: v673(options54.leg),
                waist: v673(options54.waist),
              },
              v690 = (arg517) => {
                const v691 = Number(arg517?.state);
                return Number.isFinite(v691) ? v691 : null;
              },
              v692 = (arg518, arg519, arg520) => {
                const v693 = v690(options55[arg518]);
                ((arg520.textContent = v693 === null ? "--" : Math.round(v693) + "°"),
                  v693 !== null &&
                    element230.style.setProperty(
                      "--hb-bed-" + (arg518 === "backrest" ? "backrest" : arg518) + "-angle",
                      v693 + "deg",
                    ));
              };
            (v692("backrest", element230, v677.value),
              v692("waist", element230, v678.value),
              v692("leg", element230, v679.value),
              (element224.textContent = "已连接"));
          };
          for (const v694 of [options54.backrest, options54.leg, options54.waist].filter(Boolean))
            v666(v694, v689);
          (v689(),
            element228.append(element235, element229, element236, element237),
            element221.append(element228));
        } else {
          if (options51.type === "camera") {
            const element245 = document.createElement("section");
            ((element245.className = "hb-camera-device-visual hb-custom-camera-device-visual"),
              element245.setAttribute("aria-hidden", "true"));
            const element246 = document.createElement("i");
            element246.className = "hb-camera-device-mount";
            const element247 = document.createElement("i");
            element247.className = "hb-camera-device-arm";
            const element248 = document.createElement("div");
            element248.className = "hb-camera-device-body";
            const element249 = document.createElement("i");
            element249.className = "hb-camera-device-lens";
            const element250 = document.createElement("i");
            ((element250.className = "hb-camera-device-led"),
              element248.append(element249, element250),
              element245.append(element246, element247, element248),
              element222.append(element245));
            let num38 = 0,
              value28 = null,
              num39 = 0;
            const v695 = (arg521, v696 = 0) =>
                "translateX(-50%) perspective(260px) rotateY(" +
                arg521 +
                "deg) rotateZ(" +
                arg521 * 0.035 +
                "deg) translateY(" +
                v696 +
                "px)",
              v697 = () => {
                if (!element248.isConnected) return;
                const filter11 = [-22, -16, -9, -4, 0, 6, 12, 18, 23].filter(
                    (arg522) => Math.abs(arg522 - num39) >= 7,
                  ),
                  num40 = filter11[Math.floor(Math.random() * filter11.length)] ?? 0,
                  num41 = Math.sign(num40 - num39) || 1,
                  abs2 = Math.abs(num40 - num39),
                  round2 = Math.round(430 + abs2 * 18 + Math.random() * 320),
                  v698 = num40 + num41 * (1.4 + Math.random() * 2.2),
                  v699 = Math.random() * 1.4 - 0.7;
                (element249.style.setProperty("--hb-camera-lens-shift", (num40 / 23) * 2.5 + "px"),
                  value28?.cancel(),
                  (value28 = element248.animate(
                    [
                      {
                        transform: v695(num39, 0),
                        offset: 0,
                      },
                      {
                        transform: v695(v698, v699),
                        offset: 0.78,
                      },
                      {
                        transform: v695(num40, v699 * 0.35),
                        offset: 1,
                      },
                    ],
                    {
                      duration: round2,
                      easing: "cubic-bezier(.2,.72,.22,1)",
                      fill: "forwards",
                    },
                  )),
                  value28.addEventListener(
                    "finish",
                    () => {
                      ((num39 = num40),
                        (element248.style.transform = v695(num39, v699 * 0.35)),
                        value28?.cancel(),
                        (value28 = null));
                      const v700 =
                        Math.random() < 0.22
                          ? 180 + Math.random() * 260
                          : 680 + Math.random() * 1500;
                      num38 = window.setTimeout(v697, v700);
                    },
                    {
                      once: true,
                    },
                  ));
              };
            (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
              (num38 = window.setTimeout(v697, 620)),
              list25.push(() => {
                (window.clearTimeout(num38), value28?.cancel());
              }));
            const element251 = document.createElement("div");
            ((element251.className = "hb-custom-popup-camera-stage is-connecting"),
              (element224.textContent = v664 ? "预览模式" : "正在连接"),
              element224.classList.add("is-connecting"));
            const element252 = document.createElement("i");
            element252.className = "hb-camera-preview-reveal-veil";
            const element253 = document.createElement("i");
            ((element253.className = "hb-camera-preview-scan-line"),
              element251.append(element252, element253));
            const element254 = document.createElement("span");
            ((element254.textContent = v664 ? "预览模式不获取实时画面" : "正在载入摄像头实时预览"),
              element251.append(element254),
              v664
                ? (element224.classList.remove("is-connecting"),
                  element251.classList.remove("is-connecting"),
                  element251.classList.add("is-ready"))
                : mountCameraMedia2({
                    container: element251,
                    entityId: entityId,
                    label: element223.textContent,
                    objectFit: "fill",
                    placeholder: element254,
                    onReady: () => {
                      ((element224.textContent = "实时画面"),
                        element224.classList.remove("is-connecting", "is-unavailable"),
                        element224.classList.add("is-live"),
                        element245.classList.remove("is-unavailable"),
                        element245.classList.add("is-live"),
                        element251.classList.remove(
                          "is-connecting",
                          "is-unavailable",
                          "is-revealing",
                        ),
                        element251.classList.add("is-ready"));
                    },
                    onUnavailable: () => {
                      ((element224.textContent = "画面不可用"),
                        element224.classList.remove("is-connecting", "is-live"),
                        element224.classList.add("is-unavailable"),
                        element245.classList.remove("is-live"),
                        element245.classList.add("is-unavailable"),
                        element251.classList.remove("is-connecting", "is-revealing"),
                        element251.classList.add("is-unavailable"));
                    },
                    cleanup: (arg523) => list25.push(arg523),
                  }),
              element221.append(element251));
          } else {
            if (options51.type === "line-chart") {
              const options56 = {
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
                      options51.properties,
                    ),
                    compactDetailsHorizontal: true,
                  },
                },
                element255 = document.createElement("output");
              element255.className = "hb-custom-line-chart-current";
              const element256 = document.createElement("strong"),
                element257 = document.createElement("small"),
                v701 = String(options56.properties?.valueColor || "#dce1e5");
              ((element256.style.color = v701),
                (element257.style.color = v701),
                element255.append(element256, element257),
                element222.append(element255));
              const v702 = (arg524) => {
                  const float = Number.parseFloat(arg524?.state);
                  ((element256.textContent = Number.isFinite(float)
                    ? formatLineChartValue2(float, options56.properties?.statePrecision)
                    : arg524?.state || "--"),
                    (element257.textContent = String(
                      arg524?.attributes?.unit_of_measurement || "",
                    )),
                    element255.setAttribute(
                      "aria-label",
                      "当前数值 " + element256.textContent + element257.textContent,
                    ));
                },
                options57 = {
                  states: this.states,
                  history: this.historySeries,
                  renderNamespace: this.renderNamespace + "-" + options51.id,
                  interactive: true,
                  animate: false,
                };
              let v703 = renderLineChartDetails2(options56, options57),
                num42 = 0;
              const v704 = () => {
                  if (
                    ((num42 = 0),
                    !v703?.isConnected || this.detailsStateSync?.dialog !== element214)
                  )
                    return;
                  const v705 = renderLineChartDetails2(options56, options57);
                  (v703.cleanupLineChartHover?.(), v703.replaceWith(v705), (v703 = v705), v708());
                },
                v706 = (v707 = 700) => {
                  num42 || (num42 = window.setTimeout(v704, Math.max(0, Number(v707) || 0)));
                };
              list29.push(() => v706(0));
              const v708 = () => {
                element255.style.setProperty(
                  "--hb-custom-chart-accent",
                  v703.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
                );
              };
              (v702(v672),
                v708(),
                v666(entityId, (arg525) => {
                  (v702(arg525), v703.syncLineChartState?.(arg525), v708());
                }),
                list25.push(() => {
                  (window.clearTimeout(num42), v703.cleanupLineChartHover?.());
                }),
                element221.append(v703));
            } else {
              if (options51.type === "switch") {
                let v709 = v672,
                  v710 = false,
                  text25 = "idle",
                  value29 = null;
                const v711 = entityId.split(".")[0] === "button",
                  hn3 = hn({
                    label: element223.textContent,
                    interactive: !v664,
                    momentary: v711,
                    onToggle: () => value29?.(),
                  });
                hn3.visual.classList.add("hb-custom-switch-visual");
                const v712 = (arg526) => {
                  v709 = arg526;
                  const includes6 =
                      !arg526?.state || ["unknown", "unavailable"].includes(arg526.state),
                    v713 = !v711 && arg526?.state === "on";
                  (hn3.sync(v713, {
                    unavailable: includes6,
                    pending: v710 && text25 !== "success",
                    success: text25 === "success",
                  }),
                    (element224.textContent = includes6
                      ? "当前不可用"
                      : v711
                        ? text25 === "success"
                          ? "执行成功"
                          : v710
                            ? "正在执行"
                            : "按下执行"
                        : v713
                          ? "已开启"
                          : "已关闭"),
                    element224.classList.toggle(
                      "is-live",
                      (v711 ? v710 || text25 === "success" : v713) && !includes6,
                    ));
                };
                ((value29 = async () => {
                  if (v664 || v710 || ["unknown", "unavailable"].includes(v709?.state)) return;
                  const v714 = v709;
                  ((v710 = true),
                    (text25 = "idle"),
                    v712(
                      v711
                        ? v714
                        : {
                            ...v714,
                            state: v714?.state === "on" ? "off" : "on",
                          },
                    ));
                  try {
                    v711
                      ? (await this.callEntityService("button", "press", entityId),
                        (text25 = "success"),
                        v712(v709),
                        await new Promise((arg527) => window.setTimeout(arg527, 900)))
                      : await this.callEntityService("homeassistant", "toggle", entityId);
                  } catch (v715) {
                    ((text25 = "idle"), v712(v714), this.options.onError?.(v715));
                  } finally {
                    ((v710 = false), (text25 = "idle"), v712(v709));
                  }
                }),
                  v712(v672),
                  v666(entityId, v712),
                  element221.append(hn3.visual));
              } else {
                if (options51.type === "light") {
                  let value30 = null;
                  element222.classList.add("has-light-visual");
                  const element258 = document.createElement("button");
                  ((element258.type = "button"),
                    (element258.className = "hb-light-visual hb-custom-light-visual"),
                    (element258.style.animationDelay = 0.08 + v667 * 0.07 + "s"),
                    (element258.inert = v664),
                    element258.setAttribute("aria-disabled", String(v664)));
                  const element259 = document.createElement("div");
                  element259.className = "hb-light-visual-aura";
                  const element260 = document.createElement("div");
                  element260.className = "hb-light-visual-lamp";
                  for (const v716 of ["cord", "shade", "bulb", "filament"]) {
                    const element261 = document.createElement("i");
                    ((element261.className = "hb-light-visual-" + v716),
                      element260.append(element261));
                  }
                  (element258.append(element259, element260), element222.append(element258));
                  const options58 = v672?.attributes || {},
                    v717 = lightSupportsColor2(options58),
                    num43 =
                      Number(options58.min_color_temp_kelvin) ||
                      (Number.isFinite(Number(options58.max_mireds))
                        ? 1000000 / Number(options58.max_mireds)
                        : 2000),
                    num44 =
                      Number(options58.max_color_temp_kelvin) ||
                      (Number.isFinite(Number(options58.min_mireds))
                        ? 1000000 / Number(options58.min_mireds)
                        : 6500),
                    NaN2 =
                      Number(options58.color_temp_kelvin) ||
                      (Number.isFinite(Number(options58.color_temp))
                        ? 1000000 / Number(options58.color_temp)
                        : NaN),
                    options59 = {
                      isOn: v672?.state === "on",
                      brightnessPercent: Number.isFinite(Number(options58.brightness))
                        ? (Number(options58.brightness) / 255) * 100
                        : 100,
                      colorTemperatureKelvin: Number.isFinite(NaN2) ? NaN2 : (num43 + num44) / 2,
                      colorRgb: v717 ? lightColorRgb2(options58) : null,
                    },
                    v718 = (v719 = {}) => {
                      const options60 = v719.attributes || {};
                      (typeof v719.isOn == "boolean"
                        ? (options59.isOn = v719.isOn)
                        : typeof v719.state == "string" && (options59.isOn = v719.state === "on"),
                        Number.isFinite(Number(v719.brightnessPercent))
                          ? (options59.brightnessPercent = Number(v719.brightnessPercent))
                          : Number.isFinite(Number(options60.brightness)) &&
                            (options59.brightnessPercent =
                              (Number(options60.brightness) / 255) * 100),
                        Number.isFinite(Number(v719.colorTemperatureKelvin))
                          ? (options59.colorTemperatureKelvin = Number(v719.colorTemperatureKelvin))
                          : Number.isFinite(Number(options60.color_temp_kelvin))
                            ? (options59.colorTemperatureKelvin = Number(
                                options60.color_temp_kelvin,
                              ))
                            : Number.isFinite(Number(options60.color_temp)) &&
                              (options59.colorTemperatureKelvin =
                                1000000 / Number(options60.color_temp)),
                        Object.hasOwn(v719, "colorRgb")
                          ? (options59.colorRgb = v719.colorRgb)
                          : v719.attributes &&
                            v717 &&
                            (options59.colorRgb = lightColorRgb2(options60)));
                      const max69 = Math.max(
                          1,
                          Math.min(100, Number(options59.brightnessPercent) || 1),
                        ),
                        v720 =
                          (Math.max(
                            2000,
                            Math.min(6500, Number(options59.colorTemperatureKelvin) || 4250),
                          ) -
                            2000) /
                          4500,
                        list30 = [255, 132, 42],
                        list31 = [172, 225, 255],
                        map25 =
                          options59.colorRgb ||
                          list30.map((arg528, arg529) =>
                            Math.round(arg528 + (list31[arg529] - arg528) * v720),
                          );
                      (element258.classList.toggle("is-on", options59.isOn),
                        element258.style.setProperty(
                          "--hb-light-visual-color",
                          "rgb(" + map25.join(",") + ")",
                        ),
                        element258.style.setProperty(
                          "--hb-light-visual-opacity",
                          options59.isOn ? String(0.08 + (max69 / 100) * 0.92) : "0",
                        ),
                        element258.style.setProperty(
                          "--hb-light-visual-blur",
                          Math.round(15 + max69 * 1.14) + "px",
                        ),
                        element258.style.setProperty(
                          "--hb-light-visual-scale",
                          String(0.62 + (max69 / 100) * 1.05),
                        ),
                        element258.setAttribute("aria-pressed", String(options59.isOn)),
                        element258.setAttribute(
                          "aria-label",
                          "" +
                            element223.textContent +
                            (options59.isOn ? "已开启，点击关闭" : "已关闭，点击开启"),
                        ),
                        (element224.textContent = options59.isOn ? "已开启" : "已关闭"),
                        element224.classList.toggle("is-live", options59.isOn));
                    };
                  v718();
                  let v721 = false;
                  (element258.addEventListener("click", async () => {
                    if (v664 || v721) return;
                    ((v721 = true), element258.setAttribute("aria-busy", "true"));
                    const isOn2 = options59.isOn;
                    v718({
                      isOn: !isOn2,
                    });
                    try {
                      await this.callEntityService("homeassistant", "toggle", entityId);
                    } catch (v722) {
                      (v718({
                        isOn: isOn2,
                      }),
                        this.options.onError?.(v722));
                    } finally {
                      ((v721 = false), element258.removeAttribute("aria-busy"));
                    }
                  }),
                    (value30 = this.createLightDetailsControls(entityId, v672, {
                      interactive: !v664,
                      onTurnOn: () => {
                        v718({
                          isOn: true,
                        });
                      },
                      onVisualChange: v718,
                    })),
                    list25.push(() => value30?.cleanupLightDetails?.()),
                    v666(entityId, (arg530) => {
                      (v718(arg530), value30?.syncLightState?.(arg530));
                    }),
                    element221.append(value30));
                } else {
                  if (options51.type === "climate" || options51.type === "water-heater") {
                    element221.classList.add("hb-custom-popup-module--climate");
                    const text26 =
                      options51.type === "water-heater"
                        ? "water-heater"
                        : resolveClimateDeviceType2(
                            {
                              properties: {
                                deviceType:
                                  options51.deviceType ||
                                  options51.properties?.deviceType ||
                                  "auto",
                                label: options51.title || "",
                              },
                            },
                            v672,
                            entityId,
                          );
                    let v723 = v672;
                    const options61 = {
                        entityId: entityId,
                        entityMetadata: this.entityMetadata,
                        entityTranslations: this.entityTranslations,
                      },
                      element262 = document.createElement("button");
                    ((element262.type = "button"),
                      (element262.className = "hb-climate-visual hb-custom-climate-visual"),
                      element262.classList.toggle("is-bath-heater", text26 === "bath-heater"),
                      element262.classList.toggle("is-water-heater", text26 === "water-heater"),
                      text26 === "water-heater" &&
                        list28.push({
                          visual: element262,
                          distance: 168,
                          delay: 100 + v667 * 45,
                        }),
                      (element262.inert = v664),
                      element262.setAttribute("aria-disabled", String(v664)));
                    const element263 = document.createElement("div");
                    element263.className = "hb-climate-visual-unit";
                    const element264 = document.createElement("span");
                    ((element264.className = "hb-climate-visual-brand"),
                      (element264.textContent =
                        text26 === "bath-heater"
                          ? "BATH HEATER"
                          : text26 === "water-heater"
                            ? "SMART WATER"
                            : "SMART AIR"));
                    const element265 = document.createElement("strong");
                    element265.className = "hb-climate-visual-display";
                    const element266 = document.createElement("div");
                    element266.className = "hb-climate-visual-vent";
                    for (let num45 = 0; num45 < 5; num45 += 1)
                      element266.append(document.createElement("i"));
                    element263.append(element264, element265, element266);
                    const element267 = document.createElement("div");
                    element267.className = "hb-climate-visual-airflow";
                    for (let num46 = 0; num46 < 3; num46 += 1)
                      element267.append(document.createElement("i"));
                    element262.append(element263, element267);
                    const v724 = ({
                        mode: v725 = "off",
                        visualMode: v726 = "off",
                        running: v727 = false,
                        accentColor: v728 = "#65717a",
                        targetTemperature: v729,
                      } = {}) => {
                        const v730 = v726 !== "off";
                        (element262.classList.toggle("is-on", v730),
                          element262.classList.toggle("is-running", v727),
                          element262.classList.toggle(
                            "is-airflow-mode",
                            text26 === "bath-heater" && v730 && bathHeaterModeUsesAirflow2(v725),
                          ),
                          (element262.dataset.visualMode = v726),
                          element262.style.setProperty("--hb-climate-visual-accent", v728));
                        const finite = v729 != null && v729 !== "" && Number.isFinite(Number(v729));
                        ((element265.textContent = v730
                          ? finite
                            ? Number(v729) + "°"
                            : climateModeLabel2(v725, text26, options61)
                          : "OFF"),
                          text26 === "bath-heater"
                            ? element262.setAttribute(
                                "aria-label",
                                element223.textContent + "，点击切换浴霸灯",
                              )
                            : (element262.setAttribute("aria-pressed", String(v730)),
                              element262.setAttribute(
                                "aria-label",
                                "" +
                                  element223.textContent +
                                  (v730 ? "已开启，点击关闭" : "已关闭，点击开启"),
                              )));
                      },
                      climateDetailsControls = this.createClimateDetailsControls(entityId, v672, {
                        interactive: !v664,
                        deviceType: text26,
                        onVisualChange: ({
                          mode: v731,
                          visualMode: v732,
                          running: v733,
                          accentColor: v734,
                          accentSoft: v735,
                          targetTemperature: v736,
                        }) => {
                          ((element224.textContent = climateModeLabel2(v731, text26, options61)),
                            element224.classList.toggle("is-live", v732 !== "off"),
                            element224.classList.toggle("is-running", v733),
                            element224.style.setProperty("--hb-climate-accent", v734),
                            element224.style.setProperty("--hb-climate-accent-soft", v735),
                            v724({
                              mode: v731,
                              visualMode: v732,
                              running: v733,
                              accentColor: v734,
                              targetTemperature: v736,
                            }));
                        },
                      });
                    list25.push(() => climateDetailsControls.cleanupClimateDetails?.());
                    const text27 = text26 === "bath-heater" ? deviceProfile6?.roles?.light : "",
                      value31 = text27
                        ? this.entityMetadata.get(text27)
                        : text26 === "bath-heater"
                          ? relatedDeviceDomainEntity2(this.entityMetadata, entityId, "light")
                          : null;
                    let value32 = null;
                    if (value31?.entityId) {
                      const v737 = this.states.get(value31.entityId),
                        options62 = v737?.newState ||
                          v737 || {
                            state: "unknown",
                            attributes: {},
                          };
                      ((value32 = this.createBathHeaterLightControl(value31.entityId, options62, {
                        interactive: !v664,
                        onStateChange: ({ isOn: v738, unavailable: v739 }) => {
                          (element262.classList.toggle("is-light-on", v738 && !v739),
                            element262.setAttribute("aria-pressed", String(v738 && !v739)));
                        },
                      })),
                        climateDetailsControls.append(value32),
                        v666(value31.entityId, (arg531) => value32.syncBathLightState?.(arg531)));
                    }
                    const list32 = Array.from(climateDetailsControls.children),
                      v740 = list32.find((arg532) =>
                        arg532.classList.contains("hb-climate-thermostat"),
                      ),
                      v741 = list32.find((arg533) =>
                        arg533.classList.contains("hb-climate-fan-slider"),
                      ),
                      element268 = document.createElement("div");
                    element268.className = "hb-custom-climate-left";
                    const element269 = document.createElement("div");
                    ((element269.className = "hb-custom-climate-right"),
                      v740 && element268.append(v740),
                      v741 && element268.append(v741),
                      element269.append(
                        element262,
                        ...list32.filter((arg534) => arg534 !== v740 && arg534 !== v741),
                      ));
                    const v742 = !!(v740 || v741);
                    (climateDetailsControls.classList.toggle("without-primary-controls", !v742),
                      climateDetailsControls.replaceChildren(
                        ...(v742 ? [element268, element269] : [element269]),
                      ));
                    let v743 = false;
                    (element262.addEventListener("click", async () => {
                      if (text26 === "bath-heater") {
                        value32?.toggleBathLight
                          ? await value32.toggleBathLight()
                          : this.options.onError?.(new Error("未找到与浴霸同设备的灯光实体。"));
                        return;
                      }
                      if (v664 || v743) return;
                      ((v743 = true), element262.setAttribute("aria-busy", "true"));
                      const v744 = v723,
                        v745 = climateIsPoweredOn2(v744, text26),
                        state2 =
                          climateDetailsControls.dataset.lastClimateMode ||
                          (v745 ? v744.state : "auto"),
                        options63 = {
                          state: v745 ? "off" : state2,
                          attributes: {
                            ...(v744?.attributes || {}),
                            hvac_action: v745 ? "off" : state2,
                          },
                        };
                      ((v723 = options63), climateDetailsControls.syncClimateState?.(options63));
                      try {
                        const v746 = climatePowerCommand2(
                          entityId,
                          v744,
                          !v745,
                          text26,
                          climateDetailsControls.dataset.lastClimateMode || "",
                        );
                        await this.callEntityService(
                          v746.domain,
                          v746.service,
                          entityId,
                          v746.data,
                        );
                      } catch (v747) {
                        ((v723 = v744),
                          climateDetailsControls.syncClimateState?.(v744),
                          this.options.onError?.(v747));
                      } finally {
                        ((v743 = false), element262.removeAttribute("aria-busy"));
                      }
                    }),
                      v666(entityId, (arg535) => {
                        ((v723 = arg535), climateDetailsControls.syncClimateState?.(arg535));
                      }),
                      element221.append(climateDetailsControls));
                  } else {
                    if (options51.type === "cover") {
                      let v748 = v672;
                      const options64 = v672?.attributes || {},
                        v749 = coverComponentIsAirer2(
                          options51,
                          entityId,
                          v672,
                          this.entityMetadata,
                          this.deviceMetadata,
                        ),
                        v750 = Number(options64.supported_features || 0),
                        v751 =
                          entityId +
                          " " +
                          (options64.friendly_name || "") +
                          " " +
                          (options51.title || ""),
                        finite2 =
                          Number.isFinite(Number(options64.current_tilt_position)) ||
                          !!(v750 & 240),
                        test2 = /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(v751),
                        coverKind = ["standard", "dream", "airer"].includes(
                          options51.properties?.coverKind,
                        )
                          ? options51.properties.coverKind
                          : "auto",
                        v752 =
                          !v749 &&
                          (coverKind === "dream" || (coverKind === "auto" && (finite2 || test2))),
                        text28 =
                          (v749 ? relatedAirerLightEntity2(this.entityMetadata, entityId) : null)
                            ?.entityId || "",
                        value33 = text28 ? this.states.get(text28) : null;
                      let value34 = value33?.newState || value33 || null;
                      const text29 =
                          (v749
                            ? relatedAirerPositionNumberEntity2(this.entityMetadata, entityId)
                            : null
                          )?.entityId || "",
                        v753 = this.states.get(text29),
                        value35 = v753?.newState || v753 || null,
                        text30 =
                          (v749
                            ? relatedAirerCurrentPositionSensor2(this.entityMetadata, entityId)
                            : null
                          )?.entityId || "",
                        text31 =
                          (v749
                            ? relatedAirerMotorSpeedSensor2(this.entityMetadata, entityId)
                            : null
                          )?.entityId || "",
                        v754 = this.states.get(text31),
                        value36 = v754?.newState || v754 || null,
                        options65 = v749
                          ? relatedAirerMotorActionEntities2(this.entityMetadata, entityId)
                          : {},
                        entries = Object.fromEntries(
                          Object.entries(options65).map(([v755, v756]) => [
                            v755,
                            v756?.entityId || "",
                          ]),
                        ),
                        v757 = this.states.get(text30 || text29),
                        value37 = v757?.newState || v757 || null,
                        v758 = v752 && finite2,
                        v759 = coverMotorIsReversedForComponent2(
                          options51,
                          this.entityMetadata,
                          this.states,
                          entityId,
                        ),
                        text32 = v759 ? "open_cover" : "close_cover",
                        text33 = v759 ? "close_cover" : "open_cover",
                        coverDirection = ["left", "right"].includes(
                          options51.properties?.coverDirection,
                        )
                          ? options51.properties.coverDirection
                          : "split",
                        element270 = document.createElement("div");
                      element270.className = "hb-custom-cover-layout";
                      const element271 = document.createElement("button");
                      ((element271.type = "button"),
                        (element271.className = "hb-cover-visual hb-custom-cover-visual"),
                        (element271.inert = v664),
                        element271.setAttribute("aria-disabled", String(v664)));
                      const element272 = document.createElement("i");
                      element272.className = "hb-cover-visual-rail";
                      const element273 = document.createElement("i");
                      element273.className = "hb-cover-visual-panel left";
                      const element274 = document.createElement("i");
                      element274.className = "hb-cover-visual-panel right";
                      const element275 = document.createElement("span");
                      element275.className = "hb-cover-visual-slats";
                      const num47 = 13;
                      for (let num48 = 0; num48 < num47; num48 += 1) {
                        const element276 = document.createElement("span");
                        element276.className = "hb-cover-visual-slat";
                        const element277 = document.createElement("i");
                        element276.style.setProperty("--hb-cover-slat-index", String(num48));
                        const abs3 =
                          coverDirection === "right"
                            ? num47 - 1 - num48
                            : coverDirection === "split"
                              ? Math.abs((num47 - 1) / 2 - num48)
                              : num48;
                        element276.style.setProperty("--hb-cover-slat-delay-index", String(abs3));
                        const v760 =
                          coverDirection === "left"
                            ? -num48 * 14.5
                            : coverDirection === "right"
                              ? (num47 - 1 - num48) * 14.5
                              : num48 <= (num47 - 1) / 2
                                ? -num48 * 14.5
                                : (num47 - 1 - num48) * 14.5;
                        (element276.style.setProperty("--hb-cover-retracted-shift", v760 + "px"),
                          element276.append(element277),
                          element275.append(element276));
                      }
                      const element278 = document.createElement("i");
                      ((element278.className = "hb-cover-visual-window"),
                        element271.classList.toggle("is-dream", v752),
                        element271.classList.toggle("is-airer", v749),
                        element271.classList.add("direction-" + coverDirection),
                        element271.append(
                          element278,
                          element272,
                          element273,
                          element274,
                          element275,
                        ),
                        v749 && xi(element271));
                      const v761 = (v762 = value34) => {
                        if (!v749) return;
                        value34 = v762 || value34;
                        const includes7 =
                            !text28 ||
                            ["unknown", "unavailable"].includes(
                              String(value34?.state || "unknown"),
                            ),
                          v763 = value34?.state === "on";
                        (element271.classList.toggle("is-light-on", v763 && !includes7),
                          element271.classList.toggle("is-light-unavailable", includes7),
                          (element271.disabled = v664 || includes7),
                          element271.setAttribute("aria-pressed", String(v763 && !includes7)),
                          element271.setAttribute(
                            "aria-label",
                            includes7
                              ? "晾衣机灯光实体不可用"
                              : "晾衣机灯光" + (v763 ? "已开启，点击关闭" : "已关闭，点击开启"),
                          ));
                      };
                      v761();
                      let num49 = 0;
                      const v764 = airerPositionCalibration2(
                          this.entityMetadata,
                          this.deviceMetadata,
                          entityId,
                        ),
                        v765 = ({ position: v766 = 0, state: v767 = "" } = {}) => {
                          const max70 = Math.max(0, Math.min(100, Number(v766) || 0)),
                            v768 = coverPresentationState2(
                              {
                                state: v767,
                                attributes: {
                                  current_position: max70,
                                },
                              },
                              v759,
                            ),
                            v769 = physicalCoverState2(v767 || v748?.state, v759),
                            v770 = v769 === "open" || v769 === "opening";
                          ((num49 = max70),
                            element271.style.setProperty("--hb-cover-open-position", max70 + "%"),
                            element271.style.setProperty(
                              "--hb-airer-drop",
                              airerVisualDrop2(max70) + "px",
                            ),
                            element271.style.setProperty(
                              "--hb-cover-panel-width",
                              45.9 - max70 * 0.331 + "%",
                            ),
                            element271.style.setProperty(
                              "--hb-cover-single-panel-width",
                              91.8 - max70 * 0.79 + "%",
                            ),
                            element271.style.setProperty(
                              "--hb-cover-slat-angle",
                              max70 * 1.8 + "deg",
                            ),
                            element271.classList.toggle("is-tilt-reversed", max70 > 50),
                            element271.classList.toggle(
                              "is-tilt-center",
                              Math.abs(max70 - 50) <= 2,
                            ),
                            element271.classList.toggle(
                              "is-open",
                              v752 ? v770 : v768 === "open" || v768 === "opening",
                            ),
                            element271.classList.toggle(
                              "is-moving",
                              v767 === "opening" || v767 === "closing",
                            ),
                            element271.setAttribute(
                              "aria-pressed",
                              String(v752 ? v770 : v768 === "open" || v768 === "opening"),
                            ),
                            v749
                              ? (element224.textContent = pn(v768) || Math.round(max70) + "%")
                              : v752
                                ? (element224.textContent = dreamCurtainStatusText2(
                                    v767 || v748?.state,
                                    max70,
                                    v759,
                                  ))
                                : (element224.textContent =
                                    {
                                      open: "已打开",
                                      closed: "已关闭",
                                      opening: "正在打开",
                                      closing: "正在关闭",
                                    }[v768] || Math.round(max70) + "%"),
                            element224.classList.toggle(
                              "is-live",
                              v752 ? v770 : v768 === "open" || v768 === "opening",
                            ),
                            v749 ||
                              element271.setAttribute(
                                "aria-label",
                                v752
                                  ? "" +
                                      element223.textContent +
                                      dreamCurtainStatusText2(v767 || v748?.state, max70, v759)
                                  : "" +
                                      element223.textContent +
                                      (v768 === "open" || v768 === "opening"
                                        ? "已打开，点击关闭"
                                        : "已关闭，点击打开"),
                              ));
                        },
                        coverDetailsControls = this.createCoverDetailsControls(entityId, v672, {
                          interactive: !v664,
                          dream: v752,
                          airer: v749,
                          tilt: v758,
                          motorReversed: v759,
                          positionState: value37,
                          positionCommandEntityId: text29,
                          positionCommandState: value35,
                          motorState: value36,
                          airerActionEntityIds: entries,
                          positionCalibration: v764,
                          onVisualChange: v765,
                          onCurtainPositionChange: ({ retracted: v771, moving: v772 }) => {
                            (element271.classList.toggle("is-curtain-retracted", v771),
                              element271.classList.toggle("is-curtain-moving", v772),
                              (element271.dataset.curtainRetracted = String(v771)),
                              v752 &&
                                ((element224.textContent = dreamCurtainStatusFromRetraction2(
                                  v771,
                                  v772,
                                  num49,
                                )),
                                element224.classList.toggle("is-live", v771)));
                          },
                        });
                      let v773 = false;
                      (element271.addEventListener("click", async () => {
                        if (v664 || v773) return;
                        if (((v773 = true), element271.setAttribute("aria-busy", "true"), v749)) {
                          const v774 = value34;
                          v761({
                            ...(value34 || {}),
                            state: value34?.state === "on" ? "off" : "on",
                          });
                          try {
                            await this.callEntityService("homeassistant", "toggle", text28);
                          } catch (v775) {
                            (v761(v774), this.options.onError?.(v775));
                          } finally {
                            ((v773 = false), element271.removeAttribute("aria-busy"));
                          }
                          return;
                        }
                        const v776 = num49,
                          v777 =
                            coverDetailsControls.isDreamCurtainRetracted?.() ??
                            element271.dataset.curtainRetracted === "true",
                          v778 = v776 > COVER_CLOSED_POSITION_EPSILON;
                        v752
                          ? coverDetailsControls.beginDreamCurtainMotion?.(!v777)
                          : coverDetailsControls.beginCoverMotion?.(
                              v778 ? 0 : 100,
                              v778 ? "closing" : "opening",
                            );
                        try {
                          await this.callEntityService(
                            "cover",
                            v752
                              ? dreamCurtainToggleService2(v777, text33, text32)
                              : v778
                                ? text32
                                : text33,
                            entityId,
                          );
                        } catch (v779) {
                          (v752
                            ? (coverDetailsControls.cancelDreamCurtainMotion?.(),
                              coverDetailsControls.setDreamCurtainRetracted?.(v777, false))
                            : coverDetailsControls.cancelCoverMotion?.(),
                            coverDetailsControls.syncCoverState?.(v748),
                            this.options.onError?.(v779));
                        } finally {
                          ((v773 = false), element271.removeAttribute("aria-busy"));
                        }
                      }),
                        v666(entityId, (arg536) => {
                          ((v748 = arg536), coverDetailsControls.syncCoverState?.(arg536));
                        }),
                        text28 && v666(text28, v761),
                        text30 &&
                          v666(text30, (arg537) =>
                            coverDetailsControls.syncCoverPositionState?.(arg537),
                          ),
                        text29 &&
                          v666(text29, (arg538) => {
                            (coverDetailsControls.syncCoverPositionCommandState?.(arg538),
                              text30 || coverDetailsControls.syncCoverPositionState?.(arg538));
                          }),
                        text31 &&
                          v666(text31, (arg539) =>
                            coverDetailsControls.syncAirerMotorState?.(arg539),
                          ),
                        list25.push(() => coverDetailsControls.cleanupCoverDetails?.()),
                        element270.append(element271, coverDetailsControls),
                        element221.append(element270));
                    } else {
                      if (options51.type === "air-purifier") {
                        let options66 = v672 || {
                          entityId: entityId,
                          state: "unknown",
                          attributes: {},
                        };
                        const element279 = document.createElement("button");
                        ((element279.type = "button"),
                          (element279.className =
                            "hb-air-purifier-visual hb-custom-air-purifier-visual"),
                          (element279.inert = v664),
                          element279.setAttribute("aria-disabled", String(v664)));
                        const element280 = document.createElement("i");
                        element280.className = "hb-air-purifier-visual-aura";
                        const element281 = document.createElement("span");
                        element281.className = "hb-air-purifier-visual-airflow";
                        for (let num50 = 0; num50 < 4; num50 += 1)
                          element281.append(document.createElement("i"));
                        const element282 = document.createElement("span");
                        element282.className = "hb-air-purifier-visual-body";
                        const element283 = document.createElement("i");
                        element283.className = "hb-air-purifier-visual-top";
                        const element284 = document.createElement("i");
                        element284.className = "hb-air-purifier-visual-vent";
                        const element285 = document.createElement("span");
                        element285.className = "hb-air-purifier-visual-display";
                        const element286 = document.createElement("strong");
                        (element285.append(element286),
                          element282.append(element283, element284, element285),
                          element279.append(element280, element281, element282));
                        const capabilityDetailsControls4 = this.createCapabilityDetailsControls(
                            entityId,
                            options66,
                            {
                              interactive: !v664,
                              variant: "air-purifier",
                            },
                          ),
                          element287 = document.createElement("div");
                        element287.className =
                          "hb-air-purifier-layout hb-custom-air-purifier-layout";
                        const element288 = document.createElement("section");
                        element288.className = "hb-air-purifier-summary";
                        const element289 = document.createElement("div");
                        element289.className = "hb-air-purifier-gauge-wrap";
                        const element290 = document.createElement("div");
                        element290.className = "hb-air-purifier-gauge is-quality";
                        const element291 = document.createElement("i");
                        element291.className = "hb-air-purifier-gauge-orbit";
                        const element292 = document.createElement("i");
                        element292.className = "hb-air-purifier-arc-cap start";
                        const element293 = document.createElement("i");
                        element293.className = "hb-air-purifier-arc-cap end";
                        const element294 = document.createElement("div");
                        element294.className = "hb-air-purifier-gauge-content";
                        const element295 = document.createElement("small");
                        element295.textContent = "室内空气质量";
                        const element296 = document.createElement("strong"),
                          element297 = document.createElement("span"),
                          element298 = document.createElement("span");
                        ((element298.textContent = "设备状态 --"),
                          element296.append(element297),
                          element294.append(element295, element296, element298),
                          element290.append(element292, element293, element294),
                          element289.append(element291, element290));
                        const element299 = document.createElement("section");
                        ((element299.className = "hb-air-purifier-controls-pane"),
                          element299.append(capabilityDetailsControls4));
                        const options67 = {
                            pm25: "PM2.5",
                            pm10: "PM10",
                            filterLife: "滤芯寿命",
                            filterLeftTime: "滤芯剩余时间",
                            hcho: "甲醛",
                            temperature: "温度",
                            humidity: "湿度",
                          },
                          map26 = [
                            {
                              role: "pm25",
                              ids: [deviceProfile6?.roles?.pm25],
                            },
                            {
                              role: "pm10",
                              ids: [deviceProfile6?.roles?.pm10],
                            },
                            {
                              role: "filterLife",
                              ids: [
                                deviceProfile6?.roles?.filterLife,
                                deviceProfile6?.roles?.filterLeftTime,
                              ],
                            },
                            {
                              role: "hcho",
                              ids: [deviceProfile6?.roles?.hcho],
                            },
                            {
                              role: "temperature",
                              ids: [deviceProfile6?.roles?.temperature],
                            },
                            {
                              role: "humidity",
                              ids: [deviceProfile6?.roles?.humidity],
                            },
                          ].map((arg540) => ({
                            ...arg540,
                            ids: arg540.ids.filter(Boolean),
                          })),
                          v780 = (arg541) => {
                            const v781 = this.states.get(arg541);
                            return v781?.newState || v781 || null;
                          },
                          v782 = (arg542) => {
                            const v783 = v780(arg542);
                            return (
                              v783 &&
                              !["unknown", "unavailable"].includes(
                                String(v783.state || "").toLowerCase(),
                              ) &&
                              Number.isFinite(Number(v783.state))
                            );
                          },
                          slice5 = map26
                            .map((arg543) => ({
                              ...arg543,
                              id:
                                arg543.ids.find((arg544) => v782(arg544)) ||
                                arg543.ids.find((arg545) => this.entityMetadata.has(arg545)),
                            }))
                            .filter((arg546) => arg546.id)
                            .slice(0, 3),
                          element300 = document.createElement("div");
                        element300.className =
                          "hb-air-purifier-secondary-metrics hb-custom-air-purifier-metrics";
                        for (const v784 of slice5) {
                          const v785 = this.entityMetadata.get(v784.id),
                            element301 = document.createElement("div");
                          element301.className =
                            "hb-air-purifier-secondary-metric hb-air-purifier-secondary-metric--" +
                            v784.role;
                          const element302 = document.createElement("small");
                          element302.textContent = options67[v784.role] || v784.role;
                          const element303 = document.createElement("strong");
                          (element301.append(element302, element303),
                            element300.append(element301));
                          const v786 = (arg547) => {
                            element303.textContent = ["unknown", "unavailable"].includes(
                              String(arg547?.state || "").toLowerCase(),
                            )
                              ? "--"
                              : (
                                  (arg547?.state ?? "--") +
                                  " " +
                                  (arg547?.attributes?.unit_of_measurement ||
                                    v785?.unitOfMeasurement ||
                                    "")
                                ).trim();
                          };
                          (v786(v780(v784.id)), v666(v784.id, v786));
                        }
                        const v787 = deviceProfile6?.roles?.airQuality,
                          v788 = deviceProfile6?.roles?.pm25,
                          v789 = () => {
                            const v790 = v780(v787),
                              v791 = v780(v788),
                              text34 = ["unknown", "unavailable"].includes(
                                String(v790?.state || "").toLowerCase(),
                              )
                                ? ""
                                : String(v790?.state || "").trim(),
                              v792 = Number(v791?.state),
                              lowerCase5 = text34.toLowerCase();
                            let v793 = text34,
                              text35 = "unknown";
                            (/excellent|优/.test(lowerCase5)
                              ? (text35 = "excellent")
                              : /good|良/.test(lowerCase5)
                                ? (text35 = "good")
                                : /moderate|fair|一般|轻度|污染/.test(lowerCase5)
                                  ? (text35 = "warning")
                                  : /poor|unhealthy|较差|中度|重度|严重/.test(lowerCase5)
                                    ? (text35 = "poor")
                                    : Number.isFinite(v792) &&
                                      ((text35 =
                                        v792 <= 15
                                          ? "excellent"
                                          : v792 <= 35
                                            ? "good"
                                            : v792 <= 75
                                              ? "warning"
                                              : "poor"),
                                      (v793 = {
                                        excellent: "空气优",
                                        good: "空气良",
                                        warning: "轻度污染",
                                        poor: "空气较差",
                                      }[text35])),
                              (element297.textContent = v793 || "--"),
                              element290.style.setProperty(
                                "--hb-air-purifier-progress",
                                {
                                  excellent: 72,
                                  good: 58,
                                  warning: 42,
                                  poor: 26,
                                  unknown: 0,
                                }[text35] + "%",
                              ),
                              element290.classList.toggle("is-warning", text35 === "warning"),
                              element290.classList.toggle("is-poor", text35 === "poor"));
                            const v794 = {
                                excellent: "#76cfa1",
                                good: "#76cfa1",
                                warning: "#e4b15f",
                                poor: "#db7770",
                                unknown: "#7d8990",
                              }[text35],
                              v795 = {
                                excellent: "rgba(118,207,161,.13)",
                                good: "rgba(118,207,161,.13)",
                                warning: "rgba(228,177,95,.15)",
                                poor: "rgba(219,119,112,.15)",
                                unknown: "rgba(125,137,144,.13)",
                              }[text35];
                            (element221.style.setProperty("--hb-air-purifier-accent", v794),
                              element221.style.setProperty("--hb-air-purifier-accent-soft", v795));
                          };
                        (v787 && v666(v787, v789),
                          v788 && v788 !== v787 && v666(v788, v789),
                          v789());
                        const v796 = (v797 = options66) => {
                          options66 = v797 || options66;
                          const lowerCase6 = String(options66?.state || "").toLowerCase(),
                            includes8 = ["unknown", "unavailable"].includes(lowerCase6),
                            v798 = !includes8 && lowerCase6 !== "off";
                          ((element286.textContent = v798 ? "ON" : "OFF"),
                            element279.classList.toggle("is-on", v798),
                            element279.classList.toggle("is-unavailable", includes8),
                            element279.setAttribute("aria-pressed", String(v798)),
                            element279.setAttribute(
                              "aria-label",
                              "" +
                                element223.textContent +
                                (v798 ? "已开启，点击关闭" : "已关闭，点击开启"),
                            ),
                            (element224.textContent = includes8
                              ? "当前不可用"
                              : v798
                                ? "已开启"
                                : "已关闭"),
                            element224.classList.toggle("is-live", v798),
                            (element298.textContent = includes8
                              ? "设备不可用"
                              : v798
                                ? "净化中"
                                : "已关闭"),
                            element290.classList.toggle("is-running", v798),
                            element291.classList.toggle("is-running", v798),
                            capabilityDetailsControls4.syncCapabilityState?.(options66));
                        };
                        v796();
                        let v799 = false;
                        (element279.addEventListener("click", async () => {
                          if (
                            v664 ||
                            v799 ||
                            ["unknown", "unavailable"].includes(
                              String(options66?.state || "").toLowerCase(),
                            )
                          )
                            return;
                          ((v799 = true), element279.setAttribute("aria-busy", "true"));
                          const v800 = options66,
                            v801 = String(v800?.state || "").toLowerCase() === "off";
                          v796({
                            ...v800,
                            state: v801 ? "on" : "off",
                          });
                          try {
                            await this.callEntityService(
                              "fan",
                              v801 ? "turn_on" : "turn_off",
                              entityId,
                            );
                          } catch (v802) {
                            (v796(v800), this.options.onError?.(v802));
                          } finally {
                            ((v799 = false), element279.removeAttribute("aria-busy"));
                          }
                        }),
                          v666(entityId, v796),
                          element222.append(element279),
                          element288.append(element289, element300),
                          element287.append(element288, element299),
                          element221.append(element287));
                      } else {
                        if (options51.type === "media-player") {
                          ((element223.textContent = popupModuleDialogTitle(
                            options51,
                            v672,
                            "媒体",
                          )),
                            element221.classList.add("hb-media-player-details"));
                          const element304 = document.createElement("div");
                          ((element304.className = "hb-media-speaker-visual"),
                            element304.setAttribute("aria-hidden", "true"),
                            list26.push(element304));
                          const element305 = document.createElement("i");
                          element305.className = "hb-media-speaker-body";
                          const element306 = document.createElement("img");
                          ((element306.className = "hb-media-speaker-artwork"),
                            (element306.alt = ""),
                            (element306.hidden = true));
                          const element307 = document.createElement("i");
                          ((element307.className = "hb-media-speaker-light"),
                            element304.append(element305, element306, element307),
                            element222.append(element304));
                          const element308 = document.createElement("div");
                          element308.className =
                            "hb-media-player-details-body hb-custom-media-player-body";
                          const element309 = document.createElement("section");
                          element309.className = "hb-media-player-now-playing";
                          const element310 = document.createElement("img");
                          ((element310.className = "hb-media-player-artwork"),
                            (element310.alt = ""),
                            (element310.hidden = true));
                          const element311 = document.createElement("div");
                          element311.className = "hb-media-player-copy";
                          const element312 = document.createElement("strong"),
                            element313 = document.createElement("span"),
                            element314 = document.createElement("div");
                          ((element314.className = "hb-media-player-progress"),
                            (element314.hidden = true));
                          const element315 = document.createElement("progress");
                          ((element315.max = 1), (element315.value = 0));
                          const element316 = document.createElement("span"),
                            element317 = document.createElement("time"),
                            element318 = document.createElement("time");
                          (element316.append(element317, element318),
                            element314.append(element315, element316),
                            element311.append(element312, element313, element314),
                            element309.append(element310, element311));
                          const element319 = document.createElement("div");
                          element319.className = "hb-media-player-actions";
                          const v803 = (arg548, arg549) => {
                              const element320 = document.createElement("button");
                              return (
                                (element320.type = "button"),
                                (element320.textContent = arg548),
                                element320.addEventListener("click", async () => {
                                  if (!v664) {
                                    element320.disabled = true;
                                    try {
                                      await this.callEntityService(
                                        "media_player",
                                        arg549,
                                        entityId,
                                      );
                                    } catch (v804) {
                                      this.options.onError?.(v804);
                                    } finally {
                                      element320.disabled = false;
                                    }
                                  }
                                }),
                                element319.append(element320),
                                element320
                              );
                            },
                            v805 = v803("上一曲", "media_previous_track"),
                            element321 = v803("播放", "media_play_pause"),
                            v806 = v803("下一曲", "media_next_track"),
                            mediaBrowserControl2 = this.createMediaBrowserControl(entityId, {
                              preview: v664,
                            });
                          list25.push(() => mediaBrowserControl2.cleanup?.());
                          const element322 = document.createElement("section");
                          element322.className = "hb-capability-range-group";
                          const element323 = document.createElement("div");
                          element323.className = "hb-capability-range-heading";
                          const element324 = document.createElement("strong");
                          element324.textContent = "音量";
                          const element325 = document.createElement("output");
                          element323.append(element324, element325);
                          const element326 = document.createElement("input");
                          ((element326.type = "range"),
                            (element326.min = "0"),
                            (element326.max = "1"),
                            (element326.step = ".01"),
                            (element326.disabled = v664),
                            element322.append(element323, element326));
                          let text36 = "",
                            value38 = null,
                            num51 = 0,
                            value39 = null,
                            v807 = false,
                            value40 = null,
                            value41 = null,
                            value42 = null,
                            value43 = null,
                            v808 = false,
                            value44 = null,
                            value45 = null;
                          const v809 = (arg550) => {
                              const max71 = Math.max(0, Math.floor(Number(arg550) || 0));
                              return (
                                Math.floor(max71 / 60) + ":" + String(max71 % 60).padStart(2, "0")
                              );
                            },
                            v810 = () => {
                              if (!Number.isFinite(value38) || value38 <= 0) {
                                element314.hidden = true;
                                return;
                              }
                              let num52 = Number.isFinite(num51) ? num51 : 0;
                              (v807 &&
                                Number.isFinite(value39) &&
                                (num52 += Math.max(0, (Date.now() - value39) / 1000)),
                                (num52 = Math.max(0, Math.min(value38, num52))),
                                (element314.hidden = false),
                                (element315.max = value38),
                                (element315.value = num52),
                                (element317.textContent = v809(num52)),
                                (element318.textContent = v809(value38)));
                            },
                            setInterval2 = window.setInterval(v810, 1000);
                          (list25.push(() => {
                            (window.clearInterval(setInterval2),
                              window.clearTimeout(value44),
                              window.clearTimeout(value45));
                          }),
                            element310.addEventListener("error", () => {
                              ((element310.hidden = true),
                                element309.classList.remove("has-artwork"));
                            }),
                            element310.addEventListener("load", () => {
                              ((element310.hidden = false),
                                element309.classList.add("has-artwork"));
                            }),
                            element306.addEventListener("error", () => {
                              ((element306.hidden = true),
                                element304.classList.remove("has-artwork"));
                            }),
                            element306.addEventListener("load", () => {
                              ((element306.hidden = false),
                                element304.classList.add("has-artwork"));
                            }));
                          const v811 = (arg551, arg552) =>
                              Number.isFinite(arg551) &&
                              Number.isFinite(arg552) &&
                              Math.abs(arg551 - arg552) <= 0.005,
                            v812 = (arg553) => {
                              ((value40 = Math.max(0, Math.min(1, Number(arg553) || 0))),
                                (element326.value = String(value40)),
                                (element325.textContent = Math.round(value40 * 100) + "%"));
                            },
                            v813 = async () => {
                              if (
                                (window.clearTimeout(value44),
                                (value44 = null),
                                v808 || value43 === null)
                              )
                                return;
                              const v814 = value43;
                              ((value43 = null), (v808 = true));
                              try {
                                await this.callEntityService(
                                  "media_player",
                                  "volume_set",
                                  entityId,
                                  {
                                    volume_level: v814,
                                  },
                                );
                              } catch (v815) {
                                ((value43 = null),
                                  (value42 = null),
                                  window.clearTimeout(value45),
                                  value41 !== null && v812(value41),
                                  this.options.onError?.(v815));
                              } finally {
                                ((v808 = false),
                                  value43 !== null &&
                                    !v811(value43, v814) &&
                                    (value44 = window.setTimeout(v813, 140)));
                              }
                            },
                            v816 = () => {
                              const max72 = Math.max(0, Math.min(1, Number(element326.value) || 0));
                              ((value42 = max72),
                                (value43 = max72),
                                window.clearTimeout(value45),
                                v808 ||
                                  (window.clearTimeout(value44),
                                  (value44 = window.setTimeout(v813, 120))));
                            };
                          (element326.addEventListener("input", () => v812(element326.value)),
                            element326.addEventListener("change", v816));
                          const v817 = (arg554) => {
                            const options68 = arg554?.attributes || {},
                              lowerCase7 = String(arg554?.state || "unknown").toLowerCase(),
                              v818 = Number(options68.supported_features || 0);
                            mediaBrowserControl2.sync(arg554);
                            const options69 = {
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
                            ((element224.textContent =
                              options69[lowerCase7] || arg554?.state || "未知状态"),
                              element224.classList.toggle(
                                "is-live",
                                ["playing", "paused"].includes(lowerCase7),
                              ),
                              (element312.textContent =
                                options68.media_title ||
                                options68.media_series_title ||
                                options68.app_name ||
                                options68.source ||
                                "暂无播放内容"),
                              (element313.textContent =
                                [options68.media_artist, options68.media_album_name]
                                  .filter(Boolean)
                                  .join(" · ") ||
                                options68.media_content_type ||
                                "媒体播放器"),
                              (element321.textContent = lowerCase7 === "playing" ? "暂停" : "播放"),
                              (element321.disabled =
                                v664 || ["off", "unavailable", "unknown"].includes(lowerCase7)),
                              (v805.disabled = v664 || !(v818 & 16)),
                              (v806.disabled = v664 || !(v818 & 32)),
                              element304.classList.toggle("is-playing", lowerCase7 === "playing"),
                              element304.classList.toggle("is-paused", lowerCase7 === "paused"),
                              element304.classList.toggle(
                                "is-off",
                                ["off", "unavailable", "unknown"].includes(lowerCase7),
                              ),
                              (value38 = Number.isFinite(Number(options68.media_duration))
                                ? Number(options68.media_duration)
                                : null),
                              (num51 = Number.isFinite(Number(options68.media_position))
                                ? Number(options68.media_position)
                                : 0));
                            const v819 = Date.parse(
                              String(options68.media_position_updated_at || ""),
                            );
                            ((value39 = Number.isFinite(v819) ? v819 : null),
                              (v807 = lowerCase7 === "playing"),
                              v810());
                            const v820 = Number(options68.volume_level);
                            ((element322.hidden = !Number.isFinite(v820)),
                              Number.isFinite(v820) &&
                                (value42 === null
                                  ? ((value41 = v820), v812(v820))
                                  : v811(v820, value42)
                                    ? ((value41 = v820),
                                      v812(value42),
                                      window.clearTimeout(value45),
                                      (value45 = window.setTimeout(() => {
                                        value42 = null;
                                      }, 1800)))
                                    : window.clearTimeout(value45)));
                            const text37 =
                              [
                                options68.entity_picture_local,
                                options68.entity_picture,
                                options68.media_image_url,
                              ]
                                .map((arg555) => String(arg555 || "").trim())
                                .find(
                                  (arg556) =>
                                    arg556.startsWith("/api/media_player_proxy/") ||
                                    arg556.startsWith("/api/image_proxy/"),
                                ) || "";
                            text37 !== text36 &&
                              ((text36 = text37),
                              (element310.hidden = !text36),
                              (element306.hidden = !text36),
                              element309.classList.toggle("has-artwork", !!text36),
                              element304.classList.toggle("has-artwork", !!text36),
                              text36
                                ? ((element310.src = text36), (element306.src = text36))
                                : (element310.removeAttribute("src"),
                                  element306.removeAttribute("src")));
                          };
                          (element309.append(mediaBrowserControl2.root),
                            v817(v672),
                            v666(entityId, v817),
                            element308.append(element309, element319, element322),
                            list27.push(mediaBrowserControl2.panel),
                            element221.append(element308));
                        } else {
                          const element327 = document.createElement("p");
                          element327.className = "hb-custom-popup-generic";
                          const v821 = (arg557) => {
                            element327.textContent = "当前状态：" + (arg557?.state ?? "暂无状态");
                          };
                          (v821(v672), v666(entityId, v821), element221.append(element327));
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
      element220.append(element221);
    }
    if (!(arg506.modules || []).length) {
      const element328 = document.createElement("p");
      ((element328.className = "hb-custom-popup-generic"),
        (element328.textContent = "这个组合弹窗还没有添加模块。"),
        element220.append(element328));
    }
    (element215.append(element216, element220, ...list27), element214.append(element215));
    const element329 = document.createElement("div");
    ((element329.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (element329.tabIndex = -1),
      element329.append(element214),
      this.container.append(element329),
      (this.detailsDialog = element214));
    const v822 = (arg558) =>
        arg558
          .map((arg559) => {
            const deviceProfile7 =
                arg559.type === "electric-bed"
                  ? this.deviceProfile(this.runtimeEntityId(arg559.entityId))
                  : null,
              options70 =
                deviceProfile7?.deviceType === "electric-bed" ? deviceProfile7.roles || {} : {};
            return [
              arg559.id,
              deviceProfile7?.deviceType || arg559.type || "generic",
              "backrest",
              "leg",
              "waist",
              "mode",
              "memory1",
              "memory2",
            ]
              .map((arg560) => String(arg560 === arg559.id ? arg559.id : options70[arg560] || ""))
              .join(":");
          })
          .join("|"),
      v823 = v822(list24);
    ((this.detailsStateSync = {
      dialog: element214,
      handlers: map24,
      refreshHistory: () => list29.forEach((arg561) => arg561()),
      refreshEntityCatalog: () => {
        this.detailsDialog !== element214 ||
          !element214.open ||
          (v822(list24) !== v823 &&
            this.showCustomPopup(arg506, {
              preview: v664,
            }));
      },
    }),
      this.registerRuntimeDialogScale(element329, element214, popupWidth, popupHeight),
      element219.addEventListener("click", () => element214.close()),
      this.bindRuntimeDialogOutsideDismiss(element329, element214, element215),
      element329.addEventListener("keydown", (arg562) => {
        arg562.key === "Escape" && element214.close();
      }),
      element214.addEventListener(
        "close",
        () => {
          for (const v824 of list25.splice(0)) v824();
          (this.clearRuntimeDialogScale(element214),
            this.detailsDialog === element214 && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === element214 && (this.detailsStateSync = null),
            !this.replacingDocument &&
              this.activePopupId === String(arg506?.id || "") &&
              ((this.activePopupId = null),
              (this.historyPopupGeneration += 1),
              this.connectRuntime(),
              this.refreshHistorySeries()),
            element329.remove());
        },
        {
          once: true,
        },
      ),
      element214.show(),
      this.refreshHistorySeries());
    for (const v825 of list26) {
      const v826 = playMediaSpeakerEntrance2(v825);
      v826 && list25.push(() => v826.cancel());
    }
    for (const v827 of list28) {
      const v828 = playFixedDeviceDropEntrance2(v827.visual, v827);
      v828 && list25.push(() => v828.cancel());
    }
  }
  ["createLightDetailsControls"](
    arg563,
    arg564,
    { interactive: v829 = true, onTurnOn: v830 = null, onVisualChange: v831 = null } = {},
  ) {
    const options71 = arg564?.attributes || {},
      startsWith3 = arg563.startsWith("light."),
      v832 = startsWith3 && lightSupportsColor2(options71),
      { brightness: v833, colorTemperature: v834 } = lightRealtimeCapabilities2(arg563, arg564),
      v835 = v834,
      element330 = document.createElement("section");
    ((element330.className = "hb-light-details-controls"),
      element330.classList.toggle("has-color-picker", v832),
      (element330.inert = !v829));
    const map27 = new Map(),
      v836 = lightControlModes2(options71);
    let v837 = lightControlMode2(options71.color_mode, v836);
    const element331 = document.createElement("select");
    ((element331.className = "hb-light-mode"),
      element331.setAttribute("aria-label", "灯光模式"),
      (element331.hidden = v836.length < 2));
    for (const v838 of v836) {
      const element332 = document.createElement("option");
      ((element332.value = v838),
        (element332.textContent = {
          color: "彩光",
          temperature: "色温",
          white: "白光",
        }[v838]),
        element331.append(element332));
    }
    const v839 = (arg565) => {
      ((v837 = arg565),
        (element331.value = arg565),
        value46 && (value46.hidden = arg565 !== "color"));
      const v840 = map27.get("color_temp_kelvin");
      (v840 && (v840.root.hidden = arg565 !== "temperature"),
        element330.classList.toggle("has-color-picker", v832 && arg565 === "color"));
    };
    element331.addEventListener("change", async () => {
      if (!v829) return;
      v881();
      const v841 = v837;
      v839(element331.value);
      const options72 =
        v837 === "white"
          ? {
              white: Math.round(
                Math.max(1, Math.min(255, Number(v880?.attributes?.brightness) || 255)),
              ),
            }
          : v837 === "temperature"
            ? {
                color_temp_kelvin: Number(map27.get("color_temp_kelvin")?.input.value) || v876,
              }
            : lightColorServiceData2(options71, [value47?.hue || 0, value47?.saturation || 0]);
      try {
        (await this.callEntityService("light", "turn_on", arg563, options72), v830?.());
      } catch (v842) {
        (v839(v841), this.options.onError?.(v842));
      }
    });
    const v843 = ({
      label: v844,
      value: v845,
      minimum: v846,
      maximum: v847,
      step: v848,
      suffix: v849,
      dataKey: v850,
      className: v851 = "",
      icon: v852,
      minimumLabel: v853,
      maximumLabel: v854,
      supported: v855 = true,
    }) => {
      const element333 = document.createElement("label");
      ((element333.className = ("hb-light-details-slider " + v851).trim()),
        element333.classList.toggle("is-unavailable", !v855));
      const element334 = document.createElement("span");
      element334.className = "hb-light-details-slider-heading";
      const element335 = document.createElement("i");
      ((element335.className = "hb-light-details-slider-icon"),
        element335.setAttribute("aria-hidden", "true"),
        (element335.textContent = v852));
      const element336 = document.createElement("strong");
      element336.textContent = v844;
      const element337 = document.createElement("output"),
        max73 = Math.max(v846, Math.min(v847, v845));
      ((element337.textContent = "" + Math.round(max73) + v849),
        element334.append(element335, element336, element337));
      const element338 = document.createElement("input");
      ((element338.type = "range"),
        (element338.min = String(v846)),
        (element338.max = String(v847)),
        (element338.step = String(v848)),
        (element338.value = String(max73)),
        (element338.disabled = !v855));
      const v856 = ({ notify: v857 = false } = {}) => {
        const v858 = Number(element338.value),
          v859 = ((v858 - v846) / Math.max(1, v847 - v846)) * 100;
        ((element337.textContent = v855 ? "" + Math.round(v858) + v849 : "不支持"),
          element338.style.setProperty(
            "--hb-light-slider-progress",
            Math.max(0, Math.min(100, v859)) + "%",
          ),
          v857 &&
            v855 &&
            v831?.(
              v850 === "brightness_pct"
                ? {
                    brightnessPercent: v858,
                  }
                : {
                    colorTemperatureKelvin: v858,
                    colorRgb: null,
                  },
            ));
      };
      (v856(),
        element338.addEventListener("input", () => {
          (v881(),
            v856({
              notify: true,
            }));
        }),
        element338.addEventListener("change", async () => {
          if (!(!v829 || !v855))
            try {
              (await this.callEntityService("light", "turn_on", arg563, {
                [v850]: Number(element338.value),
              }),
                v830?.());
            } catch (v860) {
              (this.options.onError?.(v860), (element337.textContent = "设置失败"));
            }
        }));
      const element339 = document.createElement("span");
      element339.className = "hb-light-details-slider-legend";
      const element340 = document.createElement("small");
      element340.textContent = v853;
      const element341 = document.createElement("small");
      ((element341.textContent = v854),
        element339.append(element340, element341),
        element333.append(element334, element338, element339),
        element330.append(element333),
        map27.set(v850, {
          root: element333,
          input: element338,
          updateSliderValue: v856,
          supported: v855,
        }));
    };
    let value46 = null,
      value47 = null,
      v861 = false;
    if (v832) {
      const list33 = lightColorHs2(options71) || [0, 0];
      ((value47 = {
        hue: Number(list33[0]) || 0,
        saturation: Number(list33[1]) || 0,
      }),
        (value46 = document.createElement("div")),
        (value46.className = "hb-light-color-picker"),
        value46.setAttribute("role", "slider"),
        value46.setAttribute("tabindex", v829 ? "0" : "-1"),
        value46.setAttribute("aria-label", "选择灯光颜色"));
      const element342 = document.createElement("i");
      element342.className = "hb-light-color-picker-glow";
      const element343 = document.createElement("i");
      ((element343.className = "hb-light-color-picker-handle"),
        value46.append(element342, element343));
      const v862 = () => lightColorPickerPointFromHs2([value47.hue, value47.saturation]),
        v863 = ({ hue: v864 = value47.hue, saturation: v865 = value47.saturation } = {}) => {
          ((value47.hue = (((Number(v864) || 0) % 360) + 360) % 360),
            (value47.saturation = Math.max(0, Math.min(100, Number(v865) || 0))));
          const vector9 = v862(),
            v866 = hsToRgbColor2([value47.hue, value47.saturation]),
            v867 = "rgb(" + v866.join(",") + ")";
          (value46.style.setProperty("--hb-light-color-picker-x", vector9.x * 100 + "%"),
            value46.style.setProperty("--hb-light-color-picker-y", vector9.y * 100 + "%"),
            value46.style.setProperty("--hb-light-color-picker-color", v867),
            value46.setAttribute(
              "aria-valuetext",
              "色相 " +
                Math.round(value47.hue) +
                " 度，饱和度 " +
                Math.round(value47.saturation) +
                "%",
            ),
            v831?.({
              colorHs: [value47.hue, value47.saturation],
              colorRgb: v866,
            }));
        },
        v868 = (arg566) => {
          const boundingClientRect12 = value46.getBoundingClientRect();
          if (!boundingClientRect12.width || !boundingClientRect12.height) return;
          const max74 = Math.max(
              0,
              Math.min(
                1,
                (arg566.clientX - boundingClientRect12.left) / boundingClientRect12.width,
              ),
            ),
            max75 = Math.max(
              0,
              Math.min(
                1,
                (arg566.clientY - boundingClientRect12.top) / boundingClientRect12.height,
              ),
            ),
            [v869, v870] = lightColorPickerHsFromPoint2(max74, max75);
          v863({
            hue: v869,
            saturation: v870,
          });
        },
        v871 = async () => {
          if (!(!v829 || v861)) {
            ((v861 = true), value46.setAttribute("aria-busy", "true"));
            try {
              (await this.callEntityService(
                "light",
                "turn_on",
                arg563,
                lightColorServiceData2(options71, [value47.hue, value47.saturation]),
              ),
                v830?.());
            } catch (v872) {
              this.options.onError?.(v872);
            } finally {
              ((v861 = false), value46.removeAttribute("aria-busy"));
            }
          }
        };
      (value46.addEventListener("pointerdown", (arg567) => {
        v829 &&
          (value46.setPointerCapture?.(arg567.pointerId),
          (value46.dataset.dragging = "true"),
          v868(arg567),
          arg567.preventDefault());
      }),
        value46.addEventListener("pointermove", (arg568) => {
          value46.dataset.dragging === "true" && v868(arg568);
        }));
      const v873 = async (arg569) => {
        value46.dataset.dragging === "true" &&
          ((value46.dataset.dragging = "false"),
          value46.releasePointerCapture?.(arg569.pointerId),
          await v871());
      };
      (value46.addEventListener("pointerup", v873),
        value46.addEventListener("pointercancel", v873),
        value46.addEventListener("keydown", async (arg570) => {
          if (!v829) return;
          const num53 = arg570.shiftKey ? 10 : 3;
          let { hue: v874, saturation: v875 } = value47;
          if (arg570.key === "ArrowLeft") v874 -= num53;
          else {
            if (arg570.key === "ArrowRight") v874 += num53;
            else {
              if (arg570.key === "ArrowUp") v875 -= num53;
              else {
                if (arg570.key === "ArrowDown") v875 += num53;
                else {
                  if (arg570.key === "Enter" || arg570.key === " ") {
                    (await v871(), arg570.preventDefault());
                    return;
                  } else return;
                }
              }
            }
          }
          (v863({
            hue: v874,
            saturation: v875,
          }),
            arg570.preventDefault());
        }),
        (value46.syncColorPicker = v863),
        (value46.cleanupColorPicker = () => {
          value46.dataset.dragging = "false";
        }),
        v863(),
        element330.append(value46));
    }
    const num54 = Number.isFinite(Number(options71.max_mireds))
        ? 1000000 / Number(options71.max_mireds)
        : 2000,
      num55 = Number.isFinite(Number(options71.min_mireds))
        ? 1000000 / Number(options71.min_mireds)
        : 6500,
      v876 = Number(options71.min_color_temp_kelvin) || num54,
      v877 = Number(options71.max_color_temp_kelvin) || num55,
      v878 = Number.isFinite(Number(options71.color_temp))
        ? 1000000 / Number(options71.color_temp)
        : v876,
      v879 = Number(options71.color_temp_kelvin) || v878;
    (!v832 || v834) &&
      v843({
        label: "色温",
        value: v879,
        minimum: Math.round(v876),
        maximum: Math.round(v877),
        step: 50,
        suffix: "K",
        dataKey: "color_temp_kelvin",
        className: "hb-light-details-temperature",
        icon: "♨",
        minimumLabel: "暖色",
        maximumLabel: "冷色",
        supported: v834,
      });
    const num56 = Number.isFinite(Number(options71.brightness))
      ? (Number(options71.brightness) / 255) * 100
      : 100;
    v843({
      label: "亮度",
      value: num56,
      minimum: 1,
      maximum: 100,
      step: 1,
      suffix: "%",
      dataKey: "brightness_pct",
      className: "hb-light-details-brightness",
      icon: "☀",
      minimumLabel: "暗",
      maximumLabel: "亮",
      supported: v833,
    });
    let value48 = null,
      num57 = 0,
      v880 = arg564;
    const v881 = ({ resync: v882 = false } = {}) => {
        (window.clearTimeout(num57),
          (num57 = 0),
          (value48 = null),
          v882 && element330.syncLightState?.(v880));
      },
      v883 = () => {
        if ((window.clearTimeout(num57), (num57 = 0), !value48)) return;
        const now3 = Date.now(),
          v884 = lightPresetPendingDecision2(value48, now3);
        if (v884 === "confirmed" || v884 === "timeout") {
          v881({
            resync: true,
          });
          return;
        }
        const min17 = value48.latestMatches
          ? Math.min(
              value48.expiresAt,
              Math.max(
                value48.minimumHoldUntil,
                value48.matchStartedAt + LIGHT_PRESET_STABLE_CONFIRMATION_MS2,
              ),
            )
          : value48.expiresAt;
        num57 = window.setTimeout(v883, Math.max(50, min17 - now3));
      },
      v885 = LIGHT_DETAIL_PRESET_DEFINITIONS2,
      v886 = (arg571) => relativeLightColorTemperature2(v876, v877, arg571.colorTemperaturePercent),
      element344 = document.createElement("div");
    ((element344.className = "hb-light-details-presets"),
      (element344.hidden = v832 || (!v833 && !v835)));
    const map28 = v885.map((arg572) => {
      const element345 = document.createElement("button");
      ((element345.type = "button"), (element345.disabled = !startsWith3));
      const element346 = document.createElement("strong");
      element346.textContent = arg572.label;
      const element347 = document.createElement("small");
      return (
        (element347.textContent = v833 ? arg572.detail : "开启"),
        element345.append(element346, element347),
        element345.addEventListener("click", async () => {
          if (!v829 || !startsWith3) return;
          const v887 = v886(arg572),
            options73 = {};
          (v833 &&
            Object.assign(options73, lightPresetBrightnessServiceData2(arg572.brightnessPercent)),
            v835 && (options73.color_temp_kelvin = Math.round(v887)),
            window.clearTimeout(num57));
          const now4 = Date.now();
          ((value48 = {
            brightnessPercent: arg572.brightnessPercent,
            colorTemperatureKelvin: v887,
            minimumHoldUntil: now4 + LIGHT_PRESET_MINIMUM_HOLD_MS2,
            expiresAt: now4 + LIGHT_PRESET_MAXIMUM_HOLD_MS2,
            latestMatches: false,
            matchStartedAt: null,
          }),
            v883());
          const v888 = map27.get("brightness_pct");
          v888?.supported &&
            ((v888.input.value = String(arg572.brightnessPercent)),
            v888.updateSliderValue({
              notify: true,
            }));
          const v889 = map27.get("color_temp_kelvin");
          v889?.supported &&
            ((v889.input.value = String(v887)),
            v889.updateSliderValue({
              notify: true,
            }));
          for (const v890 of map28)
            v890.button.classList.toggle("is-active", v890.button === element345);
          (v831?.({
            isOn: true,
            ...(v833
              ? {
                  brightnessPercent: arg572.brightnessPercent,
                }
              : {}),
            ...(v835
              ? {
                  colorTemperatureKelvin: v887,
                }
              : {}),
          }),
            v830?.());
          try {
            await this.callEntityService("light", "turn_on", arg563, options73);
          } catch (v891) {
            (v881({
              resync: true,
            }),
              element345.classList.remove("is-active"),
              this.options.onError?.(v891));
          }
        }),
        element344.append(element345),
        {
          button: element345,
          ...arg572,
        }
      );
    });
    (element330.append(element344),
      element330.prepend(element331),
      element330.classList.toggle("has-mode-switch", v836.length > 1));
    const v892 = (arg573) => {
      const options74 = arg573?.attributes || {},
        v893 = arg573?.state === "on",
        NaN3 = Number.isFinite(Number(options74.brightness))
          ? (Number(options74.brightness) / 255) * 100
          : NaN,
        NaN4 = Number.isFinite(Number(options74.color_temp))
          ? 1000000 / Number(options74.color_temp)
          : NaN,
        v894 = Number(options74.color_temp_kelvin) || NaN4;
      for (const v895 of map28) {
        const v896 = v886(v895),
          max76 = Math.max(50, (v877 - v876) * 0.06),
          finite3 =
            !v833 || (Number.isFinite(NaN3) && Math.abs(NaN3 - v895.brightnessPercent) <= 4),
          finite4 = !v835 || (Number.isFinite(v894) && Math.abs(v894 - v896) <= max76);
        v895.button.classList.toggle("is-active", v893 && finite3 && finite4);
      }
    };
    return (
      v892(arg564),
      (element330.syncLightState = (arg574) => {
        if (!arg574) return;
        v880 = arg574;
        const options75 = arg574.attributes || {};
        options75.color_mode && v839(lightControlMode2(options75.color_mode, v836));
        const v897 = map27.get("color_temp_kelvin"),
          NaN5 = Number.isFinite(Number(options75.color_temp))
            ? 1000000 / Number(options75.color_temp)
            : NaN,
          v898 = Number(options75.color_temp_kelvin) || NaN5,
          v899 = map27.get("brightness_pct"),
          NaN6 = Number.isFinite(Number(options75.brightness))
            ? (Number(options75.brightness) / 255) * 100
            : NaN;
        if (value48) {
          const finite5 =
              !v833 || (Number.isFinite(NaN6) && Math.abs(NaN6 - value48.brightnessPercent) <= 4),
            finite6 =
              !v835 ||
              (Number.isFinite(v898) && Math.abs(v898 - value48.colorTemperatureKelvin) <= 220),
            v900 = finite5 && finite6;
          (v900 && !value48.latestMatches && (value48.matchStartedAt = Date.now()),
            v900 || (value48.matchStartedAt = null),
            (value48.latestMatches = v900),
            v883());
        }
        const v901 = value48?.colorTemperatureKelvin ?? v898,
          v902 = value48?.brightnessPercent ?? NaN6;
        if (
          (v897?.supported &&
            Number.isFinite(v901) &&
            ((v897.input.value = String(v901)), v897.updateSliderValue()),
          v899?.supported &&
            Number.isFinite(v902) &&
            ((v899.input.value = String(v902)), v899.updateSliderValue()),
          value46)
        ) {
          const v903 = lightColorHs2(options75);
          v903 &&
            value46.syncColorPicker({
              hue: v903[0],
              saturation: v903[1],
            });
        }
        v892(
          value48
            ? {
                state: "on",
                attributes: {
                  ...options75,
                  ...(v833
                    ? {
                        brightness: (value48.brightnessPercent / 100) * 255,
                      }
                    : {}),
                  ...(v835
                    ? {
                        color_temp_kelvin: value48.colorTemperatureKelvin,
                      }
                    : {}),
                },
              }
            : arg574,
        );
        const v904 = lightVisualValueForCapability2(
            v835,
            v901,
            UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN2,
          ),
          v905 = lightVisualValueForCapability2(
            v833,
            v902,
            UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT2,
          );
        v831?.({
          isOn: arg574.state === "on",
          colorTemperatureKelvin: v904,
          brightnessPercent: v905,
          colorRgb: v832 ? lightColorRgb2(options75) : null,
        });
      }),
      v839(v837),
      element330.syncLightState(arg564),
      (element330.cleanupLightDetails = () => {
        (v881(), value46?.cleanupColorPicker?.());
      }),
      element330
    );
  }
  ["createCoverDetailsControls"](
    arg575,
    arg576,
    {
      interactive: v906 = true,
      dream: v907 = false,
      airer: v908 = false,
      tilt: v909 = false,
      motorReversed: v910 = false,
      positionState: v911 = null,
      positionCommandEntityId: v912 = "",
      positionCommandState: v913 = null,
      motorState: v914 = null,
      airerActionEntityIds: v915 = {},
      positionCalibration: v916 = {},
      onVisualChange: v917 = null,
      onCurtainPositionChange: v918 = null,
    } = {},
  ) {
    const element348 = document.createElement("section");
    ((element348.className = "hb-cover-details-controls"), (element348.inert = !v906));
    const element349 = document.createElement("label");
    element349.className = "hb-cover-details-position";
    const element350 = document.createElement("span");
    element350.className = "hb-cover-details-position-heading";
    const element351 = document.createElement("strong");
    element351.textContent = v907 ? "叶片角度" : v908 ? "晾杆高度" : "开合位置";
    const element352 = document.createElement("output");
    element350.append(element351, element352);
    const element353 = document.createElement("input");
    ((element353.type = "range"),
      (element353.min = "0"),
      (element353.max = "100"),
      (element353.step = "1"));
    const element354 = document.createElement("span");
    ((element354.className = "hb-cover-details-position-legend"),
      v907
        ? element354.append(
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
        : v908
          ? element354.append(
              Object.assign(document.createElement("small"), {
                textContent: "下降",
              }),
              Object.assign(document.createElement("small"), {
                textContent: "升起",
              }),
            )
          : element354.append(
              Object.assign(document.createElement("small"), {
                textContent: "关闭",
              }),
              Object.assign(document.createElement("small"), {
                textContent: "打开",
              }),
            ),
      element349.append(element350, element353, element354));
    const element355 = document.createElement("div");
    element355.className = "hb-cover-details-actions";
    const text38 = "open_cover",
      text39 = "stop_cover",
      text40 = "close_cover",
      v919 = v910 ? text38 : text40,
      v920 = v910 ? text40 : text38;
    let v921 = dreamCurtainIsRetracted2(arg576?.state, v910);
    const map29 = (
      v907
        ? [
            {
              label: "关闭",
              icon: "←",
              service: v919,
              curtainRetracted: false,
            },
            {
              label: "暂停",
              icon: "Ⅱ",
              service: text39,
            },
            {
              label: "开启",
              icon: "→",
              service: v920,
              curtainRetracted: true,
            },
          ]
        : v908
          ? [
              {
                label: "下降",
                icon: "↓",
                service: v919,
                action: "down",
              },
              {
                label: "暂停",
                icon: "Ⅱ",
                service: text39,
                action: "pause",
              },
              {
                label: "升起",
                icon: "↑",
                service: v920,
                action: "up",
              },
            ]
          : [
              {
                label: "关闭",
                icon: "←",
                service: v919,
              },
              {
                label: "暂停",
                icon: "Ⅱ",
                service: text39,
              },
              {
                label: "打开",
                icon: "→",
                service: v920,
              },
            ]
    ).map((arg577) => {
      const element356 = document.createElement("button");
      ((element356.type = "button"), (element356.dataset.coverAction = arg577.service));
      const element357 = document.createElement("i");
      ((element357.textContent = arg577.icon), element357.setAttribute("aria-hidden", "true"));
      const element358 = document.createElement("strong");
      return (
        (element358.textContent = arg577.label),
        element356.append(element357, element358),
        element356.addEventListener("click", async () => {
          if (v906) {
            (v907 &&
              typeof arg577.curtainRetracted == "boolean" &&
              element348.beginDreamCurtainMotion?.(arg577.curtainRetracted),
              !v907 && arg577.service === v920
                ? element348.beginCoverMotion?.(100, "opening")
                : !v907 && arg577.service === v919
                  ? element348.beginCoverMotion?.(0, "closing")
                  : element348.stopCoverMotion?.(),
              element356.classList.add("is-pending"));
            try {
              const text41 = v908 && arg577.action ? v915[arg577.action] : "";
              if (v908 && v912 && ["up", "down"].includes(arg577.action)) {
                const num58 = arg577.action === "up" ? 100 : 0,
                  v922 = airerDevicePosition2(num58, v916);
                await this.callEntityService("number", "set_value", v912, {
                  value: v922,
                });
              } else
                v908 && arg577.action === "pause"
                  ? await this.callEntityService("cover", text39, arg575)
                  : text41
                    ? await this.callEntityService("button", "press", text41)
                    : await this.callEntityService("cover", arg577.service, arg575);
            } catch (v923) {
              (element348.cancelDreamCurtainMotion?.(),
                element348.cancelCoverMotion?.(),
                element348.syncCoverState?.(arg576),
                this.options.onError?.(v923));
            } finally {
              element356.classList.remove("is-pending");
            }
          }
        }),
        element355.append(element356),
        element356
      );
    });
    let v924 = v911,
      v925 = v913,
      v926 = v914;
    const v927 = () => {
      v908 && learnAirerPositionCalibration2(v916, v924?.state, v925?.state, v926?.state);
    };
    v927();
    let v928 = String(arg576?.state || "");
    const v929 = (arg578) => {
      const v930 = v908
        ? airerReportedPosition2(v924, arg578, v916)
        : Number(arg578?.attributes?.[v909 ? "current_tilt_position" : "current_position"]);
      if (Number.isFinite(v930)) {
        const max77 = Math.max(0, Math.min(100, v930));
        return v908
          ? airerPresentationPositionForState2(max77, v928 || arg578?.state, v916, v910)
          : max77;
      }
      return arg578?.state === "open" ? 100 : 0;
    };
    let v931 = arg576,
      v932 = v929(arg576),
      v933 = v932,
      v934 = false,
      num59 = 0,
      value49 = null,
      value50 = null,
      num60 = 0,
      value51 = null;
    const v935 = () => {
        (window.cancelAnimationFrame(num59), (num59 = 0));
      },
      v936 = (arg579, v937 = "") => {
        ((v933 = Math.max(0, Math.min(100, Number(arg579) || 0))),
          (element353.value = String(v933)),
          element353.style.setProperty("--hb-cover-position-progress", v933 + "%"),
          (element352.textContent = Math.round(v933) + "%"));
        for (const element359 of map29)
          element359.classList.toggle(
            "is-active",
            element359.dataset.coverAction ===
              (v937 === "opening" ? text38 : v937 === "closing" ? text40 : ""),
          );
        v917?.({
          position: v933,
          state: v937,
        });
      };
    ((element348.setDreamCurtainRetracted = (arg580, v938 = false) => {
      v907 &&
        ((v921 = !!arg580),
        (element353.disabled = !v906),
        v918?.({
          retracted: v921,
          moving: !!v938,
        }));
    }),
      (element348.isDreamCurtainRetracted = () => v921),
      (element348.beginDreamCurtainMotion = (arg581) => {
        v907 &&
          ((value51 = {
            target: !!arg581,
            expiresAt: Date.now() + 10000,
          }),
          element348.setDreamCurtainRetracted?.(value51.target, true));
      }),
      (element348.cancelDreamCurtainMotion = () => {
        value51 = null;
      }),
      (element348.beginCoverMotion = (arg582, arg583) => {
        (v935(), (value50 = null), (num60 = 0));
        const v939 = v933,
          max78 = Math.max(0, Math.min(100, Number(arg582) || 0));
        value49 = {
          direction: max78 >= v939 ? 1 : -1,
          target: max78,
          state: arg583,
          initialPosition: v939,
          lastServerPosition: v939,
          sawMotorRunning: false,
          ignoreStaleUntil: Date.now() + 4000,
          expiresAt: Date.now() + (v908 ? 120000 : 10000),
        };
        const now5 = performance.now(),
          max79 = Math.max(900, Math.abs(max78 - v939) * 28),
          v940 = (arg584) => {
            const min18 = Math.min(1, (arg584 - now5) / max79),
              v941 = 1 - (1 - min18) ** 3;
            (v936(v939 + (max78 - v939) * v941, arg583),
              min18 < 1 ? (num59 = window.requestAnimationFrame(v940)) : (num59 = 0));
          };
        (v936(v939, arg583), (num59 = window.requestAnimationFrame(v940)));
      }),
      (element348.stopCoverMotion = () => {
        (v935(), (value49 = null), v936(v933, ""));
      }),
      (element348.cancelCoverMotion = () => {
        (v935(), (value49 = null));
      }),
      (element348.holdCoverPosition = (arg585) => {
        (v935(), (value50 = null), (num60 = 0));
        const max80 = Math.max(0, Math.min(100, Number(arg585) || 0)),
          v942 = v932,
          num61 = max80 >= v942 ? 1 : -1,
          text42 = v907 || Math.abs(max80 - v942) < 0.5 ? "" : num61 > 0 ? "opening" : "closing";
        ((value49 = {
          direction: num61,
          target: max80,
          state: text42,
          initialPosition: v942,
          lastServerPosition: v942,
          sawMotorRunning: false,
          ignoreStaleUntil: Date.now() + 4000,
          expiresAt: Date.now() + (v908 ? 120000 : 10000),
        }),
          v936(max80, text42));
      }));
    const v943 = (arg586, { primary: v944 = false } = {}) => {
      (v944 && ((v931 = arg586 || v931), (v928 = String(arg586?.state || v928))),
        value50 !== null && Date.now() >= num60 && ((value50 = null), (num60 = 0)));
      const v945 = v908 && value50 !== null ? value50 : v929(arg586);
      v932 = v945;
      const v946 = String(arg586?.state || "");
      if (v907) {
        const v947 = physicalCoverState2(v946, v910),
          v948 = dreamCurtainIsRetracted2(v946, v910);
        if (value51 && v948 === value51.target) {
          const target2 = value51.target;
          ((value51 = null), element348.setDreamCurtainRetracted?.(target2, false));
        } else
          value51 && Date.now() < value51.expiresAt
            ? element348.setDreamCurtainRetracted?.(value51.target, true)
            : ((value51 = null),
              element348.setDreamCurtainRetracted?.(
                v948,
                v947 === "opening" || v947 === "closing",
              ));
      }
      if (!v934) {
        if (value49) {
          const now6 = Date.now(),
            { direction: v949, target: v950, state: v951 } = value49,
            v952 = coverPositionReachedTarget2(v945, v950, v949),
            v953 = (v950 <= 0.5 && v946 === "closed") || (v950 >= 99.5 && v946 === "open"),
            v954 = Number(v926?.state),
            finite7 =
              v908 && value49.sawMotorRunning && Number.isFinite(v954) && Math.abs(v954) < 0.5;
          if (v908 ? v953 || (finite7 && v952) : v952 || v953 || (v950 >= 99.5 && v945 >= 99.5)) {
            (v935(),
              v908 && ((value50 = v950), (num60 = Date.now() + 120000)),
              (value49 = null),
              v936(v950, v946 || (v949 < 0 ? "closed" : "open")));
            return;
          }
          if (
            v949 < 0
              ? v945 < value49.lastServerPosition - 0.5 || v946 === "closing"
              : v945 > value49.lastServerPosition + 0.5 || v946 === "opening"
          ) {
            value49.lastServerPosition =
              v949 < 0
                ? Math.min(value49.lastServerPosition, v945)
                : Math.max(value49.lastServerPosition, v945);
            const v955 = coverPendingDisplayPosition2(v933, v945, v949);
            v936(v955, v951);
            return;
          }
          if (
            now6 < value49.ignoreStaleUntil ||
            (v908 && now6 < value49.expiresAt) ||
            (now6 < value49.expiresAt && Math.abs(v945 - value49.initialPosition) < 0.5)
          )
            return;
          (v935(), (value49 = null));
        } else v935();
        v936(v945, v946);
      }
    };
    return (
      element353.addEventListener("pointerdown", () => {
        ((v934 = true), v935(), (value49 = null));
      }),
      element353.addEventListener("input", () => {
        ((v934 = true), v935(), (value49 = null));
        const v956 = Number(element353.value);
        v936(v956, v907 ? "" : v956 > 0 ? "open" : "closed");
      }),
      element353.addEventListener("change", async () => {
        if (((v934 = false), !v906)) return;
        const v957 = Number(element353.value),
          v958 = airerDevicePosition2(v957, v916);
        element348.holdCoverPosition(v957);
        try {
          v908 && v912
            ? await this.callEntityService("number", "set_value", v912, {
                value: v958,
              })
            : await this.callEntityService(
                "cover",
                v909 ? "set_cover_tilt_position" : "set_cover_position",
                arg575,
                {
                  [v909 ? "tilt_position" : "position"]: v957,
                },
              );
        } catch (v959) {
          (element348.cancelCoverMotion(), v943(v931), this.options.onError?.(v959));
        }
      }),
      element353.addEventListener("pointercancel", () => {
        ((v934 = false), v943(v931));
      }),
      element348.append(element349, element355),
      (element348.syncCoverState = (arg587) =>
        v943(arg587, {
          primary: true,
        })),
      (element348.syncCoverPositionState = (arg588) => {
        ((v924 = arg588 || v924), v927(), v943(v931));
      }),
      (element348.syncCoverPositionCommandState = (arg589) => {
        ((v925 = arg589 || v925), v927(), v943(v931));
      }),
      (element348.syncAirerMotorState = (arg590) => {
        v926 = arg590 || v926;
        const v960 = Number(v926?.state);
        (value49 &&
          Number.isFinite(v960) &&
          Math.abs(v960) >= 0.5 &&
          (value49.sawMotorRunning = true),
          v927(),
          v943(v931));
      }),
      (element348.cleanupCoverDetails = () => {
        (v935(), (value49 = null), (value51 = null), (v934 = false));
      }),
      v943(arg576, {
        primary: true,
      }),
      element348
    );
  }
  ["createClimateDetailsControls"](
    arg591,
    arg592,
    {
      interactive: v961 = true,
      onPowerChange: v962 = null,
      onVisualChange: v963 = null,
      modeColors: v964 = {},
      deviceType: v965 = "air-conditioner",
    } = {},
  ) {
    const v966 = normalizeClimateCapabilities2(arg592),
      attributes2 = v966.attributes,
      v967 = String(arg591 || "").split(".", 1)[0],
      options76 = {
        entityId: arg591,
        entityMetadata: this.entityMetadata,
        entityTranslations: this.entityTranslations,
      },
      element360 = document.createElement("section");
    ((element360.className = "hb-climate-details-controls"),
      (element360.dataset.climateDeviceType = v965),
      (element360.dataset.climateStructureKey = climateControlStructureKey2(arg591, arg592, v965)),
      (element360.inert = !v961));
    const currentTemperature = v966.currentTemperature,
      targetTemperature2 = v966.targetTemperature,
      minimumTemperature = v966.minimumTemperature,
      maximumTemperature = v966.maximumTemperature,
      temperatureStep = v966.temperatureStep,
      supportsTargetTemperature =
        ["climate", "water_heater"].includes(v967) && v966.supportsTargetTemperature,
      v968 = v967 === "water_heater";
    element360.classList.toggle("without-temperature", !supportsTargetTemperature);
    let v969 = supportsTargetTemperature ? targetTemperature2 : minimumTemperature,
      value52 = null,
      value53 = null,
      value54 = null;
    const v970 = () => {
        ((value52 = null),
          window.clearTimeout(value53),
          window.clearTimeout(value54),
          (value53 = null),
          (value54 = null));
      },
      v971 = (arg593) => {
        ((value52 = arg593),
          window.clearTimeout(value53),
          window.clearTimeout(value54),
          (value54 = null),
          (value53 = window.setTimeout(() => {
            ((value52 = null), (value53 = null));
          }, 8000)));
      },
      v972 = () => {
        (window.clearTimeout(value54), (value54 = window.setTimeout(v970, 2500)));
      },
      element361 = document.createElement("section");
    element361.className = "hb-climate-thermostat";
    const element362 = document.createElement("button");
    ((element362.type = "button"),
      (element362.className = "hb-climate-temperature-step"),
      (element362.textContent = "−"),
      element362.setAttribute("aria-label", "降低设定温度"));
    const element363 = document.createElement("div");
    element363.className = "hb-climate-temperature-dial";
    const element364 = document.createElement("i");
    ((element364.className = "hb-climate-arc-cap start"),
      element364.setAttribute("aria-hidden", "true"));
    const element365 = document.createElement("i");
    ((element365.className = "hb-climate-arc-cap end"),
      element365.setAttribute("aria-hidden", "true"));
    const element366 = document.createElement("button");
    ((element366.type = "button"),
      (element366.className = "hb-climate-temperature-thumb"),
      element366.setAttribute("aria-label", "拖动调节设定温度"));
    const element367 = document.createElement("div");
    element367.className = "hb-climate-temperature-content";
    const element368 = document.createElement("small");
    element368.textContent = "设定温度";
    const element369 = document.createElement("strong"),
      element370 = document.createElement("span");
    ((element370.textContent = Number.isFinite(currentTemperature)
      ? "当前温度 " + currentTemperature + "°C"
      : "当前温度 --"),
      element367.append(element368, element369, element370),
      element363.append(element364, element365, element366, element367));
    const element371 = document.createElement("button");
    ((element371.type = "button"),
      (element371.className = "hb-climate-temperature-step"),
      (element371.textContent = "+"),
      element371.setAttribute("aria-label", "提高设定温度"));
    let v973 = arg592;
    const v974 = (arg594) => climateEffectMode2(arg594, v965),
      v975 = (v976 = v973) => {
        v973 = v976 || v973;
        const v977 = v974(v973),
          max81 = Math.max(
            0,
            Math.min(
              1,
              (v969 - minimumTemperature) /
                Math.max(temperatureStep, maximumTemperature - minimumTemperature),
            ),
          ),
          text43 =
            v977 === "cool"
              ? v964.cool || "#73c8ff"
              : v977 === "heat"
                ? v964.heat || "#ff8a65"
                : v964.other || "#dce2e6",
          text44 =
            v977 === "off"
              ? "#65717a"
              : v977 === "cool"
                ? gn(text43, "#ffffff", max81 * 0.32)
                : v977 === "heat"
                  ? gn(text43, "#ffffff", (1 - max81) * 0.3)
                  : text43;
        ((element360.dataset.climateVisualMode = v977),
          v977 !== "off" && (element360.dataset.lastClimateMode = String(v973?.state || "auto")));
        const gn2 = gn(text44, "#11171c", 0.72);
        (element360.style.setProperty("--hb-climate-accent", text44),
          element360.style.setProperty("--hb-climate-accent-soft", gn2));
        const v978 = climateIsRunning2(v973, v965);
        (element360.classList.toggle("is-running", v978),
          v963?.({
            mode: climatePresentationMode2(v973, v965),
            visualMode: v977,
            running: v978,
            accentColor: text44,
            accentSoft: gn2,
            targetTemperature: supportsTargetTemperature ? v969 : null,
          }));
        const currentTemperature2 = normalizeClimateCapabilities2(v973).currentTemperature;
        element370.textContent =
          currentTemperature2 !== null ? "当前温度 " + currentTemperature2 + "°C" : "当前温度 --";
        const v979 = (arg595) =>
          arg595 === "set_hvac_mode"
            ? v973?.state
            : arg595 === "set_fan_mode"
              ? v973?.attributes?.fan_mode
              : arg595 === "set_swing_mode"
                ? v973?.attributes?.swing_mode
                : arg595 === "set_swing_horizontal_mode"
                  ? v973?.attributes?.swing_horizontal_mode
                  : arg595 === "set_preset_mode"
                    ? v973?.attributes?.preset_mode
                    : arg595 === "set_operation_mode"
                      ? v973?.attributes?.operation_mode
                      : null;
        for (const element372 of element360.querySelectorAll("button[data-climate-service]")) {
          const climateService = element372.dataset.climateService,
            v980 = v979(climateService);
          element372.classList.toggle(
            "active",
            element372.dataset.climateValue === String(v980 ?? ""),
          );
        }
        for (const element373 of element360.querySelectorAll(
          ".hb-climate-select[data-climate-service]",
        )) {
          const v981 = String(v979(element373.dataset.climateService) ?? "");
          element373.dataset.currentValue = v981;
          const v982 = Array.from(element373.querySelectorAll('[role="option"]')).find(
              (arg596) => arg596.dataset.value === v981,
            ),
            selector26 = element373.querySelector(".hb-climate-select-trigger > span");
          (selector26 &&
            ((selector26.textContent = v982?.textContent || v981 || "请选择"),
            (selector26.title = selector26.textContent)),
            element373.querySelectorAll('[role="option"]').forEach((arg597) => {
              const v983 = arg597.dataset.value === v981;
              (arg597.classList.toggle("active", v983),
                arg597.setAttribute("aria-selected", String(v983)));
            }));
        }
      },
      v984 = (v985 = false) => {
        element369.innerHTML = supportsTargetTemperature ? v969 + "<small>°C</small>" : "--";
        const v986 =
            ((v969 - minimumTemperature) /
              Math.max(temperatureStep, maximumTemperature - minimumTemperature)) *
            75,
          max82 = Math.max(0, Math.min(75, v986));
        (element363.style.setProperty("--hb-climate-temperature-progress", max82 + "%"),
          element363.style.setProperty(
            "--hb-climate-thumb-angle",
            225 + (max82 / 75) * 270 + "deg",
          ),
          element366.setAttribute("aria-valuemin", String(minimumTemperature)),
          element366.setAttribute("aria-valuemax", String(maximumTemperature)),
          element366.setAttribute("aria-valuenow", String(v969)),
          element366.setAttribute("aria-valuetext", v969 + "°C"));
        const max83 = Math.max(0.001, temperatureStep / 2);
        ((element362.disabled = !supportsTargetTemperature || v969 <= minimumTemperature + max83),
          (element371.disabled = !supportsTargetTemperature || v969 >= maximumTemperature - max83),
          (element362.title = "最低 " + minimumTemperature + "°C"),
          (element371.title = "最高 " + maximumTemperature + "°C"),
          v975(),
          v985 &&
            (element369.classList.remove("is-changing"),
            window.requestAnimationFrame(() => element369.classList.add("is-changing"))));
      };
    let v987 = v969;
    const list34 = [];
    let value55 = null,
      v988 = v969,
      v989 = false,
      value56 = null;
    const v990 = (arg598, arg599) =>
        arg598 !== null && arg599 !== null && Math.abs(arg598 - arg599) < 1e-8,
      v991 = () => list34.at(-1) ?? value55,
      v992 = () => {
        const v993 = v991();
        v993 !== null && v971(v993);
      },
      v994 = async () => {
        if ((window.clearTimeout(value56), (value56 = null), v989 || !list34.length)) return;
        const shift = list34.shift();
        if (((value55 = shift), v990(shift, v987))) {
          ((value55 = null), v992(), list34.length && (value56 = window.setTimeout(v994, 220)));
          return;
        }
        v989 = true;
        try {
          (await this.callEntityService(
            v967 === "climate" ? "climate" : v967,
            "set_temperature",
            arg591,
            {
              temperature: shift,
            },
          ),
            (v987 = shift),
            v967 !== "water_heater" && v962?.(true));
        } catch (v995) {
          ((list34.length = 0),
            v970(),
            (v988 = v987),
            (v969 = v987),
            v984(true),
            this.options.onError?.(v995));
        } finally {
          ((v989 = false),
            (value55 = null),
            v992(),
            list34.length && (value56 = window.setTimeout(v994, 220)));
        }
      },
      v996 = ({ preserveIntermediateSteps: v997 = true } = {}) => {
        const v998 = v969;
        v988 = v998;
        const at = list34.at(-1) ?? value55 ?? v987;
        if (v990(v998, at)) {
          v992();
          return;
        }
        if (v997 && v968) {
          const at2 = list34.at(-2) ?? value55 ?? v987;
          list34.length && v990(v998, at2) ? list34.pop() : list34.push(v998);
        } else ((list34.length = 0), list34.push(v998));
        (v992(), v989 || (window.clearTimeout(value56), (value56 = window.setTimeout(v994, 160))));
      },
      v999 = (arg600) => {
        if (!v961 || !supportsTargetTemperature) return;
        const v1000 = v969,
          num62 = String(temperatureStep).split(".")[1]?.length || 0;
        ((v969 = Number(
          Math.max(
            minimumTemperature,
            Math.min(maximumTemperature, v969 + arg600 * temperatureStep),
          ).toFixed(num62),
        )),
          v969 !== v1000 && (v984(true), v996()));
      },
      v1001 = (arg601) => {
        const boundingClientRect13 = element363.getBoundingClientRect(),
          v1002 = boundingClientRect13.left + boundingClientRect13.width / 2,
          v1003 = boundingClientRect13.top + boundingClientRect13.height / 2,
          v1004 = arg601.clientX - v1002,
          v1005 = arg601.clientY - v1003,
          v1006 = ((Math.atan2(v1004, -v1005) * 180) / Math.PI + 360) % 360;
        let v1007;
        v1006 >= 225
          ? (v1007 = v1006)
          : v1006 <= 135
            ? (v1007 = v1006 + 360)
            : (v1007 = v1006 <= 180 ? 495 : 225);
        const max84 = Math.max(0, Math.min(1, (v1007 - 225) / 270)),
          num63 = String(temperatureStep).split(".")[1]?.length || 0;
        return Number(
          (
            minimumTemperature +
            Math.round(((maximumTemperature - minimumTemperature) * max84) / temperatureStep) *
              temperatureStep
          ).toFixed(num63),
        );
      };
    let value57 = null;
    (element363.addEventListener("pointerdown", (arg602) => {
      if (!v961 || !supportsTargetTemperature) return;
      const boundingClientRect14 = element363.getBoundingClientRect(),
        v1008 = Math.min(boundingClientRect14.width, boundingClientRect14.height) / 2,
        hypot4 = Math.hypot(
          arg602.clientX - (boundingClientRect14.left + boundingClientRect14.width / 2),
          arg602.clientY - (boundingClientRect14.top + boundingClientRect14.height / 2),
        );
      (arg602.target !== element366 && Math.abs(hypot4 - v1008) > 34) ||
        (arg602.preventDefault(),
        (value57 = {
          pointerId: arg602.pointerId,
          previous: v969,
        }),
        element363.setPointerCapture(arg602.pointerId),
        element363.classList.add("is-dragging"),
        (v969 = v1001(arg602)),
        v984());
    }),
      element363.addEventListener("pointermove", (arg603) => {
        !value57 || arg603.pointerId !== value57.pointerId || ((v969 = v1001(arg603)), v984());
      }));
    const v1009 = (arg604) => {
      if (!value57 || arg604.pointerId !== value57.pointerId) return;
      const previous = value57.previous;
      ((value57 = null),
        element363.classList.remove("is-dragging"),
        element363.hasPointerCapture(arg604.pointerId) &&
          element363.releasePointerCapture(arg604.pointerId),
        v984(true),
        v969 !== previous &&
          v996({
            preserveIntermediateSteps: false,
          }));
    };
    (element363.addEventListener("pointerup", v1009),
      element363.addEventListener("pointercancel", v1009),
      (element366.disabled = !supportsTargetTemperature),
      element362.addEventListener("click", () => v999(-1)),
      element371.addEventListener("click", () => v999(1)),
      v984(),
      element361.append(element362, element363, element371),
      supportsTargetTemperature && element360.append(element361));
    const element374 = v965 === "water-heater" ? document.createElement("section") : null;
    element374 &&
      ((element374.className = "hb-water-heater-control-panel"),
      (element374.dataset.controlSource = "primary-entity"),
      element360.append(element374),
      (element360.waterHeaterControlPanel = element374));
    const v1010 = ({
        label: v1011,
        values: v1012,
        current: v1013,
        service: v1014,
        dataKey: v1015,
        labels: v1016 = {},
        icons: v1017 = {},
        className: v1018 = "",
        domain: v1019 = "climate",
        presentation: v1020 = "auto",
      }) => {
        const list35 = [
          ...new Set(
            (Array.isArray(v1012) ? v1012 : [])
              .map((arg605) => String(arg605 ?? "").trim())
              .filter(Boolean),
          ),
        ];
        if (!list35.length) return;
        const v1021 = v1020 === "auto" ? climateOptionPresentation2(list35, v1016) : v1020,
          element375 = document.createElement("div");
        ((element375.className = ("hb-climate-details-group " + v1018).trim()),
          element374 && (element375.dataset.controlSource = "primary-entity"));
        const element376 = document.createElement("strong");
        if (((element376.textContent = v1011), v1021 === "select")) {
          element375.classList.add("select-options");
          const element377 = document.createElement("div");
          ((element377.className = "hb-climate-select"),
            (element377.dataset.climateService = v1014),
            (element377.dataset.currentValue = String(v1013 ?? "")));
          const element378 = document.createElement("button");
          ((element378.type = "button"),
            (element378.className = "hb-climate-select-trigger"),
            element378.setAttribute("aria-label", v1011),
            element378.setAttribute("aria-haspopup", "listbox"),
            element378.setAttribute("aria-expanded", "false"),
            (element378.disabled = !v961));
          const element379 = document.createElement("span"),
            element380 = document.createElement("i");
          (element380.setAttribute("aria-hidden", "true"),
            element378.append(element379, element380));
          const element381 = document.createElement("div");
          ((element381.className = "hb-climate-select-menu"),
            (element381.id = "hb-climate-select-" + randomUuid2()),
            element381.setAttribute("role", "listbox"),
            element381.setAttribute("aria-label", v1011),
            element381.setAttribute("popover", "auto"),
            (element381.hidden = true),
            element378.setAttribute("aria-controls", element381.id));
          let v1022 = false;
          const v1023 = () => {
              try {
                return element381.matches(":popover-open");
              } catch {
                return element381.dataset.open === "true";
              }
            },
            v1024 = (arg606) => {
              const v1025 = String(arg606 ?? "");
              element377.dataset.currentValue = v1025;
              const v1026 = Array.from(element381.querySelectorAll('[role="option"]')).find(
                (arg607) => arg607.dataset.value === v1025,
              );
              ((element379.textContent = v1026?.textContent || v1025 || "请选择"),
                (element379.title = element379.textContent),
                element381.querySelectorAll('[role="option"]').forEach((arg608) => {
                  const v1027 = arg608.dataset.value === v1025;
                  (arg608.classList.toggle("active", v1027),
                    arg608.setAttribute("aria-selected", String(v1027)));
                }));
            },
            v1028 = () => {
              if (!v1023() && element381.hidden) return;
              const boundingClientRect15 = element378.getBoundingClientRect(),
                innerWidth2 = window.innerWidth,
                innerHeight2 = window.innerHeight,
                min19 = Math.min(
                  Math.max(boundingClientRect15.width, 190),
                  Math.max(190, innerWidth2 - 20),
                );
              ((element381.style.width = min19 + "px"),
                (element381.style.maxHeight =
                  Math.min(360, Math.max(120, innerHeight2 - 20)) + "px"));
              const min20 = Math.min(element381.scrollHeight || 0, 360),
                v1029 = innerHeight2 - boundingClientRect15.bottom - 10,
                v1030 = boundingClientRect15.top - 10,
                max85 =
                  v1029 < Math.min(min20, 180) && v1030 > v1029
                    ? Math.max(10, boundingClientRect15.top - min20 - 5)
                    : Math.min(innerHeight2 - min20 - 10, boundingClientRect15.bottom + 5);
              ((element381.style.left =
                Math.max(10, Math.min(boundingClientRect15.left, innerWidth2 - min19 - 10)) + "px"),
                (element381.style.top = Math.max(10, max85) + "px"));
            },
            v1031 = () => {
              (v1023() && typeof element381.hidePopover == "function" && element381.hidePopover(),
                (element381.hidden = true),
                (element381.dataset.open = "false"),
                element378.setAttribute("aria-expanded", "false"));
            },
            v1032 = (v1033 = false) => {
              element378.disabled ||
                v1022 ||
                ((element381.hidden = false),
                typeof element381.showPopover == "function"
                  ? element381.showPopover()
                  : (element381.dataset.open = "true"),
                element378.setAttribute("aria-expanded", "true"),
                v1028(),
                v1033 &&
                  (
                    element381.querySelector('[aria-selected="true"]') ||
                    element381.querySelector('[role="option"]')
                  )?.focus());
            },
            v1034 = async (arg609) => {
              if (!v961 || v1022) return;
              const currentValue = element377.dataset.currentValue;
              ((v1022 = true), (element378.disabled = true), v1031(), v1024(arg609));
              try {
                await this.callEntityService(v1019, v1014, arg591, {
                  [v1015]: arg609,
                });
                const options77 = {
                  ...(v973?.attributes || {}),
                  [v1015]: arg609,
                };
                if (v1014 === "set_hvac_mode")
                  ((v973 = {
                    ...(v973 || {}),
                    state: arg609,
                    attributes: {
                      ...options77,
                      hvac_action:
                        arg609 === "cool"
                          ? "cooling"
                          : arg609 === "heat"
                            ? "heating"
                            : arg609 === "off"
                              ? "off"
                              : arg609,
                    },
                  }),
                    v962?.(arg609 !== "off"));
                else {
                  if (v1014 === "set_preset_mode") {
                    const includes9 =
                        v965 === "bath-heater" &&
                        ["idle", "standby", "待机", "关闭"].includes(
                          String(arg609).trim().toLowerCase(),
                        ),
                      text45 =
                        element360.dataset.lastClimateMode ||
                        v966.hvacModes.find((arg610) => arg610 !== "off") ||
                        (v967 === "fan" ? "on" : "auto"),
                      options78 = {
                        ...(v973 || {}),
                        state: includes9
                          ? "off"
                          : climateIsPoweredOn2(v973, v965)
                            ? v973?.state
                            : text45,
                        attributes: {
                          ...options77,
                          preset_mode: arg609,
                        },
                      },
                      v1035 = climateEffectMode2(options78, v965);
                    ((options78.attributes.hvac_action = includes9
                      ? "idle"
                      : v1035 === "cool"
                        ? "cooling"
                        : v1035 === "heat"
                          ? "heating"
                          : "fan"),
                      (v973 = options78),
                      v962?.(!includes9));
                  } else
                    v1014 === "set_operation_mode"
                      ? ((v973 = {
                          ...(v973 || {}),
                          state: arg609 === "off" ? "off" : "on",
                          attributes: {
                            ...options77,
                            operation_mode: arg609,
                          },
                        }),
                        v962?.(arg609 !== "off"))
                      : (v973 = {
                          ...(v973 || {}),
                          attributes: options77,
                        });
                }
                v975();
              } catch (v1036) {
                (v1024(currentValue), this.options.onError?.(v1036));
              } finally {
                ((v1022 = false), (element378.disabled = !v961));
              }
            };
          for (const v1037 of list35) {
            const element382 = document.createElement("button");
            ((element382.type = "button"),
              (element382.className = "hb-climate-select-option"),
              element382.setAttribute("role", "option"),
              (element382.dataset.value = v1037),
              (element382.textContent = v1016[v1037] || v1037),
              (element382.title = element382.textContent),
              element382.addEventListener("click", () => v1034(v1037)),
              element381.append(element382));
          }
          (v1024(String(v1013 ?? "")),
            element378.addEventListener("click", () => {
              v1023() || element381.dataset.open === "true" ? v1031() : v1032();
            }),
            element378.addEventListener("keydown", (arg611) => {
              ["ArrowDown", "ArrowUp", "Enter", " "].includes(arg611.key) &&
                (arg611.preventDefault(), v1032(true));
            }),
            element381.addEventListener("keydown", (arg612) => {
              const list36 = [...element381.querySelectorAll('[role="option"]')],
                indexOf2 = list36.indexOf(document.activeElement);
              if (arg612.key === "Escape") (arg612.preventDefault(), v1031(), element378.focus());
              else {
                if (arg612.key === "ArrowDown" || arg612.key === "ArrowUp") {
                  arg612.preventDefault();
                  const num64 = arg612.key === "ArrowDown" ? 1 : -1;
                  list36[(indexOf2 + num64 + list36.length) % list36.length]?.focus();
                } else
                  (arg612.key === "Enter" || arg612.key === " ") &&
                    (arg612.preventDefault(), document.activeElement?.click());
              }
            }),
            element381.addEventListener("toggle", (arg613) => {
              const v1038 = arg613.newState === "open";
              ((element381.hidden = !v1038),
                (element381.dataset.open = String(v1038)),
                element378.setAttribute("aria-expanded", String(v1038)),
                v1038 && v1028());
            }),
            element377.append(element378, element381),
            element375.append(element376, element377),
            (element374 || element360).append(element375));
          return;
        }
        const element383 = document.createElement("div");
        element383.className = "hb-climate-details-options";
        for (const v1039 of list35) {
          const element384 = document.createElement("button");
          ((element384.type = "button"),
            (element384.dataset.climateService = v1014),
            (element384.dataset.climateValue = v1039));
          const element385 = document.createElement("i");
          (element385.setAttribute("aria-hidden", "true"),
            (element385.textContent = v1017[v1039] || ""));
          const element386 = document.createElement("span");
          ((element386.textContent = v1016[v1039] || v1039),
            element384.append(element385, element386),
            element384.classList.toggle("active", v1039 === v1013),
            element384.addEventListener("click", async () => {
              if (!v961) return;
              const includes10 =
                v965 === "bath-heater" &&
                v1014 === "set_preset_mode" &&
                ["idle", "standby", "待机", "关闭"].includes(String(v1039).trim().toLowerCase());
              element383.querySelectorAll("button").forEach((arg614) => {
                arg614.disabled = true;
              });
              try {
                if (
                  (await this.callEntityService(v1019, v1014, arg591, {
                    [v1015]: v1039,
                  }),
                  includes10)
                ) {
                  const v1040 = climatePowerCommand2(arg591, v973, false, "bath-heater");
                  await this.callEntityService(v1040.domain, v1040.service, arg591, v1040.data);
                }
                if (
                  (element383
                    .querySelectorAll("button")
                    .forEach((arg615) => arg615.classList.toggle("active", arg615 === element384)),
                  v1014 === "set_hvac_mode")
                ) {
                  const text46 =
                    v1039 === "cool"
                      ? "cooling"
                      : v1039 === "heat"
                        ? "heating"
                        : v1039 === "off"
                          ? "off"
                          : v1039;
                  ((v973 = {
                    ...(v973 || {}),
                    state: v1039,
                    attributes: {
                      ...(v973?.attributes || {}),
                      hvac_action: text46,
                    },
                  }),
                    v975(),
                    v962?.(v1039 !== "off"));
                } else {
                  if (v1014 === "set_preset_mode") {
                    const v1041 = includes10,
                      text47 =
                        element360.dataset.lastClimateMode ||
                        v966.hvacModes.find((arg616) => arg616 !== "off") ||
                        (v967 === "fan" ? "on" : "auto"),
                      options79 = {
                        ...(v973 || {}),
                        state: v1041
                          ? "off"
                          : climateIsPoweredOn2(v973, v965)
                            ? v973?.state
                            : text47,
                        attributes: {
                          ...(v973?.attributes || {}),
                          preset_mode: v1039,
                        },
                      },
                      v1042 = climateEffectMode2(options79, v965);
                    ((options79.attributes.hvac_action = v1041
                      ? "idle"
                      : v1042 === "cool"
                        ? "cooling"
                        : v1042 === "heat"
                          ? "heating"
                          : "fan"),
                      (v973 = options79),
                      v975(),
                      v962?.(!v1041));
                  } else
                    v1014 === "set_operation_mode" &&
                      ((v973 = {
                        ...(v973 || {}),
                        state: v1039 === "off" ? "off" : "on",
                        attributes: {
                          ...(v973?.attributes || {}),
                          operation_mode: v1039,
                        },
                      }),
                      v975(),
                      v962?.(v1039 !== "off"));
                }
              } catch (v1043) {
                this.options.onError?.(v1043);
              } finally {
                element383.querySelectorAll("button").forEach((arg617) => {
                  arg617.disabled = false;
                });
              }
            }),
            element383.append(element384));
        }
        (element375.append(element376, element383), (element374 || element360).append(element375));
      },
      v1044 = climateOperationModeValues2(arg592, v965),
      entries2 = Object.fromEntries(
        v1044.map((arg618) => [arg618, climateModeLabel2(arg618, v965, options76)]),
      ),
      entries3 = Object.fromEntries(
        v1044.map((arg619) => [arg619, climateModeIcon2(arg619, v965)]),
      );
    v1010({
      label: "运行模式",
      values: v1044,
      current: String(
        v965 === "water-heater" ? attributes2.operation_mode || "" : arg592?.state || "",
      ),
      service: v965 === "water-heater" ? "set_operation_mode" : "set_hvac_mode",
      dataKey: v965 === "water-heater" ? "operation_mode" : "hvac_mode",
      labels: entries2,
      icons: entries3,
      className: "mode-options",
      domain: v965 === "water-heater" ? "water_heater" : "climate",
      presentation: climateOptionPresentation2(v1044, entries2),
    });
    const fanModes = v967 === "climate" ? v966.fanModes : [];
    if (fanModes.length) {
      const options80 = {
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
        v1045 = fanModes.find((arg620) => ["auto", "自动"].includes(String(arg620).toLowerCase())),
        filter12 = fanModes.filter((arg621) => arg621 !== v1045),
        element387 = document.createElement("section");
      element387.className = "hb-climate-fan-slider";
      const element388 = document.createElement("span");
      element388.className = "hb-climate-fan-slider-heading";
      const element389 = document.createElement("i");
      (element389.setAttribute("aria-hidden", "true"), (element389.textContent = "✾"));
      const element390 = document.createElement("strong");
      element390.textContent = "风速";
      const element391 = document.createElement("output"),
        max86 = Math.max(0, filter12.indexOf(attributes2.fan_mode));
      let v1046 = max86,
        v1047 = !!(v1045 && attributes2.fan_mode === v1045),
        fan_mode = attributes2.fan_mode;
      const element392 = document.createElement("input");
      ((element392.type = "range"),
        (element392.min = "0"),
        (element392.max = String(Math.max(0, filter12.length - 1))),
        (element392.step = "1"),
        (element392.value = String(max86)),
        (element392.disabled = filter12.length === 0));
      const v1048 = (arg622) =>
          options80[String(filter12[arg622]).toLowerCase()] || filter12[arg622] || "--",
        element393 = document.createElement("button");
      ((element393.type = "button"),
        (element393.className = "hb-climate-fan-auto"),
        (element393.textContent = "自动"),
        (element393.hidden = !v1045),
        element393.classList.toggle("active", v1047));
      const v1049 = () => {
        const v1050 = Number(element392.value),
          num65 = filter12.length > 1 ? (v1050 / (filter12.length - 1)) * 100 : 100;
        ((element391.textContent = v1047 ? "自动" : v1048(v1050)),
          element392.style.setProperty("--hb-climate-fan-progress", num65 + "%"));
      };
      (element388.append(element389, element390, element391, element393),
        element392.addEventListener("input", () => {
          ((v1047 = false), element393.classList.remove("active"), v1049());
        }),
        element392.addEventListener("change", async () => {
          if (!v961 || !filter12.length) return;
          const v1051 = Number(element392.value),
            v1052 = filter12[v1051];
          ((element392.disabled = true), (element393.disabled = true));
          try {
            (await this.callEntityService("climate", "set_fan_mode", arg591, {
              fan_mode: v1052,
            }),
              (v1046 = v1051),
              (fan_mode = v1052),
              (v1047 = false));
          } catch (v1053) {
            ((v1047 = !!(v1045 && fan_mode === v1045)),
              v1047 || (element392.value = String(v1046)),
              element393.classList.toggle("active", v1047),
              v1049(),
              this.options.onError?.(v1053));
          } finally {
            ((element392.disabled = false), (element393.disabled = false));
          }
        }),
        element393.addEventListener("click", async () => {
          if (!(!v961 || !v1045 || element393.disabled)) {
            ((element392.disabled = true), (element393.disabled = true));
            try {
              (await this.callEntityService("climate", "set_fan_mode", arg591, {
                fan_mode: v1045,
              }),
                (v1047 = true),
                (fan_mode = v1045),
                element393.classList.add("active"),
                v1049());
            } catch (v1054) {
              this.options.onError?.(v1054);
            } finally {
              ((element392.disabled = filter12.length === 0), (element393.disabled = false));
            }
          }
        }));
      const element394 = document.createElement("span");
      element394.className = "hb-climate-fan-slider-legend";
      const element395 = document.createElement("small");
      element395.textContent = v1048(0);
      const element396 = document.createElement("small");
      ((element396.textContent = v1048(filter12.length - 1)),
        element394.append(element395, element396),
        v1049(),
        element387.append(element388, element392, element394),
        element360.append(element387));
    }
    let value58 = null;
    if (v967 === "fan" && v966.supportsFanPercentage) {
      const element397 = document.createElement("section");
      element397.className = "hb-climate-fan-slider";
      const element398 = document.createElement("span");
      element398.className = "hb-climate-fan-slider-heading";
      const element399 = document.createElement("i");
      (element399.setAttribute("aria-hidden", "true"), (element399.textContent = "✾"));
      const element400 = document.createElement("strong");
      element400.textContent = "风速";
      const element401 = document.createElement("output");
      let max87 = Math.max(0, Math.min(100, v966.fanPercentage));
      const element402 = document.createElement("input");
      ((element402.type = "range"),
        (element402.min = "0"),
        (element402.max = "100"),
        (element402.step = String(v966.fanPercentageStep)),
        (element402.value = String(max87)));
      const v1055 = () => {
        const max88 = Math.max(0, Math.min(100, Number(element402.value) || 0));
        ((element401.textContent = Math.round(max88) + "%"),
          element402.style.setProperty("--hb-climate-fan-progress", max88 + "%"));
      };
      ((value58 = (arg623) => {
        const fanPercentage = normalizeClimateCapabilities2(arg623).fanPercentage;
        fanPercentage !== null &&
          ((max87 = Math.max(0, Math.min(100, fanPercentage))),
          (element402.value = String(max87)),
          v1055());
      }),
        element402.addEventListener("input", v1055),
        element402.addEventListener("change", async () => {
          if (!v961 || element402.disabled) return;
          const max89 = Math.max(0, Math.min(100, Number(element402.value) || 0));
          element402.disabled = true;
          try {
            (await this.callEntityService("fan", "set_percentage", arg591, {
              percentage: max89,
            }),
              (max87 = max89),
              (v973 = {
                ...(v973 || {}),
                state: max89 > 0 ? "on" : "off",
                attributes: {
                  ...(v973?.attributes || {}),
                  percentage: max89,
                },
              }),
              v975(),
              v962?.(max89 > 0));
          } catch (v1056) {
            ((element402.value = String(max87)), v1055(), this.options.onError?.(v1056));
          } finally {
            element402.disabled = false;
          }
        }));
      const element403 = document.createElement("span");
      element403.className = "hb-climate-fan-slider-legend";
      const element404 = document.createElement("small");
      element404.textContent = "关闭";
      const element405 = document.createElement("small");
      ((element405.textContent = "最大"),
        element403.append(element404, element405),
        element398.append(element399, element400, element401),
        v1055(),
        element397.append(element398, element402, element403),
        element360.append(element397));
    }
    const entries4 = Object.fromEntries(
      v966.swingModes.map((arg624) => [
        arg624,
        climateSwingModeLabel2(arg624, "vertical", options76),
      ]),
    );
    v1010({
      label: v966.horizontalSwingModes.length ? "纵向摆风" : "摆风",
      values: v966.swingModes,
      current: attributes2.swing_mode,
      service: "set_swing_mode",
      dataKey: "swing_mode",
      labels: entries4,
      icons: {
        off: "—",
        vertical: "↕",
        horizontal: "↔",
        both: "✣",
      },
      className: "compact-options",
      presentation: climateOptionPresentation2(v966.swingModes, entries4, {
        inlineIcon: true,
      }),
    });
    const entries5 = Object.fromEntries(
      v966.horizontalSwingModes.map((arg625) => [
        arg625,
        climateSwingModeLabel2(arg625, "horizontal", options76),
      ]),
    );
    v1010({
      label: "水平摆风",
      values: v966.horizontalSwingModes,
      current: attributes2.swing_horizontal_mode,
      service: "set_swing_horizontal_mode",
      dataKey: "swing_horizontal_mode",
      labels: entries5,
      className: "compact-options",
      presentation: climateOptionPresentation2(v966.horizontalSwingModes, entries5, {
        inlineIcon: true,
      }),
    });
    const entries6 = Object.fromEntries(
        v966.presetModes.map((arg626) => [arg626, climateModeLabel2(arg626, v965, options76)]),
      ),
      entries7 = Object.fromEntries(
        v966.presetModes.map((arg627) => [arg627, climateModeIcon2(arg627, v965)]),
      );
    v1010({
      label: "预设模式",
      values: v966.presetModes,
      current: attributes2.preset_mode,
      service: "set_preset_mode",
      dataKey: "preset_mode",
      labels: entries6,
      icons: entries7,
      className: "compact-options",
      domain: v967 === "fan" ? "fan" : "climate",
      presentation: climateOptionPresentation2(v966.presetModes, entries6, {
        inlineIcon: true,
      }),
    });
    let value59 = null;
    if (!element360.childElementCount) {
      const element406 = document.createElement("section");
      element406.className = "hb-climate-details-loading";
      const element407 = document.createElement("i");
      element407.setAttribute("aria-hidden", "true");
      const element408 = document.createElement("strong"),
        element409 = document.createElement("span");
      ((value59 = (arg628) => {
        const lowerCase8 = String(arg628?.state || "")
            .trim()
            .toLowerCase(),
          v1057 = !arg628 || !lowerCase8 || lowerCase8 === "unknown",
          v1058 = lowerCase8 === "unavailable";
        (element406.classList.toggle("is-loading", v1057),
          element406.classList.toggle("is-unavailable", v1058),
          (element408.textContent = v1057 ? "—" : v1058 ? "设备当前不可用" : "暂无可用控制数据"),
          (element409.textContent =
            v1057 || v1058 ? "" : "请检查该实体在 Home Assistant 中提供的控制能力"));
      }),
        value59(arg592),
        element406.append(element407, element408, element409),
        element360.append(element406));
    }
    return (
      (element360.syncClimateGrid = () => {
        const list37 = Array.from(element360.children),
          v1059 = list37.find((arg629) => arg629.classList.contains("hb-climate-thermostat"));
        if (!v1059) return;
        const v1060 = list37.find((arg630) => arg630.classList.contains("is-water-heater")),
          v1061 = list37.filter((arg631) => arg631 !== v1059 && arg631 !== v1060).length;
        ((v1059.style.gridRow = "1 / span " + Math.max(1, v1061)),
          v1060 && (v1060.style.gridRow = "1 / span " + Math.max(1, v1061)));
      }),
      element360.syncClimateGrid(),
      (element360.syncClimateState = (arg632) => {
        if (!arg632) return;
        ((v973 = arg632), value59?.(arg632), value58?.(arg632));
        const targetTemperature3 = normalizeClimateCapabilities2(arg632).targetTemperature,
          v1062 = reconcileClimateTargetTemperature2(
            v988,
            targetTemperature3,
            value52,
            temperatureStep,
          );
        ((value52 === null || v1062.confirmed) && (v988 = v1062.temperature),
          (v969 = v988),
          targetTemperature3 !== null &&
            (value52 === null || v1062.confirmed) &&
            (v987 = targetTemperature3),
          value52 !== null && v1062.confirmed && (v968 ? v972() : v970()),
          v984());
      }),
      (element360.cleanupClimateDetails = () => {
        (window.clearTimeout(value56),
          (value56 = null),
          (list34.length = 0),
          (value55 = null),
          v970());
      }),
      v975(),
      element360
    );
  }
  ["createWaterHeaterExtensionControls"](
    arg633,
    { component: v1063 = null, interactive: v1064 = true, excludedEntityIds: v1065 = [] } = {},
  ) {
    const value60 = v1063
        ? relatedPopupContext2(v1063, this.entityMetadata, this.deviceMetadata, this.states)
        : null,
      value61 = v1063
        ? selectedRelatedEntities2(v1063, this.entityMetadata, this.deviceMetadata, this.states)
        : null,
      set13 = new Set(v1065),
      filter13 = (
        value61 === null ? relatedWaterHeaterEntities2(this.entityMetadata, arg633) : value61
      ).filter((arg634) => !set13.has(arg634.entityId)),
      v1066 = value60?.primary || this.entityMetadata.get(arg633);
    if (!filter13.length) return null;
    const element410 = document.createElement("section");
    ((element410.className =
      "hb-related-entity-extensions hb-water-heater-extensions" +
      (value60?.deviceType ? " is-" + value60.deviceType : "")),
      (element410.dataset.controlSource = value61 === null ? "automatic-device" : "user-selected"));
    const map30 = new Map(),
      v1067 = (arg635) => {
        const v1068 = this.states.get(arg635);
        return (
          v1068?.newState ||
          v1068 || {
            entityId: arg635,
            state: "unknown",
            attributes: {},
          }
        );
      },
      v1069 = (arg636, arg637) => {
        (map30.has(arg636) || map30.set(arg636, []), map30.get(arg636).push(arg637));
      },
      element411 = document.createElement("div");
    element411.className = "hb-water-heater-extension-grid";
    for (const v1070 of filter13) {
      const entityId2 = v1070.entityId,
        v1071 = String(v1070.domain || ""),
        v1072 = value60
          ? relatedEntityLabel2(value60, v1070)
          : waterHeaterRelatedEntityLabel2(v1066, v1070);
      if (["light", "switch", "input_boolean", "fan"].includes(v1071)) {
        const element412 = document.createElement("button");
        ((element412.type = "button"), (element412.className = "hb-water-heater-extension-toggle"));
        const element413 = document.createElement("i");
        element413.setAttribute("aria-hidden", "true");
        const element414 = document.createElement("span"),
          element415 = document.createElement("strong");
        element415.textContent = v1072;
        const element416 = document.createElement("small");
        (element414.append(element415, element416), element412.append(element413, element414));
        let v1073 = v1067(entityId2),
          v1074 = false;
        const v1075 = (v1076 = v1073) => {
          v1073 = v1076 || v1073;
          const lowerCase9 = String(v1073?.state || "").toLowerCase(),
            includes11 = ["unknown", "unavailable"].includes(lowerCase9),
            v1077 = lowerCase9 === "on";
          (element412.classList.toggle("is-on", v1077 && !includes11),
            element412.classList.toggle("is-unavailable", includes11),
            (element412.disabled = !v1064 || v1074 || includes11),
            element412.setAttribute("aria-pressed", String(v1077)),
            element412.setAttribute("aria-busy", String(v1074)),
            (element416.textContent = includes11 ? "不可用" : v1077 ? "已开启" : "已关闭"));
        };
        (element412.addEventListener("click", async () => {
          if (!v1064 || v1074 || element412.classList.contains("is-unavailable")) return;
          const v1078 = v1073,
            v1079 = String(v1073?.state || "").toLowerCase() !== "on";
          ((v1074 = true),
            v1075({
              ...(v1073 || {}),
              state: v1079 ? "on" : "off",
            }));
          try {
            await this.callEntityService("homeassistant", "toggle", entityId2);
          } catch (v1080) {
            (v1075(v1078), this.options.onError?.(v1080));
          } finally {
            ((v1074 = false), v1075(v1073));
          }
        }),
          v1075(v1073),
          v1069(entityId2, v1075),
          element411.append(element412));
      } else {
        if (["select", "input_select"].includes(v1071)) {
          const element417 = document.createElement("div");
          element417.className = "hb-water-heater-extension-select";
          const element418 = document.createElement("span");
          ((element418.textContent = v1072), (element418.title = v1072));
          const element419 = document.createElement("button");
          ((element419.type = "button"),
            (element419.className = "hb-related-select-trigger"),
            element419.setAttribute("aria-label", v1072),
            element419.setAttribute("aria-haspopup", "listbox"),
            element419.setAttribute("aria-expanded", "false"));
          const element420 = document.createElement("span"),
            element421 = document.createElement("i");
          (element421.setAttribute("aria-hidden", "true"),
            element419.append(element420, element421));
          const element422 = document.createElement("div");
          ((element422.className = "hb-related-select-menu"),
            (element422.id =
              "hb-related-select-" +
              String(this.renderNamespace || "runtime").replace(/[^a-z0-9_-]/gi, "-") +
              "-" +
              entityId2.replace(/[^a-z0-9_-]/gi, "-")),
            element422.setAttribute("role", "listbox"),
            element422.setAttribute("popover", "auto"),
            (element422.hidden = true),
            element419.setAttribute("aria-controls", element422.id));
          let v1081 = v1067(entityId2),
            v1082 = String(v1081?.state || ""),
            v1083 = false,
            text48 = "",
            list38 = [];
          const options81 = {
              entityId: entityId2,
              entityMetadata: this.entityMetadata,
              entityTranslations: this.entityTranslations,
              attributes: ["options", "option"],
            },
            v1084 = (arg638) =>
              value60?.deviceType === "bath-heater"
                ? climateModeLabel2(arg638, "bath-heater", options81)
                : String(arg638 || ""),
            v1085 = () => {
              try {
                return element422.matches(":popover-open");
              } catch {
                return element422.dataset.open === "true";
              }
            },
            v1086 = () => {
              if (!v1085() && element422.hidden) return;
              const boundingClientRect16 = element419.getBoundingClientRect(),
                innerWidth3 = window.innerWidth,
                innerHeight3 = window.innerHeight,
                min21 = Math.min(
                  Math.max(boundingClientRect16.width, 132),
                  Math.max(132, innerWidth3 - 16),
                );
              ((element422.style.width = min21 + "px"),
                (element422.style.maxHeight =
                  Math.min(216, Math.max(88, innerHeight3 - 16)) + "px"));
              const min22 = Math.min(element422.scrollHeight || 0, 216),
                v1087 = innerHeight3 - boundingClientRect16.bottom - 8,
                v1088 = boundingClientRect16.top - 8,
                max90 =
                  v1087 < Math.min(min22, 140) && v1088 > v1087
                    ? Math.max(8, boundingClientRect16.top - min22 - 4)
                    : Math.min(innerHeight3 - min22 - 8, boundingClientRect16.bottom + 4);
              ((element422.style.left =
                Math.max(8, Math.min(boundingClientRect16.left, innerWidth3 - min21 - 8)) + "px"),
                (element422.style.top = Math.max(8, max90) + "px"));
            },
            v1089 = () => {
              (v1085() && typeof element422.hidePopover == "function" && element422.hidePopover(),
                (element422.hidden = true),
                (element422.dataset.open = "false"),
                element419.setAttribute("aria-expanded", "false"));
            },
            v1090 = (v1091 = false) => {
              element419.disabled ||
                ((element422.hidden = false),
                typeof element422.showPopover == "function"
                  ? element422.showPopover()
                  : (element422.dataset.open = "true"),
                element419.setAttribute("aria-expanded", "true"),
                v1086(),
                v1091 &&
                  (
                    element422.querySelector('[aria-selected="true"]') ||
                    element422.querySelector('[role="option"]')
                  )?.focus());
            },
            v1092 = async (arg639) => {
              if (!v1064 || v1083 || !arg639) return;
              const v1093 = v1081;
              ((v1083 = true),
                v1089(),
                v1098({
                  ...(v1081 || {}),
                  state: arg639,
                  attributes: {
                    ...(v1081?.attributes || {}),
                    options: list38,
                  },
                }));
              try {
                const v1094 = relatedEntitySelectService2(v1071);
                if (!v1094) throw new Error("实体 " + entityId2 + " 不支持选项服务。");
                (await this.callEntityService(v1094.domain, v1094.service, entityId2, {
                  option: arg639,
                }),
                  (v1082 = arg639));
              } catch (v1095) {
                (v1098(v1093), this.options.onError?.(v1095));
              } finally {
                ((v1083 = false), v1098(v1081));
              }
            },
            v1096 = (arg640, arg641) => {
              element422.replaceChildren(
                ...arg640.map((arg642) => {
                  const element423 = document.createElement("button");
                  ((element423.type = "button"),
                    (element423.className = "hb-related-select-option"),
                    element423.setAttribute("role", "option"),
                    (element423.dataset.value = arg642),
                    (element423.textContent = v1084(arg642)),
                    (element423.title = element423.textContent));
                  const v1097 = arg642 === arg641;
                  return (
                    element423.classList.toggle("active", v1097),
                    element423.setAttribute("aria-selected", String(v1097)),
                    element423.addEventListener("click", () => v1092(arg642)),
                    element423
                  );
                }),
              );
            },
            v1098 = (v1099 = v1081) => {
              v1081 = v1099 || v1081;
              const v1100 = String(v1081?.state || ""),
                v1101 = relatedEntityOptions2(v1070, v1081);
              list38 = v1101;
              const stringify = JSON.stringify(v1101);
              if (stringify !== text48) ((text48 = stringify), v1096(v1101, v1100));
              else
                for (const element424 of element422.querySelectorAll('[role="option"]')) {
                  const v1102 = element424.dataset.value === v1100;
                  (element424.classList.toggle("active", v1102),
                    element424.setAttribute("aria-selected", String(v1102)));
                }
              (v1100 &&
                !["unknown", "unavailable"].includes(v1100.toLowerCase()) &&
                (v1082 = v1100),
                (element420.textContent = v1082
                  ? v1084(v1082)
                  : v1101.length
                    ? v1084(v1101[0])
                    : "无选项"),
                (element420.title = element420.textContent),
                (element419.disabled =
                  !v1064 || v1083 || !v1101.length || v1100.toLowerCase() === "unavailable"));
            };
          (element419.addEventListener("click", () => {
            v1085() || element422.dataset.open === "true" ? v1089() : v1090();
          }),
            element419.addEventListener("keydown", (arg643) => {
              ["ArrowDown", "ArrowUp", "Enter", " "].includes(arg643.key) &&
                (arg643.preventDefault(), v1090(true));
            }),
            element422.addEventListener("keydown", (arg644) => {
              const list39 = [...element422.querySelectorAll('[role="option"]')],
                indexOf3 = list39.indexOf(document.activeElement);
              if (arg644.key === "Escape") (arg644.preventDefault(), v1089(), element419.focus());
              else {
                if (arg644.key === "ArrowDown" || arg644.key === "ArrowUp") {
                  arg644.preventDefault();
                  const num66 = arg644.key === "ArrowDown" ? 1 : -1;
                  list39[(indexOf3 + num66 + list39.length) % list39.length]?.focus();
                } else
                  (arg644.key === "Enter" || arg644.key === " ") &&
                    (arg644.preventDefault(), document.activeElement?.click());
              }
            }),
            element422.addEventListener("toggle", (arg645) => {
              const v1103 = arg645.newState === "open";
              ((element422.hidden = !v1103),
                (element422.dataset.open = String(v1103)),
                element419.setAttribute("aria-expanded", String(v1103)),
                v1103 && v1086());
            }),
            element417.append(element418, element419, element422),
            v1098(v1081),
            v1069(entityId2, v1098),
            element411.append(element417));
        } else {
          if (["number", "input_number"].includes(v1071)) {
            const element425 = document.createElement("div");
            element425.className = "hb-water-heater-extension-number";
            const element426 = document.createElement("span");
            element426.textContent = v1072;
            const element427 = document.createElement("span"),
              element428 = document.createElement("button");
            ((element428.type = "button"), (element428.textContent = "−"));
            const element429 = document.createElement("output"),
              element430 = document.createElement("button");
            ((element430.type = "button"),
              (element430.textContent = "+"),
              element427.append(element428, element429, element430),
              element425.append(element426, element427));
            let v1104 = v1067(entityId2),
              v1105 = Number(v1104?.state),
              v1106 = false;
            const v1107 = () => {
                const options82 = v1104?.attributes || {},
                  v1108 = Number(options82.min),
                  v1109 = Number(options82.max),
                  max91 = Math.max(0.001, Number(options82.step) || 1);
                return {
                  minimum: Number.isFinite(v1108) ? v1108 : 0,
                  maximum: Number.isFinite(v1109) ? v1109 : 100,
                  step: max91,
                };
              },
              v1110 = (v1111 = v1104) => {
                v1104 = v1111 || v1104;
                const v1112 = Number(v1104?.state),
                  includes12 =
                    !Number.isFinite(v1112) ||
                    ["unknown", "unavailable"].includes(String(v1104?.state || "").toLowerCase());
                includes12 || (v1105 = v1112);
                const v1113 = String(v1104?.attributes?.unit_of_measurement || "");
                ((element429.textContent = includes12 ? "--" : "" + v1112 + v1113),
                  (element428.disabled = !v1064 || v1106 || includes12),
                  (element430.disabled = !v1064 || v1106 || includes12));
              },
              v1114 = async (arg646) => {
                if (!v1064 || v1106 || !Number.isFinite(v1105)) return;
                const { minimum: v1115, maximum: v1116, step: v1117 } = v1107(),
                  num67 = String(v1117).split(".")[1]?.length || 0,
                  v1118 = Number(
                    Math.max(v1115, Math.min(v1116, v1105 + arg646 * v1117)).toFixed(num67),
                  );
                if (v1118 === v1105) return;
                const v1119 = v1104;
                ((v1106 = true),
                  v1110({
                    ...(v1104 || {}),
                    state: String(v1118),
                  }));
                try {
                  (await this.callEntityService(v1071, "set_value", entityId2, {
                    value: v1118,
                  }),
                    (v1105 = v1118));
                } catch (v1120) {
                  (v1110(v1119), this.options.onError?.(v1120));
                } finally {
                  ((v1106 = false), v1110(v1104));
                }
              };
            (element428.addEventListener("click", () => v1114(-1)),
              element430.addEventListener("click", () => v1114(1)),
              v1110(v1104),
              v1069(entityId2, v1110),
              element411.append(element425));
          } else {
            if (v1071 === "button") {
              const element431 = document.createElement("button");
              ((element431.type = "button"),
                (element431.className = "hb-water-heater-extension-action"),
                (element431.textContent = v1072));
              let v1121 = false;
              const v1122 = (arg647) => {
                const v1123 = String(arg647?.state || "").toLowerCase() === "unavailable";
                element431.disabled = !v1064 || v1121 || v1123;
              };
              (element431.addEventListener("click", async () => {
                if (
                  !(!v1064 || v1121 || element431.disabled) &&
                  !(
                    relatedEntityNeedsConfirmation2(v1070) &&
                    !window.confirm("确认执行“" + v1072 + "”吗？")
                  )
                ) {
                  ((v1121 = true), v1122(v1067(entityId2)));
                  try {
                    await this.callEntityService("button", "press", entityId2);
                  } catch (v1124) {
                    this.options.onError?.(v1124);
                  } finally {
                    ((v1121 = false), v1122(v1067(entityId2)));
                  }
                }
              }),
                v1122(v1067(entityId2)),
                v1069(entityId2, v1122),
                element411.append(element431));
            } else {
              if (["sensor", "binary_sensor"].includes(v1071)) {
                const element432 = document.createElement("div");
                element432.className = "hb-water-heater-extension-readonly";
                const element433 = document.createElement("strong");
                element433.textContent = v1072;
                const element434 = document.createElement("small"),
                  v1125 = (arg648) => {
                    const v1126 = String(arg648?.state || "unknown"),
                      includes13 = ["unknown", "unavailable"].includes(v1126.toLowerCase()),
                      v1127 = String(arg648?.attributes?.unit_of_measurement || "");
                    (includes13
                      ? (element434.textContent = "不可用")
                      : v1071 === "binary_sensor"
                        ? (element434.textContent = v1126 === "on" ? "已触发" : "正常")
                        : (element434.textContent = "" + v1126 + (v1127 ? " " + v1127 : "")),
                      element432.classList.toggle("is-unavailable", includes13));
                  };
                (element432.append(element433, element434),
                  v1125(v1067(entityId2)),
                  v1069(entityId2, v1125),
                  element411.append(element432));
              }
            }
          }
        }
      }
    }
    if (element411.childElementCount) {
      const element435 = document.createElement("strong");
      ((element435.className = "hb-water-heater-extension-title"),
        (element435.textContent = "扩展功能"),
        (element410.dataset.controlCount = String(element411.childElementCount)),
        (element411.dataset.controlCount = String(element411.childElementCount)),
        element410.append(element435, element411));
    }
    return (
      (element410.stateHandlers = map30),
      (element410.relatedEntityIds = filter13.map((arg649) => arg649.entityId)),
      element410
    );
  }
  ["createBathHeaterLightControl"](
    arg650,
    arg651,
    { interactive: v1128 = true, onStateChange: v1129 = null } = {},
  ) {
    const element436 = document.createElement("section");
    element436.className = "hb-bath-heater-light-control";
    const element437 = document.createElement("span"),
      element438 = document.createElement("i");
    (element438.setAttribute("aria-hidden", "true"), (element438.textContent = "☀"));
    const element439 = document.createElement("strong");
    element439.textContent = String(arg651?.attributes?.friendly_name || "浴霸灯");
    const element440 = document.createElement("output");
    element437.append(element438, element439, element440);
    const element441 = document.createElement("button");
    ((element441.type = "button"), (element441.disabled = !v1128));
    let v1130 = arg651,
      v1131 = false;
    const v1132 = (v1133 = v1130) => {
        v1130 = v1133 || v1130;
        const includes14 = ["unknown", "unavailable"].includes(String(v1130?.state || "")),
          v1134 = v1130?.state === "on";
        (element436.classList.toggle("is-on", v1134 && !includes14),
          element436.classList.toggle("is-unavailable", includes14),
          (element440.textContent = includes14 ? "不可用" : v1134 ? "已开启" : "已关闭"),
          (element441.textContent = v1134 ? "关闭灯光" : "开启灯光"),
          (element441.disabled = !v1128 || v1131 || includes14),
          element441.setAttribute("aria-pressed", String(v1134)),
          v1129?.({
            isOn: v1134,
            unavailable: includes14,
          }));
      },
      v1135 = async () => {
        if (!v1128 || v1131) return;
        v1131 = true;
        const v1136 = v1130;
        v1132({
          ...(v1130 || {}),
          state: v1130?.state === "on" ? "off" : "on",
        });
        try {
          await this.callEntityService("homeassistant", "toggle", arg650);
        } catch (v1137) {
          (v1132(v1136), this.options.onError?.(v1137));
        } finally {
          ((v1131 = false), v1132(v1130));
        }
      };
    return (
      element441.addEventListener("click", v1135),
      element436.append(element437, element441),
      (element436.syncBathLightState = v1132),
      (element436.toggleBathLight = v1135),
      v1132(arg651),
      element436
    );
  }
  ["showElectricBedLoadingDetails"](arg652, { preview: v1138 = false } = {}) {
    if (!arg652.bindings?.entity?.entityId) return;
    const pendingEntityDetails2 = this.pendingEntityDetails,
      detailsDialog2 = this.detailsDialog;
    ((this.detailsDialog = null),
      this.closeRuntimeDialog(detailsDialog2, {
        preservePending: true,
      }));
    const element442 = document.createElement("dialog");
    ((element442.className =
      "hb-entity-details-dialog electric-bed-details electric-bed-loading-details"),
      (element442.tabIndex = -1));
    const element443 = document.createElement("div");
    element443.className = "hb-entity-details-card";
    const element444 = document.createElement("div");
    element444.className = "hb-entity-details-heading";
    const element445 = document.createElement("strong");
    ((element445.textContent = componentDialogTitle(arg652, "电动床")),
      element444.append(element445));
    const element446 = document.createElement("section");
    element446.className = "hb-electric-bed-loading-body";
    const element447 = document.createElement("section");
    element447.className = "hb-climate-details-loading is-loading";
    const element448 = document.createElement("i");
    element448.setAttribute("aria-hidden", "true");
    const element449 = document.createElement("strong");
    element449.textContent = "—";
    const element450 = document.createElement("span");
    ((element450.textContent = ""),
      element447.append(element448, element449, element450),
      element446.append(element447),
      element443.append(element444, element446),
      element442.append(element443));
    const element451 = document.createElement("div");
    ((element451.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (element451.tabIndex = -1),
      element451.append(element442),
      this.container.append(element451),
      (this.detailsDialog = element442),
      this.registerRuntimeDialogScale(element451, element442, 760, 420),
      this.bindRuntimeDialogOutsideDismiss(element451, element442, element443),
      element451.addEventListener("keydown", (arg653) => {
        arg653.key === "Escape" && element442.close();
      }),
      element442.addEventListener(
        "close",
        () => {
          (this.detailsDialog === element442 &&
            this.pendingEntityDetails === pendingEntityDetails2 &&
            this.cancelPendingEntityDetails(),
            this.clearRuntimeDialogScale(element442),
            this.detailsDialog === element442 && (this.detailsDialog = null),
            element451.remove());
        },
        {
          once: true,
        },
      ),
      element442.show(),
      element442.focus({
        preventScroll: true,
      }));
  }
  ["showElectricBedDetails"](arg654, { preview: v1139 = false } = {}) {
    const v1140 = arg654.bindings?.entity?.entityId;
    if (!v1140) throw new Error("该电动床控件没有关联实体。");
    const deviceProfile8 = this.deviceProfile(v1140),
      options83 = deviceProfile8?.roles || {},
      filter14 = [
        ["backrest", "靠背角度"],
        ["leg", "腿部角度"],
        ["waist", "腰部角度"],
      ]
        .map(([v1141, v1142]) => ({
          role: v1141,
          label: v1142,
          entityId: String(options83[v1141] || ""),
        }))
        .filter((arg655) => arg655.entityId),
      v1143 = String(options83.mode || ""),
      v1144 = this.entityMetadata.get(v1140),
      map31 = v1144?.deviceId
        ? [...this.entityMetadata.values()]
            .filter(
              (arg656) =>
                arg656.deviceId === v1144.deviceId &&
                ["button", "select"].includes(
                  String(arg656.domain || arg656.entityId || "").split(".", 1)[0],
                ) &&
                arg656.entityId !== options83.mode &&
                entityMetadataIsAvailable2(arg656),
            )
            .sort((arg657, arg658) =>
              String(arg657.entityId || "").localeCompare(String(arg658.entityId || "")),
            )
            .map((arg659) => arg659.entityId)
        : [],
      slice6 = [
        ...new Set(
          [String(options83.memory1 || ""), String(options83.memory2 || ""), ...map31].filter(
            Boolean,
          ),
        ),
      ].slice(0, 2);
    this.closeRuntimeDialog();
    const element452 = document.createElement("dialog");
    element452.className = "hb-entity-details-dialog electric-bed-details";
    const element453 = document.createElement("div");
    element453.className = "hb-entity-details-card";
    const element454 = document.createElement("div");
    element454.className = "hb-entity-details-heading";
    const element455 = document.createElement("div"),
      element456 = document.createElement("strong");
    element456.textContent = componentDialogTitle(arg654, deviceProfile8?.deviceName || "电动床");
    const element457 = document.createElement("span");
    element455.append(element456, element457);
    const element458 = document.createElement("button");
    ((element458.type = "button"),
      (element458.textContent = "×"),
      element458.setAttribute("aria-label", "关闭电动床详情"),
      element454.append(element455, element458));
    const element459 = document.createElement("div");
    element459.className = "hb-electric-bed-details-body";
    const element460 = document.createElement("section");
    element460.className = "hb-electric-bed-visual";
    const element461 = document.createElement("div");
    element461.className = "hb-electric-bed-model";
    const element462 = document.createElement("i");
    element462.className = "hb-electric-bed-mattress";
    const element463 = document.createElement("i");
    element463.className = "hb-electric-bed-back";
    const element464 = document.createElement("i");
    element464.className = "hb-electric-bed-waist";
    const element465 = document.createElement("i");
    element465.className = "hb-electric-bed-legs";
    const element466 = document.createElement("i");
    ((element466.className = "hb-electric-bed-base"),
      element461.append(element462, element463, element464, element465, element466));
    const v1145 = (arg660, arg661) => {
        const element467 = document.createElement("span");
        element467.className = "hb-electric-bed-angle-readout " + arg660;
        const element468 = document.createElement("strong"),
          element469 = document.createElement("small");
        return (
          (element469.textContent = arg661),
          element467.append(element468, element469),
          {
            readout: element467,
            value: element468,
          }
        );
      },
      v1146 = v1145("back", "靠背"),
      v1147 = v1145("waist", "腰部"),
      v1148 = v1145("legs", "腿部"),
      element470 = document.createElement("strong"),
      element471 = document.createElement("small");
    element460.append(
      element461,
      v1146.readout,
      v1147.readout,
      v1148.readout,
      element470,
      element471,
    );
    const element472 = document.createElement("section");
    element472.className = "hb-electric-bed-utilities";
    const element473 = document.createElement("section");
    element473.className = "hb-electric-bed-main";
    const element474 = document.createElement("section");
    element474.className = "hb-electric-bed-angle-controls";
    const map32 = new Map(),
      list40 = [],
      v1149 = (arg662) => {
        const v1150 = this.states.get(arg662);
        return (
          v1150?.newState ||
          v1150 || {
            entityId: arg662,
            state: "unknown",
            attributes: {},
          }
        );
      },
      v1151 = (arg663, arg664, v1152 = "", v1153 = element474) => {
        const v1154 = v1149(arg664),
          element475 = document.createElement("section");
        ((element475.className = "hb-electric-bed-control"),
          arg663 === "模式" && element475.classList.add("hb-electric-bed-mode"));
        const element476 = document.createElement("strong");
        element476.textContent = arg663;
        const capabilityDetailsControls5 = this.createCapabilityDetailsControls(arg664, v1154, {
          interactive: !v1139,
          variant: v1152,
        });
        (capabilityDetailsControls5.classList.add("hb-electric-bed-capability"),
          element475.append(element476, capabilityDetailsControls5),
          v1153.append(element475));
        const v1155 = (arg665) => capabilityDetailsControls5.syncCapabilityState?.(arg665);
        (map32.set(arg664, [v1155]),
          list40.push({
            role: arg663,
            entityId: arg664,
            sync: v1155,
            cleanup: () => capabilityDetailsControls5.cleanupCapabilityDetails?.(),
          }));
      };
    for (const v1156 of filter14) v1151(v1156.label, v1156.entityId);
    if (v1143) v1151("模式", v1143, "electric-bed", element472);
    else {
      const element477 = document.createElement("section");
      element477.className = "hb-electric-bed-control hb-electric-bed-mode is-unavailable";
      const element478 = document.createElement("strong");
      element478.textContent = "模式";
      const element479 = document.createElement("select");
      ((element479.className = "hb-capability-select"),
        (element479.disabled = true),
        element479.setAttribute("aria-label", "模式"));
      const element480 = document.createElement("option");
      ((element480.textContent = "未识别到模式实体"),
        element479.append(element480),
        element477.append(element478, element479),
        element472.append(element477));
    }
    const element481 = document.createElement("section");
    element481.className = "hb-electric-bed-memory";
    const element482 = document.createElement("strong");
    element482.textContent = "记忆姿势";
    const element483 = document.createElement("div");
    element483.className = "hb-electric-bed-memory-list";
    for (let num68 = 0; num68 < 2; num68 += 1) {
      const text49 = slice6[num68] || "",
        value62 = text49 ? this.entityMetadata.get(text49) : null;
      if (String(text49).split(".", 1)[0] === "select") {
        const element484 = document.createElement("section");
        element484.className = "hb-electric-bed-memory-control hb-electric-bed-control";
        const element485 = document.createElement("strong");
        element485.textContent = "记忆姿势 " + (num68 + 1);
        const capabilityDetailsControls6 = this.createCapabilityDetailsControls(
          text49,
          v1149(text49),
          {
            interactive: !v1139,
            variant: "electric-bed-memory",
            selectLabel: "姿势",
          },
        );
        (capabilityDetailsControls6.classList.add("hb-electric-bed-capability"),
          element484.append(element485, capabilityDetailsControls6),
          element483.append(element484));
        const v1157 = (arg666) => capabilityDetailsControls6.syncCapabilityState?.(arg666);
        (map32.set(text49, [v1157]),
          list40.push({
            role: "memory" + (num68 + 1),
            entityId: text49,
            sync: v1157,
            cleanup: () => capabilityDetailsControls6.cleanupCapabilityDetails?.(),
          }));
        continue;
      }
      const element486 = document.createElement("button");
      ((element486.type = "button"),
        (element486.className = "hb-electric-bed-memory-button"),
        (element486.textContent =
          value62?.name || value62?.originalName || "记忆姿势 " + (num68 + 1)),
        (element486.disabled = v1139 || !text49),
        element486.classList.toggle("is-unavailable", !text49),
        element486.addEventListener("click", async () => {
          if (!(v1139 || !text49 || element486.disabled)) {
            ((element486.disabled = true), element486.classList.add("is-pending"));
            try {
              (await this.callEntityService("button", "press", text49),
                element486.classList.add("is-success"),
                window.setTimeout(() => element486.classList.remove("is-success"), 900));
            } catch (v1158) {
              this.options.onError?.(v1158);
            } finally {
              (element486.classList.remove("is-pending"), (element486.disabled = v1139 || !text49));
            }
          }
        }),
        element483.append(element486));
    }
    if (
      (element481.append(element482, element483), element472.append(element481), !filter14.length)
    ) {
      const element487 = document.createElement("p");
      ((element487.className = "hb-electric-bed-empty"),
        (element487.textContent = "暂未识别到角度实体"),
        element474.append(element487));
    }
    (element473.append(element460, element474),
      element459.append(element472, element473),
      element453.append(element454, element459),
      element452.append(element453));
    const v1159 = (arg667, arg668) => {
        const v1160 = Number(arg668?.state),
          v1161 = Number(arg668?.attributes?.min),
          v1162 = Number(arg668?.attributes?.max);
        return Number.isFinite(v1160)
          ? !Number.isFinite(v1161) || !Number.isFinite(v1162) || v1162 <= v1161
            ? Math.max(0, Math.min(100, v1160))
            : Math.max(0, Math.min(100, ((v1160 - v1161) / (v1162 - v1161)) * 100))
          : 0;
      },
      v1163 = () => {
        const v1164 = v1149(options83.backrest),
          v1165 = v1149(options83.leg),
          v1166 = v1149(options83.waist),
          v1167 = (arg669) => {
            const v1168 = Number(arg669?.state);
            if (!Number.isFinite(v1168)) return "--";
            const v1169 = String(arg669?.attributes?.unit_of_measurement || "°");
            return "" + v1168 + v1169;
          };
        ((v1146.value.textContent = v1167(v1164)),
          (v1147.value.textContent = v1167(v1166)),
          (v1148.value.textContent = v1167(v1165)),
          element460.style.setProperty(
            "--hb-bed-backrest-angle",
            v1159(options83.backrest, v1164) * -0.42 + "deg",
          ),
          element460.style.setProperty(
            "--hb-bed-leg-angle",
            v1159(options83.leg, v1165) * -0.28 + "deg",
          ),
          element460.style.setProperty(
            "--hb-bed-waist-angle",
            v1159(options83.waist, v1166) * -0.1 + "deg",
          ));
        const map33 = [v1164, v1165, v1166].map((arg670) =>
            String(arg670?.state || "").toLowerCase(),
          ),
          some = map33.some((arg671) => arg671 === "unavailable"),
          some2 = !some && map33.some((arg672) => arg672 === "unknown" || !arg672);
        ((element470.textContent = some ? "部分实体不可用" : some2 ? "—" : "设备在线"),
          (element471.textContent = filter14.length === 3 ? "三个角度独立控制" : ""),
          (element457.textContent = some ? "部分功能不可用" : ""));
      };
    v1163();
    for (const v1170 of filter14)
      map32.get(v1170.entityId)?.push(() => {
        v1163();
      });
    (v1143 && map32.get(v1143)?.push(() => v1163()),
      (this.detailsStateSync = {
        dialog: element452,
        handlers: map32,
      }));
    const element488 = document.createElement("div");
    ((element488.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (element488.tabIndex = -1),
      element488.append(element452),
      this.container.append(element488),
      (this.detailsDialog = element452),
      this.registerRuntimeDialogScale(element488, element452, 760, 560),
      element458.addEventListener("click", () => element452.close()),
      this.bindRuntimeDialogOutsideDismiss(element488, element452, element453),
      element488.addEventListener("keydown", (arg673) => {
        arg673.key === "Escape" && element452.close();
      }),
      element452.addEventListener(
        "close",
        () => {
          for (const v1171 of list40) v1171.cleanup?.();
          (this.clearRuntimeDialogScale(element452),
            this.detailsDialog === element452 && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === element452 && (this.detailsStateSync = null),
            element488.remove());
        },
        {
          once: true,
        },
      ),
      element452.show());
  }
  ["openInteraction3dVacuumDetails"](
    arg674,
    arg675,
    {
      states: v1172 = {},
      root: v1173,
      frame: v1174,
      popupOpacity: v1175 = 74,
      getPresentationLayout: v1176,
      getPopupLayout: v1177,
    } = {},
  ) {
    const set14 = new Set([arg674.entityId, ...(arg674.relatedEntityIds || [])]);
    let value63 = null;
    const v1178 = (arg676) => {
      for (const v1179 of set14) {
        const options84 = arg676[v1179] || {
          entityId: v1179,
          state: "unavailable",
          attributes: {},
        };
        if ((this.states.set(v1179, options84), this.detailsStateSync?.dialog === value63)) {
          for (const v1180 of this.detailsStateSync.handlers.get(v1179) || []) v1180(options84);
        }
      }
    };
    v1178(v1172);
    const v1181 = (arg677) => {
        for (const element489 of arg677 || []) {
          if (
            element489.type === "vacuum-control" &&
            element489.bindings?.entity?.entityId === arg674.entityId
          )
            return element489;
          const v1182 = v1181(element489.children);
          if (v1182) return v1182;
        }
        return null;
      },
      v1183 = (this.document?.pages || []).map((arg678) => v1181(arg678.components)).find(Boolean),
      filter15 =
        v1183?.properties?.relatedEntities?.mode === "selected"
          ? (v1183.properties.relatedEntities.entityIds || []).filter((arg679) => set14.has(arg679))
          : [],
      options85 = {
        id: "vacuum:" + arg674.id,
        type: "vacuum-control",
        properties: {
          label: arg674.label,
          relatedEntities: {
            mode: "selected",
            entityIds: filter15,
          },
        },
        bindings: {
          entity: {
            entityId: arg674.entityId,
          },
        },
      };
    return (
      (() => {
        (value63?.removeEventListener("close", arg675),
          this.showVacuumDetails(options85, {
            preview: !!this.options.editable,
            interaction3d: {
              root: v1173,
              frame: v1174,
              popupOpacity: v1175,
              getPresentationLayout: v1176,
              getPopupLayout: v1177,
              statusEntities: [...set14]
                .filter((arg680) => arg680.startsWith("sensor."))
                .map((arg681) => ({
                  entityId: arg681,
                  role: arg674.statusEntityRoles
                    ? arg674.statusEntityRoles[arg681] || ""
                    : undefined,
                })),
            },
          }),
          (value63 = this.detailsDialog),
          value63?.addEventListener("close", arg675, {
            once: true,
          }));
      })(),
      {
        updateStates: v1178,
        updateLayout: () => value63?.resizeInteraction3d?.(),
        close: () => {
          (value63?.removeEventListener("close", arg675), value63?.close());
        },
        contains: (arg682) => value63?.contains(arg682),
      }
    );
  }
  ["showVacuumDetails"](arg683, { preview: v1184 = false, interaction3d: v1185 = null } = {}) {
    const list41 = arg683.bindings?.entity?.entityId;
    if (!list41) throw new Error("该扫地机器人控件没有关联实体。");
    const v1186 = selectedRelatedEntityIds2(arg683);
    this.closeRuntimeDialog();
    const v1187 = this.states.get(list41);
    let options86 = v1187?.newState ||
      v1187 || {
        state: "unknown",
        attributes: {},
      };
    const element490 = document.createElement("dialog");
    ((element490.className = "hb-entity-details-dialog vacuum-details"),
      v1185 && element490.classList.add("i3d-vacuum-details"));
    const element491 = document.createElement("div");
    ((element491.className = "hb-entity-details-card"),
      element491.classList.add("hb-vacuum-details-card"));
    const element492 = document.createElement("div");
    element492.className = "hb-entity-details-heading";
    const element493 = document.createElement("div"),
      element494 = document.createElement("strong"),
      text50 =
        String(options86.attributes?.friendly_name || "扫地机器人").replace(/^\d+/, "") ||
        "扫地机器人";
    element494.textContent = componentDialogTitle(arg683, text50);
    const element495 = document.createElement("span");
    element495.className = "hb-vacuum-details-subtitle";
    const element496 = document.createElement("button");
    ((element496.type = "button"),
      element496.setAttribute("aria-label", "关闭扫地机器人详情"),
      (element496.textContent = "×"),
      element493.append(element494, element495),
      element492.append(element493, element496));
    const element497 = document.createElement("div");
    element497.className = "hb-vacuum-details-layout";
    const element498 = document.createElement("section");
    element498.className = "hb-vacuum-details-overview";
    const element499 = document.createElement("div");
    element499.className = "hb-vacuum-visual";
    const element500 = document.createElement("div");
    element500.className = "hb-vacuum-battery-ring";
    const element501 = document.createElement("div");
    element501.className = "hb-vacuum-robot";
    const element502 = document.createElement("i");
    element502.className = "hb-vacuum-robot-lidar";
    const element503 = document.createElement("i");
    element503.className = "hb-vacuum-robot-sensor";
    const element504 = document.createElement("i");
    element504.className = "hb-vacuum-robot-bumper";
    const element505 = document.createElement("i");
    element505.className = "hb-vacuum-robot-brush";
    const element506 = document.createElement("i");
    element506.className = "hb-vacuum-robot-mop left";
    const element507 = document.createElement("i");
    ((element507.className = "hb-vacuum-robot-mop right"),
      element501.append(element502, element503, element504, element505, element506, element507));
    const element508 = document.createElement("div");
    element508.className = "hb-vacuum-battery";
    const element509 = document.createElement("strong"),
      element510 = document.createElement("small");
    ((element510.textContent = "电量"),
      element508.append(element509, element510),
      element500.append(element501),
      element492.append(element508));
    const element511 = document.createElement("span");
    ((element511.className = "hb-vacuum-visual-status"), element499.append(element500, element511));
    const element512 = document.createElement("div");
    element512.className = "hb-vacuum-details-stats";
    const v1188 = (arg684, arg685) => {
        const element513 = document.createElement("div"),
          element514 = document.createElement("span");
        element514.className = "hb-vacuum-details-stat-value";
        const element515 = document.createElement("i");
        ((element515.textContent = arg685), element515.setAttribute("aria-hidden", "true"));
        const element516 = document.createElement("strong"),
          element517 = document.createElement("small");
        return (
          (element517.textContent = arg684),
          element514.append(element515, element516),
          element513.append(element514, element517),
          element512.append(element513),
          element516
        );
      },
      element518 = v1188("本次面积", "◇"),
      element519 = v1188("清扫时长", "◷");
    (v1185 || element498.append(element499), element498.append(element512));
    const element520 = document.createElement("section");
    element520.className = "hb-vacuum-details-controls";
    const element521 = document.createElement("div");
    element521.className = "hb-vacuum-details-actions";
    const v1189 = (arg686, arg687, arg688, arg689) => {
        const element522 = document.createElement("button");
        ((element522.type = "button"),
          (element522.dataset.service = arg689),
          (element522.disabled = v1184));
        const element523 = document.createElement("i");
        ((element523.textContent = arg688), element523.setAttribute("aria-hidden", "true"));
        const element524 = document.createElement("span"),
          element525 = document.createElement("strong");
        element525.textContent = arg686;
        const element526 = document.createElement("small");
        return (
          (element526.textContent = arg687),
          element524.append(element525, element526),
          element522.append(element523, element524),
          element521.append(element522),
          {
            button: element522,
            name: element525,
            description: element526,
          }
        );
      },
      list42 = [
        ["start", "开始清扫", "启动全屋任务", "▶"],
        ["pause", "暂停", "保留当前进度", "Ⅱ"],
        ["stop", "停止", "结束当前任务", "■"],
        ["return_to_base", "回充", "返回充电座", "⌂"],
        ["locate", "定位", "让设备发出声音", "◎"],
        ["clean_spot", "局部清扫", "清扫当前位置", "⌖"],
      ],
      map34 = new Map(
        list42.map(([v1190, v1191, v1192, v1193]) => [v1190, v1189(v1191, v1192, v1193, v1190)]),
      ),
      v1194 = map34.get("start"),
      v1195 = map34.get("pause"),
      v1196 = map34.get("stop"),
      v1197 = map34.get("return_to_base"),
      v1198 = map34.get("locate"),
      v1199 = map34.get("clean_spot");
    element520.append(element521);
    const v1200 = (arg690) =>
        String(arg690 || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, ""),
      options87 = {
        sweeping: "扫地",
        mopping: "拖地",
        sweeping_and_mopping: "扫拖同步",
        mopping_after_sweeping: "先扫后拖",
      },
      options88 = {
        silent: "静音",
        quiet: "静音",
        standard: "标准",
        strong: "强力",
        turbo: "超强",
      },
      v1201 = ({ label: v1202, detail: v1203, labels: v1204, onSelect: v1205 }) => {
        const element527 = document.createElement("section");
        element527.className = "hb-vacuum-details-option-group";
        const element528 = document.createElement("div"),
          element529 = document.createElement("strong");
        element529.textContent = v1202;
        const element530 = document.createElement("small");
        ((element530.textContent = v1203), element528.append(element529, element530));
        const element531 = document.createElement("div");
        element531.className = "hb-vacuum-details-options";
        let list43 = [],
          text51 = "";
        const v1206 = (arg691, arg692, v1207 = true) => {
          const stringify2 = JSON.stringify(arg692);
          (text51 !== stringify2 &&
            ((text51 = stringify2),
            (list43 = arg692.map((arg693) => {
              const v1208 = v1200(arg693),
                element532 = document.createElement("button");
              return (
                (element532.type = "button"),
                (element532.textContent = v1204[v1208] || String(arg693)),
                element532.addEventListener("click", () => v1205(arg693)),
                {
                  button: element532,
                  key: v1208,
                }
              );
            })),
            element531.replaceChildren(...list43.map((arg694) => arg694.button))),
            (element527.hidden = !list43.length));
          const v1209 = v1200(arg691);
          for (const { button: element533, key: v1210 } of list43)
            (element533.classList.toggle("active", v1210 === v1209),
              (element533.dataset.unsupported = String(!v1207)),
              (element533.disabled =
                v1184 || v1217 || !vacuumStatus2(options86).available || !v1207));
        };
        return (
          element527.append(element528, element531),
          element520.append(element527),
          {
            group: element527,
            sync: v1206,
          }
        );
      },
      v1211 = "select." + list41.slice(list41.indexOf(".") + 1) + "_cleaning_mode",
      v1212 = relatedDeviceEntity2(this.entityMetadata, list41, "select", "cleaning_mode", v1211),
      v1213 = String(v1212?.entityId || ""),
      value64 = v1213 ? this.states.get(v1213) : null;
    let value65 = value64?.newState || value64 || null;
    const v1214 = relatedVacuumBatteryEntity2(this.entityMetadata, this.states, list41),
      v1215 = String(v1214?.entityId || ""),
      value66 = v1215 ? this.states.get(v1215) : null;
    let value67 = value66?.newState || value66 || null,
      value68 = null;
    const v1216 = (arg695) => {
      arg695 && ((value65 = arg695.newState || arg695), v1229());
    };
    let v1217 = false,
      v1218 = false;
    const v1219 = (arg696) => {
        ((v1217 = arg696), element520.classList.toggle("is-pending", arg696));
        for (const element534 of element520.querySelectorAll(
          ":scope > .hb-vacuum-details-actions button, :scope > .hb-vacuum-details-option-group button",
        ))
          element534.disabled =
            v1184 ||
            arg696 ||
            !vacuumStatus2(options86).available ||
            element534.dataset.unsupported === "true";
      },
      v1220 = async (
        arg697,
        arg698,
        arg699,
        arg700,
        v1221 = null,
        v1222 = fn2,
        v1223 = options86,
      ) => {
        if (v1218 || v1184 || v1217 || !vacuumStatus2(options86).available) return false;
        (v1221 && v1222(v1221), v1219(true));
        try {
          return (await this.callEntityService(arg697, arg698, arg699, arg700), true);
        } catch (v1224) {
          return (v1218 || (v1221 && v1222(v1223), this.options.onError?.(v1224)), false);
        } finally {
          v1218 || v1219(false);
        }
      },
      v1225 = !!v1213;
    value68 = v1201({
      label: "清洁模式",
      detail: v1225 ? "选择本次任务方式" : "当前设备未提供模式切换实体",
      labels: options87,
      onSelect: async (arg701) => {
        const v1226 = value65;
        if (!v1225 || !v1226 || ["unknown", "unavailable"].includes(v1226.state)) return;
        const options89 = {
          ...v1226,
          state: arg701,
        };
        await v1220(
          "select",
          "select_option",
          v1213,
          {
            option: arg701,
          },
          options89,
          v1216,
          v1226,
        );
      },
    });
    const v1227 = v1201({
        label: "吸力",
        detail: "按地面情况调节",
        labels: options88,
        onSelect: async (arg702) => {
          const v1228 = options86,
            options90 = {
              ...v1228,
              attributes: {
                ...(v1228.attributes || {}),
                fan_speed: arg702,
                suction_level: arg702,
              },
            };
          await v1220(
            "vacuum",
            "set_fan_speed",
            list41,
            {
              fan_speed: arg702,
            },
            options90,
          );
        },
      }),
      v1229 = () => {
        const options91 = options86.attributes || {},
          cleaning_mode_list = value65?.attributes?.options ?? options91.cleaning_mode_list;
        value68.sync(
          value65?.state || options91.cleaning_mode,
          Array.isArray(cleaning_mode_list) ? cleaning_mode_list : [],
          v1225 && !!value65 && !["unknown", "unavailable"].includes(value65.state),
        );
        const fan_speed_list = options91.fan_speed_list?.length
          ? options91.fan_speed_list
          : options91.suction_level_list;
        v1227.sync(
          options91.fan_speed || options91.suction_level,
          Array.isArray(fan_speed_list) ? fan_speed_list : [],
        );
      },
      waterHeaterExtensionControls2 =
        v1186 !== null
          ? this.createWaterHeaterExtensionControls(list41, {
              component: arg683,
              interactive: !v1184,
              excludedEntityIds: [v1213, v1215].filter(Boolean),
            })
          : null,
      element535 = document.createElement("p");
    ((element535.className = "hb-vacuum-details-warning"),
      element520.append(element535),
      element497.append(element498, element520),
      element491.append(element492, element497),
      waterHeaterExtensionControls2 &&
        (element491.append(waterHeaterExtensionControls2),
        element490.classList.add("has-related-extensions")),
      element490.append(element491));
    const v1230 =
        v1185?.statusEntities || relatedVacuumStatusEntities2(this.entityMetadata, list41),
      map35 = new Map(v1230.map((arg703) => [arg703.entityId, this.states.get(arg703.entityId)])),
      v1231 = (arg704) =>
        vacuumStatus2(
          arg704,
          v1230.map((arg705) => ({
            ...arg705,
            state: map35.get(arg705.entityId),
          })),
        ),
      v1232 = (arg706, v1233 = "--") =>
        arg706 != null && String(arg706).trim() !== "" && Number.isFinite(Number(arg706))
          ? Number(arg706)
          : v1233,
      v1234 = () => {
        const value69 = v1231(options86).available
          ? vacuumBatteryPercent2(options86, value67)
          : null;
        element509.textContent = value69 === null ? "--" : Math.round(value69) + "%";
      },
      v1235 = (arg707) => {
        ((value67 = arg707 || value67), v1234());
      };
    function fn2(arg708) {
      if (!arg708) return;
      ((arg708 = arg708.newState || arg708), (options86 = arg708), v1219(v1217));
      const options92 = arg708.attributes || {},
        v1236 = v1231(arg708),
        text52 = v1236.status === "等待状态" ? "—" : v1236.status,
        active = v1236.active,
        paused = v1236.paused,
        returning = v1236.returning,
        v1237 = v1200(options92.cleaning_mode),
        includes15 = ["sweeping", "sweeping_and_mopping", "mopping_after_sweeping"].includes(v1237),
        includes16 = ["mopping", "sweeping_and_mopping", "mopping_after_sweeping"].includes(v1237),
        set15 = new Set(vacuumSupportedActions2(arg708));
      for (const [v1238, v1239] of map34)
        v1239.button.hidden = !set15.has(v1238) || !!(v1185 && v1238 === "clean_spot");
      const filter16 = [...map34.values()].filter((arg709) => !arg709.button.hidden),
        v1240 = filter16.length;
      ((element521.hidden = v1240 === 0),
        element521.classList.toggle("has-many-actions", v1240 > 3));
      for (const v1241 of map34.values())
        v1241.button.classList.remove("is-last-row-pair", "is-last-row-single");
      const min23 = v1240 % 3 || Math.min(v1240, 3);
      if (min23 === 2) {
        for (const v1242 of filter16.slice(-2)) v1242.button.classList.add("is-last-row-pair");
      } else min23 === 1 && filter16.at(-1)?.button.classList.add("is-last-row-single");
      ((element495.textContent = text52),
        element495.classList.toggle("is-active", active && !paused),
        (element511.textContent = text52),
        v1234(),
        element499.classList.toggle("is-working", v1236.moving),
        element499.classList.toggle("is-paused", paused),
        element499.classList.toggle("is-returning", returning),
        element499.classList.toggle("is-sweeping", includes15),
        element499.classList.toggle("is-mopping", includes16),
        (element518.textContent = v1232(options92.cleaned_area) + " m²"),
        (element519.textContent = v1232(options92.cleaning_time) + " min"),
        v1194.button.classList.toggle("active", v1236.moving && !returning),
        v1195.button.classList.toggle("active", paused),
        v1196.button.classList.toggle("active", false),
        v1197.button.classList.toggle("active", returning),
        v1198.button.classList.toggle("active", false),
        v1199.button.classList.toggle(
          "active",
          active && !paused && !returning && arg708.state === "cleaning",
        ),
        (v1194.name.textContent = paused ? "继续清扫" : "开始清扫"),
        v1229());
      const trim3 = String(options92.error || "").trim(),
        trim4 = String(options92.low_water_warning || "").trim(),
        list44 = [];
      (trim3 && !/^no error$/i.test(trim3) && list44.push(trim3),
        trim4 && !/^no warning$/i.test(trim4) && list44.push(trim4),
        (element535.textContent = list44.length ? "注意：" + list44.join(" · ") : ""),
        (element535.hidden = !list44.length));
    }
    (v1194.button.addEventListener("click", () =>
      v1220("vacuum", vacuumActionService2(options86, "start"), list41, {}),
    ),
      v1195.button.addEventListener("click", () => v1220("vacuum", "pause", list41, {})),
      v1197.button.addEventListener("click", () => v1220("vacuum", "return_to_base", list41, {})),
      v1196.button.addEventListener("click", () =>
        v1220("vacuum", vacuumActionService2(options86, "stop"), list41, {}),
      ),
      v1198.button.addEventListener("click", () => v1220("vacuum", "locate", list41, {})),
      v1199.button.addEventListener("click", () => v1220("vacuum", "clean_spot", list41, {})),
      fn2(options86));
    const element536 = document.createElement("div");
    ((element536.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (element536.tabIndex = -1),
      element536.append(element490),
      this.container.append(element536),
      (this.detailsDialog = element490));
    const map36 = new Map([[list41, [fn2]]]);
    (v1213 && map36.set(v1213, [v1216]), v1215 && map36.set(v1215, [v1235]));
    for (const [v1243, v1244] of waterHeaterExtensionControls2?.stateHandlers || [])
      map36.set(v1243, v1244);
    for (const v1245 of v1230) {
      const list45 = map36.get(v1245.entityId) || [];
      (list45.push((arg710) => {
        (map35.set(v1245.entityId, arg710), fn2(options86));
      }),
        map36.set(v1245.entityId, list45));
    }
    this.detailsStateSync = {
      dialog: element490,
      handlers: map36,
    };
    let value70 = null;
    if (v1185) {
      (element536.classList.add("i3d-vacuum-dialog-layer"),
        (v1185.root || this.container).append(element536),
        element490.style.setProperty(
          "--i3d-panel-opacity",
          String(
            Math.max(
              0,
              Math.min(100, Number.isFinite(v1185.popupOpacity) ? v1185.popupOpacity : 74),
            ) / 100,
          ),
        ));
      const v1246 = () => {
        const container2 = v1185.root || this.container,
          v1247 = v1185.getPresentationLayout?.(),
          v1248 = v1247?.fixedUi === true && v1247?.sourceWidth > 0 && v1247?.sourceHeight > 0,
          clientWidth = container2.clientWidth,
          clientHeight = container2.clientHeight,
          sourceWidth2 = v1248 ? v1247.sourceWidth : v1247?.width > 0 ? v1247.width : clientWidth,
          sourceHeight2 = v1248
            ? v1247.sourceHeight
            : v1247?.height > 0
              ? v1247.height
              : clientHeight,
          v1249 = clientWidth / Math.max(1, sourceWidth2),
          v1250 = clientHeight / Math.max(1, sourceHeight2),
          max92 = Math.max(12, Math.min(sourceHeight2 * 0.56 - 400, sourceHeight2 - 812)),
          v1251 = popupPlacement2({
            width: sourceWidth2,
            height: sourceHeight2,
            panelWidth: 360,
            panelHeight:
              Math.max(
                element490.scrollHeight ? element490.scrollHeight + 2 : 0,
                element490.offsetHeight || 0,
              ) || 400,
            defaultScale: 2,
            defaultTop: max92,
            settings: v1185.getPopupLayout?.(),
          }),
          v1252 = v1251.scale * v1249,
          v1253 = v1251.scale * v1250,
          v1254 = v1251.top * v1250;
        ((element490.style.top = v1254 + "px"),
          (element490.style.right = v1251.right * v1249 + "px"),
          (element490.style.transform = "scale(" + v1252 + "," + v1253 + ")"),
          (element490.style.maxHeight = "none"));
      };
      ((element490.resizeInteraction3d = v1246),
        (value70 = new ResizeObserver(v1246)),
        value70.observe(v1185.root || this.container),
        value70.observe(element490),
        v1185.frame && value70.observe(v1185.frame),
        v1246());
    } else
      this.registerRuntimeDialogScale(
        element536,
        element490,
        840,
        waterHeaterExtensionControls2 ? 560 : 458,
      );
    (element496.addEventListener("click", () => element490.close()),
      this.bindRuntimeDialogOutsideDismiss(element536, element490, element491),
      element536.addEventListener("keydown", (arg711) => {
        arg711.key === "Escape" && element490.close();
      }),
      element490.addEventListener(
        "close",
        () => {
          ((v1218 = true),
            value70?.disconnect(),
            this.clearRuntimeDialogScale(element490),
            this.detailsDialog === element490 && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === element490 && (this.detailsStateSync = null),
            element536.remove());
        },
        {
          once: true,
        },
      ),
      element490.show(),
      element490.resizeInteraction3d?.());
  }
  ["showPresenceDetails"](arg712, { preview: v1255 = false } = {}) {
    const v1256 = arg712.bindings?.entity?.entityId;
    if (!v1256) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    const sensorKind = ["presence", "door-window", "water-leak", "smoke", "natural-gas"].includes(
        arg712.properties?.sensorKind,
      )
        ? arg712.properties.sensorKind
        : "presence",
      element537 = {
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
    let options93 = this.states.get(v1256)?.newState ||
      this.states.get(v1256) || {
        entityId: v1256,
        state: "unknown",
        attributes: {},
      };
    const max93 = Math.max(1, Math.min(168, Number(arg712.properties?.historyHours || 24))),
      list46 = this.historySeries.get(v1256)?.points || [],
      text53 = arg712.properties?.iconOnColor || arg712.properties?.occupiedColor || "#ffffff",
      text54 = arg712.properties?.iconColor || arg712.properties?.clearColor || "#758189",
      v1257 = (arg713, v1258 = Date.now()) =>
        presenceSensorPresentation2(arg713, "auto", {
          ...presenceMotionEventConfig2(
            v1256,
            arg713,
            this.entityMetadata,
            this.states,
            arg712.properties,
          ),
          now: v1258,
        }),
      element538 = document.createElement("dialog");
    ((element538.className = "hb-entity-details-dialog presence-details"),
      (element538.dataset.sensorKind = sensorKind),
      element538.style.setProperty("--hb-presence-occupied", text53),
      element538.style.setProperty("--hb-presence-clear", text54));
    const element539 = document.createElement("div");
    element539.className = "hb-entity-details-card";
    const element540 = document.createElement("div");
    element540.className = "hb-entity-details-heading";
    const element541 = document.createElement("div"),
      element542 = document.createElement("strong");
    element542.textContent = componentDialogTitle(
      arg712,
      options93.attributes?.friendly_name || element537.title,
    );
    const element543 = document.createElement("span");
    element541.append(element542, element543);
    const element544 = document.createElement("button");
    ((element544.type = "button"),
      (element544.textContent = "×"),
      element544.setAttribute("aria-label", "关闭弹窗"),
      element540.append(element541, element544));
    const element545 = document.createElement("div");
    element545.className = "hb-presence-details-body";
    const element546 = document.createElement("section");
    element546.className = "hb-presence-details-visual";
    let value71 = null;
    if (sensorKind === "presence") {
      const element547 = document.createElement("span");
      element547.className = "hb-presence-sensor-space";
      for (let num69 = 0; num69 < 3; num69 += 1) element547.append(document.createElement("i"));
      const element548 = document.createElement("span");
      element548.className = "hb-presence-sensor-floor";
      const element549 = document.createElement("span");
      element549.className = "hb-presence-sensor-person";
      const element550 = document.createElement("i"),
        element551 = document.createElement("b"),
        element552 = document.createElement("span");
      element552.className = "arm left";
      const element553 = document.createElement("span");
      element553.className = "arm right";
      const element554 = document.createElement("span");
      element554.className = "leg left";
      const element555 = document.createElement("span");
      ((element555.className = "leg right"),
        element549.append(element550, element551, element552, element553, element554, element555),
        element546.append(element547, element548, element549));
    } else
      ((value71 = renderRegisteredComponent2(
        {
          ...arg712,
          position: {
            ...(arg712.position || {}),
            width: 100,
            height: 100,
          },
        },
        {
          states: new Map([[v1256, options93]]),
          entityMetadata: this.entityMetadata,
          editable: false,
          previewState: "auto",
          document: this.document,
        },
      )),
        value71.classList.add("hb-presence-details-sensor"),
        element546.append(value71));
    const element556 = document.createElement("strong"),
      element557 = document.createElement("small");
    element546.append(element556, element557);
    const element558 = document.createElement("section");
    element558.className = "hb-presence-details-metrics";
    const v1259 = (arg714) => {
        const element559 = document.createElement("div"),
          element560 = document.createElement("small");
        element560.textContent = arg714;
        const element561 = document.createElement("strong");
        return (
          element559.append(element560, element561),
          element558.append(element559),
          element561
        );
      },
      element562 = v1259("当前状态持续"),
      element563 = v1259("最近检测到人"),
      element564 = v1259(max93 + " 小时有人时长"),
      element565 = document.createElement("section");
    element565.className = "hb-presence-details-timeline";
    const element566 = document.createElement("div"),
      element567 = document.createElement("strong");
    element567.textContent = max93 + " 小时在家时间轴";
    const element568 = document.createElement("span");
    ((element568.textContent = "亮色为有人"), element566.append(element567, element568));
    const element569 = document.createElement("div"),
      element570 = document.createElement("div");
    ((element570.innerHTML = "<span>" + max93 + " 小时前</span><span>现在</span>"),
      element565.append(element566, element569, element570),
      element545.append(element546, element558, element565),
      element539.append(element540, element545),
      element538.append(element539));
    const v1260 = (arg715) => {
        if (!Number.isFinite(arg715)) return "--";
        const date = new Date(arg715),
          date2 = new Date(),
          v1261 =
            date.getFullYear() === date2.getFullYear() &&
            date.getMonth() === date2.getMonth() &&
            date.getDate() === date2.getDate(),
          format = new Intl.DateTimeFormat("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(date);
        return v1261
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
      v1262 = () => {
        const v1263 = presenceHistoryBuckets2(
          list46,
          options93,
          Date.now(),
          max93,
          48,
          presenceMotionEventConfig2(
            v1256,
            options93,
            this.entityMetadata,
            this.states,
            arg712.properties,
          ),
        );
        element569.replaceChildren(
          ...v1263.map((arg716, arg717) => {
            const element571 = document.createElement("i");
            element571.className = "is-" + arg716;
            const round3 = Math.round((max93 * 60 * (v1263.length - arg717 - 1)) / v1263.length);
            return (
              (element571.title =
                (round3 ? round3 + " 分钟前" : "现在") +
                "：" +
                {
                  occupied: "有人",
                  clear: "无人",
                  unavailable: "离线",
                  unknown: "未知",
                }[arg716]),
              element571
            );
          }),
        );
        const v1264 = v1263.filter((arg718) => arg718 === "occupied").length,
          round4 = Math.round((max93 * 60 * v1264) / Math.max(1, v1263.length));
        element564.textContent =
          round4 >= 60
            ? Math.floor(round4 / 60) + " 小时 " + (round4 % 60) + " 分钟"
            : round4 + " 分钟";
      },
      v1265 = () => {
        const v1266 = presenceMotionEventConfig2(
            v1256,
            options93,
            this.entityMetadata,
            this.states,
            arg712.properties,
          ),
          filter17 = list46
            .map((arg719) => ({
              timestamp: Date.parse(arg719?.timestamp),
              state: {
                state: arg719?.value,
              },
            }))
            .filter(
              (arg720) =>
                Number.isFinite(arg720.timestamp) &&
                presenceSensorPresentation2(
                  {
                    state: arg720?.state?.state,
                    lastChanged: new Date(arg720.timestamp).toISOString(),
                  },
                  "auto",
                  {
                    ...v1266,
                    now: arg720.timestamp,
                    noMotionSeconds: null,
                    noMotionStateTimestamp: null,
                  },
                ).key === "occupied",
            ),
          v1267 = presenceStateTimestamp2(options93);
        return (
          v1257(options93).key === "occupied" &&
            Number.isFinite(v1267) &&
            filter17.push({
              timestamp: v1267,
            }),
          filter17.length ? Math.max(...filter17.map((arg721) => arg721.timestamp)) : null
        );
      },
      v1268 = (arg722) => {
        options93 = arg722 || options93;
        const v1269 = v1257(options93),
          v1270 = presenceStateTimestamp2(options93);
        ((element538.dataset.presenceState = v1269.key),
          (element546.className = "hb-presence-details-visual is-" + v1269.key));
        const unknown = element537[v1269.key] || element537.unknown;
        if (
          ((element543.textContent = unknown),
          element543.classList.toggle("is-on", v1269.key === "occupied"),
          (element556.textContent = unknown),
          (element557.textContent =
            v1269.key === "occupied"
              ? element537.hintOccupied
              : v1269.key === "clear"
                ? element537.hintClear
                : v1269.key === "unavailable"
                  ? "设备当前不可用"
                  : ""),
          value71)
        ) {
          const v1271 = {
            "door-window":
              "hb-door-window-sensor is-" + (v1269.key === "occupied" ? "open" : v1269.key),
            "water-leak":
              "hb-water-leak-sensor is-" + (v1269.key === "occupied" ? "wet" : v1269.key),
            smoke: "hb-smoke-sensor is-" + (v1269.key === "occupied" ? "alert" : v1269.key),
            "natural-gas":
              "hb-natural-gas-sensor is-" + (v1269.key === "occupied" ? "alert" : v1269.key),
          }[sensorKind];
          ((value71.className = v1271 + " hb-presence-details-sensor"),
            (value71.dataset.sensorState = v1269.key),
            value71.setAttribute("aria-label", element537.title + "：" + unknown));
        }
        ((element562.textContent = ["unknown", "unavailable"].includes(v1269.key)
          ? "--"
          : formatPresenceDuration2(v1270)),
          (element563.textContent = v1260(v1265())),
          v1262());
      };
    v1268(options93);
    const v1272 = presenceMotionEventConfig2(
        v1256,
        options93,
        this.entityMetadata,
        this.states,
        arg712.properties,
      ),
      map37 = new Map([[v1256, [v1268]]]);
    for (const v1273 of v1272.companionEntityIds) map37.set(v1273, [() => v1268(options93)]);
    const setInterval3 = v1272.motionEvent
        ? window.setInterval(() => v1268(options93), 1000)
        : null,
      element572 = document.createElement("div");
    ((element572.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (element572.tabIndex = -1),
      element572.append(element538),
      this.container.append(element572),
      (this.detailsDialog = element538),
      (this.detailsStateSync = {
        dialog: element538,
        handlers: map37,
      }),
      this.registerRuntimeDialogScale(element572, element538, 760, 560),
      element544.addEventListener("click", () => element538.close()),
      this.bindRuntimeDialogOutsideDismiss(element572, element538, element539),
      element572.addEventListener("keydown", (arg723) => {
        arg723.key === "Escape" && element538.close();
      }),
      element538.addEventListener(
        "close",
        () => {
          (setInterval3 && window.clearInterval(setInterval3),
            this.clearRuntimeDialogScale(element538),
            this.detailsDialog === element538 && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === element538 && (this.detailsStateSync = null),
            element572.remove());
        },
        {
          once: true,
        },
      ),
      element538.show());
  }
  ["showEntityDetails"](arg724, { preview: v1274 = false } = {}) {
    const v1275 = arg724.bindings?.entity?.entityId;
    if (!v1275) throw new Error("该控件没有关联实体。");
    const v1276 = String(v1275),
      deviceProfile9 = this.deviceProfile(v1276);
    arg724 = applyXiaomiDeviceProfile2(arg724, deviceProfile9);
    const v1277 = v1276.split(".", 1)[0],
      v1278 =
        arg724.properties?.deviceType === "electric-bed" ||
        deviceProfile9?.deviceType === "electric-bed";
    if (!this.entityCatalogReady) {
      (this.deferEntityDetailsUntilReady(
        {
          ...arg724,
          properties: {
            ...(arg724.properties || {}),
            __catalogRetry: true,
          },
        },
        v1274,
        v1278 ? "electric-bed-catalog" : "catalog",
      ),
        v1278 &&
          this.showElectricBedLoadingDetails(arg724, {
            preview: v1274,
          }));
      return;
    }
    if (!deviceProfile9 && v1277 === "number" && !arg724.properties?.__catalogRetry) {
      (this.deferEntityDetailsUntilReady(
        {
          ...arg724,
          properties: {
            ...(arg724.properties || {}),
            __catalogRetry: true,
          },
        },
        v1274,
        v1278 ? "electric-bed-catalog" : "catalog",
      ),
        v1278 &&
          this.showElectricBedLoadingDetails(arg724, {
            preview: v1274,
          }));
      return;
    }
    if (v1277 === "water_heater" && !this.waterHeaterDetailsReady(v1276)) {
      this.deferEntityDetailsUntilReady(arg724, v1274);
      return;
    }
    if ((this.cancelPendingEntityDetails(), arg724.type === "presence-sensor")) {
      this.showPresenceDetails(arg724, {
        preview: v1274,
      });
      return;
    }
    if (deviceProfile9?.deviceType === "electric-bed") {
      this.showElectricBedDetails(arg724, {
        preview: v1274,
      });
      return;
    }
    deviceProfile9?.deviceType === "air-purifier" &&
      v1277 === "fan" &&
      ["icon-button", "device-button", "icon-button-effect"].includes(arg724.type) &&
      (arg724 = {
        ...arg724,
        type: "air-purifier",
        properties: {
          ...(arg724.properties || {}),
          deviceType: "air-purifier",
        },
      });
    const v1279 = new Set([
      "line-chart",
      "media-player",
      "air-purifier",
      "air-conditioner",
      "water-heater",
      "vacuum-control",
      "electric-bed",
    ]).has(arg724.type);
    if (arg724.type === "media-player" || (!v1279 && v1277 === "media_player")) {
      this.showMediaPlayerDetails(arg724, {
        preview: v1274,
      });
      return;
    }
    if (arg724.type === "air-purifier") {
      this.showAirPurifierDetails(arg724, {
        preview: v1274,
      });
      return;
    }
    if (
      (["air-conditioner", "bath-heater"].includes(deviceProfile9?.deviceType) &&
        ["climate", "fan"].includes(v1277) &&
        !v1279 &&
        arg724.type !== "air-conditioner" &&
        (arg724 = {
          ...arg724,
          type: "air-conditioner",
        }),
      arg724.type === "vacuum-control" || (!v1279 && v1276.startsWith("vacuum.")))
    ) {
      this.showVacuumDetails(arg724, {
        preview: v1274,
      });
      return;
    }
    const v1280 = this.states.get(v1276),
      v1281 = v1280?.newState || v1280,
      options94 = v1281?.attributes || {},
      v1282 = arg724.type === "line-chart",
      v1283 = !v1282 && v1277 === "cover",
      coverKind2 = ["standard", "dream", "airer"].includes(arg724.properties?.coverKind)
        ? arg724.properties.coverKind
        : "auto",
      v1284 =
        v1283 &&
        coverComponentIsAirer2(arg724, v1276, v1281, this.entityMetadata, this.deviceMetadata),
      v1285 = Number(options94.supported_features || 0),
      v1286 =
        v1276 + " " + (options94.friendly_name || "") + " " + (arg724.properties?.label || ""),
      finite8 = Number.isFinite(Number(options94.current_tilt_position)) || !!(v1285 & 240),
      test3 = /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(v1286),
      v1287 =
        v1283 &&
        !v1284 &&
        (coverKind2 === "dream" || (coverKind2 === "auto" && (finite8 || test3))),
      v1288 = v1287 && finite8,
      text55 =
        (v1284 ? relatedAirerLightEntity2(this.entityMetadata, v1276) : null)?.entityId || "",
      value72 = text55 ? this.states.get(text55) : null;
    let value73 = value72?.newState || value72 || null;
    const text56 =
        (v1284 ? relatedAirerPositionNumberEntity2(this.entityMetadata, v1276) : null)?.entityId ||
        "",
      v1289 = this.states.get(text56),
      value74 = v1289?.newState || v1289 || null,
      text57 =
        (v1284 ? relatedAirerCurrentPositionSensor2(this.entityMetadata, v1276) : null)?.entityId ||
        "",
      text58 =
        (v1284 ? relatedAirerMotorSpeedSensor2(this.entityMetadata, v1276) : null)?.entityId || "",
      v1290 = this.states.get(text58),
      value75 = v1290?.newState || v1290 || null,
      options95 = v1284 ? relatedAirerMotorActionEntities2(this.entityMetadata, v1276) : {},
      entries8 = Object.fromEntries(
        Object.entries(options95).map(([v1291, v1292]) => [v1291, v1292?.entityId || ""]),
      ),
      v1293 = this.states.get(text57 || text56),
      value76 = v1293?.newState || v1293 || null,
      v1294 =
        v1283 && coverMotorIsReversedForComponent2(arg724, this.entityMetadata, this.states, v1276),
      text59 = v1294 ? "open_cover" : "close_cover",
      text60 = v1294 ? "close_cover" : "open_cover",
      coverDirection2 = ["left", "right"].includes(arg724.properties?.coverDirection)
        ? arg724.properties.coverDirection
        : "split",
      v1295 = !v1282 && v1277 === "button",
      includes17 = !v1282 && (v1295 || ["switch", "input_boolean"].includes(v1277)),
      v1296 = arg724.type === "icon-button" && v1277 === "light",
      includes18 =
        !v1282 &&
        (arg724.type === "air-conditioner" ||
          arg724.type === "water-heater" ||
          ["climate", "water_heater"].includes(v1277)),
      text61 = includes18
        ? v1277 === "water_heater" || arg724.type === "water-heater"
          ? "water-heater"
          : resolveClimateDeviceType2(arg724, v1281, v1276)
        : "air-conditioner",
      v1297 = climateDeviceLabel2(text61),
      replace = componentDialogTitle(
        arg724,
        String(options94.friendly_name || "").trim() || v1297,
      ).replace(/(浴霸)(?:\s+浴霸)+$/i, "$1"),
      componentDialogTitle2 = componentDialogTitle(
        arg724,
        String(options94.friendly_name || "").trim() || (v1295 ? "按钮" : "开关"),
      ),
      v1298 = v1296 || includes18 || includes17;
    this.closeRuntimeDialog();
    const v1299 = (arg725, v1300 = options94) =>
        v1295
          ? false
          : v1296 || includes17
            ? arg725 === "on"
            : climateIsPoweredOn2(
                {
                  state: arg725,
                  attributes: v1300,
                },
                text61,
              ),
      element573 = document.createElement("dialog");
    ((element573.className = "hb-entity-details-dialog"),
      (element573.tabIndex = -1),
      element573.classList.toggle("line-chart-details", v1282),
      element573.classList.toggle("light-details", v1296),
      element573.classList.toggle("cover-details", v1283),
      element573.classList.toggle("dream-cover-details", v1287),
      element573.classList.toggle("airer-cover-details", v1284),
      element573.classList.toggle("climate-details", includes18),
      element573.classList.toggle("bath-heater-details", text61 === "bath-heater"),
      element573.classList.toggle("water-heater-details", text61 === "water-heater"),
      element573.classList.toggle("switch-details", includes17),
      element573.classList.toggle("momentary-button-details", v1295));
    const element574 = document.createElement("div");
    element574.className = "hb-entity-details-card";
    const element575 = document.createElement("div");
    element575.className = "hb-entity-details-heading";
    const element576 = document.createElement("div"),
      element577 = document.createElement("strong");
    ((element577.textContent = v1296
      ? componentDialogTitle(arg724, "灯光")
      : v1283
        ? componentDialogTitle(arg724, v1284 ? "晾衣机" : "窗帘")
        : includes18
          ? replace
          : includes17
            ? componentDialogTitle2
            : componentDialogTitle(arg724, "设备详情")),
      element576.append(element577));
    let value77 = null,
      value78 = null,
      v1301 = String(v1281?.state || ""),
      value79 = null,
      value80 = null,
      value81 = null;
    if (v1296) {
      const element578 = document.createElement("span");
      ((element578.textContent = v1281?.state === "on" ? "已开启" : "已关闭"),
        element578.classList.toggle("is-on", v1281?.state === "on"),
        (value77 = element578),
        element576.append(element578));
    } else {
      if (v1283) {
        const element579 = document.createElement("span"),
          v1302 = physicalCoverState2(v1281?.state, v1294),
          v1303 = Number(options94[v1288 ? "current_tilt_position" : "current_position"]),
          options96 = {
            open: "已打开",
            closed: "已关闭",
            opening: "正在打开",
            closing: "正在关闭",
          };
        ((element579.textContent = v1284
          ? pn(v1302) || v1302 || "状态未知"
          : v1287
            ? dreamCurtainStatusText2(v1281?.state, v1303, v1294)
            : options96[v1302] || v1302 || "状态未知"),
          element579.classList.toggle("is-on", v1302 === "open" || v1302 === "opening"),
          (value78 = element579),
          element576.append(element579));
      } else {
        if (includes18 || includes17) {
          const element580 = document.createElement("span"),
            v1304 = v1299(v1281?.state);
          ((element580.textContent = v1295
            ? ["unknown", "unavailable"].includes(v1281?.state)
              ? "当前不可用"
              : "按下执行"
            : text61 === "water-heater"
              ? waterHeaterStatusLabel2(v1281)
              : ["unknown", "unavailable"].includes(v1281?.state)
                ? "当前不可用"
                : v1304
                  ? "已开启"
                  : "已关闭"),
            element580.classList.toggle("is-on", v1304),
            includes18 ? (value79 = element580) : (value80 = element580),
            element576.append(element580));
        } else {
          if (arg724.type === "line-chart") {
            const element581 = document.createElement("span");
            ((element581.textContent =
              v1281?.state == null || ["unknown", "unavailable"].includes(v1281.state)
                ? "暂无数据"
                : "实时数据"),
              (value81 = element581),
              element576.append(element581));
          }
        }
      }
    }
    const element582 = document.createElement("button");
    ((element582.type = "button"),
      element582.setAttribute("aria-label", "关闭实体详情"),
      (element582.textContent = "×"),
      element575.append(element576, element582));
    let v1305 = v1281,
      value82 = null,
      value83 = null,
      value84 = null,
      value85 = null,
      value86 = null,
      value87 = null,
      value88 = null,
      num70 = 0;
    const v1306 = airerPositionCalibration2(this.entityMetadata, this.deviceMetadata, v1276);
    let v1307 = false,
      value89 = null,
      value90 = null,
      value91 = null,
      value92 = null,
      value93 = null,
      v1308 = false,
      value94 = null,
      text62 = "idle",
      text63 = "",
      value95 = null,
      value96 = null,
      set16 = new Set();
    const v1309 = selectedRelatedEntityIds2(arg724),
      set17 = new Set(v1309 || []);
    if (v1296) {
      ((value84 = document.createElement("button")),
        (value84.type = "button"),
        (value84.className = "hb-light-visual"),
        (value84.inert = v1274),
        value84.setAttribute("aria-disabled", String(v1274)));
      const element583 = document.createElement("div");
      element583.className = "hb-light-visual-aura";
      const element584 = document.createElement("div");
      element584.className = "hb-light-visual-lamp";
      for (const v1310 of ["cord", "shade", "bulb", "filament"]) {
        const element585 = document.createElement("i");
        ((element585.className = "hb-light-visual-" + v1310),
          element585.setAttribute("aria-hidden", "true"),
          element584.append(element585));
      }
      const element586 = document.createElement("span");
      ((element586.className = "hb-light-visual-status"),
        value84.append(element583, element584, element586));
      const num71 =
          Number(options94.min_color_temp_kelvin) ||
          (Number.isFinite(Number(options94.max_mireds))
            ? 1000000 / Number(options94.max_mireds)
            : 2000),
        num72 =
          Number(options94.max_color_temp_kelvin) ||
          (Number.isFinite(Number(options94.min_mireds))
            ? 1000000 / Number(options94.min_mireds)
            : 6500),
        NaN7 =
          Number(options94.color_temp_kelvin) ||
          (Number.isFinite(Number(options94.color_temp))
            ? 1000000 / Number(options94.color_temp)
            : NaN),
        v1311 = Number.isFinite(NaN7) ? NaN7 : (num71 + num72) / 2,
        v1312 = lightSupportsColor2(options94),
        options97 = {
          isOn: v1281?.state === "on",
          brightnessPercent: Number.isFinite(Number(options94.brightness))
            ? (Number(options94.brightness) / 255) * 100
            : 100,
          colorTemperatureKelvin: v1311,
          colorRgb: v1312 ? lightColorRgb2(options94) : null,
        },
        v1313 = () => {
          const max94 = Math.max(1, Math.min(100, Number(options97.brightnessPercent) || 1)),
            max95 = Math.max(
              2000,
              Math.min(6500, Number(options97.colorTemperatureKelvin) || 3000),
            ),
            v1314 = (max95 - 2000) / 4500,
            list47 = [255, 132, 42],
            list48 = [172, 225, 255],
            v1315 =
              "rgb(" +
              (
                options97.colorRgb ||
                list47.map((arg726, arg727) =>
                  Math.round(arg726 + (list48[arg727] - arg726) * v1314),
                )
              ).join(",") +
              ")";
          (value84.classList.toggle("is-on", options97.isOn),
            value84.style.setProperty("--hb-light-visual-color", v1315),
            value84.style.setProperty(
              "--hb-light-visual-opacity",
              options97.isOn ? String(0.08 + (max94 / 100) * 0.92) : "0",
            ),
            value84.style.setProperty(
              "--hb-light-visual-blur",
              Math.round(15 + max94 * 1.14) + "px",
            ),
            value84.style.setProperty(
              "--hb-light-visual-scale",
              String(0.62 + (max94 / 100) * 1.05),
            ),
            (element586.textContent = options97.isOn
              ? Math.round(max94) + "%  ·  " + Math.round(max95) + "K"
              : "灯光已关闭"),
            value84.setAttribute("aria-label", element586.textContent));
        };
      ((value85 = (v1316 = {}) => {
        const options98 = v1316.attributes || {};
        (typeof v1316.isOn == "boolean"
          ? (options97.isOn = v1316.isOn)
          : typeof v1316.state == "string" && (options97.isOn = v1316.state === "on"),
          Number.isFinite(Number(v1316.brightnessPercent))
            ? (options97.brightnessPercent = Number(v1316.brightnessPercent))
            : Number.isFinite(Number(options98.brightness)) &&
              (options97.brightnessPercent = (Number(options98.brightness) / 255) * 100),
          Number.isFinite(Number(v1316.colorTemperatureKelvin))
            ? (options97.colorTemperatureKelvin = Number(v1316.colorTemperatureKelvin))
            : Number.isFinite(Number(options98.color_temp_kelvin))
              ? (options97.colorTemperatureKelvin = Number(options98.color_temp_kelvin))
              : Number.isFinite(Number(options98.color_temp)) &&
                (options97.colorTemperatureKelvin = 1000000 / Number(options98.color_temp)),
          Object.hasOwn(v1316, "colorRgb")
            ? (options97.colorRgb = v1316.colorRgb)
            : v1316.attributes && v1312 && (options97.colorRgb = lightColorRgb2(options98)),
          v1313());
      }),
        v1313());
    }
    if (v1283) {
      ((value86 = document.createElement("button")),
        (value86.type = "button"),
        (value86.className = "hb-cover-visual"),
        (value86.inert = v1274),
        value86.setAttribute("aria-disabled", String(v1274)));
      const element587 = document.createElement("i");
      element587.className = "hb-cover-visual-rail";
      const element588 = document.createElement("i");
      element588.className = "hb-cover-visual-panel left";
      const element589 = document.createElement("i");
      element589.className = "hb-cover-visual-panel right";
      const element590 = document.createElement("span");
      element590.className = "hb-cover-visual-slats";
      const num73 = 13;
      for (let num74 = 0; num74 < num73; num74 += 1) {
        const element591 = document.createElement("span");
        element591.className = "hb-cover-visual-slat";
        const element592 = document.createElement("i");
        element591.style.setProperty("--hb-cover-slat-index", String(num74));
        const abs4 =
          coverDirection2 === "right"
            ? num73 - 1 - num74
            : coverDirection2 === "split"
              ? Math.abs((num73 - 1) / 2 - num74)
              : num74;
        element591.style.setProperty("--hb-cover-slat-delay-index", String(abs4));
        const v1317 =
          coverDirection2 === "left"
            ? -num74 * 14.5
            : coverDirection2 === "right"
              ? (num73 - 1 - num74) * 14.5
              : num74 <= (num73 - 1) / 2
                ? -num74 * 14.5
                : (num73 - 1 - num74) * 14.5;
        (element591.style.setProperty("--hb-cover-retracted-shift", v1317 + "px"),
          element591.append(element592),
          element590.append(element591));
      }
      const element593 = document.createElement("i");
      ((element593.className = "hb-cover-visual-window"),
        value86.classList.toggle("is-dream", v1287),
        value86.classList.toggle("is-airer", v1284),
        value86.classList.add("direction-" + coverDirection2),
        value86.append(element593, element587, element588, element589, element590),
        v1284 && xi(value86),
        (value88 = (v1318 = value73) => {
          if (!v1284) return;
          value73 = v1318 || value73;
          const includes19 =
              !text55 || ["unknown", "unavailable"].includes(String(value73?.state || "unknown")),
            v1319 = value73?.state === "on";
          (value86.classList.toggle("is-light-on", v1319 && !includes19),
            value86.classList.toggle("is-light-unavailable", includes19),
            (value86.disabled = v1274 || includes19),
            value86.setAttribute("aria-pressed", String(v1319 && !includes19)),
            value86.setAttribute(
              "aria-label",
              includes19
                ? "晾衣机灯光实体不可用"
                : "晾衣机灯光" + (v1319 ? "已开启，点击关闭" : "已关闭，点击开启"),
            ));
        }),
        value88(),
        (value87 = ({ position: v1320 = 0, state: v1321 = "" } = {}) => {
          const max96 = Math.max(0, Math.min(100, Number(v1320) || 0)),
            v1322 = coverPresentationState2(
              {
                state: v1321,
                attributes: {
                  current_position: max96,
                },
              },
              v1294,
            ),
            v1323 = physicalCoverState2(v1321 || v1301, v1294),
            v1324 = v1323 === "open" || v1323 === "opening";
          ((num70 = max96),
            value86.style.setProperty("--hb-cover-open-position", max96 + "%"),
            value86.style.setProperty("--hb-airer-drop", airerVisualDrop2(max96) + "px"),
            value86.style.setProperty("--hb-cover-panel-width", 45.9 - max96 * 0.331 + "%"),
            value86.style.setProperty("--hb-cover-single-panel-width", 91.8 - max96 * 0.79 + "%"),
            value86.style.setProperty("--hb-cover-slat-angle", max96 * 1.8 + "deg"),
            value86.classList.toggle("is-tilt-reversed", max96 > 50),
            value86.classList.toggle("is-tilt-center", Math.abs(max96 - 50) <= 2),
            value86.classList.toggle(
              "is-open",
              v1287 ? v1324 : v1322 === "open" || v1322 === "opening",
            ),
            value86.classList.toggle("is-moving", v1321 === "opening" || v1321 === "closing"),
            value86.setAttribute(
              "aria-pressed",
              String(v1287 ? v1324 : v1322 === "open" || v1322 === "opening"),
            ),
            v1284 ||
              value86.setAttribute(
                "aria-label",
                v1287
                  ? "" +
                      componentDialogTitle(arg724, "梦幻帘") +
                      dreamCurtainStatusText2(v1321 || v1301, max96, v1294)
                  : "" +
                      componentDialogTitle(arg724, "窗帘") +
                      (v1322 === "open" || v1322 === "opening"
                        ? "已打开，点击关闭"
                        : "已关闭，点击打开"),
              ));
        }),
        value87({
          position: Number.isFinite(
            Number(options94[v1288 ? "current_tilt_position" : "current_position"]),
          )
            ? Number(options94[v1288 ? "current_tilt_position" : "current_position"])
            : v1281?.state === "open"
              ? 100
              : 0,
          state: v1281?.state,
        }),
        value86.addEventListener("click", async () => {
          if (v1274 || v1307) return;
          if (((v1307 = true), value86.setAttribute("aria-busy", "true"), v1284)) {
            const v1325 = value73;
            value88({
              ...(value73 || {}),
              state: value73?.state === "on" ? "off" : "on",
            });
            try {
              await this.callEntityService("homeassistant", "toggle", text55);
            } catch (v1326) {
              (value88(v1325), this.options.onError?.(v1326));
            } finally {
              ((v1307 = false), value86.removeAttribute("aria-busy"));
            }
            return;
          }
          const v1327 = num70,
            v1328 =
              value82?.isDreamCurtainRetracted?.() ?? value86.dataset.curtainRetracted === "true",
            v1329 = v1327 > COVER_CLOSED_POSITION_EPSILON;
          (v1287 && value82?.beginDreamCurtainMotion?.(!v1328),
            v1287 || value82?.beginCoverMotion?.(v1329 ? 0 : 100, v1329 ? "closing" : "opening"));
          try {
            await this.callEntityService(
              "cover",
              v1287 ? dreamCurtainToggleService2(v1328, text60, text59) : v1329 ? text59 : text60,
              v1276,
            );
          } catch (v1330) {
            (v1287
              ? (value82?.cancelDreamCurtainMotion?.(),
                value82?.setDreamCurtainRetracted?.(v1328, false))
              : value82?.cancelCoverMotion?.(),
              value82?.syncCoverState?.(v1281),
              value87({
                position: v1327,
                state: v1281?.state,
              }),
              this.options.onError?.(v1330));
          } finally {
            ((v1307 = false), value86.removeAttribute("aria-busy"));
          }
        }));
    }
    if (includes18) {
      const options99 = {
        entityId: v1276,
        entityMetadata: this.entityMetadata,
        entityTranslations: this.entityTranslations,
      };
      ((value89 = document.createElement("button")),
        (value89.type = "button"),
        (value89.className = "hb-climate-visual"),
        value89.classList.toggle("is-bath-heater", text61 === "bath-heater"),
        value89.classList.toggle("is-water-heater", text61 === "water-heater"),
        (value89.inert = v1274),
        value89.setAttribute("aria-disabled", String(v1274)));
      const element594 = document.createElement("div");
      element594.className = "hb-climate-visual-unit";
      const element595 = document.createElement("span");
      ((element595.className = "hb-climate-visual-brand"),
        (element595.textContent =
          text61 === "bath-heater"
            ? "BATH HEATER"
            : text61 === "water-heater"
              ? "SMART WATER"
              : "SMART AIR"));
      const element596 = document.createElement("strong");
      element596.className = "hb-climate-visual-display";
      const element597 = document.createElement("div");
      element597.className = "hb-climate-visual-vent";
      for (let num75 = 0; num75 < 5; num75 += 1) element597.append(document.createElement("i"));
      element594.append(element595, element596, element597);
      const element598 = document.createElement("div");
      element598.className = "hb-climate-visual-airflow";
      for (let num76 = 0; num76 < 3; num76 += 1) element598.append(document.createElement("i"));
      (value89.append(element594, element598),
        (value90 = ({
          mode: v1331 = "off",
          visualMode: v1332 = "off",
          running: v1333 = false,
          accentColor: v1334 = "#65717a",
          targetTemperature: v1335,
        } = {}) => {
          const v1336 = v1332 !== "off";
          (value89.classList.toggle("is-on", v1336),
            value89.classList.toggle("is-running", v1333),
            value89.classList.toggle(
              "is-airflow-mode",
              text61 === "bath-heater" && v1336 && bathHeaterModeUsesAirflow2(v1331),
            ),
            (value89.dataset.visualMode = v1332),
            value89.style.setProperty("--hb-climate-visual-accent", v1334));
          const finite9 = v1335 != null && v1335 !== "" && Number.isFinite(Number(v1335));
          element596.textContent = v1336
            ? finite9
              ? Number(v1335) + "°"
              : climateModeLabel2(v1331, text61, options99)
            : "OFF";
        }));
    }
    if (includes17) {
      const hn4 = hn({
        label: componentDialogTitle2,
        interactive: !v1274,
        momentary: v1295,
        onToggle: () => value93?.(),
      });
      ((value91 = hn4.visual),
        (value92 = hn4.sync),
        value92(v1299(v1281?.state), {
          unavailable: ["unknown", "unavailable"].includes(v1281?.state),
        }));
    }
    const element599 = document.createElement(v1298 ? "button" : "div");
    ((element599.className = "hb-entity-details-state"), v1298 && (element599.type = "button"));
    const element600 = document.createElement("span");
    element600.textContent = v1298 ? "⏻" : "当前状态";
    const element601 = document.createElement("strong"),
      options100 = {
        off: "关闭",
        auto: "自动",
        cool: "制冷",
        dry: "除湿",
        heat: "制热",
        fan_only: "送风",
        heat_cool: "冷暖自动",
      };
    ((element601.textContent = v1298
      ? v1281?.state
        ? v1299(v1281.state)
          ? "已开启"
          : "已关闭"
        : "状态未知"
      : v1277 === "climate"
        ? options100[v1281?.state] || v1281?.state || "暂无状态"
        : (v1281?.state ?? "暂无状态")),
      element599.classList.toggle("hb-light-details-power", v1296),
      element599.classList.toggle("hb-climate-details-power", includes18),
      element599.classList.toggle("hb-switch-details-power", includes17),
      element599.classList.toggle("is-on", v1298 && v1299(v1281?.state)),
      element599.append(element600, element601),
      v1298 &&
        ((element599.inert = v1274),
        element599.setAttribute("aria-disabled", String(v1274)),
        (value83 = (arg728, { unavailable: v1337 = false, syncClimate: v1338 = true } = {}) => {
          if (
            (element599.classList.toggle("is-on", arg728),
            element599.classList.toggle("is-unavailable", v1337),
            element599.setAttribute("aria-pressed", String(arg728)),
            (element599.disabled = v1337 || v1274),
            (element601.textContent = v1337
              ? "当前不可用"
              : v1295
                ? text62 === "success"
                  ? "执行成功"
                  : v1308
                    ? "执行中"
                    : "等待执行"
                : arg728
                  ? "已开启"
                  : "已关闭"),
            element599.setAttribute(
              "aria-label",
              v1337
                ? (v1296
                    ? componentDialogTitle(arg724, "灯光")
                    : includes18
                      ? replace
                      : componentDialogTitle2) + "当前不可用"
                : v1295
                  ? "" +
                    componentDialogTitle2 +
                    (text62 === "success" ? "执行成功" : v1308 ? "正在执行" : "，点击执行")
                  : "" +
                    componentDialogTitle(arg724, v1296 ? "灯光" : includes18 ? v1297 : "开关") +
                    (arg728 ? "已开启，点击关闭" : "已关闭，点击开启"),
            ),
            v1296 &&
              (value85?.({
                isOn: arg728,
              }),
              (value77.textContent = arg728 ? "已开启" : "已关闭"),
              value77.classList.toggle("is-on", arg728),
              value84.setAttribute("aria-pressed", String(arg728)),
              value84.setAttribute(
                "aria-label",
                "" +
                  componentDialogTitle(arg724, "灯光") +
                  (arg728 ? "已开启，点击关闭" : "已关闭，点击开启"),
              )),
            includes18 && value82?.syncClimateState && v1338)
          ) {
            const v1339 = normalizeClimateCapabilities2(v1305 || v1281),
              text64 =
                text61 === "water-heater"
                  ? v1339.operationModes.find(
                      (arg729) => !["off", "空"].includes(String(arg729).trim().toLowerCase()),
                    ) || "普通"
                  : v1339.hvacModes.find((arg730) => arg730 !== "off") ||
                    (text61 === "bath-heater" ? "heat" : "auto"),
              state3 =
                value82.dataset.lastClimateMode ||
                (v1281?.state && v1281.state !== "off" ? v1281.state : text64);
            value82.syncClimateState({
              state: arg728 ? (text61 === "water-heater" ? "on" : state3) : "off",
              attributes: {
                ...(v1305?.attributes || v1281?.attributes || {}),
                operation_mode:
                  text61 === "water-heater"
                    ? arg728
                      ? v1305?.attributes?.operation_mode || text64
                      : "off"
                    : undefined,
                hvac_action:
                  text61 === "water-heater"
                    ? undefined
                    : arg728
                      ? v1281?.attributes?.hvac_action || state3
                      : "off",
              },
            });
          }
          (includes18 &&
            ((value79.textContent =
              text61 === "water-heater"
                ? waterHeaterStatusLabel2({
                    ...(v1305 || v1281 || {}),
                    state: arg728 ? "on" : "off",
                  })
                : arg728
                  ? "已开启"
                  : "已关闭"),
            value79.classList.toggle("is-on", arg728),
            text61 === "bath-heater"
              ? (value95 || value89.setAttribute("aria-pressed", "false"),
                value89.setAttribute("aria-label", replace + "，点击切换浴霸灯"))
              : (value89.setAttribute("aria-pressed", String(arg728)),
                value89.setAttribute(
                  "aria-label",
                  "" + replace + (arg728 ? "已开启，点击关闭" : "已关闭，点击开启"),
                ))),
            includes17 &&
              (value92?.(arg728, {
                pending: v1308 && text62 !== "success",
                success: text62 === "success",
                unavailable: v1337,
              }),
              (value80.textContent = v1337
                ? "当前不可用"
                : v1295
                  ? text62 === "success"
                    ? "执行成功"
                    : v1308
                      ? "正在执行"
                      : "按下执行"
                  : arg728
                    ? "已开启"
                    : "已关闭"),
              value80.classList.toggle(
                "is-on",
                (v1295 ? v1308 || text62 === "success" : arg728) && !v1337,
              )));
        }),
        v1281?.state &&
          value83(v1299(v1281.state), {
            unavailable: ["unknown", "unavailable"].includes(v1281.state),
          }),
        (value93 = async () => {
          if (v1274 || v1308 || !v1305?.state) return;
          v1308 = true;
          const v1340 = v1296 ? value84 : includes18 ? value89 : value91;
          v1340?.setAttribute("aria-busy", "true");
          const contains2 = element599.classList.contains("is-on"),
            v1341 = v1295 || !contains2;
          value83(v1341);
          try {
            if (v1295)
              (await this.callEntityService("button", "press", v1276),
                (text62 = "success"),
                value83(false),
                await new Promise((arg731) => window.setTimeout(arg731, 900)));
            else {
              if (includes18) {
                if (!v1341 && text61 === "bath-heater") {
                  const v1342 = normalizeClimateCapabilities2(v1305).presetModes.find((arg732) =>
                    ["idle", "standby", "待机", "关闭"].includes(
                      String(arg732).trim().toLowerCase(),
                    ),
                  );
                  v1342 &&
                    (await this.callEntityService(
                      v1277 === "fan" ? "fan" : "climate",
                      "set_preset_mode",
                      v1276,
                      {
                        preset_mode: v1342,
                      },
                    ));
                }
                const v1343 = climatePowerCommand2(
                  v1276,
                  v1305,
                  v1341,
                  text61,
                  value82?.dataset.lastClimateMode || "",
                );
                await this.callEntityService(v1343.domain, v1343.service, v1276, v1343.data);
              } else await this.callEntityService("homeassistant", "toggle", v1276);
            }
          } catch (v1344) {
            ((text62 = "idle"), value83(contains2), this.options.onError?.(v1344));
          } finally {
            ((v1308 = false),
              v1295
                ? ((text62 = "idle"), value83(false))
                : includes17 && value92?.(element599.classList.contains("is-on")),
              v1340?.removeAttribute("aria-busy"));
          }
        }),
        element599.addEventListener("click", value93),
        v1296 && value84.addEventListener("click", value93),
        includes18 &&
          value89.addEventListener("click", () => {
            if (text61 === "bath-heater") {
              value95?.toggleBathLight
                ? value95.toggleBathLight()
                : this.options.onError?.(new Error("未找到与浴霸同设备的灯光实体。"));
              return;
            }
            value93();
          })));
    const value97 = includes18
      ? (arg733) =>
          this.createClimateDetailsControls(v1276, arg733, {
            interactive: !v1274,
            deviceType: text61,
            onPowerChange: (arg734) =>
              value83?.(arg734, {
                syncClimate: false,
              }),
            onVisualChange: ({
              mode: v1345,
              visualMode: v1346,
              running: v1347,
              accentColor: v1348,
              accentSoft: v1349,
              targetTemperature: v1350,
            }) => {
              (element599.classList.toggle("is-running", v1347),
                element599.style.setProperty("--hb-climate-accent", v1348),
                element599.style.setProperty("--hb-climate-accent-soft", v1349),
                value79.style.setProperty("--hb-climate-accent", v1348),
                text61 === "water-heater" &&
                  (value79.textContent =
                    v1346 === "off" ? "已关闭" : v1347 ? "正在加热" : "保温中"),
                value90?.({
                  mode: v1345,
                  visualMode: v1346,
                  running: v1347,
                  accentColor: v1348,
                  targetTemperature: v1350,
                }));
            },
            modeColors: {
              cool: arg724.properties?.airflowCoolColor || "#73c8ff",
              heat: arg724.properties?.airflowHeatColor || "#ff8a65",
              other: arg724.properties?.airflowOtherColor || "#dce2e6",
            },
          })
      : null;
    ((value82 = v1296
      ? this.createLightDetailsControls(v1276, v1281, {
          interactive: !v1274,
          onTurnOn: () => value83?.(true),
          onVisualChange: (arg735) => value85?.(arg735),
        })
      : includes18
        ? value97(v1281)
        : v1283
          ? this.createCoverDetailsControls(v1276, v1281, {
              interactive: !v1274,
              dream: v1287,
              airer: v1284,
              tilt: v1288,
              motorReversed: v1294,
              positionState: value76,
              positionCommandEntityId: text56,
              positionCommandState: value74,
              motorState: value75,
              airerActionEntityIds: entries8,
              positionCalibration: v1306,
              onVisualChange: ({ position: v1351, state: v1352 }) => {
                (v1352 && (v1301 = v1352),
                  value87?.({
                    position: v1351,
                    state: v1352,
                  }));
                const v1353 = coverPresentationState2(
                    {
                      state: v1352,
                      attributes: {
                        current_position: v1351,
                      },
                    },
                    v1294,
                  ),
                  options101 = {
                    open: "已打开",
                    closed: "已关闭",
                    opening: "正在打开",
                    closing: "正在关闭",
                  },
                  v1354 = physicalCoverState2(v1301, v1294);
                ((value78.textContent = v1284
                  ? pn(v1353) || Math.round(v1351) + "%"
                  : v1287
                    ? dreamCurtainStatusText2(v1301, v1351, v1294)
                    : options101[v1353] || Math.round(v1351) + "%"),
                  value78.classList.toggle(
                    "is-on",
                    v1287
                      ? v1354 === "open" || v1354 === "opening"
                      : v1353 === "open" || v1353 === "opening",
                  ));
              },
              onCurtainPositionChange: ({ retracted: v1355, moving: v1356 }) => {
                (value86.classList.toggle("is-curtain-retracted", v1355),
                  value86.classList.toggle("is-curtain-moving", v1356),
                  (value86.dataset.curtainRetracted = String(v1355)),
                  v1287 &&
                    ((value78.textContent = dreamCurtainStatusFromRetraction2(v1355, v1356, num70)),
                    value78.classList.toggle("is-on", v1355)));
              },
            })
          : null),
      v1296 &&
        value82?.classList.contains("has-color-picker") &&
        element573.classList.add("color-picker-details"),
      includes18 &&
        text61 === "water-heater" &&
        value82 &&
        value89 &&
        (value82.prepend(value89), value82.syncClimateGrid?.()));
    const text65 = (includes18 && text61 === "bath-heater" && deviceProfile9?.roles?.light) || "";
    if (
      ((text63 =
        (text65
          ? this.entityMetadata.get(text65)
          : includes18 && text61 === "bath-heater"
            ? relatedDeviceDomainEntity2(this.entityMetadata, v1276, "light")
            : null
        )?.entityId || ""),
      text63 && value82)
    ) {
      const v1357 = this.states.get(text63),
        options102 = v1357?.newState ||
          v1357 || {
            state: "unknown",
            attributes: {},
          };
      ((value95 = this.createBathHeaterLightControl(text63, options102, {
        interactive: !v1274,
        onStateChange: ({ isOn: v1358, unavailable: v1359 }) => {
          (value89?.classList.toggle("is-light-on", v1358 && !v1359),
            value89?.setAttribute("aria-pressed", String(v1358 && !v1359)));
        },
      })),
        value82.append(value95),
        value82.syncClimateGrid?.());
    }
    const value98 =
      includes18 && (text61 === "water-heater" || v1309 !== null)
        ? () => {
            const v1360 = set16,
              waterHeaterExtensionControls3 = this.createWaterHeaterExtensionControls(v1276, {
                component: arg724,
                interactive: !v1274,
                excludedEntityIds: text63 ? [text63] : [],
              });
            (value96?.remove(),
              (value96 = waterHeaterExtensionControls3),
              (set16 = new Set(waterHeaterExtensionControls3?.relatedEntityIds || [])),
              value82?.classList.toggle(
                "has-multiline-water-heater-extensions",
                text61 === "water-heater" &&
                  Number(waterHeaterExtensionControls3?.dataset?.controlCount || 0) > 2,
              ),
              text61 !== "water-heater" &&
                element574.isConnected &&
                element573.classList.toggle(
                  "has-related-extensions",
                  !!waterHeaterExtensionControls3,
                ),
              waterHeaterExtensionControls3 &&
                value82 &&
                (text61 === "water-heater"
                  ? ((value82.waterHeaterControlPanel || value82).append(
                      waterHeaterExtensionControls3,
                    ),
                    value82.syncClimateGrid?.())
                  : element574.isConnected &&
                    (element574.append(waterHeaterExtensionControls3),
                    element573.classList.add("has-related-extensions"))));
            const map38 = this.detailsStateSync?.handlers;
            if (map38) {
              for (const v1361 of v1360) map38.delete(v1361);
              for (const [v1362, v1363] of waterHeaterExtensionControls3?.stateHandlers || []) {
                map38.set(v1362, v1363);
                const v1364 = this.states.get(v1362);
                if (v1364) {
                  for (const v1365 of v1363) v1365(v1364.newState || v1364);
                }
              }
            }
          }
        : null;
    value98?.();
    let value99 =
        arg724.type === "line-chart"
          ? renderLineChartDetails2(arg724, {
              states: this.states,
              history: this.historySeries,
              renderNamespace: this.renderNamespace,
            })
          : null,
      value100 = null,
      value101 = null,
      value102 = null;
    const element602 = document.createElement("dl");
    element602.className = "hb-entity-details-attributes";
    for (const [v1366, v1367] of Object.entries(options94).filter(
      ([v1368]) => v1368 !== "friendly_name",
    )) {
      const element603 = document.createElement("div"),
        element604 = document.createElement("dt");
      element604.textContent = v1366;
      const element605 = document.createElement("dd");
      ((element605.textContent = typeof v1367 == "string" ? v1367 : JSON.stringify(v1367)),
        element603.append(element604, element605),
        element602.append(element603));
    }
    if (value99) {
      ((value100 = document.createElement("section")),
        (value100.className = "hb-line-chart-current-visual"),
        value100.style.setProperty(
          "--hb-chart-current-color",
          value99.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
        ),
        (value101 = document.createElement("strong")));
      const float2 = Number.parseFloat(v1281?.state);
      ((value101.textContent = Number.isFinite(float2)
        ? formatLineChartValue2(float2, arg724.properties?.statePrecision)
        : v1281?.state || "--"),
        (value102 = document.createElement("small")),
        (value102.textContent = String(options94.unit_of_measurement || "实时数值")),
        value100.append(value101, value102),
        element599.style.setProperty(
          "--hb-chart-current-color",
          value99.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
        ),
        (element600.textContent = "●"),
        (element601.textContent = "实时数据"),
        element574.append(element575, value100, value99));
    } else {
      if (includes18)
        (element574.append(
          element575,
          ...(text61 === "water-heater" ? [value82] : [value89, value82]),
          ...(text61 !== "water-heater" && value96 ? [value96] : []),
        ),
          element573.classList.toggle(
            "has-related-extensions",
            text61 !== "water-heater" && !!value96,
          ));
      else {
        if (v1296) {
          const element606 = document.createElement("div");
          element606.className = "hb-light-details-layout";
          const element607 = document.createElement("section");
          ((element607.className = "hb-light-details-panel"),
            element607.append(...(value82 ? [value82] : [])),
            element606.append(element607, value84),
            element574.append(element575, element606));
        } else {
          if (includes17) {
            const element608 = document.createElement("div");
            ((element608.className = "hb-switch-details-layout"),
              element608.append(value91),
              element574.append(element575, element608));
          } else {
            if (v1283) {
              const element609 = document.createElement("div");
              element609.className = "hb-cover-details-layout";
              const element610 = document.createElement("section");
              ((element610.className = "hb-cover-details-panel"),
                element610.append(...(value82 ? [value82] : [])),
                element609.append(element610, value86),
                element574.append(element575, element609));
            } else {
              if (element602.childElementCount)
                element574.append(
                  element575,
                  element599,
                  ...(value82 ? [value82] : []),
                  element602,
                );
              else {
                const element611 = document.createElement("p");
                ((element611.className = "hb-entity-details-empty"),
                  (element611.textContent = "该实体暂无附加属性。"),
                  element602.replaceWith(element611),
                  element574.append(
                    element575,
                    element599,
                    ...(value82 ? [value82] : []),
                    element611,
                  ));
              }
            }
          }
        }
      }
    }
    element573.append(element574);
    const element612 = document.createElement("div");
    ((element612.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (element612.tabIndex = -1),
      element612.append(element573),
      this.container.append(element612),
      (this.detailsDialog = element573));
    const num77 = includes18
        ? 840
        : arg724.type === "line-chart"
          ? 780
          : v1296 || v1283
            ? 760
            : includes17
              ? 620
              : 460,
      num78 = includes18
        ? text61 !== "water-heater" && value96
          ? 620
          : 540
        : v1296 || v1283
          ? 620
          : includes17
            ? 500
            : 680;
    this.registerRuntimeDialogScale(element612, element573, num77, num78);
    let num79 = 0;
    if (arg724.type === "line-chart" && value99) {
      const v1369 = () => {
          if (((num79 = 0), !value99?.isConnected || this.detailsStateSync?.dialog !== element573))
            return;
          const v1370 = renderLineChartDetails2(arg724, {
            states: this.states,
            history: this.historySeries,
            renderNamespace: this.renderNamespace,
          });
          (value99.cleanupLineChartHover?.(),
            value99.replaceWith(v1370),
            (value99 = v1370),
            value100.style.setProperty(
              "--hb-chart-current-color",
              value99.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
            ));
        },
        v1371 = (v1372 = 700) => {
          num79 || (num79 = window.setTimeout(v1369, Math.max(0, Number(v1372) || 0)));
        };
      this.detailsStateSync = {
        dialog: element573,
        entityId: v1276,
        refreshHistory: () => v1371(0),
        apply: (arg736) => {
          const float3 = Number.parseFloat(arg736?.state);
          ((value101.textContent = Number.isFinite(float3)
            ? formatLineChartValue2(float3, arg724.properties?.statePrecision)
            : arg736?.state || "--"),
            (value102.textContent = String(arg736?.attributes?.unit_of_measurement || "实时数值")),
            (value81.textContent =
              arg736?.state == null || ["unknown", "unavailable"].includes(arg736.state)
                ? "暂无数据"
                : "实时数据"),
            value99.syncLineChartState?.(arg736),
            value100.style.setProperty(
              "--hb-chart-current-color",
              value99.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
            ));
        },
      };
    } else {
      if (v1298 && value83) {
        const v1373 = (arg737) => {
            if (((v1305 = arg737), includes18 && value97 && value82)) {
              const v1374 = climateControlStructureKey2(v1276, arg737, text61);
              if (value82.dataset.climateStructureKey !== v1374) {
                const element613 = value97(arg737);
                (element613.classList.toggle(
                  "has-multiline-water-heater-extensions",
                  value82.classList.contains("has-multiline-water-heater-extensions"),
                ),
                  element613.classList.add("is-runtime-hydrated"),
                  text61 === "water-heater" && value89 && element613.prepend(value89),
                  value95 && (element613.append(value95), element613.syncClimateGrid?.()),
                  value96 &&
                    text61 === "water-heater" &&
                    ((element613.waterHeaterControlPanel || element613).append(value96),
                    element613.syncClimateGrid?.()),
                  value82.replaceWith(element613),
                  (value82 = element613));
              }
            }
            (arg737?.state &&
              value83(v1299(arg737.state, arg737.attributes), {
                unavailable: ["unknown", "unavailable"].includes(arg737.state),
              }),
              value82?.syncLightState?.(arg737),
              value82?.syncClimateState?.(arg737));
          },
          map39 = new Map([[v1276, [v1373]]]);
        if (
          (text63 &&
            value95 &&
            map39.set(text63, [(arg738) => value95.syncBathLightState?.(arg738)]),
          value96?.stateHandlers)
        ) {
          for (const [v1375, v1376] of value96.stateHandlers) map39.set(v1375, v1376);
        }
        if (
          ((this.detailsStateSync = {
            dialog: element573,
            handlers: map39,
            refreshEntityCatalog: value98,
          }),
          includes18 && value82?.querySelector(".hb-climate-details-loading"))
        ) {
          const now7 = Date.now();
          value94 = window.setInterval(() => {
            const v1377 = this.states.get(v1276),
              v1378 = v1377?.newState || v1377;
            (v1378 && v1373(v1378),
              (!value82?.querySelector(".hb-climate-details-loading") ||
                Date.now() - now7 >= 30000) &&
                (window.clearInterval(value94), (value94 = null)));
          }, 120);
        }
      } else {
        if (v1283) {
          const map40 = new Map([[v1276, [(arg739) => value82?.syncCoverState?.(arg739)]]]);
          (text55 && map40.set(text55, [value88]),
            text57 && map40.set(text57, [(arg740) => value82?.syncCoverPositionState?.(arg740)]),
            text56 &&
              map40.set(text56, [
                (arg741) => {
                  (value82?.syncCoverPositionCommandState?.(arg741),
                    text57 || value82?.syncCoverPositionState?.(arg741));
                },
              ]),
            text58 && map40.set(text58, [(arg742) => value82?.syncAirerMotorState?.(arg742)]),
            (this.detailsStateSync = {
              dialog: element573,
              handlers: map40,
            }));
        }
      }
    }
    (element582.addEventListener("click", () => element573.close()),
      this.bindRuntimeDialogOutsideDismiss(element612, element573, element574),
      element612.addEventListener("keydown", (arg743) => {
        arg743.key === "Escape" && element573.close();
      }),
      element573.addEventListener(
        "close",
        () => {
          (window.clearTimeout(num79),
            window.clearInterval(value94),
            (value94 = null),
            value82?.cleanupLightDetails?.(),
            value82?.cleanupClimateDetails?.(),
            value82?.cleanupCoverDetails?.(),
            value99?.cleanupLineChartHover?.(),
            this.clearRuntimeDialogScale(element573),
            this.detailsDialog === element573 && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === element573 && (this.detailsStateSync = null),
            element612.remove());
        },
        {
          once: true,
        },
      ),
      element573.show(),
      element573.focus({
        preventScroll: true,
      }));
  }
  ["resize"]() {
    if (!this.viewport || !this.document) return;
    const clientWidth2 = this.container.clientWidth,
      clientHeight2 = this.container.clientHeight;
    if (!clientWidth2 || !clientHeight2) return;
    const v1379 = clientWidth2 / this.document.canvas.width,
      v1380 = clientHeight2 / this.document.canvas.height,
      text66 = this.options.scaleMode || this.document.canvas.scaleMode || "contain",
      max97 = text66 === "cover" ? Math.max(v1379, v1380) : Math.min(v1379, v1380),
      v1381 = text66 === "stretch" ? v1379 : max97,
      v1382 = text66 === "stretch" ? v1380 : max97;
    ((this.appliedScaleX = v1381),
      (this.appliedScaleY = v1382),
      (this.canvas.style.transform = "scale(" + v1381 + ", " + v1382 + ")"),
      (this.viewport.style.width = this.document.canvas.width * v1381 + "px"),
      (this.viewport.style.height = this.document.canvas.height * v1382 + "px"),
      (this.container.dataset.viewportAspect = (clientWidth2 / clientHeight2).toFixed(3)),
      (this.container.dataset.renderScale = Math.min(v1381, v1382).toFixed(4)));
    for (const [v1383, v1384] of this.componentHosts)
      this.updateTransformHandleScale(v1384, this.componentRecords.get(v1383));
    (this.updateMultiSelectionHandleScale(
      this.canvas.querySelector(":scope > .hb-multi-selection-bounds"),
    ),
      this.updateRuntimeDialogScale());
  }
  ["pauseRuntimeFlowLines"]() {
    this.runtimeSnapshotReady = false;
    for (const [v1385, v1386] of this.componentRecords || [])
      v1386.type === "flow-line" &&
        v1386.properties?.controlMode === "entity-sign" &&
        this.componentHosts
          ?.get(v1385)
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
    let v1387;
    const v1388 = () => {
        (window.clearTimeout(v1387),
          socket.removeEventListener("open", v1389),
          socket.removeEventListener("close", v1388));
      },
      v1389 = () => {
        (v1388(), socket.readyState < WebSocket.CLOSING && socket.close());
      };
    (socket.addEventListener("open", v1389, {
      once: true,
    }),
      socket.addEventListener("close", v1388, {
        once: true,
      }),
      (v1387 = window.setTimeout(v1389, 12000)));
  }
  ["connectRuntime"]({ force: v1390 = false } = {}) {
    if (!this.document || this.destroyed) {
      this.disconnectRuntime();
      return;
    }
    const page = this.page || this.document.pages?.[0],
      map41 = new Map((this.document.sharedComponents || []).map((arg744) => [arg744.id, arg744])),
      list49 = [
        ...(page?.sharedComponentIds || []).map((arg745) => map41.get(arg745)).filter(Boolean),
        ...(page?.components || []),
      ],
      vector10 = collectEntityIds2(list49),
      value103 = this.activePopupId
        ? (this.document.customPopups || []).find(
            (arg746) => String(arg746.id || "") === this.activePopupId,
          )
        : null;
    for (const v1391 of value103?.modules || [])
      v1391.entityId && !isVirtualEntityId2(v1391.entityId) && vector10.add(v1391.entityId);
    for (const v1392 of [...vector10]) {
      if (this.entityMetadata.get(v1392)?.domain !== "event") continue;
      const v1393 = collectComponents2(
        list49,
        (arg747) =>
          arg747.type === "presence-sensor" && arg747.bindings?.entity?.entityId === v1392,
      )[0];
      if (!v1393) continue;
      const v1394 = presenceMotionEventConfig2(
        v1392,
        this.states.get(v1392),
        this.entityMetadata,
        this.states,
        v1393.properties,
      );
      for (const v1395 of v1394.companionEntityIds) vector10.add(v1395);
    }
    for (const v1396 of [...vector10]) {
      const v1397 = this.entityMetadata.get(v1396);
      if (
        v1397?.domain !== "sensor" ||
        !v1397.deviceId ||
        !["state", "status", "task_status"].includes(v1397.translationKey)
      )
        continue;
      const v1398 = [...this.entityMetadata.values()].find(
        (arg748) =>
          arg748.deviceId === v1397.deviceId &&
          arg748.domain === "vacuum" &&
          entityMetadataIsAvailable2(arg748),
      );
      v1398?.entityId && vector10.add(v1398.entityId);
    }
    for (const list50 of [...vector10]) {
      if (this.entityMetadata.get(list50)?.domain !== "vacuum") continue;
      const slice7 = list50.slice(list50.indexOf(".") + 1),
        v1399 = relatedDeviceEntity2(
          this.entityMetadata,
          list50,
          "select",
          "cleaning_mode",
          "select." + slice7 + "_cleaning_mode",
        );
      v1399?.entityId && vector10.add(v1399.entityId);
      const v1400 = relatedVacuumBatteryEntity2(this.entityMetadata, this.states, list50);
      v1400?.entityId && vector10.add(v1400.entityId);
      for (const v1401 of relatedVacuumStatusEntities2(this.entityMetadata, list50))
        vector10.add(v1401.entityId);
    }
    for (const v1402 of [...vector10]) {
      if (
        (this.entityMetadata.get(v1402)?.domain || String(v1402 || "").split(".", 1)[0]) !== "cover"
      )
        continue;
      const v1403 = relatedCoverMotorReverseEntity2(this.entityMetadata, v1402);
      v1403?.entityId && vector10.add(v1403.entityId);
      const v1404 = relatedAirerLightEntity2(this.entityMetadata, v1402);
      v1404?.entityId && vector10.add(v1404.entityId);
      const v1405 = relatedAirerPositionNumberEntity2(this.entityMetadata, v1402);
      v1405?.entityId && vector10.add(v1405.entityId);
      const v1406 = relatedAirerCurrentPositionSensor2(this.entityMetadata, v1402);
      v1406?.entityId && vector10.add(v1406.entityId);
      const v1407 = relatedAirerMotorSpeedSensor2(this.entityMetadata, v1402);
      v1407?.entityId && vector10.add(v1407.entityId);
      const v1408 = relatedAirerMotorActionEntities2(this.entityMetadata, v1402);
      for (const v1409 of Object.values(v1408)) v1409?.entityId && vector10.add(v1409.entityId);
    }
    for (const v1410 of [...vector10]) {
      const v1411 = this.entityMetadata.get(v1410);
      if (!["climate", "fan"].includes(String(v1411?.domain || ""))) continue;
      const v1412 = relatedDeviceDomainEntity2(this.entityMetadata, v1410, "light");
      v1412?.entityId && vector10.add(v1412.entityId);
    }
    for (const v1413 of [...vector10])
      if (this.entityMetadata.get(v1413)?.domain === "water_heater") {
        for (const v1414 of relatedWaterHeaterEntities2(this.entityMetadata, v1413))
          vector10.add(v1414.entityId);
      }
    for (const v1415 of [...vector10]) {
      const deviceProfile10 = this.deviceProfile(v1415);
      if (deviceProfile10)
        for (const v1416 of [
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
          const v1417 = deviceProfile10.roles?.[v1416];
          v1417 && vector10.add(v1417);
        }
    }
    const list51 = [...vector10];
    if (!list51.length) {
      (this.disconnectRuntime(), (this.runtimeHydrationRetryAttempt = 0));
      return;
    }
    if (list51.length > un) {
      this.disconnectRuntime();
      const v1418 = String(list51.length);
      this.runtimeEntityLimitSignature !== v1418 &&
        ((this.runtimeEntityLimitSignature = v1418),
        this.options.onError?.(
          new Error(
            "当前项目需要实时订阅 " +
              list51.length +
              " 个实体，已超过 " +
              un +
              " 个上限。请减少统计或控件中绑定的实体。",
          ),
        ));
      return;
    }
    this.runtimeEntityLimitSignature = "";
    const stringify3 = JSON.stringify([...list51].sort()),
      runtimeSubscription = this.runtimeSubscription,
      v1419 = this.socket?.readyState === WebSocket.CONNECTING,
      v1420 = this.socket?.readyState === WebSocket.OPEN;
    if (
      !v1390 &&
      runtimeSubscription &&
      (v1419 || (v1420 && runtimeSubscription.signature === stringify3))
    ) {
      ((runtimeSubscription.entityIds = list51),
        (runtimeSubscription.runtimeComponents = list49),
        (runtimeSubscription.signature = stringify3),
        v1420 && this.scheduleRuntimeHydrationRetry(runtimeSubscription, this.socketGeneration));
      return;
    }
    (runtimeSubscription?.signature !== stringify3 && (this.runtimeHydrationRetryAttempt = 0),
      this.disconnectRuntime());
    const socketGeneration = this.socketGeneration,
      options103 = {
        entityIds: list51,
        runtimeComponents: list49,
        signature: stringify3,
      };
    this.runtimeSubscription = options103;
    const text67 = window.location.protocol === "https:" ? "wss" : "ws",
      webSocket = new WebSocket(text67 + "://" + window.location.host + "/api/v1/ws/runtime");
    ((this.socket = webSocket),
      webSocket.addEventListener("open", () => {
        socketGeneration === this.socketGeneration &&
          (this.reconnectAttempt > 0 &&
            window.HABridgeLog?.report("success", "实时连接", "实时状态连接已恢复", {
              phase: "websocket-reconnected",
              path: "/api/v1/ws/runtime",
            }),
          (this.reconnectAttempt = 0),
          webSocket.send(
            JSON.stringify({
              type: "subscribe",
              entityIds: options103.entityIds,
            }),
          ));
      }),
      webSocket.addEventListener("message", (arg749) => {
        if (socketGeneration !== this.socketGeneration) return;
        const { entityIds: v1421 } = options103;
        let v1422;
        try {
          v1422 = JSON.parse(arg749.data);
        } catch (v1423) {
          window.HABridgeLog?.error(
            v1423,
            {
              phase: "websocket-message",
              path: "/api/v1/ws/runtime",
            },
            "实时状态消息格式异常",
          );
          return;
        }
        if (v1422.type === "snapshot") {
          this.runtimeSnapshotReady = true;
          const list52 = v1422.states || [],
            set18 = new Set(
              [...this.removedRuntimeEntityIds].filter((arg750) =>
                list52.some((arg751) => String(arg751?.entityId || "") === arg750),
              ),
            );
          for (const v1424 of set18) this.historyRequestPolicy?.success(v1424);
          (this.historyRequestPolicy?.authenticated(),
            window.dispatchEvent?.(
              new CustomEvent("hb-runtime-ready", {
                detail: {
                  entityIds: [...set18],
                },
              }),
            ));
          const set19 = new Set(
            list52.map((arg752) => String(arg752?.entityId || "")).filter(Boolean),
          );
          for (const v1425 of v1421)
            set19.has(v1425) ||
              (this.removedRuntimeEntityIds.add(v1425), this.states.delete(v1425));
          for (const v1426 of [...this.states.keys()])
            set19.has(v1426) || this.states.delete(v1426);
          for (const v1427 of list52)
            this.optimisticStateIsConfirmed(v1427.entityId, v1427) &&
              (this.rememberLightVisualState(v1427.entityId, v1427),
              this.removedRuntimeEntityIds.delete(v1427.entityId),
              this.states.set(v1427.entityId, v1427),
              this.applyRuntimeStateHandlers(v1427.entityId, v1427.newState || v1427));
          (this.options.onRuntimeStateChange?.(list52), this.tryOpenPendingEntityDetails());
          for (const v1428 of list52) this.refreshVacuumMapEntity(v1428.entityId);
          if (this.detailsStateSync?.handlers)
            for (const [v1429, v1430] of this.detailsStateSync.handlers) {
              const v1431 = this.states.get(v1429);
              if (v1431) {
                for (const v1432 of v1430) v1432(v1431.newState || v1431);
              }
            }
          else {
            const value104 = this.detailsStateSync
              ? this.states.get(this.detailsStateSync.entityId)
              : null;
            this.detailsStateSync &&
              value104 &&
              this.detailsStateSync.apply(value104.newState || value104);
          }
          (this.refreshRuntimeComponents([...set19, ...this.removedRuntimeEntityIds]),
            list52.some((arg753) => !lineChartRuntimeStateNeedsHydration2(arg753)) &&
              (window.clearTimeout(this.runtimeHydrationRetryTimer),
              (this.runtimeHydrationRetryTimer = null),
              (this.runtimeHydrationRetryAttempt = 0)),
            this.scheduleRuntimeHydrationRetry(options103, socketGeneration));
        } else {
          if (v1422.type === "state_removed") {
            const v1433 = String(v1422.entityId || "");
            if (!v1433) return;
            const options104 = {
              type: "state_changed",
              entityId: v1433,
              domain: v1433.split(".", 1)[0],
              state: "unavailable",
              attributes: {},
              available: false,
            };
            if (
              (this.removedRuntimeEntityIds.add(v1433),
              this.states.delete(v1433),
              this.options.onRuntimeStateChange?.([]),
              this.tryOpenPendingEntityDetails(),
              this.detailsStateSync?.handlers?.has(v1433))
            ) {
              for (const v1434 of this.detailsStateSync.handlers.get(v1433)) v1434(options104);
            } else
              this.detailsStateSync?.entityId === v1433 && this.detailsStateSync.apply(options104);
            (this.applyRuntimeStateHandlers(v1433, options104),
              this.refreshRuntimeComponents([v1433]));
            for (const v1435 of this.runtimeEntityComponentIndex.get(v1433) || []) {
              const v1436 = this.componentRecords.get(v1435);
              ["line-chart", "camera", "vacuum-map"].includes(v1436?.type) &&
                this.refreshRuntimeComponent(v1435);
            }
            this.refreshVacuumMapEntity(v1433);
          } else {
            if (v1422.type === "resync_required")
              socketGeneration === this.socketGeneration &&
                !this.destroyed &&
                this.connectRuntime({
                  force: true,
                });
            else {
              if (v1422.type === "state_changed") {
                if (!this.optimisticStateIsConfirmed(v1422.entityId, v1422)) return;
                if (
                  (this.removedRuntimeEntityIds.has(v1422.entityId) &&
                    (this.historyRequestPolicy?.success(v1422.entityId),
                    window.dispatchEvent?.(
                      new CustomEvent("hb-runtime-ready", {
                        detail: {
                          entityIds: [v1422.entityId],
                        },
                      }),
                    )),
                  this.rememberLightVisualState(v1422.entityId, v1422),
                  this.removedRuntimeEntityIds.delete(v1422.entityId),
                  this.states.set(v1422.entityId, v1422),
                  this.options.onRuntimeStateChange?.([v1422]),
                  this.tryOpenPendingEntityDetails(),
                  this.refreshVacuumMapEntity(v1422.entityId),
                  this.detailsStateSync?.handlers?.has(v1422.entityId))
                ) {
                  for (const v1437 of this.detailsStateSync.handlers.get(v1422.entityId))
                    v1437(v1422.newState || v1422);
                } else
                  this.detailsStateSync?.entityId === v1422.entityId &&
                    this.detailsStateSync.apply(v1422.newState || v1422);
                (this.applyRuntimeStateHandlers(v1422.entityId, v1422.newState || v1422),
                  this.scheduleRuntimeRender(v1422.entityId));
              }
            }
          }
        }
      }),
      webSocket.addEventListener("close", (arg754) => {
        if (socketGeneration !== this.socketGeneration || this.destroyed) return;
        if (
          (this.pauseRuntimeFlowLines(),
          (this.socket = null),
          (this.runtimeSubscription = null),
          window.clearTimeout(this.runtimeHydrationRetryTimer),
          (this.runtimeHydrationRetryTimer = null),
          window.HABridgeLog?.report(
            "warning",
            "实时连接",
            "实时状态连接已断开（" +
              arg754.code +
              "）" +
              ([4400, 4401, 4403].includes(arg754.code) ? "" : "，正在重连"),
            {
              code: arg754.code,
              phase: "websocket-disconnected",
              path: "/api/v1/ws/runtime",
            },
          ),
          arg754.code === 4401)
        ) {
          const startsWith4 =
            (window.HABridgeEmbed?.path || window.location.pathname).startsWith("/display/") ||
            (window.HABridgeEmbed?.path || window.location.pathname).startsWith("/habridge/");
          window.location.assign(
            startsWith4
              ? "/pair?next=" +
                  encodeURIComponent(
                    "" +
                      (window.HABridgeEmbed?.path || window.location.pathname) +
                      window.location.search,
                  )
              : "/login",
          );
          return;
        }
        if (arg754.code === 4403) {
          window.location.replace("/license");
          return;
        }
        if (arg754.code === 4400) {
          const text68 =
            arg754.reason === "too many entities"
              ? "当前项目的实时订阅实体超过 " +
                un +
                " 个，已停止重连。请减少统计或控件中绑定的实体。"
              : "实时状态订阅请求无效，已停止自动重连。";
          this.options.onError?.(new Error(text68));
          return;
        }
        const min24 = Math.min(1000 * 2 ** this.reconnectAttempt, 15000);
        ((this.reconnectAttempt += 1),
          (this.reconnectTimer = window.setTimeout(() => this.connectRuntime(), min24)));
      }),
      webSocket.addEventListener("error", () => {
        webSocket.readyState === WebSocket.OPEN && webSocket.close();
      }));
  }
  ["scheduleRuntimeHydrationRetry"](arg755, arg756) {
    const v1438 = () => {
      const { entityIds: v1439, runtimeComponents: v1440 } = arg755,
        set20 = new Set(
          collectComponents2(v1440, (arg757) => arg757.type === "line-chart")
            .map((arg758) => String(arg758.bindings?.entity?.entityId || ""))
            .filter(Boolean),
        );
      return (
        v1439.filter(
          (arg759) =>
            set20.has(arg759) && lineChartRuntimeStateNeedsHydration2(this.states.get(arg759)),
        ).length > 0
      );
    };
    if (!v1438()) {
      (window.clearTimeout(this.runtimeHydrationRetryTimer),
        (this.runtimeHydrationRetryTimer = null),
        (this.runtimeHydrationRetryAttempt = 0));
      return;
    }
    if (this.runtimeHydrationRetryTimer || !(this.runtimeHydrationRetryAttempt < 5)) return;
    this.runtimeHydrationRetryAttempt += 1;
    const min25 = Math.min(10000, 500 * 2 ** (this.runtimeHydrationRetryAttempt - 1));
    this.runtimeHydrationRetryTimer = window.setTimeout(() => {
      ((this.runtimeHydrationRetryTimer = null),
        arg756 === this.socketGeneration &&
          !this.destroyed &&
          (v1438()
            ? this.connectRuntime({
                force: true,
              })
            : (this.runtimeHydrationRetryAttempt = 0)));
    }, min25);
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
      document.visibilityState === "hidden" ||
      this.historyRetryTimer ||
      this.historyRetryAttempt >= 4
    )
      return;
    const historyRetryAttempt = this.historyRetryAttempt,
      min26 = Math.min(8000, 1000 * 2 ** historyRetryAttempt);
    ((this.historyRetryAttempt += 1),
      (this.historyRetryTimer = window.setTimeout(() => {
        ((this.historyRetryTimer = 0), this.refreshHistorySeries());
      }, min26)));
  }
  async ["refreshHistorySeriesPass"]() {
    if (!this.document || this.destroyed || document.visibilityState === "hidden") return;
    const historyDocumentGeneration = this.historyDocumentGeneration,
      historyPopupGeneration = this.historyPopupGeneration,
      text69 = this.page?.path || "",
      map42 = new Map(),
      v1441 = (arg760, arg761) => {
        const v1442 = collectComponents2(
          arg760,
          (arg762) => arg762.type === "line-chart" || arg762.type === "presence-sensor",
        );
        for (const v1443 of v1442) {
          const v1444 = v1443.bindings?.entity?.entityId;
          if (!v1444) continue;
          const v1445 = v1443.type === "presence-sensor",
            max98 = Math.max(
              30,
              Math.min(86400, Number(v1445 ? 300 : v1443.properties?.updateInterval || 600)),
            ),
            max99 = Math.max(
              1,
              Math.min(
                168,
                Number(
                  v1445 ? v1443.properties?.historyHours || 24 : v1443.properties?.hours || 24,
                ),
              ),
            ),
            v1446 = map42.get(v1444);
          map42.set(v1444, {
            interval: Math.min(v1446?.interval ?? max98, max98),
            hours: Math.max(v1446?.hours ?? max99, max99),
            documentGeneration: historyDocumentGeneration,
            shared: !!(v1446?.shared || arg761.shared),
            pagePath: v1446?.pagePath ?? arg761.pagePath ?? null,
            popupId: v1446?.popupId ?? arg761.popupId ?? null,
            popupGeneration: historyPopupGeneration,
          });
        }
      };
    (v1441(this.document.sharedComponents || [], {
      shared: true,
    }),
      v1441(this.page?.components || [], {
        pagePath: text69,
      }));
    const value105 = this.activePopupId
        ? (this.document.customPopups || []).find(
            (arg763) => String(arg763.id || "") === this.activePopupId,
          )
        : null,
      list53 = [];
    for (const v1447 of value105?.modules || [])
      v1447.type === "line-chart" &&
        v1447.entityId &&
        list53.push({
          type: "line-chart",
          bindings: {
            entity: {
              entityId: v1447.entityId,
            },
          },
          properties: syncedLineChartProperties2(
            this.document,
            this.page,
            v1447.entityId,
            v1447.properties,
          ),
        });
    v1441(list53, {
      popupId: this.activePopupId || null,
    });
    const now8 = Date.now();
    let v1448 = false,
      v1449 = false;
    this.historyRequestPolicy.retain(new Set(map42.keys()));
    const list54 = [...map42],
      v1450 = () => ({
        documentGeneration: this.historyDocumentGeneration,
        pagePath: this.page?.path || "",
        popupId: this.activePopupId || null,
        popupGeneration: this.historyPopupGeneration,
      }),
      v1451 = async () => {
        for (; list54.length;) {
          const [shift2, shift3] = list54.shift();
          if (
            this.destroyed ||
            document.visibilityState === "hidden" ||
            !historyRequestStillRelevant2(shift3, v1450()) ||
            !this.historyRequestPolicy.canRequest(shift2)
          )
            continue;
          const v1452 = this.historySeries.get(shift2),
            v1453 = this.historySeriesCache.get(historySeriesCacheKey2(shift2, shift3.hours)),
            v1454 = [v1452, v1453]
              .filter(
                (arg764) => arg764 && arg764.hours === shift3.hours && Array.isArray(arg764.points),
              )
              .sort((arg765, arg766) => arg766.fetchedAt - arg765.fetchedAt)[0];
          if (v1454 && now8 - v1454.fetchedAt < shift3.interval * 1000) {
            v1452 !== v1454 && (this.historySeries.set(shift2, v1454), (v1448 = true));
            continue;
          }
          if (this.historyFetches.has(shift2)) continue;
          this.historyFetches.add(shift2);
          const abortController =
            typeof AbortController == "function" ? new AbortController() : null;
          abortController && this.historyAbortControllers.add(abortController);
          const setTimeout3 = window.setTimeout(
            () => abortController?.abort(),
            HISTORY_FETCH_TIMEOUT_MS2,
          );
          try {
            const v1455 = await fetch(
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
            if (!v1455.ok) {
              if (!historyRequestStillRelevant2(shift3, v1450()) || this.destroyed) continue;
              v1449 =
                Number.isFinite(this.historyRequestPolicy.failure(shift2, v1455.status)) || v1449;
              continue;
            }
            const json = await v1455.json();
            if (
              this.destroyed ||
              document.visibilityState === "hidden" ||
              !historyRequestStillRelevant2(shift3, v1450())
            )
              continue;
            if (!Array.isArray(json.points)) throw new Error("历史数据格式异常");
            this.historyRequestPolicy?.success(shift2);
            const options105 = {
              points: json.points,
              hours: shift3.hours,
              fetchedAt: Date.now(),
            };
            (this.historySeries.set(shift2, options105),
              cacheHistorySeries2(this.historySeriesCache, shift2, options105),
              (v1448 = true));
          } catch (v1456) {
            if (
              this.destroyed ||
              document.visibilityState === "hidden" ||
              abortController?.signal.reason === "lifecycle" ||
              !historyRequestStillRelevant2(shift3, v1450())
            )
              continue;
            (this.historyRequestPolicy.failure(shift2),
              v1456?.name === "AbortError" &&
                window.HABridgeLog?.report("warning", "网络请求", "历史曲线请求超时", {
                  entityId: shift2,
                  phase: "history-timeout",
                  path: "/api/v1/ha/history",
                  durationMs: HISTORY_FETCH_TIMEOUT_MS2,
                }),
              (v1449 = true));
          } finally {
            (window.clearTimeout(setTimeout3),
              this.historyFetches.delete(shift2),
              this.historyAbortControllers.delete(abortController));
          }
        }
      };
    if (
      (await Promise.all(
        Array.from(
          {
            length: Math.min(2, list54.length),
          },
          () => v1451(),
        ),
      ),
      v1449 && !this.destroyed ? this.scheduleHistoryRetry() : (this.historyRetryAttempt = 0),
      v1448 && !this.destroyed)
    ) {
      this.detailsStateSync?.refreshHistory?.();
      for (const v1457 of this.historyChartRefreshers) v1457();
    }
  }
  ["destroy"]() {
    this.destroyed = true;
    for (const v1458 of this.historyAbortControllers) v1458.abort("lifecycle");
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
