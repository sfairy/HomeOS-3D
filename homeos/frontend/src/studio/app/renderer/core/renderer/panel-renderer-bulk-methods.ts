import type { PanelRenderer } from "../renderer";

import { vacuumMapAvailable as vacuumMapAvailable2 } from "../vacuum-map-state";
import { syncInteraction3dUiScale as syncInteraction3dUiScale2 } from "../../../bridge/bridge";
import { popupPlacement as popupPlacement2 } from "../../../bridge/popup-placement";
import {
  cameraPopupLayout as cameraPopupLayout2,
  cameraPreviewRatio as cameraPreviewRatio2,
} from "../../../bridge/camera-popup-layout";
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
} from "../registry";
import { randomUuid as randomUuid2 } from "../../../utils/random-id";
import {
  applyRangeProgressCss as applyRangeProgressCss2,
  syncHtmlRangeProgress as syncHtmlRangeProgress2,
} from "../../../utils/range-progress";
import { popupLayoutMetrics as popupLayoutMetrics2 } from "../../../shared/popup-layout";
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
} from "../../controls/climate";
import {
  applyXiaomiDeviceProfile as applyXiaomiDeviceProfile2,
  resolveXiaomiDeviceProfile as resolveXiaomiDeviceProfile2,
} from "../entity-role-profiles";
import {
  relatedEntityLabel as relatedEntityLabel2,
  relatedEntityNeedsConfirmation as relatedEntityNeedsConfirmation2,
  relatedEntityOptions as relatedEntityOptions2,
  relatedEntitySelectService as relatedEntitySelectService2,
  relatedPopupContext as relatedPopupContext2,
  selectedRelatedEntities as selectedRelatedEntities2,
  selectedRelatedEntityIds as selectedRelatedEntityIds2,
} from "../../../shared/related-entities";
import {
  entityPowerIsOn as entityPowerIsOn2,
  entityPowerTarget as entityPowerTarget2,
  entityToggleCommand as entityToggleCommand2,
  optimisticToggleState as optimisticToggleState2,
} from "../entity-power";
import {
  ICON_VISIBILITY_VIRTUAL_KIND as ICON_VISIBILITY_VIRTUAL_KIND2,
  isVirtualEntityId as isVirtualEntityId2,
  parseVirtualEntityId as parseVirtualEntityId2,
} from "../../../shared/virtual-entities";
import {
  airflowCanvasOffsetBounds as airflowCanvasOffsetBounds2,
  airflowLayerGeometry as airflowLayerGeometry2,
  groupedComponentLocalDelta as groupedComponentLocalDelta2,
  rotateMultiSelectionTransforms as rotateMultiSelectionTransforms2,
} from "../../geometry/transform-geometry";
import {
  componentHostZIndex as componentHostZIndex2,
  effectCropRectangle as effectCropRectangle2,
  effectCroppedLayerGeometry as effectCroppedLayerGeometry2,
  effectFadeDuration as effectFadeDuration2,
  effectLayerDimensions as effectLayerDimensions2,
  effectReferenceImageTransform as effectReferenceImageTransform2,
  effectSourceDimensions as effectSourceDimensions2,
  normalizeIconButtonEffectComponent as normalizeIconButtonEffectComponent2,
} from "../../geometry/effect-geometry";
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
} from "../../controls/light-runtime";
import { entityMetadataIsAvailable as entityMetadataIsAvailable2 } from "../entity-metadata";
import {
  relatedVacuumStatusEntities as relatedVacuumStatusEntities2,
  vacuumStatus as vacuumStatus2,
  relatedVacuumBatteryEntity as relatedVacuumBatteryEntity2,
  vacuumActionService as vacuumActionService2,
  vacuumBatteryPercent as vacuumBatteryPercent2,
  vacuumSupportedActions as vacuumSupportedActions2,
} from "../../controls/vacuum-runtime";
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
} from "../../controls/cover-runtime";
import {
  playFixedDeviceDropEntrance as playFixedDeviceDropEntrance2,
  playMediaSpeakerEntrance as playMediaSpeakerEntrance2,
  playStableRuntimeDialogEntrance as playStableRuntimeDialogEntrance2,
  runtimeDialogUsesStableMotion as runtimeDialogUsesStableMotion2,
} from "../panel-dialog-motion";
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
} from "../panel-caches";
import { EVENT_LOG_WALL_AUTO_ENTITY_LIMIT, isEventLogWallDomain } from "../../controls/event-log-runtime";
import {
  collectComponents as collectComponents2,
  collectEntityIds as collectEntityIds2,
  lineChartRuntimeStateNeedsHydration as lineChartRuntimeStateNeedsHydration2,
  syncedLineChartProperties as syncedLineChartProperties2,
} from "../panel-document";
import { navigateInShell } from "@/studio/platform/shell-navigation";
import { shellConfirm, shellOpenMediaPlayer } from "@/studio/platform/shell-chrome";
import {
  type PanelRendererOptions,
  type RendererDetailsStateSync,
  type ComponentControllerElement,
  type ComponentDialogElement,
  type ComponentPayload,
  type ClimateVisualSyncPayload,
  type DraggedComponentEntry,
  type EntityStateControlElement,
} from "../renderer-types";
import {
  maxRuntimeEntitySubscriptions,
  defaultTargetOccupancy,
  compactTargetOccupancy,
  COVER_CLOSED_POSITION_EPSILON,
  runtimeDialogLayout,
  runtimeDialogViewport,
  assignComponentIdentifiers,
  isPrimaryModifierPressed,
  componentSupportsAction,
  componentDialogTitle,
  popupModuleDialogTitle,
  createAirerVisual,
  entityStateText,
  createSwitchVisual,
  mixHexColor,
  clickFocusedElement,
  isDocumentHidden,
} from "../renderer-helpers";
import * as geometryMethods from "../renderer-geometry";
export function renderComponent(this: PanelRenderer, 
    renderComponentRecord: any,
    renderParentElement = this.canvas,
    baseRenderZIndex = 0,
    componentIdToHostMap: any = null,
    componentIdToEffectHostMap: any = null,
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
      isIconVisible: (visibilityEntityId: any) => this.iconVisibilityState(visibilityEntityId),
      navigate: (componentNavigationPath: any) => this.navigate(componentNavigationPath),
      callEntityService: (...serviceCallParameters: [any, any, any, any?]) =>
        this.callEntityService(...serviceCallParameters),
      openCameraPreview: (cameraPreviewComponent: any, cameraPreviewWidth: any, cameraPreviewHeight: any) =>
        this.openInteraction3dCameraPreview(
          cameraPreviewComponent,
          cameraPreviewWidth,
          cameraPreviewHeight,
        ),
      openVacuumDetails: (vacuumDetailsComponent: any, vacuumDetailsWidth: any, vacuumDetailsHeight: any) =>
        this.openInteraction3dVacuumDetails(
          vacuumDetailsComponent,
          vacuumDetailsWidth,
          vacuumDetailsHeight,
        ),
      runVacuumRoom: (vacuumRoomEntry: any) =>
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
            data: {} as Record<string, any>,
          },
        ),
      onError: (actionErrorObject: any) => this.options.onError?.(actionErrorObject),
      openEntityDetails: (eventLogWallEntityId: any) => {
        const entityId = String(eventLogWallEntityId || "").trim();
        if (!entityId) return;
        navigateInShell(`/device?id=${encodeURIComponent(entityId)}`);
      },
      registerRuntimeStateHandler: (componentStateEntityId: any, componentStateHandler: any) =>
        this.registerRuntimeStateHandler(
          componentStateEntityId,
          componentStateHandler,
          renderComponentRecord.id,
        ),
      runtimeStateReady: () => this.runtimeSnapshotReady === true,
      invalidate: () => this.renderComponents(true),
      cleanup: (cleanupFunction: any) => {
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
        (chartStatePayload: any) => {
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

export function createCapabilityDetailsControls(this: PanelRenderer, 
    capabilityEntityId: any,
    externalStateSnapshot: any,
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
      attributes: {} as Record<string, any>,
    };
    const componentDeviceType =
        capabilityDomain === "fan"
          ? resolveClimateDeviceType2(
              {
                properties: {} as Record<string, any>,
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
      controlDescriptors: any = [],
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
          } catch (powerToggleError: any) {
            ((capabilityEntityState = previousState),
              syncEntityState(previousState),
              this.options.onError?.(powerToggleError));
          }
        },
      });
    (hn2.visual.classList.add("hb-capability-power"),
      isPowerToggleCapable && capabilityControlsSection.append(hn2.visual));
    const createSelectControl = (
        optionControlLabel: any,
        optionCandidates: any,
        activeOptionValue: any,
        optionServiceName: any,
        servicePayloadKey: any,
        optionServiceDomain = capabilityDomain,
      ) => {
        const selectOptions = [
          ...new Set<string>(
            (optionCandidates || [])
              .map((optionText: any) => String(optionText ?? "").trim())
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
            selectBedValue = async (bedSelectedValue: any) => {
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
              } catch (selectError: any) {
                ((capabilityEntityState = previousStateOnSelect),
                  syncEntityState(previousStateOnSelect),
                  this.options.onError?.(selectError));
              } finally {
                ((isSelectPending = false), syncEntityState(capabilityEntityState));
              }
            },
            renderSelectOptions = (valuesList: any, bedCurrentOptionValue: any) => {
              bedSelectMenu.replaceChildren(
                ...valuesList.map((selectableValue: any) => {
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
        const modeButtons: any = [];
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
              ? (modeLabelMap as any)[capabilityModeValue.toLowerCase()] || capabilityModeValue
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
              modeButtons.forEach((disabledModeButton: any) => {
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
              } catch (modeError: any) {
                ((capabilityEntityState = previousStateOnMode),
                  syncEntityState(previousStateOnMode),
                  this.options.onError?.(modeError));
              } finally {
                modeButtons.forEach((enabledModeButton: any) => {
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
              } catch (speedError: any) {
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
          syncHtmlRangeProgress2(fanSpeedRangeSlider),
          fanSpeedRangeSlider.addEventListener("input", () =>
            syncHtmlRangeProgress2(fanSpeedRangeSlider),
          ),
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
            } catch (fanSpeedError: any) {
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
        syncHtmlRangeProgress2(numericRangeSlider),
        numericRangeSlider.addEventListener("input", () =>
          syncHtmlRangeProgress2(numericRangeSlider),
        ),
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
          } catch (rangeError: any) {
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
    function syncEntityState(nextState: any) {
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
          controlDescriptor.buttons.forEach((descriptorButton: any) =>
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
                    .map((rawInputValue: any) => String(rawInputValue ?? "").trim())
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
                    .map((rawInputOption: any) => String(rawInputOption ?? "").trim())
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
                controlDescriptor.buttons.forEach((speedButton: any) =>
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
                  syncHtmlRangeProgress2(controlDescriptor.input),
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

export function showAirPurifierDetails(this: PanelRenderer, 
    airPurifierComponent: any,
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
        attributes: {} as Record<string, any>,
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
      isMetricValueValid = (metricStateArg: any) => {
        const numericMetricValue = Number(metricStateArg?.state);
        return ["unknown", "unavailable"].includes(
          String(metricStateArg?.state || "").toLowerCase(),
        ) || !Number.isFinite(numericMetricValue)
          ? null
          : numericMetricValue;
      },
      lookupEntityState = (stateLookupEntity: any) =>
        this.states.get(stateLookupEntity?.id)?.newState ||
        this.states.get(stateLookupEntity?.id) ||
        null,
      resolveSelectedCandidate = (metricGroupItem: any) =>
        metricGroupItem.candidates.find(
          (candidateItem: any) => isMetricValueValid(lookupEntityState(candidateItem)) != null,
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
      formatMetricValue = (metricStateValue: any, metricKey: any) => {
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
            metricStateValue?.attributes?.unit_of_measurement || (unitSuffixLabels as any)[metricKey] || "",
          displayUnit = (unitSuffixAliases as any)[String(unitSuffix).toLowerCase()] || unitSuffix;
        return "" + (metricStateValue?.state ?? "--") + (displayUnit ? " " + displayUnit : "");
      },
      stateHandlerByEntityId = new Map(),
      registerEntityStateHandler = (registeredStateEntityId: any, handlerCallback: any) => {
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
            : (qualityLevelLabels as any)[lowerCase2] || trimmedStateText,
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
      syncAirQualityState = (airQualityStateArg: any) => {
        ((airQualityState = airQualityStateArg), refreshParticulate());
      },
      syncAirPurifierState = (nextAirPurifierState: any) => {
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
        (capabilityDetailsControls2 as HTMLElement)
          .querySelector<HTMLElement>(".hb-capability-power")
          ?.click(),
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

export function showCustomPopup(this: PanelRenderer, customPopupModule: any, { preview: isCustomPopupPreview = false } = {}) {
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
    const popupCleanupCallbacks: any = [],
      popupMediaSpeakerVisuals: any[] = [],
      popupControlPanels: any[] = [],
      popupEntranceTargets: any[] = [],
      popupRefreshCallbacks: any = [],
      stateHandlerByPopupEntityId = new Map(),
      registerPopupStateHandler = (popupHandlerEntityId: any, popupHandlerCallback: any) => {
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
          (moduleStatusLabels as any)[moduleDeviceProfile.type] || moduleStatusLabels.generic),
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
            resolveBedEntityState = (bedEntityId: any) => {
              const bedEntityState = this.states.get(bedEntityId);
              return (
                bedEntityState?.newState ||
                bedEntityState || {
                  entityId: bedEntityId,
                  state: "unknown",
                  attributes: {} as Record<string, any>,
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
          const createBedAngleReadout = (anglePartName: any, anglePartLabel: any) => {
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
              controlParentElement: any,
              controlLabelText: any,
              blockEntityId: any,
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
                registerPopupStateHandler(blockEntityId, (capabilityStateArg: any) =>
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
                  } catch (memoryPressError: any) {
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
              getBedAngleValue = (bedAngleState: any) => {
                const bedAngleNumber = Number(bedAngleState?.state);
                return Number.isFinite(bedAngleNumber) ? bedAngleNumber : null;
              },
              applyBedAngle = (angleRoleName: any, _angleElement: any, angleReadoutValue: any) => {
                const bedAngleDegrees = getBedAngleValue((bedAngleEntityIds as any)[angleRoleName]);
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
              popupCameraMotionAnimation: any = null,
              popupCameraPreviousAngle = 0;
            const formatPopupCameraTilt = (popupTiltAngleDeg: any, popupTiltScaleFactor = 0) =>
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
                    cleanup: (popupCleanupCallback: any) => {
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
              const syncLineChart = (chartStateArg: any) => {
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
                registerPopupStateHandler(entityId, (lineChartStateArg: any) => {
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
                  togglePressHandler: any = null;
                const isMomentaryButton = entityId.split(".")[0] === "button",
                  hn3 = createSwitchVisual({
                    label: popupModuleTitle.textContent,
                    interactive: !isCustomPopupPreview,
                    momentary: isMomentaryButton,
                    onToggle: () => togglePressHandler?.(),
                  });
                hn3.visual.classList.add("hb-custom-switch-visual");
                const syncPopupModuleState = (moduleState: any) => {
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
                  } catch (moduleToggleError: any) {
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
                  let popupBathLightControl: any = null;
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
                    } catch (lightToggleError: any) {
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
                    registerPopupStateHandler(entityId, (popupLightStateArg: any) => {
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
                          }: any) => {
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
                    let moduleBathLightControl: any = null;
                    if (bathLightMetadata?.entityId) {
                      const moduleBathLightState = this.states.get(bathLightMetadata.entityId),
                        bathLightStateSnapshot = moduleBathLightState?.newState ||
                          moduleBathLightState || {
                            state: "unknown",
                            attributes: {} as Record<string, any>,
                          };
                      ((moduleBathLightControl = this.createBathHeaterLightControl(
                        bathLightMetadata.entityId,
                        bathLightStateSnapshot,
                        {
                          interactive: !isCustomPopupPreview,
                          onStateChange: ({
                            isOn: isModuleBathLightOn,
                            unavailable: isModuleBathLightUnavailable,
                          }: any) => {
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
                          (moduleBathLightStateArg: any) =>
                            moduleBathLightControl.syncBathLightState?.(moduleBathLightStateArg),
                        ));
                    }
                    const climateChildElements = Array.from(climateDetailsControls.children) as HTMLElement[],
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
                      } catch (climatePowerError: any) {
                        ((currentClimateState = previousClimateState),
                          climateDetailsControls.syncClimateState?.(previousClimateState),
                          this.options.onError?.(climatePowerError));
                      } finally {
                        ((isClimateTogglePending = false),
                          climateVisualElement.removeAttribute("aria-busy"));
                      }
                    }),
                      registerPopupStateHandler(entityId, (popupClimateStateArg: any) => {
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
                            }: any) => {
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
                          } catch (coverToggleError: any) {
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
                        } catch (coverPositionError: any) {
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
                        registerPopupStateHandler(entityId, (coverSyncStateArg: any) => {
                          ((currentCoverState = coverSyncStateArg),
                            coverDetailsControls.syncCoverState?.(coverSyncStateArg));
                        }),
                        coverAirerLightEntityId &&
                          registerPopupStateHandler(coverAirerLightEntityId, syncAirerLight),
                        coverPositionCommandEntityId &&
                          registerPopupStateHandler(
                            coverPositionCommandEntityId,
                            (popupCoverCommandArg: any) =>
                              coverDetailsControls.syncCoverPositionState?.(popupCoverCommandArg),
                          ),
                        coverPositionEntityId &&
                          registerPopupStateHandler(
                            coverPositionEntityId,
                            (popupCoverPositionStateArg: any) => {
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
                          registerPopupStateHandler(airerMotorEntityId, (airerMotorStateArg: any) =>
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
                          attributes: {} as Record<string, any>,
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
                          resolveEntityStateById = (resolveStateEntityId: any) => {
                            const stateForEntity = this.states.get(resolveStateEntityId);
                            return stateForEntity?.newState || stateForEntity || null;
                          },
                          hasStateForEntity = (candidateEntityId: any) => {
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
                            (popupMetricLabels as any)[popupMetricEntry.role] || popupMetricEntry.role;
                          const popupMetricValueElement = document.createElement("strong");
                          (popupMetricRow.append(popupMetricLabel, popupMetricValueElement),
                            popupSecondaryMetricsElement.append(popupMetricRow));
                          const syncPopupMetric = (popupMetricState: any) => {
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
                                      }[popupQualityLevel]!)),
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
                              popupPurifierAccent!,
                            ),
                              popupModuleSection.style.setProperty(
                                "--hb-air-purifier-accent-soft",
                                popupPurifierAccentSoft!,
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
                          } catch (popupPurifierError: any) {
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
                          const popupMediaBody: any = document.createElement("div");
                          popupMediaBody.className =
                            "hb-media-player-details-body hb-custom-media-player-body";
                          const popupNowPlayingSection: any = document.createElement("section");
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
                          const createPopupMediaButton = (popupButtonLabel: any, popupMediaService: any) => {
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
                                    } catch (popupMediaControlError: any) {
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
                            popupMediaDuration: any = null,
                            popupInitialPosition = 0,
                            popupPlaybackUpdatedAtMs: any = null,
                            isPopupVolumeDragging = false,
                            popupVolumeLevel: any = null,
                            popupDraggingValue: any = null,
                            popupLastCommittedVolume: any = null,
                            popupPendingVolume: any = null,
                            isPopupVolumeSyncing = false,
                            popupVolumeCommitTimer: any = null,
                            popupVolumeSyncTimer: any = null;
                          const formatPopupMediaTime = (popupSecondsValue: any) => {
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
                          const isPopupVolumeClose = (popupLeftVolume: any, popupRightVolume: any) =>
                              Number.isFinite(popupLeftVolume) &&
                              Number.isFinite(popupRightVolume) &&
                              Math.abs(popupLeftVolume - popupRightVolume) <= 0.005,
                            applyPopupVolume = (popupRawVolume: any) => {
                              ((popupVolumeLevel = Math.max(
                                0,
                                Math.min(1, Number(popupRawVolume) || 0),
                              )),
                                (popupMediaVolumeSlider.value = String(popupVolumeLevel)),
                                syncHtmlRangeProgress2(popupMediaVolumeSlider),
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
                              } catch (popupVolumeError: any) {
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
                          const syncPopupMediaState = (nextPopupMediaState: any) => {
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
                              (popupMediaStateLabels as any)[lowerCase7] ||
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
                          const syncPopupModuleStatus = (popupModuleStateArg: any) => {
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
    const popupStructureKey = (popupStructureEntry: any) =>
        popupStructureEntry
          .map((popupStructureModule: any) => {
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
        popupRefreshCallbacks.forEach((popupRefreshCallback: any) => popupRefreshCallback()),
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

export function createLightDetailsControls(this: PanelRenderer, 
    lightEntityId: any,
    lightState: any,
    {
      interactive: isLightInteractive = true,
      onTurnOn: onLightTurnOn = null,
      onVisualChange: onLightVisualChange = null,
    }: any = {},
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
        }[lightModeOption]!),
        lightModeSelect.append(lightModeOptionElement));
    }
    const applyLightMode = (nextLightMode: any) => {
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
      } catch (lightModeError: any) {
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
    }: any) => {
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
        lightSliderInput.classList.add("hb-range"),
        (lightSliderInput.min = String(sliderMinimum)),
        (lightSliderInput.max = String(sliderMaximum)),
        (lightSliderInput.step = String(sliderStep)),
        (lightSliderInput.value = String(clampedSliderValue)),
        (lightSliderInput.disabled = !isSliderSupported));
      const updateSliderValue = ({ notify: shouldNotifyChange = false } = {}) => {
        const sliderValue = Number(lightSliderInput.value),
          sliderProgressPercent = Math.max(
            0,
            Math.min(
              100,
              ((sliderValue - sliderMinimum) / Math.max(1, sliderMaximum - sliderMinimum)) * 100,
            ),
          ),
          // 同时写 studio 专用变量与全局 main.css 读取的 --progress-pct：
          // 未排除的 range 会吃到 main.css 默认 50%，造成「读数 25%、蓝条却停在一半」。
          progressCss = sliderProgressPercent + "%";
        ((lightSliderOutputElement.textContent = isSliderSupported
          ? "" + Math.round(sliderValue) + sliderSuffix
          : "不支持"),
          lightSliderInput.style.setProperty("--hb-light-slider-progress", progressCss),
          lightSliderInput.style.setProperty("--progress-pct", progressCss),
          lightSliderInput.style.setProperty("--progress", progressCss),
          lightSliderInput.style.setProperty("--range-progress", progressCss));
        // 亮度：琥珀进度填充。色温：保留暖→冷渐变，进度点之后盖灰（拇指右侧不露色）
        if (sliderPayloadKey === "brightness_pct") {
          lightSliderInput.style.background = `linear-gradient(90deg, #f4a816 0%, #f4a816 ${progressCss}, #343d44 ${progressCss}, #343d44 100%)`;
        } else if (sliderPayloadKey === "color_temp_kelvin") {
          lightSliderInput.style.background = `linear-gradient(90deg, transparent 0%, transparent ${progressCss}, #343d44 ${progressCss}, #343d44 100%), linear-gradient(90deg, #f4a816, #f6c76d 35%, #e5dfcf 57%, #72b9ed)`;
        }
        shouldNotifyChange &&
          isSliderSupported &&
          onLightVisualChange?.(
            sliderPayloadKey === "brightness_pct"
              ? {
                  brightnessPercent: sliderValue,
                }
              : {
                  colorTemperatureKelvin: sliderValue,
                  colorRgb: null as any,
                },
          );
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
            } catch (sliderCommitError: any) {
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
    let lightColorPickerPanel: any = null,
      lightColorHs: any = null,
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
            lightColorCss = "rgb(" + lightColorRgb!.join(",") + ")";
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
        applyColorPickerPointer = (colorPointerEvent: any) => {
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
            } catch (colorPickerError: any) {
              this.options.onError?.(colorPickerError);
            } finally {
              ((isColorPickerBound = false), lightColorPickerPanel.removeAttribute("aria-busy"));
            }
          }
        };
      (lightColorPickerPanel.addEventListener("pointerdown", (pickerPointerDownEvent: any) => {
        isLightInteractive &&
          (lightColorPickerPanel.setPointerCapture?.(pickerPointerDownEvent.pointerId),
          (lightColorPickerPanel.dataset.dragging = "true"),
          applyColorPickerPointer(pickerPointerDownEvent),
          pickerPointerDownEvent.preventDefault());
      }),
        lightColorPickerPanel.addEventListener("pointermove", (pickerPointerMoveEvent: any) => {
          lightColorPickerPanel.dataset.dragging === "true" &&
            applyColorPickerPointer(pickerPointerMoveEvent);
        }));
      const endColorPickerDrag = async (pickerPointerUpEvent: any) => {
        lightColorPickerPanel.dataset.dragging === "true" &&
          ((lightColorPickerPanel.dataset.dragging = "false"),
          lightColorPickerPanel.releasePointerCapture?.(pickerPointerUpEvent.pointerId),
          await commitColorPicker());
      };
      (lightColorPickerPanel.addEventListener("pointerup", endColorPickerDrag),
        lightColorPickerPanel.addEventListener("pointercancel", endColorPickerDrag),
        lightColorPickerPanel.addEventListener("keydown", async (colorPickerKeyEvent: any) => {
          if (!isLightInteractive) return;
          const keyboardStep = colorPickerKeyEvent.shiftKey ? 10 : 3;
          let { hue: keyboardHue, saturation: keyboardSaturation }: any = lightColorHs;
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
    let lightPresetPending: any = null,
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
      colorTemperatureFromPercent = (presetEntry: any) =>
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
            matchStartedAt: null as any,
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
          } catch (presetApplyError: any) {
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
    const syncLightStateDetails = (nextLightDetailsState: any) => {
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

export function createCoverDetailsControls(this: PanelRenderer, 
    coverDetailsEntityId: any,
    coverStateObject: any,
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
    }: any = {},
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
      coverPositionSlider.classList.add("hb-range"),
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
    ).map((coverAction: any) => {
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
                isAirer && coverAction.action ? (airerActionEntityIds as any)[coverAction.action] : "";
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
            } catch (coverActionError: any) {
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
    const resolveCoverPosition = (positionSourceState: any) => {
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
      coverMotionState: any = null,
      airerHoldPosition: any = null,
      airerHoldExpiryMs = 0,
      dreamCurtainTarget: any = null;
    const clearCoverMotionTimers = () => {
        (window.cancelAnimationFrame(coverHandleIndex), (coverHandleIndex = 0));
      },
      updateCoverPosition = (nextCoverPosition: any, coverMotionPhase = "") => {
        ((displayCoverPosition = Math.max(0, Math.min(100, Number(nextCoverPosition) || 0))),
          (coverPositionSlider.value = String(displayCoverPosition)),
          applyRangeProgressCss2(coverPositionSlider, displayCoverPosition + "%"),
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
          motionFrame = (motionTimestamp: any) => {
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
      primaryStateSource: any,
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
        coverControlsPanel.holdCoverPosition!(sliderTargetValue);
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
        } catch (coverSyncError: any) {
          (coverControlsPanel.cancelCoverMotion!(),
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

export function createClimateDetailsControls(this: PanelRenderer, 
    climateDetailsEntityId: any,
    climateState: any,
    {
      interactive: isClimateInteractive = true,
      onPowerChange: onClimatePowerChange = null,
      onVisualChange: onClimateVisualChange = null,
      modeColors: climateModeColors = {} as Record<string, string>,
      deviceType: climateStructureType = "air-conditioner",
    }: any = {},
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
      temperatureCommitTimer: any = null,
      temperatureSyncTimer: any = null,
      temperatureControlTimer: any = null;
    const applyCommittedTemperature = () => {
        ((temperatureCommitTimer = null),
          window.clearTimeout(temperatureSyncTimer),
          window.clearTimeout(temperatureControlTimer),
          (temperatureSyncTimer = null),
          (temperatureControlTimer = null));
      },
      commitTemperature = (nextTemperature: any) => {
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
    const climateEffectMode = (climateStateArg: any) =>
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
        const climateServiceStateKey = (climateServiceName: any) =>
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
    const pendingTemperatures: any = [];
    let activePendingTemperature: any = null,
      previousTemperature = targetTemperatureValue,
      isStepPending = false,
      stepTimerId: any = null;
    const areTemperaturesEqual = (temperatureA: any, temperatureB: any) =>
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
        } catch (temperatureCommitError: any) {
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
      adjustTemperatureByStep = (stepDirection: any) => {
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
      temperatureFromPointer = (pointerEvent: any) => {
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
    let activePointer: any = null;
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
    const endTemperatureDrag = (createClimateDetailsControlsPointerUpEvent: any) => {
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
      }: any) => {
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
            applySelectValue = (selectedValue: any) => {
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
            selectClimateOption = async (optionValue: any) => {
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
              } catch (climateUpdateError: any) {
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
              } catch (waterHeaterUpdateError: any) {
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
      const fanModeDisplayLabel = (fanModeIndexValue: any) =>
          (fanModeLabels as any)[String(manualFanModes[fanModeIndexValue]).toLowerCase()] ||
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
          } catch (fanSpeedUpdateError: any) {
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
            } catch (fanSpeedCommitError: any) {
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
    let fanCapabilitiesListener: any = null;
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
      ((fanCapabilitiesListener = (capabilitiesPayload: any) => {
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
          } catch (fanPercentageError: any) {
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
    let climateStateListener: any = null;
    if (!climateDetailsPanel.childElementCount) {
      const climateLoadingSection = document.createElement("section");
      climateLoadingSection.className = "hb-climate-details-loading";
      const climateLoadingIcon = document.createElement("i");
      climateLoadingIcon.setAttribute("aria-hidden", "true");
      const climateLoadingLabel = document.createElement("strong"),
        climateLoadingHint = document.createElement("span");
      ((climateStateListener = (climateLoadingStatePayload: any) => {
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

export function createWaterHeaterExtensionControls(this: PanelRenderer, 
    primaryEntityId: any,
    {
      component: componentRecord = null,
      interactive: createWaterHeaterExtensionControlsIsInteractive = true,
      excludedEntityIds: excludedEntityIdsInput = [],
    }: any = {},
  ): ComponentControllerElement | null {
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
      resolveEntityState = (stateEntityId: any) => {
        const resolvedEntityState = this.states.get(stateEntityId);
        return (
          resolvedEntityState?.newState ||
          resolvedEntityState || {
            entityId: stateEntityId,
            state: "unknown",
            attributes: {} as Record<string, any>,
          }
        );
      },
      registerStateHandler = (
        createWaterHeaterExtensionControlsHandledEntityId: any,
        registeredStateHandler: any,
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
          } catch (toggleStateError: any) {
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
            relatedEntityOptions: any = [];
          const bathHeaterLabelOptions = {
              entityId: entityId2,
              entityMetadata: this.entityMetadata,
              entityTranslations: this.entityTranslations,
              attributes: ["options", "option"],
            },
            relatedOptionLabel = (optionDisplayValue: any) =>
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
            selectRelatedOption = async (optionStateValue: any) => {
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
              } catch (selectServiceError: any) {
                (syncRelatedSelect(previousSelectState),
                  this.options.onError?.(selectServiceError));
              } finally {
                ((isSelectBusy = false), syncRelatedSelect(selectEntityState));
              }
            },
            renderRelatedOptions = (optionEntries: any, selectedOptionValue: any) => {
              relatedSelectMenu.replaceChildren(
                ...optionEntries.map((optionEntry: any) => {
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
              stepNumberValue = async (numberStepDirection: any) => {
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
                } catch (numberUpdateError: any) {
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
              const syncActionButton = (actionEntityState: any) => {
                const isActionUnavailable =
                  String(actionEntityState?.state || "").toLowerCase() === "unavailable";
                extensionActionButton.disabled =
                  !createWaterHeaterExtensionControlsIsInteractive ||
                  isActionBusy ||
                  isActionUnavailable;
              };
              (extensionActionButton.addEventListener("click", async () => {
                if (
                  !createWaterHeaterExtensionControlsIsInteractive ||
                  isActionBusy ||
                  extensionActionButton.disabled
                )
                  return;
                if (relatedEntityNeedsConfirmation2(relatedEntity)) {
                  const accepted = await shellConfirm({
                    title: "确认执行",
                    message: "确认执行“" + entityLabel + "”吗？",
                    confirmLabel: "执行",
                    cancelLabel: "取消",
                    tone: "warning",
                  });
                  if (!accepted) return;
                }
                ((isActionBusy = true), syncActionButton(resolveEntityState(entityId2)));
                try {
                  await this.callEntityService("button", "press", entityId2);
                } catch (actionUpdateError: any) {
                  this.options.onError?.(actionUpdateError);
                } finally {
                  ((isActionBusy = false), syncActionButton(resolveEntityState(entityId2)));
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
                  syncReadonlyValue = (readonlyEntityState: any) => {
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

export function showVacuumDetails(this: PanelRenderer, 
    vacuumComponent: any,
    { preview: isVacuumPreview = false, interaction3d: interaction3dInstance = null }: any = {},
  ) {
    const vacuumEntityId = vacuumComponent.bindings?.entity?.entityId;
    if (!vacuumEntityId) throw new Error("该扫地机器人控件没有关联实体。");
    const selectedRelatedEntityIds = selectedRelatedEntityIds2(vacuumComponent);
    this.closeRuntimeDialog();
    const vacuumState = this.states.get(vacuumEntityId);
    let vacuumStateOptions = vacuumState?.newState ||
      vacuumState || {
        state: "unknown",
        attributes: {} as Record<string, any>,
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
    const createVacuumStat = (statLabel: any, statIcon: any) => {
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
        actionTitle: any,
        descriptionText: any,
        actionIconValue: any,
        actionServiceName: any,
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
    const normalizeActionKey = (rawActionValue: any) =>
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
      }: any) => {
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
        let vacuumOptionEntries: any = [],
          cachedOptionSignature = "";
        const syncVacuumOptions = (currentValueText: any, optionItems: any, isOptionSupported = true) => {
          const optionSignature = JSON.stringify(optionItems);
          (cachedOptionSignature !== optionSignature &&
            ((cachedOptionSignature = optionSignature),
            (vacuumOptionEntries = optionItems.map((optionItem: any) => {
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
              ...vacuumOptionEntries.map((optionEntryItem: any) => optionEntryItem.button),
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
      modeOptionSync: any = null;
    const syncCleaningMode = (cleaningModeStateArg: any) => {
      cleaningModeStateArg &&
        ((cleaningModeStateValue = cleaningModeStateArg.newState || cleaningModeStateArg),
        syncCleaningModeOptions());
    };
    let isVacuumBusy = false,
      isVacuumActioning = false;
    const setVacuumPending = (interaction3dInstanceIsPending: any) => {
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
        targetDomain: any,
        targetService: any,
        targetEntityId: any,
        callVacuumServiceServicePayload: any,
        pendingError: any = null,
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
        } catch (vacuumServiceError: any) {
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
      onSelect: async (selectedModeValue: any) => {
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
        onSelect: async (selectedFanSpeed: any) => {
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
        statusEntities.map((statusEntity: any) => [
          statusEntity.entityId,
          this.states.get(statusEntity.entityId),
        ]),
      ),
      resolveVacuumStatus = (vacuumStateInput: any) =>
        vacuumStatus2(
          vacuumStateInput,
          statusEntities.map((statusEntityEntry: any) => ({
            ...statusEntityEntry,
            state: statesByEntityId.get(statusEntityEntry.entityId),
          })),
        ),
      formatVacuumNumber = (numericValue: any, fallbackValue = "--") =>
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
      syncBatteryState = (batteryStateArg: any) => {
        ((batteryStateValue = batteryStateArg || batteryStateValue), syncBatteryValue());
      };
    function applyVacuumState(nextVacuumState: any) {
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
        startAction!.button.classList.toggle("active", vacuumStatus.moving && !returning),
        pauseAction!.button.classList.toggle("active", paused),
        stopAction!.button.classList.toggle("active", false),
        returnToBaseAction!.button.classList.toggle("active", returning),
        locateAction!.button.classList.toggle("active", false),
        cleanSpotAction!.button.classList.toggle(
          "active",
          active && !paused && !returning && nextVacuumState.state === "cleaning",
        ),
        (startAction!.name.textContent = paused ? "继续清扫" : "开始清扫"),
        syncCleaningModeOptions());
      const errorText = String(vacuumStateAttributes.error || "").trim(),
        warningText = String(vacuumStateAttributes.low_water_warning || "").trim(),
        vacuumWarnings: any[] = [];
      (errorText && !/^no error$/i.test(errorText) && vacuumWarnings.push(errorText),
        warningText && !/^no warning$/i.test(warningText) && vacuumWarnings.push(warningText),
        (vacuumWarningNote.textContent = vacuumWarnings.length
          ? "注意：" + vacuumWarnings.join(" · ")
          : ""),
        (vacuumWarningNote.hidden = !vacuumWarnings.length));
    }
    (startAction!.button.addEventListener("click", () =>
      callVacuumService(
        "vacuum",
        vacuumActionService2(vacuumStateOptions, "start"),
        vacuumEntityId,
        {},
      ),
    ),
      pauseAction!.button.addEventListener("click", () =>
        callVacuumService("vacuum", "pause", vacuumEntityId, {}),
      ),
      returnToBaseAction!.button.addEventListener("click", () =>
        callVacuumService("vacuum", "return_to_base", vacuumEntityId, {}),
      ),
      stopAction!.button.addEventListener("click", () =>
        callVacuumService(
          "vacuum",
          vacuumActionService2(vacuumStateOptions, "stop"),
          vacuumEntityId,
          {},
        ),
      ),
      locateAction!.button.addEventListener("click", () =>
        callVacuumService("vacuum", "locate", vacuumEntityId, {}),
      ),
      cleanSpotAction!.button.addEventListener("click", () =>
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
    let vacuumResizeObserver: any = null;
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

export function showPresenceDetails(this: PanelRenderer, presenceComponent: any, { preview: _isPresencePreview = false } = {}) {
    const presenceEntityId = presenceComponent.bindings?.entity?.entityId;
    if (!presenceEntityId) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    const sensorKind = ["presence", "door-window", "water-leak", "smoke", "natural-gas"].includes(
        presenceComponent.properties?.sensorKind,
      )
        ? presenceComponent.properties.sensorKind
        : "presence",
      presencePresentationConfig = ({
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
      } as any)[sensorKind];
    let presenceState = this.states.get(presenceEntityId)?.newState ||
      this.states.get(presenceEntityId) || {
        entityId: presenceEntityId,
        state: "unknown",
        attributes: {} as Record<string, any>,
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
      resolvePresencePresentation = (presenceStateInput: any, nowTimestamp = Date.now()) =>
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
    let presenceSensorElement: any = null;
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
    const createPresenceMetric = (metricLabel: any) => {
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
    const formatPresenceTime = (timestamp: any) => {
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
                ({
                  occupied: "有人",
                  clear: "无人",
                  unavailable: "离线",
                  unknown: "未知",
                } as any)[bucketState]),
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
            .map((rawHistoryPoint: any) => ({
              timestamp: Date.parse(rawHistoryPoint?.timestamp),
              state: {
                state: rawHistoryPoint?.value,
              },
            }))
            .filter(
              (historyPoint: any) =>
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
                    noMotionSeconds: null as any,
                    noMotionStateTimestamp: null as any,
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
            ? Math.max(...presencePoints.map((presencePoint: any) => presencePoint.timestamp))
            : null
        );
      },
      applyPresenceState = (presenceStateValue: any) => {
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
          const sensorClassName = ({
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
          } as any)[sensorKind];
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

export function showEntityDetails(this: PanelRenderer, entityDetailsComponent: any, { preview: isEntityDetailsPreview = false } = {}) {
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
      (["air-conditioner", "bath-heater"].includes(detailDeviceProfile?.deviceType!) &&
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
    const resolveEntityStateLabel = (stateValueText: any, stateAttributes = entityAttributes) =>
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
    let entityStateLabelElement: any = null,
      coverStateLabelElement: any = null,
      isEntityDetailsPreviewEntityStateText = String(entityStateValue?.state || ""),
      climateStateLabelElement: any = null,
      buttonStateLabelElement: any = null,
      lineChartStateLabelElement: any = null;
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
            : (coverStateLabels as any)[physicalCoverState] || physicalCoverState || "状态未知"),
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
      stateController: any = null,
      lightVisualButton: any = null,
      lightVisualSync: any = null,
      coverVisualButton: any = null,
      coverVisualSync: any = null,
      airerLightSync: any = null,
      curtainPosition = 0;
    const airerPositionCalibration = airerPositionCalibration2(
      this.entityMetadata,
      this.deviceMetadata,
      detailEntityIdText,
    );
    let isEntityPending = false,
      climateVisualButton: any = null,
      climateVisualSync: any = null,
      switchVisualButton: any = null,
      toggleController: any = null,
      isEntityDetailsPreviewToggleHandler: any = null,
      isTogglePending = false,
      toggleResetTimerId: any = null,
      toggleStatusText = "idle",
      bathHeaterLightEntityId = "",
      bathLightControl: any = null,
      waterHeaterExtensionControl: any = null,
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
            } catch (coverUpdateError: any) {
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
          } catch (coverCommandError: any) {
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
        ? (entityStateLabels as any)[entityStateValue?.state] || entityStateValue?.state || "暂无状态"
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
          isOnState: any,
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
                coverVisualControllerElement!.dataset.lastClimateMode ||
                (entityStateValue?.state && entityStateValue.state !== "off"
                  ? entityStateValue.state
                  : fallbackClimateState);
            coverVisualControllerElement!.syncClimateState!({
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
          } catch (powerCommandError: any) {
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
      ? (climateStateInput: any) =>
          this.createClimateDetailsControls(detailEntityIdText, climateStateInput, {
            interactive: !isEntityDetailsPreview,
            deviceType: climateDeviceType,
            onPowerChange: (powerState: any) =>
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
            }: any) => {
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
          onVisualChange: (visualChangePayload: any) => lightVisualSync?.(visualChangePayload),
        })
      : isClimateEntity
        ? createClimateControls!(entityStateValue)
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
              onVisualChange: ({ position: visualPosition, state: visualState }: any) => {
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
                    : (coverPositionLabels as any)[coverVisualPresentationState] ||
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
              }: any) => {
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
            attributes: {} as Record<string, any>,
          };
      ((bathLightControl = this.createBathHeaterLightControl(
        bathHeaterLightEntityId,
        bathLightOptions,
        {
          interactive: !isEntityDetailsPreview,
          onStateChange: ({
            isOn: isBathLightOnValue,
            unavailable: isBathLightUnavailableValue,
          }: any) => {
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
        coverVisualControllerElement!.append(bathLightControl),
        coverVisualControllerElement!.syncClimateGrid?.());
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
      lineChartCurrentVisualElement: any = null,
      lineChartCurrentValue: any = null,
      lineChartUnitLabel: any = null;
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
          (lineChartContainer!.cleanupLineChartHover?.(),
            lineChartContainer!.replaceWith(lineChartDetails),
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
        apply: (chartState: any) => {
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
            lineChartContainer!.syncLineChartState?.(chartState),
            lineChartCurrentVisualElement.style.setProperty(
              "--hb-chart-current-color",
              lineChartContainer!.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
            ));
        },
      };
    } else {
      if (isToggleable && stateController) {
        const applyEntityState = (nextEntityState: any) => {
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
                coverVisualControllerElement!.dataset.climateStructureKey !== climateStructureKey
              ) {
                const climateControlsElement = createClimateControls!(nextEntityState);
                (climateControlsElement.classList.toggle(
                  "has-multiline-water-heater-extensions",
                  coverVisualControllerElement!.classList.contains(
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
                  coverVisualControllerElement!.replaceWith(climateControlsElement),
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
              [(coverStateArg: any) => coverVisualControllerElement?.syncCoverState?.(coverStateArg)],
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

export function connectRuntime(this: PanelRenderer, { force: isForcedConnect = false } = {}) {
    if (!this.document || this.destroyed) {
      this.disconnectRuntime();
      return;
    }
    const page = this.page || this.document.pages?.[0],
      sharedComponentsById = new Map(
        (this.document.sharedComponents || []).map((sharedComponent: any) => [
          sharedComponent.id,
          sharedComponent,
        ]),
      ),
      pageComponents = [
        ...(page?.sharedComponentIds || [])
          .map((isForcedConnectSharedComponentId: any) =>
            sharedComponentsById.get(isForcedConnectSharedComponentId),
          )
          .filter(Boolean),
        ...(page?.components || []),
      ],
      runtimeEntityIdSet = collectEntityIds2(pageComponents),
      activePopupEntry = this.activePopupId
        ? (this.document.customPopups || []).find(
            (popupModule: any) => String(popupModule.id || "") === this.activePopupId,
          )
        : null;
    for (const eventLogWallComponent of collectComponents2(
      pageComponents,
      (componentCandidate) => componentCandidate.type === "event-log-wall",
    )) {
      const eventLogWallProperties = eventLogWallComponent.properties || {};
      if (eventLogWallProperties.enabled === false) continue;
      if (String(eventLogWallProperties.watchScope || "auto") === "manual") {
        for (const manualEventLogWallEntityId of Array.isArray(eventLogWallProperties.entityIds)
          ? eventLogWallProperties.entityIds
          : [])
          manualEventLogWallEntityId &&
            !isVirtualEntityId2(manualEventLogWallEntityId) &&
            runtimeEntityIdSet.add(String(manualEventLogWallEntityId));
        continue;
      }
      const eventLogWallAutoBudget = Math.min(
        EVENT_LOG_WALL_AUTO_ENTITY_LIMIT,
        Math.max(0, maxRuntimeEntitySubscriptions - runtimeEntityIdSet.size),
      );
      let eventLogWallAutoCount = 0;
      for (const [eventLogWallAutoEntityId, eventLogWallAutoMetadata] of this.entityMetadata) {
        if (eventLogWallAutoCount >= eventLogWallAutoBudget) break;
        if (isVirtualEntityId2(eventLogWallAutoEntityId)) continue;
        if (
          !isEventLogWallDomain(eventLogWallAutoMetadata?.domain || eventLogWallAutoEntityId)
        )
          continue;
        runtimeEntityIdSet.add(eventLogWallAutoEntityId);
        eventLogWallAutoCount += 1;
      }
    }
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
            window.HomeOSLog?.report!("success", "实时连接", "实时状态连接已恢复", {
              phase: "websocket-reconnected",
              path: "/api/v1/ws/runtime",
            })!,
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
        } catch (runtimeMessageError: any) {
          window.HomeOSLog?.error!(
            runtimeMessageError,
            {
              phase: "websocket-message",
              path: "/api/v1/ws/runtime",
            },
            "实时状态消息格式异常",
          )!;
          return;
        }
        if (runtimeMessage.type === "snapshot") {
          this.runtimeSnapshotReady = true;
          const snapshotStates = runtimeMessage.states || [],
            restoredEntityIdSet = new Set(
              [...this.removedRuntimeEntityIds].filter((removedRuntimeEntityId) =>
                snapshotStates.some(
                  (snapshotState: any) =>
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
              .map((snapshotEntry: any) => String(snapshotEntry?.entityId || ""))
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
              (stateNeedingHydration: any) =>
                !lineChartRuntimeStateNeedsHydration2(stateNeedingHydration),
            ) &&
              (window.clearTimeout(this.runtimeHydrationRetryTimer!),
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
              attributes: {} as Record<string, any>,
              available: false,
            };
            if (
              (this.removedRuntimeEntityIds.add(removedEntityId),
              this.states.delete(removedEntityId),
              this.options.onRuntimeStateChange?.([]),
              this.tryOpenPendingEntityDetails(),
              this.detailsStateSync?.handlers?.has(removedEntityId))
            ) {
              for (const stateHandlerFn of this.detailsStateSync!.handlers.get(removedEntityId))
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
                const eventLogWallPreviousState = this.states.get(runtimeMessage.entityId);
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
                  for (const detailsHandler of this.detailsStateSync!.handlers.get(
                    runtimeMessage.entityId,
                  ))
                    detailsHandler(runtimeMessage.newState || runtimeMessage);
                } else
                  this.detailsStateSync?.entityId === runtimeMessage.entityId &&
                    this.detailsStateSync!.apply(runtimeMessage.newState || runtimeMessage);
                (this.applyRuntimeStateHandlers(
                  runtimeMessage.entityId,
                  runtimeMessage.newState || runtimeMessage,
                ),
                  this.pushEventLogWallEntries(
                    runtimeMessage.entityId,
                    eventLogWallPreviousState,
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
          window.clearTimeout(this.runtimeHydrationRetryTimer!),
          (this.runtimeHydrationRetryTimer = null),
          window.HomeOSLog?.report!(
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
          )!,
          socketCloseEvent.code === 4401)
        ) {
          // 配对码机制已移除：会话失效一律回登录页，登录后由路由守卫放行。
          navigateInShell("/login");
          return;
        }
        if (socketCloseEvent.code === 4403) {
          navigateInShell("/activate");
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

