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
import {
  applyRangeProgressCss as applyRangeProgressCss2,
  syncHtmlRangeProgress as syncHtmlRangeProgress2,
} from "../../utils/range-progress";
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
} from "./entity-role-profiles";
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
} from "./panel-dialog-motion";
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
} from "./panel-caches";
import { EVENT_LOG_WALL_AUTO_ENTITY_LIMIT, isEventLogWallDomain } from "../controls/event-log-runtime";
import {
  collectComponents as collectComponents2,
  collectEntityIds as collectEntityIds2,
  lineChartRuntimeStateNeedsHydration as lineChartRuntimeStateNeedsHydration2,
  syncedLineChartProperties as syncedLineChartProperties2,
} from "./panel-document";
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
} from "./renderer-types";
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
} from "./renderer-helpers";
import * as geometryMethods from "./renderer-geometry";
import * as panelRendererBulkMethods from "./renderer/panel-renderer-bulk-methods";
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
export interface PanelRenderer {
  componentParentTransform(transformChainComponentId: any): any;
  componentTransformChain(chainStartComponentId: any): any;
  componentWorldTransform(worldTransformComponentId: any): any;
  worldPointToComponentLocal(localPointComponentId: any, worldPointX: any, worldPointY: any): any;
  componentLocalPointToWorld(worldPointComponentKey: any, localPointX: any, localPointY: any): any;
  componentVisualBounds(boundsComponentRecord: any, boundsHostElement?: any): any;
  scaleRecordsBounds(componentSelectionEntries: any): any;
  refreshMultiSelectionBounds(): any;
  updateMultiSelectionHandleScale(multiSelectionHandleElement: any): any;
  appendMultiSelectionBounds(): any;
  renderComponent(
    renderComponentRecord: any,
    renderParentElement?: any,
    baseRenderZIndex?: any,
    componentIdToHostMap?: any,
    componentIdToEffectHostMap?: any,
  ): any;
  connectRuntime(options?: { force?: boolean }): any;
  showCustomPopup(customPopupModule: any, options?: any): any;
  showEntityDetails(entityDetailsComponent: any, options?: any): any;
  showVacuumDetails(vacuumComponent: any, options?: any): any;
  showPresenceDetails(presenceComponent: any, options?: any): any;
  showAirPurifierDetails(airPurifierComponent: any, options?: any): any;
  createCapabilityDetailsControls(...args: any[]): any;
  createClimateDetailsControls(...args: any[]): any;
  createLightDetailsControls(...args: any[]): any;
  createCoverDetailsControls(...args: any[]): any;
  createWaterHeaterExtensionControls(...args: any[]): any;
}
export class PanelRenderer {


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
  declare eventLogWallComponentIds: Set<any>;
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
  declare stagePrewarmTimer: ReturnType<typeof setTimeout> | null;
  declare retainedInteraction3d: any;
  declare prewarmingStageId: string | null;

  constructor(rootContainerElement: HTMLElement, rendererOptions: PanelRendererOptions = {}) {
    ((this.container = rootContainerElement),
      (this.options = {
        ...rendererOptions,
        onError: (errorObject) => {
          (window.HomeOSLog?.error!(errorObject, {
            phase: "runtime-operation",
          }),
            rendererOptions.onError?.(errorObject)!);
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
      (this.eventLogWallComponentIds = new Set()),
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
          this.suspendCameraMedia();
          for (const runtimeAbortController of this.historyAbortControllers)
            runtimeAbortController.abort("lifecycle");
          (window.clearTimeout(this.historyRetryTimer), (this.historyRetryTimer = 0));
        }
        if (document.visibilityState === "visible") {
          this.resumeCameraMedia();
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
  ["setDocument"](documentPayload: any, requestedPagePath: any = null) {
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
        window.clearTimeout(this.runtimeHydrationRetryTimer!),
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
                (documentPageRecord: any) => documentPageRecord.components || [],
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
          (searchedPageRecord: any) => searchedPageRecord.path === requestedPagePath,
        ),
        defaultPageRecord = this.document.pages.find(
          (defaultPathPageRecord: any) => defaultPathPageRecord.path === this.document.defaultPagePath,
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
            ...this.document.pages.flatMap((cameraPageRecord: any) => cameraPageRecord.components || []),
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
  ["refreshBuiltinAssets"](assetVersions: any[] = []) {
    const assetsChanged = setBuiltinAssetVersions2(assetVersions);
    return (
      assetsChanged && this.document && (this.renderComponents(true), this.preloadStaticImages()),
      assetsChanged
    );
  }
  ["preloadStaticImages"]() {
    if (!this.document || !this.page) return;
    const collectPageImageSources = (pageRecord: any) =>
        collectComponents2(
          pageRecord,
          (assetImageComponent) =>
            assetImageComponent.type === "image" && assetImageComponent.properties?.assetId,
        )
          .map((assetImageRecord) => staticAssetImageSource2(assetImageRecord.properties.assetId))
          .filter(Boolean),
      sharedComponentById = new Map(
        (this.document.sharedComponents || []).map((sharedComponentRecord: any) => [
          sharedComponentRecord.id,
          sharedComponentRecord,
        ]),
      ),
      pageSharedComponents = (this.page.sharedComponentIds || [])
        .map((sharedComponentId: any) => sharedComponentById.get(sharedComponentId))
        .filter(Boolean),
      pageImageSources = collectPageImageSources([
        ...(this.page.components || []),
        ...pageSharedComponents,
      ]),
      sharedImageSources = collectPageImageSources([
        ...(this.document.sharedComponents || []),
        ...this.document.pages.flatMap((documentPageEntry: any) => documentPageEntry.components || []),
      ]);
    this.runtimeStaticImageCache.setSources(sharedImageSources, pageImageSources);
  }
  ["setEntityCatalog"](
    entityCatalogEntries: any[] = [],
    entityTranslations: Record<string, any> = {},
    deviceCatalogEntries: any[] = [],
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
  ["deviceProfile"](runtimeEntityKey: any) {
    return resolveXiaomiDeviceProfile2(
      runtimeEntityKey,
      this.entityMetadata,
      this.deviceMetadata,
      this.states,
    );
  }
  ["runtimeEntityId"](entityIdValue: any) {
    return String(entityIdValue || "");
  }
  ["iconVisibilityPageKey"]() {
    return String(this.page?.path || this.page?.id || "current-page");
  }
  /** 图标可视化是否可见； */
  ["iconVisibilityState"](_iconVisibilityComponent: any = null) {
    return this.virtualEntityStates.get(this.iconVisibilityPageKey()) !== false;
  }
  ["toggleVirtualEntity"](virtualEntityId: any) {
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
        attributes: {} as Record<string, any>,
      }),
      this.renderComponents(true));
  }
  ["waterHeaterDetailsReady"](waterHeaterEntityId: any) {
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
    detailsComponentRecord: any,
    detailsPreviewEntry: any,
    deferReasonText = "water-heater",
  ) {
    this.cancelPendingEntityDetails();
    const pendingDetailsRequest = {
        component: structuredClone(detailsComponentRecord),
        preview: detailsPreviewEntry,
        reason: deferReasonText,
        retryTimer: null as any,
        timer: null as any,
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
    profiledEntityComponent: any,
    profiledEntityId = profiledEntityComponent?.bindings?.entity?.entityId || "",
  ) {
    return applyXiaomiDeviceProfile2(
      profiledEntityComponent,
      this.deviceProfile(this.runtimeEntityId(profiledEntityId)) ||
        this.deviceProfile(profiledEntityId),
    );
  }
  ["powerEntityId"](
    powerTargetComponent: any,
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
    runtimePowerSourceComponent: any,
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
  ["navigate"](targetPagePath: any) {
    const targetPageRecord = this.document?.pages.find(
      (pageCandidate: any) => pageCandidate.path === targetPagePath,
    );
    targetPageRecord &&
      (targetPageRecord !== this.page && this.closeRuntimeDialog(),
      (this.page = targetPageRecord),
      window.clearTimeout(this.runtimeHydrationRetryTimer!),
      (this.runtimeHydrationRetryTimer = null),
      (this.runtimeHydrationRetryAttempt = 0),
      this.preloadStaticImages(),
      this.renderComponents(),
      this.connectRuntime(),
      this.refreshHistorySeries(),
      this.options.onPageChange?.(targetPageRecord));
  }
  ["setSelectedComponent"](selectedComponentIdValue: any) {
    this.setSelectedComponents(
      selectedComponentIdValue ? [selectedComponentIdValue] : [],
      selectedComponentIdValue,
    );
  }
  ["setSelectedComponents"](nextSelectedIds: any, primarySelectedId: any = null) {
    ((this.selectedComponentIds = new Set(
      (nextSelectedIds || []).filter(
        (existingSelectedId: any) => !!this.componentRecords.get(existingSelectedId),
      ),
    )),
      (this.selectedComponentId = this.selectedComponentIds.has(primarySelectedId)
        ? primarySelectedId
        : this.selectedComponentIds.values().next().value || null),
      this.syncSelection());
  }
  ["setActiveGroup"](activeGroupIdValue: any = null) {
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
  ["setComponentSelectionLayer"](layerComponentId: any, selectionLayerName = "button") {
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
  ["setComponentPreviewState"](previewComponentId: any, previewStateValue = "auto") {
    (previewStateValue === "on" || previewStateValue === "off"
      ? this.componentPreviewStates.set(previewComponentId, previewStateValue)
      : this.componentPreviewStates.delete(previewComponentId),
      this.previewComponentProperties(previewComponentId));
  }
  ["previewComponentTransform"](transformComponentId: any, transformInput: Record<string, number> = {}) {
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
  ["previewComponentProperties"](propertyComponentId: any, propertyOverrides: ComponentPayload = {}) {
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
          isIconVisible: (iconVisibilityComponent: any) =>
            this.iconVisibilityState(iconVisibilityComponent),
          navigate: (navigationPath: any) => this.navigate(navigationPath),
          cleanup: (cleanupCallback: any) => this.cleanups.push(cleanupCallback),
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
        .forEach((staleAirflowElement: any) => staleAirflowElement.remove());
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
          .forEach((staleOverlayElement: any) => staleOverlayElement.remove()),
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
  ["previewComponentsTransform"](
    componentTransforms: any,
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
    scalePointerEvent: any,
    scaleEntries: any,
    selectionBounds: any,
    measurementHostElement: any,
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
      scaledEntries = scaleEntries.map((entryRecord: any) => {
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
      minScaleFactor = Math.max(...scaledEntries.map((scaleEntry: any) => 0.01 / scaleEntry.scale)),
      maxScaleFactor = Math.min(
        ...scaledEntries.map((scaleEntryLimit: any) => 5 / scaleEntryLimit.scale),
      );
    let appliedScaleFactor = 1,
      transformPreviewEntries: any = [],
      hasStartedScaling = false;
    const pointerId = scalePointerEvent.pointerId;
    scalePointerEvent.currentTarget.setPointerCapture(pointerId);
    const scaleMoveHandler = (scaleMoveEvent: any) => {
        if (scaleMoveEvent.pointerId !== pointerId) return;
        const hypot = Math.hypot(
          scaleMoveEvent.clientX - hostCenterX,
          scaleMoveEvent.clientY - hostCenterY,
        );
        ((appliedScaleFactor = Math.max(
          minScaleFactor,
          Math.min(maxScaleFactor, hypot / initialPointerDistance),
        )),
          (transformPreviewEntries = scaledEntries.map((scaledEntry: any) => {
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
      scaleEndHandler = (scaleEndEvent: any = null) => {
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
    airflowComponentRotateEvent: any,
    rotateEntries: any,
    rotationBounds: any,
    rotationHostElement: any,
  ) {
    (airflowComponentRotateEvent.preventDefault(), airflowComponentRotateEvent.stopPropagation());
    const rotationHostRect = rotationHostElement.getBoundingClientRect(),
      rotationCenterX = rotationHostRect.left + rotationHostRect.width / 2,
      rotationCenterY = rotationHostRect.top + rotationHostRect.height / 2,
      rotationBoundsCenterX = (rotationBounds.left + rotationBounds.right) / 2,
      rotationBoundsCenterY = (rotationBounds.top + rotationBounds.bottom) / 2,
      rotatableEntries = rotateEntries.map((rotatableEntry: any) => {
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
      rotatedPreviewEntries: any = [],
      hasRotated = false;
    const pointerId2 = airflowComponentRotateEvent.pointerId;
    airflowComponentRotateEvent.currentTarget.setPointerCapture(pointerId2);
    const rotateMoveHandler = (rotateMoveEvent: any) => {
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
            (rotationMatchEntry: any) =>
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
      rotateEndHandler = (rotateEndEvent: any = null) => {
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
  ["suspendCameraMedia"]() {
    if (this.destroyed) return;
    for (const cameraCleanupList of this.cameraCleanups.values())
      for (const cameraCleanupCallback of cameraCleanupList.splice(0)) cameraCleanupCallback();
    this.cameraCleanups.clear();
  }
  ["resumeCameraMedia"]() {
    if (this.destroyed || !this.document || document.visibilityState === "hidden") return;
    this.renderComponents(true);
  }
  ["cleanupComponents"](shouldPreserveSelection = false, retainedComponentIds = new Set()) {
    (clearTimeout(this.stagePrewarmTimer ?? undefined),
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
  ["registerComponentCleanup"](cleanupComponentId: any, componentCleanupFunction: any) {
    !cleanupComponentId ||
      typeof componentCleanupFunction != "function" ||
      (this.componentCleanups.has(cleanupComponentId) ||
        this.componentCleanups.set(cleanupComponentId, []),
      this.componentCleanups.get(cleanupComponentId).push(componentCleanupFunction));
  }
  ["scheduleInteraction3dPrewarm"]() {
    (clearTimeout(this.stagePrewarmTimer ?? undefined),
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
              (this.document.sharedComponents || []).map((sharedComponentDefinition: any) => [
                sharedComponentDefinition.id,
                sharedComponentDefinition,
              ]),
            ),
            pageComponentsWithShared = (sourcePageRecord: any) => [
              ...(sourcePageRecord.components || []),
              ...(sourcePageRecord.sharedComponentIds || [])
                .map((sharedComponentKey: any) => sharedComponentMapById.get(sharedComponentKey))
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
            .filter((candidatePageRecord: any) => candidatePageRecord !== this.page)
            .flatMap(pageComponentsWithShared)
            .find(
              (interaction3dPageComponent: any) =>
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
              timer: null as any,
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
  ["cleanupRenderedComponent"](cleanupTargetComponentId: any) {
    const componentCleanupCallbacks = this.componentCleanups.get(cleanupTargetComponentId) || [];
    this.componentCleanups.delete(cleanupTargetComponentId);
    for (const cleanupRunnable of componentCleanupCallbacks.splice(0)) cleanupRunnable();
  }
  ["render"](dirtyComponentIds: any = null) {
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
  ["renderComponents"](isForcedRender = false, retainedInteractionIds: any = null) {
    if (!this.canvas || !this.page) return;
    const sharedComponentLookupMap = new Map(
        (this.document.sharedComponents || []).map((sharedComponentEntry: any) => [
          sharedComponentEntry.id,
          sharedComponentEntry,
        ]),
      ),
      sharedComponentList = (this.page.sharedComponentIds || [])
        .map((sharedComponentKeyId: any) => sharedComponentLookupMap.get(sharedComponentKeyId))
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
      attributes: {} as Record<string, any>,
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
                  (documentPageComponent: any) => documentPageComponent.components || [],
                ),
              ],
              (interaction3dPageEntry) => interaction3dPageEntry.type === "interaction3d",
            ).map((interaction3dPageDefinition) => [
              interaction3dPageDefinition.id,
              interaction3dPageDefinition,
            ]),
          )
        : new Map(),
      interaction3dMatches = (expectedInteractionComponent: any, actualInteractionComponent: any) =>
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
            timer: null as any,
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
    stateHandlerEntityId: any,
    stateHandlerFunction: any,
    stateHandlerComponentId: any = null,
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
  ["registerHistoryChartRefresher"](historyRefresherFunction: any, historyRefresherComponentId: any = null) {
    if (typeof historyRefresherFunction != "function") return;
    this.historyChartRefreshers.add(historyRefresherFunction);
    const deregisterHistoryRefresher = () =>
      this.historyChartRefreshers.delete(historyRefresherFunction);
    historyRefresherComponentId
      ? this.registerComponentCleanup(historyRefresherComponentId, deregisterHistoryRefresher)
      : this.cleanups.push(deregisterHistoryRefresher);
  }
  ["applyRuntimeStateHandlers"](handledEntityId: any, entityStateSnapshot: any) {
    for (const entityStateHandler of this.runtimeStateHandlers.get(String(handledEntityId || "")) ||
      [])
      entityStateHandler(entityStateSnapshot);
  }
  ["pushEventLogWallEntries"](handledEntityId: any, previousStateEntry: any, nextStateEntry: any) {
    if (!this.eventLogWallComponentIds.size || !isEventLogWallDomain(handledEntityId)) return;
    for (const eventLogWallComponentId of this.eventLogWallComponentIds) {
      const eventLogWallHostElement = this.componentHosts.get(eventLogWallComponentId);
      if (!eventLogWallHostElement?.isConnected) continue;
      const eventLogWallProperties =
        this.componentRecords.get(eventLogWallComponentId)?.properties || {};
      if (eventLogWallProperties.enabled === false) continue;
      if (
        String(eventLogWallProperties.watchScope || "auto") === "manual" &&
        !(
          Array.isArray(eventLogWallProperties.entityIds) &&
          eventLogWallProperties.entityIds.includes(handledEntityId)
        )
      )
        continue;
      eventLogWallHostElement
        .querySelector(".hb-event-log-wall")
        ?.pushEvent?.(handledEntityId, previousStateEntry, nextStateEntry);
    }
  }
  ["runtimeEntityIdsForComponent"](runtimeEntityComponent: any) {
    const runtimeEntityIdCollection = collectEntityIds2([
        {
          ...runtimeEntityComponent,
          children: [] as any[],
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
  ["indexRuntimeComponent"](indexedComponent: any) {
    indexedComponent.type === "event-log-wall" &&
      indexedComponent.id &&
      this.eventLogWallComponentIds.add(indexedComponent.id);
    for (const indexedEntityId of this.runtimeEntityIdsForComponent(indexedComponent))
      (this.runtimeEntityComponentIndex.has(indexedEntityId) ||
        this.runtimeEntityComponentIndex.set(indexedEntityId, new Set()),
        this.runtimeEntityComponentIndex.get(indexedEntityId).add(indexedComponent.id));
  }
  ["unindexRuntimeComponent"](unindexedComponent: any) {
    this.eventLogWallComponentIds.delete(unindexedComponent);
    for (const [indexedEntityKey, componentIndexSet] of this.runtimeEntityComponentIndex)
      (componentIndexSet.delete(unindexedComponent),
        componentIndexSet.size || this.runtimeEntityComponentIndex.delete(indexedEntityKey));
  }
  ["runtimeComponentContent"](renderHostElement: any) {
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
  ["refreshRuntimeComponent"](refreshComponentId: any) {
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
        isIconVisible: (iconVisibilityEntityId: any) => this.iconVisibilityState(iconVisibilityEntityId),
        navigate: (navigationTargetPath: any) => this.navigate(navigationTargetPath),
        callEntityService: (...serviceCallArgs: [any, any, any, any?]) =>
          this.callEntityService(...serviceCallArgs),
        openCameraPreview: (interaction3dCameraRecord: any, cameraOptions: any, cameraCallback: any) =>
          this.openInteraction3dCameraPreview(
            interaction3dCameraRecord,
            cameraOptions,
            cameraCallback,
          ),
        openVacuumDetails: (vacuumComponentRecord: any, vacuumOptions: any, vacuumCallback: any) =>
          this.openInteraction3dVacuumDetails(vacuumComponentRecord, vacuumOptions, vacuumCallback),
        runVacuumRoom: (vacuumRoomRecord: any) =>
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
              data: {} as Record<string, any>,
            },
          ),
        onError: (renderErrorObject: any) => this.options.onError?.(renderErrorObject),
        openEntityDetails: (eventLogWallEntityId: any) => {
          const entityId = String(eventLogWallEntityId || "").trim();
          if (!entityId) return;
          navigateInShell(`/device?id=${encodeURIComponent(entityId)}`);
        },
        registerRuntimeStateHandler: (stateHandlerEntityKey: any, stateHandlerCallback: any) =>
          this.registerRuntimeStateHandler(
            stateHandlerEntityKey,
            stateHandlerCallback,
            refreshComponentId,
          ),
        runtimeStateReady: () => this.runtimeSnapshotReady === true,
        invalidate: () => this.refreshRuntimeComponent(refreshComponentId),
        cleanup: (refreshCleanupCallback: any) =>
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
  ["refreshEditorComponent"](editorComponentId: any) {
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
  ["refreshRuntimeComponents"](dirtyEntityIds: any) {
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
  ["applyEditorComponentUpdates"](updatedDocument: any, updatedPagePath: any, componentUpdates: any[] = []) {
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
          (resolvedTargetPage: any) => resolvedTargetPage.path === updatedPagePath,
        ) ||
        this.document.pages?.find(
          (fallbackPageRecord: any) => fallbackPageRecord.path === this.document.defaultPagePath,
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
          (replacedComponentRecord.children = childComponentList.map((childComponentDefinition: any) =>
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
              nestedComponentCandidate.type!,
            ),
        ))
          refreshedComponentIdSet.add(nestedComponentRecord.id!);
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
  ["scheduleRuntimeRender"](scheduledEntityId: any, renderDelayMs = 120) {
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
  ["setEffectLayerActive"](effectLayerElement: any, isEffectLayerActive: any, effectFadeDurationSec = 0) {
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
  ["syncEffectLayerLightVisual"](lightEffectComponent: any, lightEffectLayerElement: any) {
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
  ["cachedLightVisualState"](cachedLightEntityId: any) {
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
  ["rememberLightVisualState"](rememberedLightEntityId: any, rememberedLightState: any) {
    const lightEntityIdKey = String(rememberedLightEntityId || ""),
      lightStatePayload = rememberedLightState?.newState || rememberedLightState;
    if (!lightEntityIdKey.startsWith("light.") || !lightStatePayload?.attributes) return;
    const attributes = lightStatePayload.attributes,
      hasAttributeValue = (attributeName: any) =>
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
  ["optimisticStateIsConfirmed"](optimisticEntityId: any, optimisticInputPayload: any) {
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
  ["updateOptimisticToggleVisuals"](optimisticToggleEntityId: any, componentIdFilterSet: any = null) {
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
            isIconVisible: (iconVisibilityEntityKey: any) =>
              this.iconVisibilityState(iconVisibilityEntityKey),
            navigate: (navigationPathValue: any) => this.navigate(navigationPathValue),
            invalidate: () =>
              this.updateOptimisticToggleVisuals("", new Set([optimisticComponentId])),
            cleanup: (effectCleanupCallback: any) =>
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
            isIconVisible: (conditionerIconEntityId: any) =>
              this.iconVisibilityState(conditionerIconEntityId),
            navigate: (conditionerNavigationPath: any) => this.navigate(conditionerNavigationPath),
            invalidate: () =>
              this.updateOptimisticToggleVisuals("", new Set([optimisticComponentId])),
            cleanup: (conditionerCleanupCallback: any) =>
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
            isIconVisible: (airflowIconEntityId: any) => this.iconVisibilityState(airflowIconEntityId),
            navigate: (airflowNavigationPath: any) => this.navigate(airflowNavigationPath),
            invalidate: () =>
              this.updateOptimisticToggleVisuals("", new Set([optimisticComponentId])),
            cleanup: (airflowCleanupCallback: any) =>
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
  ["refreshVacuumMapEntity"](vacuumImageEntityId: any) {
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
  ["applyOptimisticToggle"](optimisticToggleTarget: any, optimisticComponent: any = null) {
    const optimisticEntityIdString = optimisticToggleTarget,
      powerEntityId4 = this.powerEntityId(optimisticComponent, optimisticEntityIdString),
      optimisticStateRecord = this.states.get(powerEntityId4),
      optimisticStatePayload = optimisticStateRecord?.newState ||
        optimisticStateRecord || {
          entityId: powerEntityId4,
          attributes: {} as Record<string, any>,
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
  ["startComponentMove"](
    movePointerEvent: any,
    moveComponentRecord: any,
    moveHostElement: any,
    pointerTargetElement = moveHostElement,
  ) {
    if (
      !this.options.editable ||
      moveComponentRecord.properties?.layoutMode === "fill" ||
      movePointerEvent.button !== 0 ||
      movePointerEvent.target.closest(".hb-transform-handle")
    )
      return;
    // 画布点击：未选中则先选中（⌘/Ctrl 切换多选），再进入拖拽
    if (!this.selectedComponentIds.has(moveComponentRecord.id)) {
      const toggle = isPrimaryModifierPressed(movePointerEvent);
      if (toggle) {
        this.selectedComponentIds.add(moveComponentRecord.id);
        this.selectedComponentId = moveComponentRecord.id;
      } else {
        this.selectedComponentIds = new Set([moveComponentRecord.id]);
        this.selectedComponentId = moveComponentRecord.id;
      }
      this.options.onSelectionChange?.(
        [...this.selectedComponentIds],
        this.selectedComponentId,
      );
      this.setSelectedComponents([...this.selectedComponentIds], this.selectedComponentId);
    }
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
      duplicatedEntries: any = [],
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
    const dragMoveHandler = (dragMoveEvent: any) => {
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
            (draggedEntries = duplicatedEntries.map((duplicatedEntry: any, duplicatedIndex: any) => ({
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
                (duplicateMatchEntry: any) =>
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
      dragEndHandler = (dragEndEvent: any = null) => {
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
  ["createComponentSelectionOverlay"](overlayHostElement: any, overlayComponentRecord: any) {
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
  ["createAirflowSelectionOverlay"](airflowLayerHostElement: any, airflowComponentRecord: any) {
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
    airflowLayerTargetElement: any,
    geometryComponentRecord: any,
    geometryOverlayElement: any = null,
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
  ["appendEffectSelectionBounds"](effectBoundsHostElement: any, effectBoundsComponent: any) {
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
  ["syncComponentSelectionOverlay"](overlayComponentId: any) {
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
    handleHostElement: any,
    handleComponentRecord: any,
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
  ["withSelectionMeasurementHost"](measurementRootElement: any, measurementTask: any) {
    const hiddenElements: any[] = [];
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
  ["selectionElementIsVisible"](measuredElement: any) {
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
  ["selectionElementBox"](boxElement: any, boxStopElement: any) {
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
    doorWindowHostElement: any,
    doorWindowComponentRecord: any,
    perspectiveCornersArray: any,
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
  ["updateDoorWindowPerspectiveHandles"](perspectiveBoundsElement: any, perspectiveCornerValues: any) {
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
        .forEach((perspectiveHandleElement: any) => {
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
    doorWindowHandleHost: any,
    doorWindowHandleComponent: any,
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
    perspectivePointerEvent: any,
    perspectiveComponentRecord: any,
    perspectiveLayerElement: any,
    perspectiveHandleBoundsElement: any,
    perspectiveCornerIndex: any,
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
    const perspectiveMoveHandler = (perspectiveMoveEvent: any) => {
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
      perspectiveEndHandler = (perspectiveEndEvent: any = null) => {
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
  ["appendAirflowTransformHandles"](airflowHandleLayerElement: any, airflowHandleComponent: any) {
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
    airflowMovePointerEvent: any,
    airflowMoveComponent: any,
    airflowMoveLayerElement: any,
    airflowMoveCaptureElement: any,
    airflowMoveOverlayElement: any,
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
    const airflowMoveHandler = (airflowMovePointer: any) => {
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
      airflowEndHandler = (airflowEndEvent: any = null) => {
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
  ["updateAirflowHandleScale"](airflowScaleComponent: any, airflowScaleLayerElement: any) {
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
    airflowScalePointerEvent: any,
    airflowScaleComponentRecord: any,
    airflowScaleLayerTarget: any,
    airflowScaleHandleElement: any,
    airflowScaleOverlayElement: any,
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
      airflowScaleMoveHandler = (airflowScaleMoveEvent: any) => {
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
    airflowRotatePointerEvent: any,
    airflowRotateComponent: any,
    airflowRotateLayerElement: any,
    airflowRotateTargetElement: any,
    airflowRotateOverlayElement: any,
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
    const airflowRotateMoveHandler = (airflowRotateMoveEvent: any) => {
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
    acBoundsHostElement: any,
    acBoundsComponent: any,
    acBoundsElement: any,
  ) {
    if (!acBoundsHostElement || acBoundsComponent?.type !== "air-conditioner" || !acBoundsElement)
      return;
    const acProperties = acBoundsComponent.properties || {},
      acWidth = Math.max(1, Number(acBoundsComponent.position?.width || 100)),
      acHeight = Math.max(1, Number(acBoundsComponent.position?.height || 100)),
      acComponentScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1)),
      acBoundsEntries: any = [],
      clampOptionValue = (optionRawValue: any, optionMinValue: any, optionMaxValue: any, optionFallbackValue: any) => {
        const optionNumericValue = Number(optionRawValue);
        return Math.max(
          optionMinValue,
          Math.min(
            optionMaxValue,
            Number.isFinite(optionNumericValue) ? optionNumericValue : optionFallbackValue,
          ),
        );
      },
      pushBoundsRect = (rectCenterX: any, rectCenterY: any, rectWidth: any, rectHeight: any) => {
        acBoundsEntries.push({
          left: rectCenterX - rectWidth / 2,
          top: rectCenterY - rectHeight / 2,
          right: rectCenterX + rectWidth / 2,
          bottom: rectCenterY + rectHeight / 2,
        });
      },
      measureIconBounds = (iconElement: any, iconLeftOption: any, iconTopOption: any, iconMinSize: any) => {
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
      acBoundsLeft = Math.min(...acBoundsEntries.map((acEntry: any) => acEntry.left)) - acBoundsPadding,
      acBoundsTop =
        Math.min(...acBoundsEntries.map((acEntryTop: any) => acEntryTop.top)) - acBoundsPadding,
      acBoundsRight =
        Math.max(...acBoundsEntries.map((acBoundsEntryRight: any) => acBoundsEntryRight.right)) +
        acBoundsPadding,
      acBoundsBottom =
        Math.max(...acBoundsEntries.map((acBoundsEntryBottom: any) => acBoundsEntryBottom.bottom)) +
        acBoundsPadding;
    Object.assign(acBoundsElement.style, {
      left: acBoundsLeft + "px",
      top: acBoundsTop + "px",
      width: Math.max(1, acBoundsRight - acBoundsLeft) + "px",
      height: Math.max(1, acBoundsBottom - acBoundsTop) + "px",
    });
  }
  ["updateDeviceButtonSelectionBounds"](
    deviceBoundsHostElement: any,
    deviceBoundsComponent: any,
    deviceBoundsElement: any,
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
      deviceBoundsEntries: any = [],
      clampDeviceValue = (
        deviceOptionRaw: any,
        deviceOptionMin: any,
        deviceOptionMax: any,
        deviceOptionFallback: any,
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
        deviceRectCenterX: any,
        deviceRectCenterY: any,
        deviceRectWidth: any,
        deviceRectHeight: any,
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
        deviceIconElement: any,
        deviceIconLeftOption: any,
        deviceIconTopOption: any,
        deviceIconMinSize: any,
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
        Math.min(...deviceBoundsEntries.map((deviceEntry: any) => deviceEntry.left)) -
        deviceBoundsPadding,
      deviceBoundsTop =
        Math.min(...deviceBoundsEntries.map((deviceEntryTop: any) => deviceEntryTop.top)) -
        deviceBoundsPadding,
      deviceBoundsRight =
        Math.max(
          ...deviceBoundsEntries.map((deviceBoundsEntryRight: any) => deviceBoundsEntryRight.right),
        ) + deviceBoundsPadding,
      deviceBoundsBottom =
        Math.max(
          ...deviceBoundsEntries.map((deviceBoundsEntryBottom: any) => deviceBoundsEntryBottom.bottom),
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
    titleBoundsHostElement: any,
    titleBoundsComponent: any,
    titleBoundsElement: any,
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
      titleBoundsEntries: any = [],
      pushTitleBoundsRect = (
        titleRectCenterX: any,
        titleRectCenterY: any,
        titleRectWidth: any,
        titleRectHeight: any,
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
      clampTitleValue = (titleOptionRaw: any, titleOptionMin: any, titleOptionMax: any, titleOptionFallback: any) => {
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
        Math.min(...titleBoundsEntries.map((titleEntry: any) => titleEntry.left)) - titleBoundsPadding,
      titleBoundsTop =
        Math.min(...titleBoundsEntries.map((titleEntryTop: any) => titleEntryTop.top)) -
        titleBoundsPadding,
      titleBoundsRight =
        Math.max(
          ...titleBoundsEntries.map((titleBoundsEntryRight: any) => titleBoundsEntryRight.right),
        ) + titleBoundsPadding,
      titleBoundsBottom =
        Math.max(
          ...titleBoundsEntries.map((titleBoundsEntryBottom: any) => titleBoundsEntryBottom.bottom),
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
    statsBoundsHostElement: any,
    statsBoundsComponent: any,
    statsBoundsElement: any,
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
  ["updateTextSelectionBounds"](textBoundsHostElement: any, textBoundsComponent: any, textBoundsElement: any) {
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
    imageBoundsHostElement: any,
    imageBoundsComponent: any,
    imageBoundsElement: any,
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
    transformHandleHostElement: any,
    transformHandleComponent: any,
    transformHandleBoundsElement: any = null,
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
    scaleComponentPointerEvent: any,
    scalingComponentRecord: any,
    scalingHostElement: any,
    scalingBoundsElement: any,
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
    const componentScaleMoveHandler = (componentScaleMoveEvent: any) => {
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
      componentScaleEndHandler = (componentScaleEndEvent: any = null) => {
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
    rotateComponentPointerEvent: any,
    rotatingComponentRecord: any,
    rotatingHostElement: any,
    rotatingBoundsElement: any,
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
    const componentRotateMoveHandler = (componentRotateMoveEvent: any) => {
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
      componentRotateEndHandler = (componentRotateEndEvent: any = null) => {
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
  ["bindRuntimeActions"](actionHostElement: any, actionOptions: any) {
    let tapTimeoutId: any = null,
      holdTimeoutId: any = null,
      moveTimeoutId: any = null,
      hasLongPressed = false,
      activePointerRecord: any = null,
      lastTapRecord: any = null,
      tapCooldownUntil = 0,
      optimisticRollbackHandler: any = null,
      optimisticPreviousState: any;
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
      actionHostElement.addEventListener("contextmenu", (menuPointerEvent: any) =>
        menuPointerEvent.preventDefault(),
      ),
      actionHostElement.addEventListener("selectstart", (selectStartEvent: any) =>
        selectStartEvent.preventDefault(),
      ),
      actionHostElement.addEventListener("dragstart", (dragStartEvent: any) =>
        dragStartEvent.preventDefault(),
      ),
      actionHostElement.addEventListener("pointerdown", (pointerDownEvent: any) => {
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
    (actionHostElement.addEventListener("pointermove", (pointerMoveEvent: any) => {
      !activePointerRecord ||
        activePointerRecord.pointerId !== pointerMoveEvent.pointerId ||
        Math.hypot(
          pointerMoveEvent.clientX - activePointerRecord.x,
          pointerMoveEvent.clientY - activePointerRecord.y,
        ) <= 18 ||
        ((activePointerRecord.moved = true), clearLongPressTimer());
    }),
      actionHostElement.addEventListener("pointerup", (pointerUpEvent: any) => {
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
  ["runAction"](runtimeActionComponent: any, actionPayload: any, actionRuntimeOptions: Record<string, any> = {}) {
    !actionPayload?.type ||
      actionPayload.type === "none" ||
      this.dispatchAction(runtimeActionComponent, actionPayload, actionRuntimeOptions).catch(
        (actionError) => {
          (window.HomeOSLog?.error!(actionError, {
            componentId: runtimeActionComponent.id,
            entityId: runtimeActionComponent.bindings?.entity?.entityId || "",
            phase: "component-action",
          }),
            this.options.onError?.(actionError)!);
        },
      );
  }
  ["previewAction"](actionPreviewComponent: any, previewActionPayload: any) {
    previewActionPayload?.type === "more-info" &&
      this.showActionPopup(actionPreviewComponent, previewActionPayload, {
        preview: true,
      });
  }
  ["popupComponentForEntity"](popupEntityId: any, popupLabel = "") {
    let resolvedEntityId = String(popupEntityId || ""),
      entityDomain = resolvedEntityId.split(".")[0];
    const targetDeviceProfile = this.deviceProfile(resolvedEntityId);
    targetDeviceProfile?.deviceType === "air-purifier" &&
      targetDeviceProfile.roles?.fan &&
      entityDomain !== "fan" &&
      ((resolvedEntityId = targetDeviceProfile.roles.fan), (entityDomain = "fan"));
    const roleEntityId =
      targetDeviceProfile?.roles?.climate || targetDeviceProfile?.roles?.fan || "";
    ["air-conditioner", "bath-heater"].includes(targetDeviceProfile?.deviceType!) &&
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
          : (["air-conditioner", "bath-heater"].includes(targetDeviceProfile?.deviceType!) &&
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
        ...(["air-conditioner", "bath-heater"].includes(targetDeviceProfile?.deviceType!)
          ? {
              deviceType: targetDeviceProfile!.deviceType,
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
      actions: {} as Record<string, any>,
    };
  }
  ["showActionPopup"](popupComponent: any, popupActionRecord: any, { preview: isPopupPreview = false } = {}) {
    const popupSourceMode = popupActionRecord?.data?.popupSource || "current";
    if (popupSourceMode === "custom") {
      const customPopupRecord = (this.document?.customPopups || []).find(
        (customPopupCandidate: any) => customPopupCandidate.id === popupActionRecord.data?.popupId,
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
    toggleComponentRecord: any,
    toggleActionRecord: any,
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
      } catch (toggleError: any) {
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
          (pageRecordCandidate: any) => pageRecordCandidate.path === toggleActionRecord.target,
        )
      )
        throw new Error("跳转的页面不存在。");
      this.navigate(toggleActionRecord.target);
    }
  }
  async ["callEntityService"](serviceDomain: any, serviceName: any, serviceEntityId: any, servicePayload: Record<string, any> = {}) {
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
      throw window.HomeOSLog?.linkError!(error, serviceResponse)! || error;
    }
  }
  async ["browseMedia"](mediaEntityId: any, mediaContentId = "media-source://", mediaContentType = "") {
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
  ["createMediaBrowserControl"](mediaBrowserEntityId: any, { preview: isMediaPreview = false } = {}) {
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
      mediaHistoryEntries: any = [],
      isMediaBusy = false,
      isMediaAvailable = false;
    const setMediaStatus = (mediaStatusText = "") => {
        mediaBrowserStatusElement.textContent = mediaStatusText;
      },
      closeMediaBrowser = () => {
        ((mediaBrowserPanelElement.hidden = true),
          mediaBrowserTriggerElement.setAttribute("aria-expanded", "false"));
      },
      setMediaBusy = (busyFlag: any) => {
        ((isMediaBusy = !!busyFlag),
          (mediaBrowserTriggerElement.disabled =
            isMediaPreview || isMediaBusy || !isMediaAvailable),
          (mediaBrowserBackElement.disabled = isMediaBusy),
          mediaBrowserListElement.querySelectorAll("button").forEach((mediaButtonElement) => {
            mediaButtonElement.disabled = isMediaBusy;
          }));
      },
      mediaItemTitle = (mediaEntry: any) =>
        String(
          mediaEntry?.title || mediaEntry?.name || mediaEntry?.media_content_id || "未命名媒体",
        ),
      loadMediaDirectory = async (
        targetContentId: any,
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
            (children2.forEach((mediaChildEntry: any) => {
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
                    } catch (mediaPlayError: any) {
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
          } catch (mediaLoadError: any) {
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
        sync: (mediaSyncState: any) => {
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
    dialogLayerElement: any,
    dialogElement: any,
    dialogDesignWidth: any,
    dialogDesignHeight: any,
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
      layoutObserver: null as any,
      entranceAnimations: [] as any[],
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
  ["clearRuntimeDialogScale"](closingDialogElement: any) {
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
    outsideDismissLayer: any,
    outsideClickDialog: any,
    outsideDismissCardElement: any,
  ) {
    const outsideClickGraceUntilMs = performance.now() + 320;
    outsideDismissLayer.addEventListener("click", (outsideClickEvent: any) => {
      outsideDismissCardElement.contains(outsideClickEvent.target) ||
        (outsideClickEvent.preventDefault(),
        outsideClickEvent.stopPropagation(),
        !(performance.now() < outsideClickGraceUntilMs) && outsideClickDialog.close());
    });
  }
  ["openInteraction3dCameraPreview"](
    cameraControlComponent: any,
    cameraPreviewCloseHandler: any,
    cameraPreviewOptions: Record<string, any> = {},
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
        contains: (domTargetNode: any) => detailsDialog?.contains(domTargetNode),
      }
    );
  }
  ["showCameraPreview"](
    cameraComponent: any,
    { preview: isCameraPreview = false, interaction3d: cameraInteractionConfig = null }: any = {},
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
      cameraMotionAnimation: any = null,
      cameraPreviousAngle = 0;
    const formatCameraTiltTransform = (tiltAngleDeg: any, tiltScaleFactor = 0) =>
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
    const cameraCleanupCallbacks: any = [];
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
          cleanup: (cleanupRegistration: any) => {
            cameraCleanupCallbacks.push(cleanupRegistration);
          },
        }),
        syncCameraMediaSize = (mediaWidth: any, mediaHeight: any) => {
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
  ["showCapabilityDetails"](
    capabilityComponent: any,
    { preview: isPreviewMode = false, title: dialogTitle = "" } = {},
  ) {
    const detailsEntityId = capabilityComponent.bindings?.entity?.entityId;
    if (!detailsEntityId) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    const capabilityStateSnapshot = this.states.get(detailsEntityId)?.newState ||
        this.states.get(detailsEntityId) || {
          entityId: detailsEntityId,
          state: "unknown",
          attributes: {} as Record<string, any>,
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
          (metricRoleLabels as any)[metricRoleKey] ||
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
    const syncCapabilityHandler = (capabilitySyncStateArg: any) => {
        (capabilityDetailsControls.syncCapabilityState?.(capabilitySyncStateArg),
          (capabilityDialogStatus.textContent = ["unknown", "unavailable"].includes(
            String(capabilitySyncStateArg?.state || "").toLowerCase(),
          )
            ? "当前不可用"
            : "设备控制"));
      },
      capabilityHandlerByEntityId = new Map([[detailsEntityId, [syncCapabilityHandler]]]);
    for (const { item: metricEntityItem } of slice2) {
      const syncMetricHandler = (metricState: any) => {
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
  ["showMediaPlayerDetails"](mediaComponent: any, { preview: _isMediaDetailsPreview = false } = {}) {
    const mediaPlayerEntityId = mediaComponent.bindings?.entity?.entityId;
    if (!mediaPlayerEntityId) throw new Error("该控件没有关联实体。");
    // 栈 C more-info → 栈 B MediaPlayerModal（与 MiniWidget / 紧凑弹窗展开共用），不再维护手写 DOM dialog。
    this.closeRuntimeDialog();
    shellOpenMediaPlayer(String(mediaPlayerEntityId));
  }
  ["createBathHeaterLightControl"](
    createBathHeaterLightControlToggleEntityId: any,
    bathLightState: any,
    {
      interactive: isBathLightInteractive = true,
      onStateChange: onBathLightStateChange = null,
    }: any = {},
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
        } catch (bathLightUpdateError: any) {
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
    electricBedComponent: any,
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
    electricBedDetailsComponent: any,
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
    const createAngleReadout = (readoutClassName: any, readoutLabel: any) => {
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
      controlCleanups: any = [],
      resolveAngleState = (angleEntityId: any) => {
        const resolvedAngleState = this.states.get(angleEntityId);
        return (
          resolvedAngleState?.newState ||
          resolvedAngleState || {
            entityId: angleEntityId,
            state: "unknown",
            attributes: {} as Record<string, any>,
          }
        );
      },
      createAngleControl = (
        controlLabel: any,
        controlEntityId: any,
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
        const syncAngleControl = (angleState: any) =>
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
        const syncMemorySlot = (memoryState: any) =>
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
            } catch (memoryUpdateError: any) {
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
    const anglePercentForState = (_angleRoleEntityId: any, angleEntityState: any) => {
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
          formatAngleValue = (angleValueState: any) => {
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
    vacuumDetailsOptions: any,
    onDialogClose: any,
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
  ): any {
    const statusEntityIdSet = new Set([
      vacuumDetailsOptions.entityId,
      ...(vacuumDetailsOptions.relatedEntityIds || []),
    ]);
    let vacuumDialogElement: any = null;
    const updateVacuumStates = (stateMap: any) => {
      for (const statusEntityId of statusEntityIdSet) {
        const entityState = stateMap[statusEntityId] || {
          entityId: statusEntityId,
          state: "unavailable",
          attributes: {} as Record<string, any>,
        };
        if (
          (this.states.set(statusEntityId, entityState),
          this.detailsStateSync?.dialog === vacuumDialogElement)
        ) {
          for (const stateHandler of this.detailsStateSync!.handlers.get(statusEntityId) || [])
            stateHandler(entityState);
        }
      }
    };
    updateVacuumStates(stateSnapshot);
    const findVacuumComponent = (componentList: any) => {
        for (const componentRecordCandidate of componentList || []) {
          if (
            componentRecordCandidate.type === "vacuum-control" &&
            componentRecordCandidate.bindings?.entity?.entityId === vacuumDetailsOptions.entityId
          )
            return componentRecordCandidate;
          const nestedComponent: any = findVacuumComponent(componentRecordCandidate.children);
          if (nestedComponent) return nestedComponent;
        }
        return null;
      },
      pageComponent = (this.document?.pages || [])
        .map((documentPage: any) => findVacuumComponent(documentPage.components))
        .find(Boolean),
      selectedStatusEntityIds =
        pageComponent?.properties?.relatedEntities?.mode === "selected"
          ? (pageComponent.properties.relatedEntities.entityIds || []).filter((selectedEntityId: any) =>
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
        contains: (containedEntityId: any) => vacuumDialogElement?.contains(containedEntityId),
      }
    );
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
      window.clearTimeout(this.reconnectTimer!),
      (this.reconnectTimer = null),
      window.clearTimeout(this.runtimeHydrationRetryTimer!),
      (this.runtimeHydrationRetryTimer = null));
    const socket = this.socket;
    if (
      ((this.socket = null),
      (this.runtimeSubscription = null),
      !socket || socket.readyState >= WebSocket.CLOSING)
    )
      return;
    if (socket!.readyState !== WebSocket.CONNECTING) {
      socket!.close();
      return;
    }
    let socketReconnectTimerId: any;
    const handleSocketClose = () => {
        (window.clearTimeout(socketReconnectTimerId),
          socket!.removeEventListener("open", handleSocketOpen),
          socket!.removeEventListener("close", handleSocketClose));
      },
      handleSocketOpen = () => {
        (handleSocketClose(), socket!.readyState < WebSocket.CLOSING && socket!.close());
      };
    (socket!.addEventListener("open", handleSocketOpen, {
      once: true,
    }),
      socket!.addEventListener("close", handleSocketClose, {
        once: true,
      }),
      (socketReconnectTimerId = window.setTimeout(handleSocketOpen, 12000)));
  }
  ["scheduleRuntimeHydrationRetry"](subscription: any, socketGenerationValue: any) {
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
          (hydrationEntityId: any) =>
            hydrationEntityIdSet.has(hydrationEntityId) &&
            lineChartRuntimeStateNeedsHydration2(this.states.get(hydrationEntityId)),
        ).length > 0
      );
    };
    if (!isSubscriptionActive()) {
      (window.clearTimeout(this.runtimeHydrationRetryTimer!),
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
      registerHistoryRequests = (components: any, requestDefaults: any) => {
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
            (historyPopupModule: any) => String(historyPopupModule.id || "") === this.activePopupId,
          )
        : null,
      pendingHistoryRequests: any[] = [];
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
          const [shift2, shift3] = requestEntries.shift()!;
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
          } catch (historyFetchError: any) {
            if (
              this.destroyed ||
              isDocumentHidden() ||
              abortController?.signal.reason === "lifecycle" ||
              !historyRequestStillRelevant2(shift3, getHistoryRequestSnapshot())
            )
              continue;
            (this.historyRequestPolicy.failure(shift2),
              historyFetchError?.name === "AbortError" &&
                window.HomeOSLog?.report!("warning", "网络请求", "历史曲线请求超时", {
                  entityId: shift2,
                  phase: "history-timeout",
                  path: "/api/v1/ha/history",
                  durationMs: HISTORY_FETCH_TIMEOUT_MS2,
                })!,
              (shouldRetryHistory = true));
          } finally {
            (window.clearTimeout(historyFetchTimer),
              this.historyFetches.delete(shift2),
              this.historyAbortControllers.delete(abortController!));
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
      window.clearTimeout(this.reconnectTimer!),
      window.clearTimeout(this.runtimeRenderTimer),
      window.clearTimeout(this.historyRetryTimer),
      window.clearTimeout(this.runtimeHydrationRetryTimer!),
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

Object.assign(PanelRenderer.prototype, geometryMethods as any);
Object.assign(PanelRenderer.prototype, panelRendererBulkMethods as any);
