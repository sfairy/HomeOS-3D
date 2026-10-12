
import {
  iconButtonEffectLightVisualAwaiting as iconButtonEffectLightVisualAwaiting2,
  iconButtonEffectLightVisualState as iconButtonEffectLightVisualState2,
  prewarmCameraMedia as prewarmCameraMedia2,
  renderRegisteredComponent as renderRegisteredComponent2,
  setBuiltinAssetVersions as setBuiltinAssetVersions2,
  staticAssetImageSource as staticAssetImageSource2,
} from "./registry";
import { randomUuid as randomUuid2 } from "../shared/util/random-id";




import {
  applyXiaomiDeviceProfile as applyXiaomiDeviceProfile2,
  resolveXiaomiDeviceProfile as resolveXiaomiDeviceProfile2,
} from "../../platform/entity-role-profiles";
import {
  relatedPopupContext as relatedPopupContext2,
} from "../shared/related-entities";
import {
  entityPowerTarget as entityPowerTarget2,
} from "./entity-power";
import {
  ICON_VISIBILITY_VIRTUAL_KIND as ICON_VISIBILITY_VIRTUAL_KIND2,
  parseVirtualEntityId as parseVirtualEntityId2,
} from "../shared/virtual-entities";
import {
  airflowCanvasOffsetBounds as airflowCanvasOffsetBounds2,
  airflowLayerGeometry as airflowLayerGeometry2,
  groupedComponentLocalDelta as groupedComponentLocalDelta2,
  rotateMultiSelectionTransforms as rotateMultiSelectionTransforms2,
} from "./geometry/transform-geometry";
import {
  componentHostZIndex as componentHostZIndex2,
  effectCroppedLayerGeometry as effectCroppedLayerGeometry2,
  effectLayerDimensions as effectLayerDimensions2,
  effectReferenceImageTransform as effectReferenceImageTransform2,
  normalizeIconButtonEffectComponent as normalizeIconButtonEffectComponent2,
} from "./geometry/effect-geometry";
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
} from "./controls/light-runtime";
import { entityMetadataIsAvailable as entityMetadataIsAvailable2 } from "./entity-metadata";
import {
  relatedVacuumBatteryEntity as relatedVacuumBatteryEntity2,
  vacuumActionService as vacuumActionService2,
  vacuumBatteryPercent as vacuumBatteryPercent2,
  vacuumSupportedActions as vacuumSupportedActions2,
} from "./controls/vacuum-runtime";
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
  coverToggleServiceForComponent as coverToggleServiceForComponent2,
  dreamCurtainBladeLabel as dreamCurtainBladeLabel2,
  dreamCurtainIsRetracted as dreamCurtainIsRetracted2,
  dreamCurtainStatusText as dreamCurtainStatusText2,
  dreamCurtainToggleService as dreamCurtainToggleService2,
  learnAirerPositionCalibration as learnAirerPositionCalibration2,
  relatedAirerCurrentPositionSensor as relatedAirerCurrentPositionSensor2,
  relatedAirerLightEntity as relatedAirerLightEntity2,
  relatedAirerMotorActionEntities as relatedAirerMotorActionEntities2,
  relatedAirerMotorSpeedSensor as relatedAirerMotorSpeedSensor2,
  relatedAirerPositionNumberEntity as relatedAirerPositionNumberEntity2,
  relatedWaterHeaterEntities as relatedWaterHeaterEntities2,
  waterHeaterRelatedEntityLabel as waterHeaterRelatedEntityLabel2,
} from "./controls/cover-runtime";
import {
  runtimeDialogUsesStableMotion as runtimeDialogUsesStableMotion2,
} from "./panel-dialog-motion";
import {
  EntityRequestPolicy as EntityRequestPolicy2,
  HistoryRefreshCoordinator as HistoryRefreshCoordinator2,
  RuntimeEffectImageLoader as RuntimeEffectImageLoader2,
  RuntimeStaticImageCache as RuntimeStaticImageCache2,
  RuntimeVacuumMapImagePreloader as RuntimeVacuumMapImagePreloader2,
  historyRequestStillRelevant as historyRequestStillRelevant2,
} from "./panel-caches";
import {
  collectComponents as collectComponents2,
  lineChartRuntimeStateNeedsHydration as lineChartRuntimeStateNeedsHydration2,
  syncedLineChartProperties as syncedLineChartProperties2,
} from "./panel-document";
import {
  type PanelRendererOptions,
  type RendererDetailsStateSync,
  type ComponentControllerElement,
  type ComponentPayload,
} from "./renderer-types";
import {
  componentDialogTitle,
} from "./renderer-helpers";
import * as geometryMethods from "./renderer-geometry";
// 面板 mixin 方法按 seam 拆分（每个功能域一刀，见 app/renderer/panel-seams/）。
// 这里显式列出、不再立一层 barrel：桶会立刻退化成「纯 re-export 桩」，而 `import * as ns`
// + `Object.assign(proto, ns as any)` 的组合在漏一个名字时 **tsc 一声不吭**（`as any`），
// 只有运行期点开对应面板才炸。清单式 import 让漏项在 typecheck 阶段就显形。
import { createCapabilityDetailsControls } from "./panel-seams/capability-controls";
import { createClimateDetailsControls } from "./panel-seams/climate-controls";
import { createCoverDetailsControls } from "./panel-seams/cover-controls";
import { createLightDetailsControls } from "./panel-seams/light-controls";
import { createWaterHeaterExtensionControls } from "./panel-seams/water-heater-controls";
import { connectRuntime } from "./panel-seams/runtime-connect";
import { renderComponent } from "./panel-seams/render-component";
import { showAirPurifierDetails } from "./panel-seams/air-purifier-details";
import { showCustomPopup } from "./panel-seams/custom-popup";
import { showEntityDetails } from "./panel-seams/entity-details";
import { showPresenceDetails } from "./panel-seams/presence-details";
import { showVacuumDetails } from "./panel-seams/vacuum-details";
import { startComponentsScale, startComponentsRotate, startComponentMove, startDoorWindowPerspective, startAirflowMove, startAirflowScale, startAirflowRotate, startComponentScale, startComponentRotate } from "./panel-seams/transform-interaction";
import { createComponentSelectionOverlay, createAirflowSelectionOverlay, syncAirflowLayerGeometry, appendEffectSelectionBounds, syncComponentSelectionOverlay, appendTransformHandles, withSelectionMeasurementHost, selectionElementIsVisible, selectionElementBox, applyDoorWindowPerspective, updateDoorWindowPerspectiveHandles, appendDoorWindowPerspectiveHandles, updateAirflowHandleScale, updateTransformHandleScale } from "./panel-seams/selection-overlay";
import { updateAirConditionerButtonSelectionBounds, updateDeviceButtonSelectionBounds, updateTitleButtonSelectionBounds, updateLightStatisticsSelectionBounds, updateTextSelectionBounds, updateImageSelectionBounds } from "./panel-seams/selection-bounds";
import { scheduleInteraction3dPrewarm, releaseRetainedInteraction3d, cleanupRenderedComponent, registerRuntimeStateHandler, registerHistoryChartRefresher, applyRuntimeStateHandlers, pushEventLogWallEntries, runtimeEntityIdsForComponent, indexRuntimeComponent, unindexRuntimeComponent, runtimeComponentContent, refreshRuntimeComponent, refreshEditorComponent, refreshRuntimeComponents, applyEditorComponentUpdates, scheduleRuntimeRender, refreshVacuumMapEntity, disconnectRuntime, scheduleRuntimeHydrationRetry, refreshHistorySeries, scheduleHistoryRetry, refreshHistorySeriesPass } from "./panel-seams/runtime-refresh";
import { popupComponentForEntity, showActionPopup, showCapabilityDetails, showMediaPlayerDetails, createBathHeaterLightControl, showElectricBedLoadingDetails, showElectricBedDetails, openInteraction3dVacuumDetails } from "./panel-seams/details-popups";
import { browseMedia, createMediaBrowserControl, openInteraction3dCameraPreview, showCameraPreview } from "./panel-seams/media-camera";
import { registerRuntimeDialogScale, updateRuntimeDialogScale, clearRuntimeDialogScale, closeRuntimeDialog, bindRuntimeDialogOutsideDismiss } from "./panel-seams/runtime-dialogs";
import { bindRuntimeActions, runAction, previewAction, dispatchAction, callEntityService } from "./panel-seams/runtime-actions";
import { optimisticStateIsConfirmed, updateOptimisticToggleVisuals, applyOptimisticToggle } from "./panel-seams/optimistic-state";
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
  ["startComponentsScale"](scalePointerEvent: any,
    scaleEntries: any,
    selectionBounds: any,
    measurementHostElement: any,) { return startComponentsScale(this, scalePointerEvent, scaleEntries, selectionBounds, measurementHostElement); }
  ["startComponentsRotate"](airflowComponentRotateEvent: any,
    rotateEntries: any,
    rotationBounds: any,
    rotationHostElement: any,) { return startComponentsRotate(this, airflowComponentRotateEvent, rotateEntries, rotationBounds, rotationHostElement); }
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
  ["scheduleInteraction3dPrewarm"]() { return scheduleInteraction3dPrewarm(this); }
  ["releaseRetainedInteraction3d"]() { return releaseRetainedInteraction3d(this); }
  ["cleanupRenderedComponent"](cleanupTargetComponentId: any) { return cleanupRenderedComponent(this, cleanupTargetComponentId); }
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
  ["registerRuntimeStateHandler"](stateHandlerEntityId: any,
    stateHandlerFunction: any,
    stateHandlerComponentId: any = null,) { return registerRuntimeStateHandler(this, stateHandlerEntityId, stateHandlerFunction, stateHandlerComponentId); }
  ["registerHistoryChartRefresher"](historyRefresherFunction: any, historyRefresherComponentId: any = null) { return registerHistoryChartRefresher(this, historyRefresherFunction, historyRefresherComponentId); }
  ["applyRuntimeStateHandlers"](handledEntityId: any, entityStateSnapshot: any) { return applyRuntimeStateHandlers(this, handledEntityId, entityStateSnapshot); }
  ["pushEventLogWallEntries"](handledEntityId: any, previousStateEntry: any, nextStateEntry: any) { return pushEventLogWallEntries(this, handledEntityId, previousStateEntry, nextStateEntry); }
  ["runtimeEntityIdsForComponent"](runtimeEntityComponent: any) { return runtimeEntityIdsForComponent(this, runtimeEntityComponent); }
  ["indexRuntimeComponent"](indexedComponent: any) { return indexRuntimeComponent(this, indexedComponent); }
  ["unindexRuntimeComponent"](unindexedComponent: any) { return unindexRuntimeComponent(this, unindexedComponent); }
  ["runtimeComponentContent"](renderHostElement: any) { return runtimeComponentContent(this, renderHostElement); }
  ["refreshRuntimeComponent"](refreshComponentId: any) { return refreshRuntimeComponent(this, refreshComponentId); }
  ["refreshEditorComponent"](editorComponentId: any) { return refreshEditorComponent(this, editorComponentId); }
  ["refreshRuntimeComponents"](dirtyEntityIds: any) { return refreshRuntimeComponents(this, dirtyEntityIds); }
  ["applyEditorComponentUpdates"](updatedDocument: any, updatedPagePath: any, componentUpdates: any[] = []) { return applyEditorComponentUpdates(this, updatedDocument, updatedPagePath, componentUpdates); }
  ["scheduleRuntimeRender"](scheduledEntityId: any, renderDelayMs = 120) { return scheduleRuntimeRender(this, scheduledEntityId, renderDelayMs); }
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
  ["optimisticStateIsConfirmed"](optimisticEntityId: any, optimisticInputPayload: any) { return optimisticStateIsConfirmed(this, optimisticEntityId, optimisticInputPayload); }
  ["updateOptimisticToggleVisuals"](optimisticToggleEntityId: any, componentIdFilterSet: any = null) { return updateOptimisticToggleVisuals(this, optimisticToggleEntityId, componentIdFilterSet); }
  ["refreshVacuumMapEntity"](vacuumImageEntityId: any) { return refreshVacuumMapEntity(this, vacuumImageEntityId); }
  ["applyOptimisticToggle"](optimisticToggleTarget: any, optimisticComponent: any = null) { return applyOptimisticToggle(this, optimisticToggleTarget, optimisticComponent); }
  ["startComponentMove"](movePointerEvent: any,
    moveComponentRecord: any,
    moveHostElement: any,
    pointerTargetElement = moveHostElement,) { return startComponentMove(this, movePointerEvent, moveComponentRecord, moveHostElement, pointerTargetElement); }
  ["createComponentSelectionOverlay"](overlayHostElement: any, overlayComponentRecord: any) { return createComponentSelectionOverlay(this, overlayHostElement, overlayComponentRecord); }
  ["createAirflowSelectionOverlay"](airflowLayerHostElement: any, airflowComponentRecord: any) { return createAirflowSelectionOverlay(this, airflowLayerHostElement, airflowComponentRecord); }
  ["syncAirflowLayerGeometry"](airflowLayerTargetElement: any,
    geometryComponentRecord: any,
    geometryOverlayElement: any = null,) { return syncAirflowLayerGeometry(this, airflowLayerTargetElement, geometryComponentRecord, geometryOverlayElement); }
  ["appendEffectSelectionBounds"](effectBoundsHostElement: any, effectBoundsComponent: any) { return appendEffectSelectionBounds(this, effectBoundsHostElement, effectBoundsComponent); }
  ["syncComponentSelectionOverlay"](overlayComponentId: any) { return syncComponentSelectionOverlay(this, overlayComponentId); }
  ["appendTransformHandles"](handleHostElement: any,
    handleComponentRecord: any,
    shouldAddResizeHandle = true,
    handleTargetElement = handleHostElement,) { return appendTransformHandles(this, handleHostElement, handleComponentRecord, shouldAddResizeHandle, handleTargetElement); }
  ["withSelectionMeasurementHost"](measurementRootElement: any, measurementTask: any) { return withSelectionMeasurementHost(this, measurementRootElement, measurementTask); }
  ["selectionElementIsVisible"](measuredElement: any) { return selectionElementIsVisible(this, measuredElement); }
  ["selectionElementBox"](boxElement: any, boxStopElement: any) { return selectionElementBox(this, boxElement, boxStopElement); }
  ["applyDoorWindowPerspective"](doorWindowHostElement: any,
    doorWindowComponentRecord: any,
    perspectiveCornersArray: any,) { return applyDoorWindowPerspective(this, doorWindowHostElement, doorWindowComponentRecord, perspectiveCornersArray); }
  ["updateDoorWindowPerspectiveHandles"](perspectiveBoundsElement: any, perspectiveCornerValues: any) { return updateDoorWindowPerspectiveHandles(this, perspectiveBoundsElement, perspectiveCornerValues); }
  ["appendDoorWindowPerspectiveHandles"](doorWindowHandleHost: any,
    doorWindowHandleComponent: any,
    doorWindowHandleTargetElement = doorWindowHandleHost,) { return appendDoorWindowPerspectiveHandles(this, doorWindowHandleHost, doorWindowHandleComponent, doorWindowHandleTargetElement); }
  ["startDoorWindowPerspective"](perspectivePointerEvent: any,
    perspectiveComponentRecord: any,
    perspectiveLayerElement: any,
    perspectiveHandleBoundsElement: any,
    perspectiveCornerIndex: any,) { return startDoorWindowPerspective(this, perspectivePointerEvent, perspectiveComponentRecord, perspectiveLayerElement, perspectiveHandleBoundsElement, perspectiveCornerIndex); }
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
  ["startAirflowMove"](airflowMovePointerEvent: any,
    airflowMoveComponent: any,
    airflowMoveLayerElement: any,
    airflowMoveCaptureElement: any,
    airflowMoveOverlayElement: any,) { return startAirflowMove(this, airflowMovePointerEvent, airflowMoveComponent, airflowMoveLayerElement, airflowMoveCaptureElement, airflowMoveOverlayElement); }
  ["updateAirflowHandleScale"](airflowScaleComponent: any, airflowScaleLayerElement: any) { return updateAirflowHandleScale(this, airflowScaleComponent, airflowScaleLayerElement); }
  ["startAirflowScale"](airflowScalePointerEvent: any,
    airflowScaleComponentRecord: any,
    airflowScaleLayerTarget: any,
    airflowScaleHandleElement: any,
    airflowScaleOverlayElement: any,) { return startAirflowScale(this, airflowScalePointerEvent, airflowScaleComponentRecord, airflowScaleLayerTarget, airflowScaleHandleElement, airflowScaleOverlayElement); }
  ["startAirflowRotate"](airflowRotatePointerEvent: any,
    airflowRotateComponent: any,
    airflowRotateLayerElement: any,
    airflowRotateTargetElement: any,
    airflowRotateOverlayElement: any,) { return startAirflowRotate(this, airflowRotatePointerEvent, airflowRotateComponent, airflowRotateLayerElement, airflowRotateTargetElement, airflowRotateOverlayElement); }
  ["updateAirConditionerButtonSelectionBounds"](acBoundsHostElement: any,
    acBoundsComponent: any,
    acBoundsElement: any,) { return updateAirConditionerButtonSelectionBounds(this, acBoundsHostElement, acBoundsComponent, acBoundsElement); }
  ["updateDeviceButtonSelectionBounds"](deviceBoundsHostElement: any,
    deviceBoundsComponent: any,
    deviceBoundsElement: any,) { return updateDeviceButtonSelectionBounds(this, deviceBoundsHostElement, deviceBoundsComponent, deviceBoundsElement); }
  ["updateTitleButtonSelectionBounds"](titleBoundsHostElement: any,
    titleBoundsComponent: any,
    titleBoundsElement: any,) { return updateTitleButtonSelectionBounds(this, titleBoundsHostElement, titleBoundsComponent, titleBoundsElement); }
  ["updateLightStatisticsSelectionBounds"](statsBoundsHostElement: any,
    statsBoundsComponent: any,
    statsBoundsElement: any,) { return updateLightStatisticsSelectionBounds(this, statsBoundsHostElement, statsBoundsComponent, statsBoundsElement); }
  ["updateTextSelectionBounds"](textBoundsHostElement: any, textBoundsComponent: any, textBoundsElement: any) { return updateTextSelectionBounds(this, textBoundsHostElement, textBoundsComponent, textBoundsElement); }
  async ["updateImageSelectionBounds"](imageBoundsHostElement: any,
    imageBoundsComponent: any,
    imageBoundsElement: any,) { return updateImageSelectionBounds(this, imageBoundsHostElement, imageBoundsComponent, imageBoundsElement); }
  ["updateTransformHandleScale"](transformHandleHostElement: any,
    transformHandleComponent: any,
    transformHandleBoundsElement: any = null,) { return updateTransformHandleScale(this, transformHandleHostElement, transformHandleComponent, transformHandleBoundsElement); }
  ["startComponentScale"](scaleComponentPointerEvent: any,
    scalingComponentRecord: any,
    scalingHostElement: any,
    scalingBoundsElement: any,) { return startComponentScale(this, scaleComponentPointerEvent, scalingComponentRecord, scalingHostElement, scalingBoundsElement); }
  ["startComponentRotate"](rotateComponentPointerEvent: any,
    rotatingComponentRecord: any,
    rotatingHostElement: any,
    rotatingBoundsElement: any,) { return startComponentRotate(this, rotateComponentPointerEvent, rotatingComponentRecord, rotatingHostElement, rotatingBoundsElement); }
  ["bindRuntimeActions"](actionHostElement: any, actionOptions: any) { return bindRuntimeActions(this, actionHostElement, actionOptions); }
  ["runAction"](runtimeActionComponent: any, actionPayload: any, actionRuntimeOptions: Record<string, any> = {}) { return runAction(this, runtimeActionComponent, actionPayload, actionRuntimeOptions); }
  ["previewAction"](actionPreviewComponent: any, previewActionPayload: any) { return previewAction(this, actionPreviewComponent, previewActionPayload); }
  ["popupComponentForEntity"](popupEntityId: any, popupLabel = "") { return popupComponentForEntity(this, popupEntityId, popupLabel); }
  ["showActionPopup"](popupComponent: any, popupActionRecord: any, arg?: { preview?: boolean | undefined; }) { return showActionPopup(this, popupComponent, popupActionRecord, arg); }
  async ["dispatchAction"](toggleComponentRecord: any, toggleActionRecord: any, arg?: {
      optimisticAlreadyApplied?: boolean;
      optimisticRollback?: any;
      optimisticPreviousState?: any;
    }) { return dispatchAction(this, toggleComponentRecord, toggleActionRecord, arg); }
  async ["callEntityService"](serviceDomain: any, serviceName: any, serviceEntityId: any, servicePayload: Record<string, any> = {}) { return callEntityService(this, serviceDomain, serviceName, serviceEntityId, servicePayload); }
  async ["browseMedia"](mediaEntityId: any, mediaContentId = "media-source://", mediaContentType = "") { return browseMedia(this, mediaEntityId, mediaContentId, mediaContentType); }
  ["createMediaBrowserControl"](mediaBrowserEntityId: any, arg?: { preview?: boolean | undefined; }) { return createMediaBrowserControl(this, mediaBrowserEntityId, arg); }
  ["registerRuntimeDialogScale"](dialogLayerElement: any, dialogElement: any, dialogDesignWidth: any, dialogDesignHeight: any) { return registerRuntimeDialogScale(this, dialogLayerElement, dialogElement, dialogDesignWidth, dialogDesignHeight); }
  ["updateRuntimeDialogScale"]() { return updateRuntimeDialogScale(this); }
  ["clearRuntimeDialogScale"](closingDialogElement: any) { return clearRuntimeDialogScale(this, closingDialogElement); }
  ["closeRuntimeDialog"](targetDialogElement = this.detailsDialog, arg?: { preservePending?: boolean | undefined; }) { return closeRuntimeDialog(this, targetDialogElement, arg); }
  ["bindRuntimeDialogOutsideDismiss"](outsideDismissLayer: any, outsideClickDialog: any, outsideDismissCardElement: any) { return bindRuntimeDialogOutsideDismiss(this, outsideDismissLayer, outsideClickDialog, outsideDismissCardElement); }
  ["openInteraction3dCameraPreview"](cameraControlComponent: any, cameraPreviewCloseHandler: any, cameraPreviewOptions: Record<string, any> = {}) { return openInteraction3dCameraPreview(this, cameraControlComponent, cameraPreviewCloseHandler, cameraPreviewOptions); }
  ["showCameraPreview"](cameraComponent: any, arg?: any) { return showCameraPreview(this, cameraComponent, arg); }
  ["showCapabilityDetails"](capabilityComponent: any, arg?: { preview?: boolean | undefined; title?: string | undefined; }) { return showCapabilityDetails(this, capabilityComponent, arg); }
  ["showMediaPlayerDetails"](mediaComponent: any, arg?: { preview?: boolean | undefined; }) { return showMediaPlayerDetails(this, mediaComponent, arg); }
  ["createBathHeaterLightControl"](createBathHeaterLightControlToggleEntityId: any, bathLightState: any, arg?: any): ComponentControllerElement { return createBathHeaterLightControl(this, createBathHeaterLightControlToggleEntityId, bathLightState, arg); }
  ["showElectricBedLoadingDetails"](electricBedComponent: any, arg?: { preview?: boolean | undefined; }) { return showElectricBedLoadingDetails(this, electricBedComponent, arg); }
  ["showElectricBedDetails"](electricBedDetailsComponent: any, arg?: { preview?: boolean | undefined; }) { return showElectricBedDetails(this, electricBedDetailsComponent, arg); }
  ["openInteraction3dVacuumDetails"](vacuumDetailsOptions: any, onDialogClose: any, arg?: {
      states?: ComponentPayload;
      root?: any;
      frame?: any;
      popupOpacity?: number;
      getPresentationLayout?: any;
      getPopupLayout?: any;
    }): any { return openInteraction3dVacuumDetails(this, vacuumDetailsOptions, onDialogClose, arg); }
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
  ["disconnectRuntime"]() { return disconnectRuntime(this); }
  ["scheduleRuntimeHydrationRetry"](subscription: any, socketGenerationValue: any) { return scheduleRuntimeHydrationRetry(this, subscription, socketGenerationValue); }
  ["refreshHistorySeries"]() { return refreshHistorySeries(this); }
  ["scheduleHistoryRetry"]() { return scheduleHistoryRetry(this); }
  async ["refreshHistorySeriesPass"]() { return refreshHistorySeriesPass(this); }
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
Object.assign(PanelRenderer.prototype, {
  renderComponent,
  connectRuntime,
  showCustomPopup,
  showEntityDetails,
  showPresenceDetails,
  showVacuumDetails,
  showAirPurifierDetails,
  createClimateDetailsControls,
  createWaterHeaterExtensionControls,
  createLightDetailsControls,
  createCoverDetailsControls,
  createCapabilityDetailsControls,
} as any);
