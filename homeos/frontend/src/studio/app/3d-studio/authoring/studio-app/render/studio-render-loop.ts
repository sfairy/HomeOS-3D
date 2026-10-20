import { trimRetainedFloors as trimRetainedFloors2 } from "../../scene/studio-floor-cache-budget";

import {
  sceneModelOrigin as sceneModelOrigin2,
} from "../../../plan/courtyard-drawing";
import { createInteractionBatches as createInteractionBatches2 } from "../../studio-interaction-batches";

import { stageStartup as stageStartup2 } from "../../../stage-startup";
import { interactionResourcePolicy } from "../../../studio-resource-policy";

import { createStartupPresentation as createStartupPresentation2 } from "../../scene/studio-startup-presentation";
import {
  MAX_CAMERA_POLAR_ANGLE as MAX_CAMERA_POLAR_ANGLE2,
  constrainCameraPosition as constrainCameraPosition2,
  constrainCameraPose as constrainCameraPose2,
} from "../../scene/studio-camera-constraints";
import { createReflectionPasses as createReflectionPasses2 } from "../../../reflection/studio-reflection-passes";
import { createReflectionDetail as createReflectionDetail2 } from "../../../reflection/studio-reflection-detail";
import { createOverviewDetail as createOverviewDetail2 } from "../../scene/studio-overview-detail";
import { overviewFloorId as overviewFloorId2 } from "../../scene/studio-overview-stack";
import { createFloorTransition as createFloorTransition2 } from "../../scene/studio-floor-transition";
import { createGroundReflections as createGroundReflections2 } from "../../../reflection/studio-ground-reflections";
import { createMotionPresentation as createMotionPresentation2 } from "../../scene/studio-motion-presentation";

import { transformSceneCamera as transformSceneCamera2 } from "../../../../bridge/scene/scene-frame";
import { normalizeGroundReflection as normalizeGroundReflection2 } from "../../../../bridge/scene/reflection-settings";
import { sceneUpdatePlan as sceneUpdatePlan2 } from "../../../../bridge/scene/scene-update";
import { createDemandFrameLoop as createDemandFrameLoop2 } from "../../../../bridge/scene/frame-loop";
import { withRequestTimeout as withRequestTimeout2 } from "../../../../shared/util/request-timeout";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import {
  createLightTransition as createLightTransition2,
  sampleLightTransition as sampleLightTransition2,
  lightTransitionDurationMs as lightTransitionDurationMs2,
  mapLightEffectState as mapLightEffectState2,
  lightEffectColorHex as lightEffectColorHex2,
} from "../../../../bridge/light-motion";
import {
  clamp as clamp2,
  spotLightBrightnessResponse as spotLightBrightnessResponse2,
} from "../../../plan/geometry";

import {
  DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2,
  finite as finite2,
  normalizeBaseLighting as normalizeBaseLighting2,
} from "../../../loaders/studio-normalization";

import { lampItemTypeSet } from "../../items/item-catalog";

import type {
  LightEffectOptions,
  CameraInteractionOptions,
} from '../../types/studio-app-types';
import {
  composeItemKey,
} from '../../ui/studio-app-helpers';

import { normalizeStudioDocument } from "../../scene/studio-document-payload";

import { mergeFloors } from "../../store/scene-sync-controller";

import { createStudioRenderContext } from "../../studio-app/studio-render-context";

import { computeDownlightRange } from "../../studio-app/scene/downlight-range";

export interface RunStudioRenderLoopDeps {
  interactionBatches: any; shouldForceEffectFrame: any; studioReflectionDetailMode: any; effectCache: any; stageLoadTiming: any; appCtx: any; applyBaseLighting: any; applyCameraFocalLength: any; applyLoadedDraft: any; applyOrthoFrame: any; areLightsEnabled: any; assetLoaderState: any; buildLightCacheMap: any; cameraSettings: any; canBuildScene: any; collectLampEntries: any; composeLightGroupKey: any; computeCourtyardBounds: any; computeRenderPixelRatio: any; computeSceneBounds: any; computeSceneExtent: any; computeVisibleHeight: any; createOrbitControls: any; currentSceneSyncSinceKey: any; diagnosticsState: any; disposeObjectTree: any; emitRuntimeDiagnostic: any; ensureLightCache: any; finishModelLoad: any; flushSceneSyncRuntime: any; geometryCacheHandle: any; getActiveFloor: any; getCameraFocalLength: any; getCameraMode: any; getCameraTopRotation: any; getCameraView: any; getPreviewFloorMode: any; handleOrbitChange: any; handleOrbitEnd: any; handleOrbitStart: any; isEmbedStageMode: any; isEmbeddedStage: any; isPerformanceDiagnostics: any; isRenderStatsTest: any; measureFloorSwitchPhase: any; modelPresentationState: any; planToWorldPoint: any; preloadDefaultModels: any; previewLightCacheCanvasElement: any; rebuildFloorLayers: any; recordFloorSwitchTick: any; refreshAfterSceneSyncOutcome: any; refreshFloorControls: any; refreshSceneRender: any; refreshSceneSyncLightingDerived: any; rememberSceneSyncKey: any; renderStudioFrame: any; requestSceneRebuild: any; requestSceneRender: any; requestStudioRender: any; resetFrameSamples: any; resizeStudioRenderer: any; resolveFrameSize: any; restoreLightVisibility: any; restorePreviewAfterFade: any; scheduleLightPrecompile: any; scheduleStudioRender: any; selectElement: any; setCameraMode: any; setCameraView: any; setFadeOverlay: any; setPreviewFloor: any; setupSceneShadows: any; studioDocumentDeps: any; studioSceneSyncController: any; syncFloorGroups: any; updateCameraPlanes: any; updateCameraView: any; updateFloorPreviewButtons: any; updateShadowState: any; waitForSceneReady: any; waitForSceneRevision: any; waitForStageReady: any;
}

export function runStudioRenderLoop(deps: RunStudioRenderLoopDeps): any {
  const {
    appCtx,
    effectCache,
    stageLoadTiming,
    applyBaseLighting,
    applyCameraFocalLength,
    applyLoadedDraft,
    applyOrthoFrame,
    areLightsEnabled,
    assetLoaderState,
    buildLightCacheMap,
    cameraSettings,
    canBuildScene,
    collectLampEntries,
    composeLightGroupKey,
    computeCourtyardBounds,
    computeRenderPixelRatio,
    computeSceneBounds,
    computeSceneExtent,
    computeVisibleHeight,
    createOrbitControls,
    currentSceneSyncSinceKey,
    diagnosticsState,
    disposeObjectTree,
    emitRuntimeDiagnostic,
    ensureLightCache,
    finishModelLoad,
    flushSceneSyncRuntime,
    geometryCacheHandle,
    getActiveFloor,
    getCameraFocalLength,
    getCameraMode,
    getCameraTopRotation,
    getCameraView,
    getPreviewFloorMode,
    handleOrbitChange,
    handleOrbitEnd,
    handleOrbitStart,
    isEmbedStageMode,
    isEmbeddedStage,
    isPerformanceDiagnostics,
    isRenderStatsTest,
    measureFloorSwitchPhase,
    modelPresentationState,
    planToWorldPoint,
    preloadDefaultModels,
    previewLightCacheCanvasElement,
    rebuildFloorLayers,
    recordFloorSwitchTick,
    refreshAfterSceneSyncOutcome,
    refreshFloorControls,
    refreshSceneRender,
    rememberSceneSyncKey,
    renderStudioFrame,
    requestSceneRebuild,
    requestSceneRender,
    requestStudioRender,
    resetFrameSamples,
    resizeStudioRenderer,
    resolveFrameSize,
    restoreLightVisibility,
    restorePreviewAfterFade,
    scheduleLightPrecompile,
    scheduleStudioRender,
    selectElement,
    setCameraMode,
    setCameraView,
    setFadeOverlay,
    setPreviewFloor,
    setupSceneShadows,
    studioDocumentDeps,
    studioSceneSyncController,
    syncFloorGroups,
    updateCameraPlanes,
    updateCameraView,
    updateFloorPreviewButtons,
    updateShadowState,
    waitForSceneReady,
    waitForSceneRevision,
    waitForStageReady,
  } = deps;

  const ctx = createStudioRenderContext();
  const zn4 = normalizeStudioDocument(
    appCtx.loadedDraft.referenceScene || appCtx.loadedDraft.scene,
    studioDocumentDeps(),
  );
  const retainedFloorsByKey = new Map(),
    renderLoopStats = {
      reusedTransitions: 0,
      rebuiltTransitions: 0,
      reusedFloors: 0,
    };
  const disposeRetainedNode = (releaseEntry: any) => {
      (ctx.floorRetentionService?.releaseRoot?.(releaseEntry.node, {
        dispose: true,
      }),
        appCtx.regionLightController?.releaseRoot?.(releaseEntry.node),
        disposeObjectTree(releaseEntry.node));
    },
    trimRetainedFloors = (keepKeySet: any = null) => {
      keepKeySet || ctx.cacheEpoch++;
      for (const [retainedKey, retainedEntry] of retainedFloorsByKey)
        (keepKeySet && !keepKeySet.has(retainedKey)) ||
          (disposeRetainedNode(retainedEntry), retainedFloorsByKey.delete(retainedKey));
    };
  // C4：同步到新的 baseLighting 后重建灯光派生状态（缓存裁剪 + 灯光应用），
  // 与旧 readSceneUpdate 的非全量灯光分支语义一致。
  deps.refreshSceneSyncLightingDerived = () => {
    if (ctx.hasBaseLightingApplied) return;
    (trimRetainedFloors(), applyBaseLighting(appCtx.studioProject.baseLighting));
  };
  function retainFloorNode(retainRequest: any) {
    if (!retainRequest.cacheKey || retainRequest.cacheEpoch !== ctx.cacheEpoch) return false;
    const retainFloorId = retainRequest.id,
      previousRetainedEntry = retainedFloorsByKey.get(retainFloorId);
    return (
      previousRetainedEntry &&
        previousRetainedEntry.node !== retainRequest.node &&
        disposeRetainedNode(previousRetainedEntry),
      retainRequest.node.position.set(0, 0, 0),
      retainRequest.node.quaternion.identity(),
      retainRequest.node.scale.set(1, 1, 1),
      retainRequest.node.updateMatrixWorld(true),
      retainedFloorsByKey.delete(retainFloorId),
      retainedFloorsByKey.set(retainFloorId, retainRequest),
      appCtx.regionLightController?.retainRoot?.(retainRequest.node),
      ctx.floorRetentionService?.retainRoot?.(retainRequest.node),
      trimRetainedFloors2(retainedFloorsByKey, disposeRetainedNode),
      true
    );
  }
  (appCtx.lightPreviewWorker?.close(), (appCtx.lightPreviewWorker = null));
  ctx.isBackgroundVisible = !isEmbeddedStage;
  const retainedLayerKeySet = new Set(["items", "lights"]);
  const snapshotOrthoCamera = new ns2.OrthographicCamera(),
    snapshotPerspectiveCamera = new ns2.PerspectiveCamera(),
    cameraSyncState = {
      matrix: new ns2.Matrix4(),
      /** 上一次同步用的相机运动规格，用来判断是否需要重新同步。 */
      motion: null as any,
      camera: null as any,
      distance: 0,
      height: 0,
      aspect: 1,
      weight: 0,
      near: 0,
      far: 0,
    },
    projectedScreenPoint = new ns2.Vector2();
  function computeCameraFrameDistance(cameraFrameSpec: any) {
    return cameraFrameSpec.mode !== "perspective"
      ? Math.max(1, cameraFrameSpec.frameSize || 10) /
          cameraFrameSpec.zoom /
          Math.min(1, Math.max(0.1, appCtx.threeCamera.userData.viewportAspect || 1))
      : ((snapshotPerspectiveCamera.aspect = appCtx.threeCamera.userData.viewportAspect || 1),
        (snapshotPerspectiveCamera.zoom = cameraFrameSpec.zoom),
        snapshotPerspectiveCamera.setFocalLength(cameraFrameSpec.focalLength || 50),
        2 *
          new ns2.Vector3()
            .fromArray(cameraFrameSpec.position)
            .distanceTo(new ns2.Vector3().fromArray(cameraFrameSpec.target)) *
          Math.tan(ns2.MathUtils.degToRad(snapshotPerspectiveCamera.getEffectiveFOV()) / 2));
  }
  function syncSnapshotCamera() {
    if (!ctx.cameraMotionSpec) return;
    const syncSnapshotCameraCameraTargetDistance = Math.max(
        0.000001,
        appCtx.threeCamera.position.distanceTo(appCtx.orbitControls.target),
      ),
      snapshotSceneHeight = Math.max(0.000001, ctx.cameraMotionSpec.height),
      viewportAspect = appCtx.threeCamera.userData.viewportAspect || 1,
      weight = ctx.cameraMotionSpec.weight,
      view = appCtx.threeCamera.view,
      view2 = snapshotOrthoCamera.view,
      isViewEqual =
        view === view2 ||
        (view &&
          view2 &&
          view.enabled === view2.enabled &&
          view.fullWidth === view2.fullWidth &&
          view.fullHeight === view2.fullHeight &&
          view.offsetX === view2.offsetX &&
          view.offsetY === view2.offsetY &&
          view.width === view2.width &&
          view.height === view2.height);
    if (
      cameraSyncState.motion === ctx.cameraMotionSpec &&
      cameraSyncState.camera === appCtx.threeCamera &&
      cameraSyncState.distance === syncSnapshotCameraCameraTargetDistance &&
      cameraSyncState.height === snapshotSceneHeight &&
      cameraSyncState.aspect === viewportAspect &&
      cameraSyncState.weight === weight &&
      cameraSyncState.near === appCtx.threeCamera.near &&
      cameraSyncState.far === appCtx.threeCamera.far &&
      isViewEqual &&
      cameraSyncState.matrix.equals(appCtx.threeCamera.projectionMatrix)
    )
      return;
    (Object.assign(snapshotOrthoCamera, {
      left: (-snapshotSceneHeight * viewportAspect) / 2,
      right: (snapshotSceneHeight * viewportAspect) / 2,
      top: snapshotSceneHeight / 2,
      bottom: -snapshotSceneHeight / 2,
      near: appCtx.threeCamera.near,
      far: appCtx.threeCamera.far,
      zoom: 1,
    }),
      Object.assign(snapshotPerspectiveCamera, {
        fov: ns2.MathUtils.radToDeg(
          2 * Math.atan(snapshotSceneHeight / (2 * syncSnapshotCameraCameraTargetDistance)),
        ),
        aspect: viewportAspect,
        near: appCtx.threeCamera.near,
        far: appCtx.threeCamera.far,
        zoom: 1,
      }));
    for (const cameraForProjection of [snapshotOrthoCamera, snapshotPerspectiveCamera])
      ((cameraForProjection.view = appCtx.threeCamera.view
        ? {
            ...appCtx.threeCamera.view,
          }
        : null),
        cameraForProjection.updateProjectionMatrix());
    const elements = snapshotOrthoCamera.projectionMatrix.elements,
      elements2 = snapshotPerspectiveCamera.projectionMatrix.elements;
    for (let matrixUpdateIndex = 0; matrixUpdateIndex < 16; matrixUpdateIndex++)
      appCtx.threeCamera.projectionMatrix.elements[matrixUpdateIndex] =
        elements[matrixUpdateIndex] * (1 - weight) +
        (elements2[matrixUpdateIndex] / syncSnapshotCameraCameraTargetDistance) * weight;
    (appCtx.threeCamera.projectionMatrixInverse.copy(appCtx.threeCamera.projectionMatrix).invert(),
      (cameraSyncState.motion = ctx.cameraMotionSpec),
      (cameraSyncState.camera = appCtx.threeCamera),
      (cameraSyncState.distance = syncSnapshotCameraCameraTargetDistance),
      (cameraSyncState.height = snapshotSceneHeight),
      (cameraSyncState.aspect = viewportAspect),
      (cameraSyncState.weight = weight),
      (cameraSyncState.near = appCtx.threeCamera.near),
      (cameraSyncState.far = appCtx.threeCamera.far),
      cameraSyncState.matrix.copy(appCtx.threeCamera.projectionMatrix));
  }
  const lightTransitionsByLight = new Map(),
    lightTransitionsByKey = new Map();
  ctx.runStudioRenderLoopLightsByItemKey = new Map();
  ctx.lightRecordsByItemKey = new Map();
  const controlsRestoreOptions = {
    restore: () => sampleLightTransitions(performance.now(), true),
  };
  function applyLightTransitionFrame(runStudioRenderLoopFrameTimestamp: any) {
    if (
      (ctx.presentationHandle !== null && window.clearTimeout(ctx.presentationHandle),
      (ctx.presentationHandle = null),
      runStudioRenderLoopFrameTimestamp)
    ) {
      if (appCtx.isPrewarming) return;
      ((appCtx.isPrewarming = true),
        (appCtx.samplingWindowStartMs = 0),
        updateShadowState(true, {
          preserveLightCache: true,
        }));
    } else
      appCtx.isPrewarming &&
        (ctx.presentationHandle = window.setTimeout(() => {
          ((ctx.presentationHandle = null),
            (appCtx.isPrewarming = false),
            resetFrameSamples(),
            (appCtx.samplingWindowStartMs = 0),
            updateShadowState(appCtx.isRenderSuppressed, {
              preserveLightCache: true,
            }));
        }, 140));
  }
  function normalizeLightBrightness(runStudioRenderLoopLightObject: any, brightnessPercent: any) {
    const normalizeLightBrightnessLightBrightnessRatio =
      clamp2(finite2(brightnessPercent, 0), 0, 150) / 100;
    return isEmbedStageMode
      ? normalizeLightBrightnessLightBrightnessRatio
      : runStudioRenderLoopLightObject.type === "striplight"
        ? Math.pow(normalizeLightBrightnessLightBrightnessRatio, 0.82)
        : spotLightBrightnessResponse2(
            runStudioRenderLoopLightObject.type,
            normalizeLightBrightnessLightBrightnessRatio,
          ) * Math.max(1, normalizeLightBrightnessLightBrightnessRatio);
  }
    function applySpotLightState(spotLightUpdater: any, spotLightState: any) {
    ((spotLightUpdater.intensity = spotLightState.intensity),
      spotLightUpdater.color.fromArray(spotLightState.color),
      (spotLightUpdater.visible = spotLightState.intensity > 0.000001 || !spotLightState.complete));
  }
  function sampleLightTransitions(transitionTimestamp: any, immediateTransition = false) {
    if (appCtx.prewarmState === controlsRestoreOptions) {
      if (
        ((ctx.pendingCameraState !== appCtx.sceneRootNode ||
          ctx.pendingTransitionSpec !== appCtx.sceneRootNode?.children[0]) &&
          ((ctx.pendingCameraState = appCtx.sceneRootNode),
          (ctx.pendingTransitionSpec = appCtx.sceneRootNode?.children[0]),
          (ctx.runStudioRenderLoopLightsByItemKey = buildLightCacheMap()),
          (ctx.lightRecordsByItemKey = new Map(
            collectLampEntries().map((lightRecordEntry: any) => [
              lightRecordEntry.itemKey,
              lightRecordEntry,
            ]),
          )),
          (ctx.shouldResetCamera = true)),
        immediateTransition || ctx.shouldResetCamera)
      )
        for (const [lightItemKey, groupedLights] of ctx.runStudioRenderLoopLightsByItemKey) {
          const lightRecord = ctx.lightRecordsByItemKey.get(lightItemKey);
          if (!lightRecord) continue;
          const shouldLightBeOn =
            lightRecord.group?.enabled !== false && lightRecord.item.lightBrightness > 0;
          for (const managedLight of groupedLights)
            ((managedLight.intensity = shouldLightBeOn
              ? finite2(managedLight.userData.lightOnIntensity, 0)
              : 0),
              (managedLight.visible = shouldLightBeOn),
              managedLight.color.setHex(
                lightEffectColorHex2(
                  lightRecord.item.lightTemperature,
                  lightRecord.item.lightColorRgb,
                ),
              ));
        }
      ctx.shouldResetCamera = false;
    }
    for (const [transitionLight, lightTransition] of lightTransitionsByLight)
      applySpotLightState(
        transitionLight,
        sampleLightTransition2(lightTransition, transitionTimestamp),
      );
  }
  function sampleTransitionProgress(sampledTransition: any, sampleTimestamp: any) {
    const transitionProgress = sampledTransition.duration
      ? clamp2((sampleTimestamp - sampledTransition.started) / sampledTransition.duration, 0, 1)
      : 1;
    return (
      sampledTransition.from +
      (sampledTransition.to - sampledTransition.from) *
        transitionProgress *
        transitionProgress *
        (3 - 2 * transitionProgress)
    );
  }
  function onLightsChanged() {
    (ctx.renderTickCounter && cancelAnimationFrame(ctx.renderTickCounter),
      (ctx.renderTickCounter = 0),
      lightTransitionsByKey.clear(),
      (appCtx.isPrecompilePending = false));
  }
  function resetLightTransitions(changedTimestamp: any) {
    if (
      ((ctx.renderTickCounter = 0),
      !appCtx.isCacheReady || appCtx.isFrameDirty || previewLightCacheCanvasElement.hidden || appCtx.prewarmState)
    ) {
      onLightsChanged();
      return;
    }
    for (const [resetLight, resetTransition] of lightTransitionsByKey)
      (appCtx.lightGainByFloor.set(
        resetLight,
        sampleTransitionProgress(resetTransition, changedTimestamp),
      ),
        changedTimestamp >= resetTransition.started + resetTransition.duration &&
          lightTransitionsByKey.delete(resetLight));
    ((appCtx.isPrecompilePending = lightTransitionsByKey.size > 0),
      restoreLightVisibility(),
      lightTransitionsByKey.size &&
        (ctx.renderTickCounter = requestAnimationFrame(resetLightTransitions)));
  }
  function applyLightStates(lightStateMap: any, applyTimestamp: any, lightApplyOptions: any) {
    if (
      !appCtx.isCacheReady ||
      appCtx.isFrameDirty ||
      appCtx.isCapturingLights ||
      previewLightCacheCanvasElement.hidden ||
      appCtx.prewarmState ||
      ctx.isSnapshotMode ||
      ctx.isViewTransitioning
    )
      return false;
    const visibleLightEntries = [...lightStateMap.values()].filter(
      (floorLightEntry) =>
        getPreviewFloorMode() === "all" || floorLightEntry.floorId === appCtx.activeFloorId,
    );
    if (
      !visibleLightEntries.every(
        (lightStateEntry) =>
          !lightStateEntry.colorChanged &&
          lightStateEntry.previousBrightness === lightStateEntry.item.lightBrightness &&
          lightStateEntry.previousKelvin === lightStateEntry.item.lightTemperature &&
          appCtx.lightGroupCacheByFloor.has(
            composeLightGroupKey(lightStateEntry.floorId, lightStateEntry.item.lightGroupId),
          ),
      )
    )
      return false;
    const applyNow = performance.now();
    for (const appliedLightState of visibleLightEntries) {
      const es2 = composeLightGroupKey(
          appliedLightState.floorId,
          appliedLightState.item.lightGroupId,
        ),
        existingLightTransition = lightTransitionsByKey.get(es2),
        lightOnProgress = existingLightTransition
          ? sampleTransitionProgress(existingLightTransition, applyNow)
          : finite2(appCtx.lightGainByFloor.get(es2), appliedLightState.wasOn ? 1 : 0);
      lightTransitionsByKey.set(es2, {
        from: lightOnProgress,
        to: appliedLightState.isOn ? 1 : 0,
        started: applyNow,
        duration: lightTransitionDurationMs2(
          appliedLightState.wasOn,
          appliedLightState.isOn,
          appliedLightState.fadeDuration,
          {
            ...lightApplyOptions,
            immediate: applyTimestamp,
          },
        ),
      });
    }
    return (
      ctx.renderTickCounter && cancelAnimationFrame(ctx.renderTickCounter),
      resetLightTransitions(applyNow),
      true
    );
  }
  function resetLightEffectStates() {
    const previousTransitionsByKey = new Map(lightTransitionsByKey);
    (onLightsChanged(),
      (appCtx.prewarmState = controlsRestoreOptions),
      ctx.overviewTimeoutHandle !== null && window.clearTimeout(ctx.overviewTimeoutHandle),
      (ctx.overviewTimeoutHandle = null),
      window.clearTimeout(appCtx.renderCommitTimeoutId),
      (appCtx.renderCommitTimeoutId = null),
      (appCtx.modelRevisionCounter += 1),
      (appCtx.isFrameDirty = true),
      appCtx.isCapturingLights || restorePreviewAfterFade(),
      setFadeOverlay(false));
    const fr3 = collectLampEntries();
    ((ctx.runStudioRenderLoopLightsByItemKey = ensureLightCache(fr3)),
      (ctx.lightRecordsByItemKey = new Map(
        fr3.map((resetRecordEntry: any) => [resetRecordEntry.itemKey, resetRecordEntry]),
      )),
      (ctx.pendingCameraState = appCtx.sceneRootNode),
      (ctx.pendingTransitionSpec = appCtx.sceneRootNode?.children[0]),
      (ctx.shouldResetCamera = true));
    const resetNow = performance.now();
    for (const resetRecord of fr3) {
      const previousTransition = previousTransitionsByKey.get(resetRecord.groupKey);
      if (!previousTransition) continue;
      const resetProgress = sampleTransitionProgress(previousTransition, resetNow);
      for (const restoredLight of ctx.runStudioRenderLoopLightsByItemKey.get(resetRecord.itemKey) ||
        []) {
        const resetLightEffectStatesLightOnIntensity = finite2(
            restoredLight.userData.lightOnIntensity,
            0,
          ),
          array = restoredLight.color.toArray();
        lightTransitionsByLight.set(
          restoredLight,
          createLightTransition2(
            {
              intensity: resetLightEffectStatesLightOnIntensity * resetProgress,
              color: array,
            },
            {
              intensity: resetLightEffectStatesLightOnIntensity * previousTransition.to,
              color: array,
            },
            resetNow,
            Math.max(0, previousTransition.started + previousTransition.duration - resetNow),
          ),
        );
      }
    }
    return (
      lightTransitionsByLight.size &&
        !ctx.reflectionPassCounter &&
        (ctx.reflectionPassCounter = requestAnimationFrame(checkTransitionsSettled)),
      requestStudioRender(),
      ctx.runStudioRenderLoopLightsByItemKey
    );
  }
  function scheduleControlsRestore() {
    if (
      ((ctx.overviewTimeoutHandle = null),
      !(
        appCtx.isEnvironmentActive ||
        appCtx.isCurtainMoving ||
        appCtx.isVacuumMoving ||
        appCtx.isBackgroundMoving ||
        ctx.isSnapshotMode ||
        ctx.isViewTransitioning ||
        lightTransitionsByLight.size ||
        appCtx.prewarmState !== controlsRestoreOptions
      ))
    ) {
      if (appCtx.isCapturingLights || appCtx.isPrewarming) {
        ctx.overviewTimeoutHandle = window.setTimeout(scheduleControlsRestore, 60);
        return;
      }
      ((appCtx.prewarmState = null),
        areLightsEnabled() && ((appCtx.isFrameDirty = true), scheduleStudioRender(0)));
    }
  }
  function checkTransitionsSettled(controlsTimestamp: any) {
    ((ctx.reflectionPassCounter = 0), sampleLightTransitions(controlsTimestamp));
    let hasPendingTransition = false;
    for (const [pendingLight, pendingTransition] of lightTransitionsByLight)
      controlsTimestamp - pendingTransition.started < pendingTransition.duration ||
        (lightTransitionsByLight.delete(pendingLight),
        pendingLight.visible || (hasPendingTransition = true));
    (hasPendingTransition &&
      (setupSceneShadows(appCtx.sceneRootNode, {
        rebuildAtlas: false,
      }),
      scheduleLightPrecompile()),
      renderStudioFrame(),
      lightTransitionsByLight.size
        ? (ctx.reflectionPassCounter = requestAnimationFrame(checkTransitionsSettled))
        : (applyLightTransitionFrame(false),
          appCtx.prewarmState === controlsRestoreOptions &&
            (ctx.overviewTimeoutHandle = window.setTimeout(scheduleControlsRestore, 180))));
  }
  function hasActiveLightTransition() {
    (onLightsChanged(),
      ctx.reflectionPassCounter && cancelAnimationFrame(ctx.reflectionPassCounter),
      ctx.overviewTimeoutHandle !== null && window.clearTimeout(ctx.overviewTimeoutHandle),
      ctx.presentationHandle !== null && window.clearTimeout(ctx.presentationHandle),
      (ctx.reflectionPassCounter = 0),
      (ctx.overviewTimeoutHandle = null),
      (ctx.presentationHandle = null),
      (appCtx.isPrewarming = false));
    for (const [activeLight, activeTransition] of lightTransitionsByLight)
      applySpotLightState(activeLight, {
        ...activeTransition.to,
        complete: true,
      });
    (lightTransitionsByLight.clear(),
      (ctx.isViewTransitioning = false),
      ctx.runStudioRenderLoopLightsByItemKey.clear(),
      ctx.lightRecordsByItemKey.clear(),
      appCtx.prewarmState === controlsRestoreOptions && (appCtx.prewarmState = null));
  }
  const weakMap = new WeakMap();
  function applyLightEffects(
    lightEffectEntries: any,
    lightEffectOptions: LightEffectOptions = {},
  ) {
    const lightEffectsByKey = new Map(
        lightEffectEntries.map((lightEffectEntry: any) => [
          composeItemKey(lightEffectEntry.floorId, lightEffectEntry.groupId),
          lightEffectEntry,
        ]),
      ),
      isPartialUpdate = lightEffectOptions.partial === true;
    ((lightEffectEntries = isPartialUpdate
      ? [...lightEffectsByKey.values()]
      : appCtx.studioProject.floors.flatMap((effectFloor: any) =>
          (effectFloor.scene.lightGroups || []).map(
            (effectGroup: any) =>
              lightEffectsByKey.get(composeItemKey(effectFloor.id, effectGroup.id)) || {
                floorId: effectFloor.id,
                groupId: effectGroup.id,
                on: false,
                brightnessSupported: false,
                temperatureSupported: false,
              },
          ),
        )),
      ctx.isPresentationRunning ||
        ((ctx.isPresentationRunning = true),
        window.addEventListener("pagehide", hasActiveLightTransition, {
          once: true,
        })));
    const isImmediateTransition =
        lightEffectOptions.immediate === true ||
        !ctx.isEntranceComplete ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
      pendingEffectsByKey = new Map(),
      floorsByFloorId = new Map(
        appCtx.studioProject.floors.map((lightEffectOptionsFloorEntry: any) => [
          lightEffectOptionsFloorEntry.id,
          lightEffectOptionsFloorEntry,
        ]),
      ),
      lightEffectBucketsByFloor = new Map();
    for (const lightEffect of lightEffectEntries) {
      const lightEffectState = mapLightEffectState2(lightEffect),
        effectFloorRecord = floorsByFloorId.get(lightEffect.floorId) as any;
      if (!effectFloorRecord) continue;
      let lightEffectBucket = lightEffectBucketsByFloor.get(effectFloorRecord);
      if (!lightEffectBucket) {
        lightEffectBucket = {
          groups: new Map(
            (effectFloorRecord.scene.lightGroups || []).map((bucketGroup: any) => [
              bucketGroup.id,
              bucketGroup,
            ]),
          ),
          items: new Map(),
        };
        for (const effectSceneItem of effectFloorRecord.scene.items)
          if (lampItemTypeSet.has(effectSceneItem.type)) {
            const bucketItems = lightEffectBucket.items.get(effectSceneItem.lightGroupId) || [];
            (bucketItems.push(effectSceneItem),
              lightEffectBucket.items.set(effectSceneItem.lightGroupId, bucketItems));
          }
        lightEffectBucketsByFloor.set(effectFloorRecord, lightEffectBucket);
      }
      const effectLightGroup = lightEffectBucket.groups.get(lightEffect.groupId);
      if (!effectLightGroup) continue;
      const isLightGroupEnabled = effectLightGroup.enabled !== false,
        isLightOn = lightEffect.on === true;
      effectLightGroup.enabled = isLightOn;
      for (const effectLightItem of lightEffectBucket.items.get(effectLightGroup.id) || []) {
        const lightBrightness = effectLightItem.lightBrightness,
          lightTemperature = effectLightItem.lightTemperature,
          lightColorRgb = effectLightItem.lightColorRgb;
        weakMap.has(effectLightItem) ||
          weakMap.set(effectLightItem, {
            brightness: lightBrightness,
            kelvin: lightTemperature,
          });
        const previousLightValue = weakMap.get(effectLightItem);
        (Number.isFinite(lightEffectState.brightness)
          ? (effectLightItem.lightBrightness = lightEffectState.brightness)
          : lightEffect.brightnessSupported === false &&
            (effectLightItem.lightBrightness = previousLightValue.brightness),
          Number.isFinite(lightEffectState.kelvin)
            ? (effectLightItem.lightTemperature = lightEffectState.kelvin)
            : lightEffect.temperatureSupported === false &&
              (effectLightItem.lightTemperature = previousLightValue.kelvin),
          (effectLightItem.lightColorRgb = lightEffectState.colorRgb || null));
        const hasLightColorChanged =
          String(lightColorRgb || []) !== String(effectLightItem.lightColorRgb || []);
        (!ctx.hasControlsRestored &&
          !hasLightColorChanged &&
          isLightGroupEnabled === isLightOn &&
          lightBrightness === effectLightItem.lightBrightness &&
          lightTemperature === effectLightItem.lightTemperature) ||
          pendingEffectsByKey.set(composeItemKey(effectFloorRecord.id, effectLightItem.id), {
            item: effectLightItem,
            floorId: effectFloorRecord.id,
            wasOn: isLightGroupEnabled,
            isOn: isLightOn,
            previousBrightness: lightBrightness,
            previousKelvin: lightTemperature,
            previousColorRgb: lightColorRgb,
            colorChanged: hasLightColorChanged,
            fadeDuration: lightEffect.fadeDuration,
          });
      }
    }
    if (
      (isPartialUpdate || ((ctx.isEntranceComplete = true), (ctx.hasControlsRestored = false)),
      !pendingEffectsByKey.size)
    )
      return;
    const ht4 = areLightsEnabled();
    if (ht4 && applyLightStates(pendingEffectsByKey, isImmediateTransition, lightEffectOptions))
      return;
    let lightsByKey = buildLightCacheMap();
    const previousLightsByKey = lightsByKey;
    ht4
      ? (lightsByKey = resetLightEffectStates())
      : [...pendingEffectsByKey.keys()].some(
          (pendingLightKey) => !lightsByKey.has(pendingLightKey),
        ) &&
        (lightsByKey = ensureLightCache(
          collectLampEntries().filter((trackedLightRecord: any) =>
            pendingEffectsByKey.has(trackedLightRecord.itemKey),
          ),
        ));
    let shouldRefreshLights = false;
    const effectNow = performance.now();
    for (const [effectKey, effectState] of pendingEffectsByKey) {
      if (getPreviewFloorMode() !== "all" && effectState.floorId !== appCtx.activeFloorId) continue;
      const affectedLights = lightsByKey.get(effectKey);
      if (affectedLights?.length)
        for (const affectedLight of affectedLights) {
          const existingEffectTransition = lightTransitionsByLight.get(affectedLight),
            previousBrightnessRatio = normalizeLightBrightness(
              effectState.item,
              effectState.previousBrightness,
            ),
            baseLightIntensity =
              previousLightsByKey.get(effectKey)?.includes(affectedLight) &&
              previousBrightnessRatio > 1e-7 &&
              affectedLight.userData.lightOnIntensity > 0
                ? affectedLight.userData.lightOnIntensity / previousBrightnessRatio
                : computeDownlightRange(effectState.item),
            lightEffectOptionsTargetLightIntensity =
              baseLightIntensity *
              normalizeLightBrightness(effectState.item, effectState.item.lightBrightness),
            lightTargetState = {
              intensity: effectState.isOn ? lightEffectOptionsTargetLightIntensity : 0,
              color: new ns2.Color(
                lightEffectColorHex2(
                  effectState.item.lightTemperature,
                  effectState.item.lightColorRgb,
                ),
              ).toArray(),
            },
            currentTransitionSample = existingEffectTransition
              ? sampleLightTransition2(existingEffectTransition, effectNow)
              : null,
            lightStartState =
              !effectState.wasOn &&
              effectState.isOn &&
              (!currentTransitionSample || currentTransitionSample.intensity <= 0.000001)
                ? {
                    intensity: 0,
                    color: lightTargetState.color,
                  }
                : currentTransitionSample || {
                    intensity: ht4
                      ? effectState.wasOn
                        ? baseLightIntensity * previousBrightnessRatio
                        : 0
                      : affectedLight.intensity,
                    color: ht4
                      ? new ns2.Color(
                          lightEffectColorHex2(
                            effectState.previousKelvin,
                            effectState.previousColorRgb,
                          ),
                        ).toArray()
                      : affectedLight.color.toArray(),
                  };
          ((affectedLight.userData.lightOnIntensity = lightEffectOptionsTargetLightIntensity),
            (affectedLight.userData.lightBrightness = effectState.item.lightBrightness));
          const lightTransitionDurationMs = lightTransitionDurationMs2(
              effectState.wasOn,
              effectState.isOn,
              effectState.fadeDuration,
              {
                ...lightEffectOptions,
                immediate: isImmediateTransition,
                temperatureChanged:
                  effectState.colorChanged ||
                  effectState.previousKelvin !== effectState.item.lightTemperature,
              },
            ),
            newLightTransition = createLightTransition2(
              lightStartState,
              lightTargetState,
              effectNow,
              lightTransitionDurationMs,
            ),
            visible2 = affectedLight.visible;
          (applySpotLightState(
            affectedLight,
            sampleLightTransition2(newLightTransition, effectNow),
          ),
            (shouldRefreshLights ||= visible2 !== affectedLight.visible),
            lightTransitionDurationMs
              ? lightTransitionsByLight.set(affectedLight, newLightTransition)
              : lightTransitionsByLight.delete(affectedLight));
        }
    }
    (ht4 && sampleLightTransitions(effectNow),
      (shouldRefreshLights || ht4) &&
        setupSceneShadows(appCtx.sceneRootNode, {
          rebuildAtlas: false,
        }),
      shouldRefreshLights && scheduleLightPrecompile(),
      applyLightTransitionFrame(lightTransitionsByLight.size > 0),
      renderStudioFrame(),
      ctx.reflectionPassCounter ||
        (lightTransitionsByLight.size
          ? (ctx.reflectionPassCounter = requestAnimationFrame(checkTransitionsSettled))
          : ht4 && (ctx.overviewTimeoutHandle = window.setTimeout(scheduleControlsRestore, 100))));
  }
  function syncViewOffset() {
    appCtx.threeRenderer.getSize(projectedScreenPoint);
    const viewOffsetWidth = Math.max(projectedScreenPoint.x || 1, 1),
      viewOffsetHeight = Math.max(projectedScreenPoint.y || 1, 1),
      viewOffsetSignature =
        viewOffsetWidth + "/" + viewOffsetHeight + "/" + ctx.stereoSampleIndex + "/" + appCtx.threeCamera.uuid;
    if (viewOffsetSignature === ctx.lastViewOffsetSignature) {
      syncSnapshotCamera();
      return;
    }
    ((ctx.lastViewOffsetSignature = viewOffsetSignature),
      ctx.stereoSampleIndex
        ? appCtx.threeCamera.setViewOffset(
            viewOffsetWidth,
            viewOffsetHeight,
            (viewOffsetWidth * ctx.stereoSampleIndex) / 2,
            0,
            viewOffsetWidth,
            viewOffsetHeight,
          )
        : appCtx.threeCamera.clearViewOffset(),
      syncSnapshotCamera());
  }
  function applyOrbitControlSettings() {
    ((appCtx.orbitControls.enablePan = ctx.shouldEnablePan),
      (appCtx.orbitControls.enableZoom = ctx.shouldEnableZoom),
      ctx.cameraViewMode === "horizontal" &&
        (appCtx.orbitControls.minPolarAngle = appCtx.orbitControls.maxPolarAngle = appCtx.orbitControls.getPolarAngle()),
      ctx.cameraViewMode === "vertical" &&
        (appCtx.orbitControls.minAzimuthAngle = appCtx.orbitControls.maxAzimuthAngle =
          appCtx.orbitControls.getAzimuthalAngle()));
  }
  function planToWorldForFloor(
    runStudioRenderLoopTargetFloorId: any,
    targetPlanX: any,
    targetPlanY: any,
    floorElevation = 0.1,
  ) {
    const targetFloorRecord = appCtx.studioProject.floors.find(
      (matchingFloor: any) => matchingFloor.id === runStudioRenderLoopTargetFloorId,
    );
    if (!targetFloorRecord) return null;
    const floorElevationFloorPixelsPerMeter =
      targetFloorRecord.scene.calibration?.pixelsPerMeter || 1;
    if (getPreviewFloorMode() === "all") {
      const sort9 = [...appCtx.studioProject.floors].sort(
          (firstElevationFloor, secondElevationFloor) =>
            firstElevationFloor.elevation - secondElevationFloor.elevation,
        ),
        $a5 = planToWorldPoint(targetFloorRecord, {
          x: targetPlanX,
          y: targetPlanY,
        });
      return new ns2.Vector3(
        $a5.x,
        sort9.indexOf(targetFloorRecord) * appCtx.studioProject.previewFloorGap + floorElevation,
        $a5.z,
      );
    }
    const floorElevationFloorModelOrigin = sceneModelOrigin2(
      targetFloorRecord.scene,
      targetFloorRecord,
    );
    return new ns2.Vector3(
      (targetPlanX - floorElevationFloorModelOrigin.x) / floorElevationFloorPixelsPerMeter,
      floorElevation,
      (targetPlanY - floorElevationFloorModelOrigin.y) / floorElevationFloorPixelsPerMeter,
    );
  }
  function cameraTargetForFloor(lookupFloorId: any) {
    if (!appCtx.studioProject.floors.some((presentFloor: any) => presentFloor.id === lookupFloorId))
      return null;
    const targetFloorPpm =
        appCtx.studioProject.floors.find((targetFloorEntry: any) => targetFloorEntry.id === lookupFloorId)
          ?.scene.calibration?.pixelsPerMeter || 1,
      floorTargetPoint = planToWorldForFloor(lookupFloorId, 0, 0, 0);
    return new ns2.Matrix4()
      .makeBasis(
        planToWorldForFloor(lookupFloorId, targetFloorPpm, 0, 0).sub(floorTargetPoint),
        new ns2.Vector3(0, 1, 0),
        planToWorldForFloor(lookupFloorId, 0, targetFloorPpm, 0).sub(floorTargetPoint),
      )
      .setPosition(floorTargetPoint);
  }
  function computeOverviewBox() {
    const ug3 = computeCourtyardBounds({
      physicalStack: appCtx.studioProject.uniformOverviewStack === true,
    });
    if (ug3) return ug3.getCenter(new ns2.Vector3());
    const isOverviewAllFloorsView = getPreviewFloorMode() === "all";
    if (isOverviewAllFloorsView && appCtx.studioProject.floors.length < 2) return null;
    const floors3 = isOverviewAllFloorsView
        ? appCtx.studioProject.floors
        : appCtx.studioProject.floors.filter((includedFloor: any) => includedFloor.id === appCtx.activeFloorId),
      computeOverviewBoxOverviewBoundsBox = new ns2.Box3();
    let maxFloorElevation = 0;
    for (const computeOverviewBoxOverviewFloor of floors3)
      for (const overviewWall of computeOverviewBoxOverviewFloor.scene.walls || []) {
        for (const wallPlanPoint of [overviewWall.start, overviewWall.end]) {
          if (
            !wallPlanPoint ||
            !Number.isFinite(wallPlanPoint.x) ||
            !Number.isFinite(wallPlanPoint.y)
          )
            continue;
          const $a6 = isOverviewAllFloorsView
            ? planToWorldPoint(computeOverviewBoxOverviewFloor, wallPlanPoint)
            : {
                x: wallPlanPoint.x,
                z: wallPlanPoint.y,
              };
          computeOverviewBoxOverviewBoundsBox.expandByPoint(new ns2.Vector3($a6.x, 0, $a6.z));
        }
        maxFloorElevation = Math.max(
          maxFloorElevation,
          finite2(
            overviewWall.height,
            computeOverviewBoxOverviewFloor.scene.settings?.wallHeight || 2.8,
          ),
        );
      }
    if (computeOverviewBoxOverviewBoundsBox.isEmpty()) return null;
    const center = computeOverviewBoxOverviewBoundsBox.getCenter(new ns2.Vector3());
    if (isOverviewAllFloorsView) {
      const floorElevations = floors3.map((stackFloor: any) => stackFloor.elevation),
        overviewStackGap =
          appCtx.studioProject.uniformOverviewStack === true
            ? Math.max(...floorElevations) - Math.min(...floorElevations)
            : (appCtx.studioProject.floors.length - 1) * appCtx.studioProject.previewFloorGap;
      return ((center.y = overviewStackGap / 2 + maxFloorElevation / 2), center);
    }
    return planToWorldForFloor(appCtx.activeFloorId, center.x, center.z, maxFloorElevation / 2);
  }
  function computeCameraTarget(targetVector: any) {
    const targetScopeKey = getPreviewFloorMode() === "all" ? "all" : appCtx.activeFloorId;
    if (
      ctx.renderRootRef !== appCtx.sceneRootNode ||
      ctx.renderKeyRef !== appCtx.sceneRevisionCount ||
      ctx.renderViewRef !== targetScopeKey
    ) {
      const floorOverviewBox = computeOverviewBox(),
        computedSceneBounds = floorOverviewBox
          ? null
          : computeSceneBounds({
              excludeModelLayers: retainedLayerKeySet,
            });
      ((ctx.renderRootRef = appCtx.sceneRootNode),
        (ctx.renderKeyRef = appCtx.sceneRevisionCount),
        (ctx.renderViewRef = targetScopeKey),
        (ctx.viewportBaseCamera =
          floorOverviewBox ||
          (computedSceneBounds.isEmpty()
            ? null
            : computedSceneBounds.getCenter(new ns2.Vector3()))));
    }
    return (ctx.viewportBaseCamera || targetVector).clone();
  }
  function configureOrbitControls() {
    if (
      (ctx.orbitTargetVector || (ctx.orbitTargetVector = computeCameraTarget(appCtx.orbitControls.target)),
      ctx.orbitTargetAnchor === appCtx.orbitControls)
    )
      return;
    const configureOrbitControlsOrbitControls = appCtx.orbitControls,
      activeCamera = appCtx.threeCamera,
      bind2 = configureOrbitControlsOrbitControls.update.bind(configureOrbitControlsOrbitControls);
    ctx.orbitTargetAnchor = configureOrbitControlsOrbitControls;
    let cachedOrbitShiftPivot: any = null,
      cachedOrbitShiftProject: any = null,
      cachedOrbitShiftScope: any = null,
      cachedOrbitShiftFloorGap: any = null,
      cachedOrbitShiftRuntimeSettings: any = null,
      cachedOrbitShiftOverview: any = null;
    const panCameraForward = () => {
        if (
          !ctx.isPerspectiveCameraMode ||
          !activeCamera.isPerspectiveCamera ||
          !ctx.cameraForwardVector ||
          ctx.isSnapshotMode
        )
          return;
        const normalize3 = configureOrbitControlsOrbitControls.target
            .clone()
            .sub(activeCamera.position)
            .normalize(),
          dot = ctx.cameraForwardVector.clone().sub(activeCamera.position).dot(normalize3);
        !Number.isFinite(dot) ||
          dot <= configureOrbitControlsOrbitControls.minDistance ||
          configureOrbitControlsOrbitControls.target
            .copy(activeCamera.position)
            .addScaledVector(normalize3, dot);
      },
      bind3 = configureOrbitControlsOrbitControls._pan.bind(configureOrbitControlsOrbitControls);
    configureOrbitControlsOrbitControls._pan = (panDeltaX: any, panDeltaY: any) => {
      panCameraForward();
      const zoom =
        ctx.isPerspectiveCameraMode && activeCamera.isPerspectiveCamera ? activeCamera.zoom : 1;
      return bind3(panDeltaX / zoom, panDeltaY / zoom);
    };
    for (const dollyMethodName of ["_dollyIn", "_dollyOut"]) {
      const bind4 = configureOrbitControlsOrbitControls[dollyMethodName].bind(
        configureOrbitControlsOrbitControls,
      );
      configureOrbitControlsOrbitControls[dollyMethodName] = (dollyDelta: any) => (
        panCameraForward(),
        bind4(dollyDelta)
      );
    }
    const queueControlsRestore = () => {
      appCtx.prewarmState === controlsRestoreOptions &&
        (ctx.overviewTimeoutHandle !== null && window.clearTimeout(ctx.overviewTimeoutHandle),
        (ctx.overviewTimeoutHandle = null),
        ctx.isViewTransitioning ||
          (ctx.overviewTimeoutHandle = window.setTimeout(scheduleControlsRestore, 180)));
    };
    (configureOrbitControlsOrbitControls.addEventListener("start", () => {
      ctx.isSnapshotMode || (ctx.isViewTransitioning = true);
    }),
      configureOrbitControlsOrbitControls.addEventListener("change", () => {
        ctx.isSnapshotMode ||
          (ctx.isViewTransitioning &&
            areLightsEnabled() &&
            appCtx.prewarmState !== controlsRestoreOptions &&
            (resetLightEffectStates(),
            sampleLightTransitions(performance.now()),
            setupSceneShadows(appCtx.sceneRootNode, {
              rebuildAtlas: false,
            })),
          queueControlsRestore());
      }),
      configureOrbitControlsOrbitControls.addEventListener("end", () => {
        ctx.isSnapshotMode || ((ctx.isViewTransitioning = false), queueControlsRestore());
      }));
    let enabled2 = configureOrbitControlsOrbitControls.enabled;
    (Object.defineProperty(configureOrbitControlsOrbitControls, "enabled", {
      configurable: true,
      get: () => ctx.isOrbitEnabled && !ctx.isSnapshotMode && enabled2,
      set: (controlsSetState) => {
        enabled2 = controlsSetState === true;
      },
    }),
      Object.defineProperty(configureOrbitControlsOrbitControls, "enableRotate", {
        configurable: true,
        get: () => true,
        set() {},
      }),
      (configureOrbitControlsOrbitControls.update = (controlsDeltaTime: any) => {
        if (
          ctx.isSnapshotMode ||
          configureOrbitControlsOrbitControls !== appCtx.orbitControls ||
          activeCamera !== appCtx.threeCamera
        )
          return false;
        (ctx.orbitTargetVector ||
          (ctx.orbitTargetVector = computeCameraTarget(configureOrbitControlsOrbitControls.target)));
        const clone7 = activeCamera.quaternion.clone();
        if (
          getCameraView() === "top" &&
          (configureOrbitControlsOrbitControls._sphericalDelta.theta ||
            configureOrbitControlsOrbitControls._sphericalDelta.phi)
        ) {
          const sub2 = activeCamera.position
              .clone()
              .sub(configureOrbitControlsOrbitControls.target),
            targetDistance = Math.max(sub2.length(), 0.001);
          if (Math.hypot(sub2.x, sub2.z) < targetDistance * 0.00001 && sub2.y > 0) {
            const quaternion = new ns2.Vector3(0, 1, 0).applyQuaternion(activeCamera.quaternion);
            ((quaternion.y = 0),
              quaternion.normalize(),
              sub2.set(
                -quaternion.x * targetDistance * 0.000001,
                targetDistance,
                -quaternion.z * targetDistance * 0.000001,
              ),
              activeCamera.position.copy(configureOrbitControlsOrbitControls.target).add(sub2));
          }
          (activeCamera.up.set(0, 1, 0),
            configureOrbitControlsOrbitControls._quat.identity(),
            configureOrbitControlsOrbitControls._quatInverse.identity(),
            configureOrbitControlsOrbitControls._spherical.setFromVector3(sub2),
            (configureOrbitControlsOrbitControls.minPolarAngle = 0),
            (configureOrbitControlsOrbitControls.maxPolarAngle = MAX_CAMERA_POLAR_ANGLE2),
            (configureOrbitControlsOrbitControls.minAzimuthAngle = -Infinity),
            (configureOrbitControlsOrbitControls.maxAzimuthAngle = Infinity),
            (cameraSettings().cameraView = "free"),
            (activeCamera.userData.cameraView = "free"),
            applyOrbitControlSettings());
        }
        const controlsUpdate = bind2(controlsDeltaTime);
        if (
          ctx.isSnapshotMode ||
          configureOrbitControlsOrbitControls !== appCtx.orbitControls ||
          activeCamera !== appCtx.threeCamera
        )
          return controlsUpdate;
        if (ctx.isOrbitEnabled && clone7.angleTo(activeCamera.quaternion) > 1e-7) {
          const orbitShiftScope = getPreviewFloorMode(),
            orbitShiftFloorGap = appCtx.pendingRuntimeSettings
              ? appCtx.studioProject?.exportFloorGap
              : appCtx.studioProject?.previewFloorGap,
            isOverviewOrbitShift =
              !!(appCtx.pendingRuntimeSettings && orbitShiftScope === "all" &&
                appCtx.studioProject?.uniformOverviewStack);
          if (
            !cachedOrbitShiftPivot ||
            cachedOrbitShiftProject !== appCtx.studioProject ||
            cachedOrbitShiftScope !== orbitShiftScope ||
            cachedOrbitShiftFloorGap !== orbitShiftFloorGap ||
            cachedOrbitShiftRuntimeSettings !== appCtx.pendingRuntimeSettings ||
            cachedOrbitShiftOverview !== isOverviewOrbitShift
          ) {
            const overviewOrbitPivot = isOverviewOrbitShift
                ? appCtx.overviewStackController?.getOrbitPivot?.()
                : null,
              fallbackPivotCenter = overviewOrbitPivot ? null : computeOverviewBox(),
              fallbackPivotBounds =
                overviewOrbitPivot || fallbackPivotCenter
                  ? null
                  : appCtx.sceneRootNode
                    ? computeSceneBounds({
                        excludeModelLayers: new Set(["items", "lights"]),
                      })
                    : null;
            ((cachedOrbitShiftPivot =
              overviewOrbitPivot?.clone() ||
              fallbackPivotCenter?.clone() ||
              (fallbackPivotBounds && !fallbackPivotBounds.isEmpty()
                ? fallbackPivotBounds.getCenter(new ns2.Vector3())
                : configureOrbitControlsOrbitControls.target.clone())),
              (cachedOrbitShiftProject = appCtx.studioProject),
              (cachedOrbitShiftScope = orbitShiftScope),
              (cachedOrbitShiftFloorGap = orbitShiftFloorGap),
              (cachedOrbitShiftRuntimeSettings = appCtx.pendingRuntimeSettings),
              (cachedOrbitShiftOverview = isOverviewOrbitShift));
          }
          const multiply = activeCamera.quaternion.clone().multiply(clone7.invert()),
            sub3 = cachedOrbitShiftPivot.clone().sub(configureOrbitControlsOrbitControls.target),
            sub4 = sub3.clone().sub(sub3.applyQuaternion(multiply));
          return (
            activeCamera.position.add(sub4),
            configureOrbitControlsOrbitControls.target.add(sub4),
            constrainCameraPosition2(
              activeCamera.position,
              configureOrbitControlsOrbitControls.target,
            ),
            activeCamera.lookAt(configureOrbitControlsOrbitControls.target),
            activeCamera.updateMatrixWorld(),
            configureOrbitControlsOrbitControls.dispatchEvent({
              type: "change",
            }),
            true
          );
        }
        return controlsUpdate;
      }));
  }
  ctx.reflectionModeIndex = isEmbeddedStage ? 0 : 1;
  const reflectionMaterialsByMesh = new WeakMap();
  ctx.isReflectionEnabled = !isEmbeddedStage;
  function applyReflectionVisibility() {
    if (!ctx.isReflectionEnabled) {
      for (const reflectionTarget of ctx.syncTargets)
        if (!(
          !reflectionTarget.userData?.floorPlanGroundShadow &&
          reflectionTarget.userData?.batchedWallContactShadowCount == null
        )) {
          for (const reflectionMaterial of [reflectionTarget.material].flat().filter(Boolean))
            (reflectionMaterialsByMesh.has(reflectionMaterial) ||
              reflectionMaterialsByMesh.set(reflectionMaterial, reflectionMaterial.opacity),
              (reflectionMaterial.opacity =
                reflectionMaterialsByMesh.get(reflectionMaterial) * ctx.reflectionModeIndex));
        }
      ctx.reflectionModeIndex === 1 && (ctx.isReflectionEnabled = true);
    }
  }
  function prepareReflectionTargets() {
    ((ctx.cameraRootRef !== appCtx.sceneRootNode || ctx.cameraFirstChildRef !== appCtx.sceneRootNode?.children[0]) &&
      ((ctx.cameraRootRef = appCtx.sceneRootNode),
      (ctx.cameraFirstChildRef = appCtx.sceneRootNode?.children[0]),
      (ctx.syncTargets = []),
      appCtx.sceneRootNode?.traverse((reflectionNode: any) => {
        (["background", "grid"].includes(reflectionNode.userData?.exportRole) ||
          reflectionNode.userData?.floorPlanGroundShadow === true ||
          reflectionNode.userData?.batchedWallContactShadowCount != null) &&
          ctx.syncTargets.push(reflectionNode);
      })),
      appCtx.backgroundController?.sync(ctx.syncTargets, ctx.isBackgroundVisible));
    for (const preparedReflectionTarget of ctx.syncTargets)
      preparedReflectionTarget.visible =
        ctx.isBackgroundVisible &&
        (!preparedReflectionTarget.userData.floorBackgroundHidden ||
          preparedReflectionTarget.userData.backgroundThemeKeepVisible === true) &&
        !preparedReflectionTarget.userData.backgroundThemeHidden;
    applyReflectionVisibility();
  }
  const isRenderLoopPerformanceDiagnostics =
      new URLSearchParams(globalThis.window?.location?.search || "").get(
        "performance-diagnostics",
      ) === "1",
    isBaselineGeometryMode =
      isRenderLoopPerformanceDiagnostics &&
      new URLSearchParams(window.location.search).get("geometry-detail") === "baseline",
    reflectionDetail = createReflectionDetail2({
      THREE: ns2,
      includeRuntime: !isBaselineGeometryMode,
      worldError: 0.06,
      ratio: 0.1,
      runtimeWorldError: 0.025,
      requestFrame: () => {
        (groundReflections.changed(), renderStudioFrame());
      },
    }),
    reflectionPasses = createReflectionPasses2({
      THREE: ns2,
      requestFrame: () => {
        (groundReflections.changed(), renderStudioFrame());
      },
    });
  reflectionPasses.options.small = false;
  const isReflectionDiagnosticsMode =
    new URLSearchParams(globalThis.window?.location?.search || "").get(
      "performance-diagnostics",
    ) === "1" && new URLSearchParams(window.location.search).get("reflection-work") === "baseline";
  ctx.previousReflectionEnabled = isEmbeddedStage;
  ctx.isReflectionDisabled = !isEmbeddedStage;
  ctx.reflectionDetailMode = isEmbeddedStage ? 0 : 1;
  deps.studioReflectionDetailMode = ctx.reflectionDetailMode;
  ctx.shouldStartPresentation = !isEmbeddedStage;
  (appCtx.regionLightController?.setPresentationGain(ctx.reflectionDetailMode),
    appCtx.regionLightController?.setShadowPresentationGain(ctx.reflectionModeIndex));
  const progressListenerSet = new Set<(progress: number) => void>(),
    startupPresentation = createStartupPresentation2({
      coverWindow: window.parent,
      waitForEffects: true,
      onPreparationFrame: (preparationFrame: any) =>
        appCtx.contactShadowController?.prepareDuringEntrance?.(preparationFrame),
      onProgress: (startupProgress: any) => {
        (appCtx.overviewStackController?.setEntryProgress(startupProgress),
          appCtx.regionLightController?.setPresentationGain(startupProgress),
          renderStudioFrame());
      },
      onShadowsProgress: (shadowsProgress: any) => {
        (shadowsProgress > 0 &&
          !ctx.hasEffectsPrepared &&
          ((ctx.hasEffectsPrepared = true), stageLoadTiming("shadows-reveal-start")),
          (ctx.reflectionModeIndex = shadowsProgress),
          appCtx.regionLightController?.setShadowPresentationGain(shadowsProgress),
          applyReflectionVisibility(),
          renderStudioFrame());
      },
      onEffectsProgress: (effectsProgress: any) => {
        (effectsProgress > 0 &&
          !ctx.isStartupPresentationDone &&
          ((ctx.isStartupPresentationDone = true), stageLoadTiming("effects-reveal-start")),

          (ctx.reflectionDetailMode = effectsProgress),
          (deps.studioReflectionDetailMode = effectsProgress));
        for (const progressListener of progressListenerSet) progressListener(effectsProgress);
      },
      onComplete: () => {
        stageLoadTiming("entry-finished");
      },
      onMotionComplete: () => {
        (stageLoadTiming("entry-motion-finished"),
          (ctx.isReflectionDisabled = true),
          appCtx.contactShadowController?.finishDeferredSurfaceBake?.(),
          renderStudioFrame());
      },
    });
  window.addEventListener(
    "pagehide",
    () => {
      (progressListenerSet.clear(), startupPresentation.dispose());
    },
    {
      once: true,
    },
  );
  const groundReflections = (appCtx.rendererLossHandler = createGroundReflections2({
      passes: reflectionPasses,
      detail: reflectionDetail,
      THREE: ns2,
      renderer: appCtx.threeRenderer,
      scene: appCtx.threeScene,
      ...interactionResourcePolicy.reflections,
      getRoot: () => appCtx.sceneRootNode,
      getSceneRevision: () => appCtx.sceneRevisionCount + ":" + appCtx.curtainFrameKey,
      floorLighting: isEmbedStageMode,
      persistentCache: isEmbedStageMode ? stageStartup2?.reflectionCache : null,
      getPersistentState: (floorId: any) => appCtx.regionLightController?.persistentKey?.(floorId),
      getPersistentMaterialState: (material: any) =>
        ctx.floorRetentionService?.persistentMaterialKey?.(material),
      getFloorCamera: (floorCamera: any, cameraFloorId: any) =>
        appCtx.overviewStackController?.reflectionCamera(floorCamera, cameraFloorId) || floorCamera,
      cull: !isReflectionDiagnosticsMode,
      maxResumeCapturesPerFrame: 1,
      syncLighting: (lightingCamera: any) =>
        isReflectionDiagnosticsMode
          ? appCtx.regionLightController?.sync(lightingCamera, true)
          : appCtx.regionLightController?.syncCamera(lightingCamera),
      requestFrame: () => renderStudioFrame(),
      getStateKey: () =>
        [
          appCtx.sceneRevisionCount,
          appCtx.isEnvironmentActive,
          appCtx.studioProject.uniformOverviewStack === true,
          isEmbedStageMode ? "" : appCtx.modelRevisionCounter,
          appCtx.isCacheReady,
          appCtx.threeRenderer.toneMappingExposure,
        ].join("|"),
    })),
    floorEffectsQuery = new URLSearchParams(globalThis.window?.location?.search || "").get(
      "floorEffects",
    );
  ctx.previousReflectionEnabled && groundReflections.setSuspended(true);
  const motionPresentation = createMotionPresentation2({
    reflections(reflectionsSuspended: any) {
      ((ctx.shouldSuspendReflections = reflectionsSuspended),
        groundReflections.setSuspended?.(
          ctx.previousReflectionEnabled || ctx.isReflectionsSuspended || reflectionsSuspended,
          {
            fade: !ctx.isReflectionsSuspended && !ctx.previousReflectionEnabled,
          },
        ));
    },
    shadows(shadowsEnabled: any) {
      (appCtx.contactShadowController?.setVisibleFloor?.(
        getPreviewFloorMode() === "all" ? null : appCtx.activeFloorId,
      ),
        appCtx.contactShadowController?.setMotion?.(shadowsEnabled));
    },
  });
  function applyShadowSettings(nextShadowsEnabled: any, prevShadowsEnabled: any) {
    const shadowSettingsChanged = nextShadowsEnabled && !prevShadowsEnabled;
    ((appCtx.threeRenderer.domElement.dataset.editorEffects = nextShadowsEnabled
      ? prevShadowsEnabled
        ? "light-preview"
        : "paused"
      : "runtime"),
      ctx.isReflectionsSuspended !== shadowSettingsChanged &&
        ((ctx.isReflectionsSuspended = shadowSettingsChanged),
        groundReflections.setSuspended?.(
          ctx.previousReflectionEnabled || ctx.isReflectionsSuspended || ctx.shouldSuspendReflections,
        ),
        renderStudioFrame()));
  }
  const We3 =
    (isEmbedStageMode || floorEffectsQuery === "follow") && floorEffectsQuery !== "deferred";
  const shadowIntensitiesByLight = new Map();
  function setShadowsEnabled(shadowEnabledFlag: any) {
    if (ctx.hasShadowBoost !== shadowEnabledFlag) {
      if (((ctx.hasShadowBoost = shadowEnabledFlag), We3)) {
        (shadowEnabledFlag && (ctx.isShadowBoostActive = appCtx.threeRenderer.shadowMap.autoUpdate),
          (appCtx.threeRenderer.shadowMap.autoUpdate = shadowEnabledFlag || ctx.isShadowBoostActive),
          (appCtx.threeRenderer.shadowMap.needsUpdate = true),
          appCtx.regionLightController?.setMotion?.(shadowEnabledFlag, true));
        return;
      }
      (shadowEnabledFlag
        ? ((ctx.shadowBoostStart = null),
          (ctx.isShadowBoostActive = appCtx.threeRenderer.shadowMap.autoUpdate),
          (appCtx.threeRenderer.shadowMap.autoUpdate = false),
          (appCtx.threeRenderer.shadowMap.needsUpdate = false),
          appCtx.threeScene.traverse((shadowNode: any) => {
            !shadowNode.isLight ||
              !shadowNode.castShadow ||
              !shadowNode.shadow ||
              (shadowIntensitiesByLight.has(shadowNode.shadow) ||
                shadowIntensitiesByLight.set(shadowNode.shadow, shadowNode.shadow.intensity ?? 1),
              (shadowNode.shadow.intensity = 0));
          }))
        : ((appCtx.threeRenderer.shadowMap.autoUpdate = ctx.isShadowBoostActive),
          (appCtx.threeRenderer.shadowMap.needsUpdate = true),
          (ctx.shadowBoostStart = performance.now())),
        appCtx.regionLightController?.setMotion?.(shadowEnabledFlag));
    }
  }
  function updateShadowBoost() {
    if (ctx.hasShadowBoost || ctx.shadowBoostStart === null) return;
    const shadowBoostProgress = Math.min(1, (performance.now() - ctx.shadowBoostStart) / 280);
    for (const [boostedLight, baselineIntensity] of shadowIntensitiesByLight)
      boostedLight.intensity = baselineIntensity * shadowBoostProgress;
    shadowBoostProgress < 1
      ? renderStudioFrame()
      : (shadowIntensitiesByLight.clear(), (ctx.shadowBoostStart = null));
  }
  const scheduleTask = (schedulerKey: any, schedulerWork: any) =>
    typeof measureFloorSwitchPhase == "function"
      ? measureFloorSwitchPhase(schedulerKey, schedulerWork)
      : schedulerWork();
  function suspendReflections(suspendedFlag: any) {
    (motionPresentation.floor(suspendedFlag), setShadowsEnabled(suspendedFlag));
  }
  const floorTransition = createFloorTransition2({
      THREE: ns2,
      getRoot: () => appCtx.sceneRootNode,
      dispose: disposeObjectTree,
      release: retainFloorNode,
      suspendReflections: suspendReflections,
      invalidate: (invalidatedFloorId) => {
        (invalidatedFloorId &&
          ((ctx.orbitTargetVector = null),
          (ctx.renderRootRef = null),
          (ctx.renderKeyRef = undefined),
          (ctx.viewportBaseCamera = null),
          configureOrbitControls()),
          We3 && !invalidatedFloorId && computeSceneExtent(),
          refreshSceneRender(
            invalidatedFloorId
              ? {
                  scene: true,
                  shadows: true,
                }
              : {
                  preserveLightCache: true,
                },
          ));
      },
    }),
    recordsByFloorId = new Map();
  function invalidateFloorTransition(resolvedFloorId: any) {
    const floorTransitionRecord = floorTransition.records.find(
      (transitionRecord: any) => transitionRecord.id === resolvedFloorId,
    );
    if (floorTransitionRecord)
      return (
        floorTransitionRecord.node.updateWorldMatrix(true, false),
        floorTransitionRecord.node.matrixWorld.clone().multiply(floorTransitionRecord.baseFrame)
      );
    const sceneSnapshotKeys = [
      appCtx.sceneRootNode,
      appCtx.studioProject,
      appCtx.sceneRevisionCount,
      getPreviewFloorMode(),
      appCtx.studioProject.previewFloorGap,
    ];
    return (
      sceneSnapshotKeys.some(
        (snapshotItem, snapshotIndex) => snapshotItem !== ctx.previousSceneSnapshot[snapshotIndex],
      ) && ((ctx.previousSceneSnapshot = sceneSnapshotKeys), recordsByFloorId.clear()),
      recordsByFloorId.has(resolvedFloorId) ||
        recordsByFloorId.set(resolvedFloorId, cameraTargetForFloor(resolvedFloorId)),
      recordsByFloorId.get(resolvedFloorId)
    );
  }
  (appCtx.contactShadowController?.setFrameProvider?.(invalidateFloorTransition),
    appCtx.regionLightController?.setMotionTransformProvider?.((motionNode: any) => {
      const motionRecord = floorTransition.records.find(
        (motionRecordEntry: any) => motionRecordEntry.id === motionNode,
      );
      return motionRecord
        ? (motionRecord.node.updateWorldMatrix(true, false),
          (motionRecord.lightingTransform ||= new ns2.Matrix4())
            .copy(motionRecord.node.matrixWorld)
            .invert()
            .premultiply(appCtx.sceneRootNode.matrixWorld))
        : null;
    }),
    globalThis.window?.addEventListener(
      "pagehide",
      () => {
        (floorTransition.finish(), trimRetainedFloors());
      },
      {
        once: true,
      },
    ),
    globalThis.window?.addEventListener("pagehide", () => groundReflections.dispose(), {
      once: true,
    }));
  const onBeforeRender = appCtx.threeScene.onBeforeRender,
    reflectionProbeMesh = new ns2.Mesh(
      new ns2.BufferGeometry().setAttribute("position", new ns2.Float32BufferAttribute([], 3)),
      new ns2.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        depthTest: false,
      }),
    );
  ((reflectionProbeMesh.name = "interaction3d-curtain-shadow-refresh"),
    (reflectionProbeMesh.frustumCulled = false),
    (reflectionProbeMesh.renderOrder = -1000000000),
    reflectionProbeMesh.layers.enableAll(),
    (reflectionProbeMesh.onBeforeRender = () => {
      ctx.shouldRefreshGeometry &&
        !ctx.hasShadowBoost &&
        (ctx.shouldRefreshGeometry = appCtx.lightPrecompileController
          ? !appCtx.lightPrecompileController.refreshGeometry(appCtx.sceneRootNode, ctx.geometryBoxes)
          : false);
    }),
    appCtx.threeScene.add(reflectionProbeMesh),
    globalThis.window?.addEventListener(
      "pagehide",
      () => {
        (reflectionProbeMesh.removeFromParent(),
          reflectionProbeMesh.geometry.dispose(),
          reflectionProbeMesh.material.dispose());
      },
      {
        once: true,
      },
    ),
    (appCtx.threeScene.onBeforeRender = function (...renderArgs: any[]) {
      if (groundReflections.stats.inCapture) {
        isReflectionDiagnosticsMode && appCtx.regionLightController?.sync(renderArgs[2], true);
        return;
      }
      groundReflections.setInsideEnabled?.(getPreviewFloorMode() !== "all");
      if (
        (updateShadowBoost(),
        ctx.reflectionDetailMode === 0 && ctx.releaseStartupDeviceSync?.(),
        ctx.hasShadowBoost || scheduleTask("curtains", () => ctx.releaseCurtains?.()),
        scheduleTask("television-screens", () => ctx.releaseTelevisionScreens?.()),
        ctx.shouldRefreshGeometry && !ctx.hasShadowBoost)
      ) {
        (ctx.geometryRootRef !== appCtx.sceneRootNode || ctx.geometryKeyRef !== appCtx.sceneRevisionCount) &&
          ((ctx.geometryRootRef = appCtx.sceneRootNode),
          (ctx.geometryKeyRef = appCtx.sceneRevisionCount),
          (ctx.shadowLights = []),
          (ctx.geometryBoxes = []),
          appCtx.sceneRootNode?.updateWorldMatrix(true, true),
          appCtx.sceneRootNode?.traverse((probeNode: any) => {
            probeNode.userData?.environmentModelType === "curtain" &&
              ctx.geometryBoxes.push(new ns2.Box3().setFromObject(probeNode));
          }),
          appCtx.threeScene.traverse((sceneShadowNode: any) => {
            sceneShadowNode.isLight &&
              sceneShadowNode.castShadow &&
              sceneShadowNode.shadow &&
              ctx.shadowLights.push(sceneShadowNode);
          }));
        for (const shadowUpdateLight of ctx.shadowLights) shadowUpdateLight.shadow.needsUpdate = true;
        appCtx.contactShadowController?.invalidate(ctx.invalidationBounds, true);
      }
      if (
        (scheduleTask("lighting-and-contact", () => onBeforeRender?.apply(this, renderArgs)),
        ctx.hasShadowBoost ||
          (ctx.floorRetentionService?.setRoot(
            appCtx.sceneRootNode,
            appCtx.sceneRevisionCount + ":" + appCtx.curtainFrameKey,
          ),
          ctx.sceneRetentionService?.setRoot(appCtx.sceneRootNode, appCtx.sceneRevisionCount)),
        prepareReflectionTargets(),
        syncViewOffset(),
        ctx.previousReflectionEnabled &&
          ctx.isReflectionDisabled &&
          !appCtx.contactShadowController?.isPending?.() &&
          !appCtx.contactShadowController?.hasPendingSurfaces?.() &&
          ((ctx.previousReflectionEnabled = false),
          groundReflections.setSuspended(ctx.isReflectionsSuspended || ctx.shouldSuspendReflections, {

            fadeIn: true,
          }),
          groundReflections.changed(),
          stageLoadTiming("surface-shadows-ready"),
          startupPresentation.shadowsReady()),
        !ctx.previousReflectionEnabled &&

          (!appCtx.threeRenderer.getRenderTarget() || appCtx.shadowAtlasCanvas?.isScreenPass) &&
          (scheduleTask("reflections", () => {
            const renderGroundReflections = () =>
              groundReflections.render(renderArgs[2], {
                worldMatricesCurrent: true,
              });
            ctx.reflectionDetailMode < 1 && appCtx.regionLightController
              ? appCtx.regionLightController.withPresentationGain(1, renderGroundReflections)
              : renderGroundReflections();
          }),
          ctx.isReflectionDisabled &&
            !ctx.isShadowReady &&
            groundReflections.isPrepared() &&
            ((ctx.isShadowReady = true),
            stageLoadTiming("reflections-ready"),
            startupPresentation.effectsReady()),
          isRenderLoopPerformanceDiagnostics || isRenderStatsTest))
      ) {
        const reflectionStatsJson = JSON.stringify({
          ...groundReflections.stats,
          detail: reflectionDetail?.stats,
        });
        appCtx.threeRenderer.domElement.dataset.reflectionStats !== reflectionStatsJson &&
          (appCtx.threeRenderer.domElement.dataset.reflectionStats = reflectionStatsJson);
      }
      renderArgs[2] === appCtx.threeCamera &&
        (!appCtx.threeRenderer.getRenderTarget() || appCtx.shadowAtlasCanvas?.isScreenPass) &&
        (overviewDetail.prepare(appCtx.sceneRootNode, appCtx.sceneRevisionCount),
        overviewDetail.begin(renderArgs[2]),
        isInteractionBatchesEnabled() &&
          (deps.interactionBatches.prepare(
            appCtx.sceneRootNode,
            appCtx.sceneRevisionCount + ":" + appCtx.curtainFrameKey,
          ),
          deps.interactionBatches.begin(renderArgs[2]),
          (isRenderLoopPerformanceDiagnostics || isRenderStatsTest) &&
            (appCtx.threeRenderer.domElement.dataset.interactionBatchStats = JSON.stringify(
              deps.interactionBatches.stats,
            ))),
        isRenderLoopPerformanceDiagnostics &&
          (appCtx.threeRenderer.domElement.dataset.overviewDetailStats = JSON.stringify(
            overviewDetail.stats,
          )));
    }));
  const overviewDetail = createOverviewDetail2({
    THREE: ns2,
    renderer: appCtx.threeRenderer,
    scene: appCtx.threeScene,
    getCamera: () => appCtx.threeCamera,
    getFloorId: overviewFloorId2,
    getFloorCamera: (overviewCamera, overviewFloorId) =>
      appCtx.overviewStackController?.cameraForFloor(overviewFloorId2(overviewCamera), overviewFloorId) ||
      overviewFloorId,
    enabled: () =>
      !isBaselineGeometryMode &&
      getPreviewFloorMode() === "all" &&
      !ctx.isPerspectiveCameraMode &&
      !ctx.stereoSampleIndex &&
      !ctx.isRenderLoopOverviewMode &&
      !ctx.hasShadowBoost &&
      ctx.isReflectionDisabled &&
      ctx.reflectionDetailMode === 1 &&
      !appCtx.pendingRuntimeSettings &&
      (!appCtx.threeRenderer.getRenderTarget() || appCtx.shadowAtlasCanvas?.isScreenPass),
    requestFrame: () => {
      (appCtx.compiledShaderCache?.clear(), renderStudioFrame());
    },
  });
  window.addEventListener("pagehide", () => overviewDetail.dispose(), {
    once: true,
  });
  /** 交互批处理：仅嵌入式 stage、高细节、非诊断模式与 `?interaction-batches=baseline` 关闭时启用。 */
  function isInteractionBatchesEnabled() {
    return (
      !isBaselineGeometryMode &&
      ctx.reflectionDetailMode === 1 &&
      !appCtx.pendingRuntimeSettings &&
      new URLSearchParams(window.location.search).get("interaction-batches") !== "baseline"
    );
  }
  deps.interactionBatches = createInteractionBatches2({
    THREE: ns2,
    renderer: appCtx.threeRenderer,
    scene: appCtx.threeScene,
    isDynamicObject: (sceneNode: any) => effectCache?.isDynamicObject(sceneNode) === true,
    getCamera: (sceneNode: any, floorCamera: any) =>
      appCtx.overviewStackController?.cameraForFloor(
        sceneNode.userData?.environmentFloorId,
        floorCamera,
      ) || floorCamera,
    materialState: (material: any) =>
      ctx.floorRetentionService?.persistentMaterialKey?.(material) ?? null,
  });
  window.addEventListener("pagehide", () => deps.interactionBatches?.dispose(), {
    once: true,
  });
  const onAfterRender = appCtx.threeScene.onAfterRender;
  appCtx.threeScene.onAfterRender = function (...afterRenderArgs: any[]) {
    (onAfterRender?.apply(this, afterRenderArgs),
      ctx.isShadowReady &&
        ctx.reflectionDetailMode === 1 &&
        afterRenderArgs[2] === appCtx.threeCamera &&
        (!appCtx.threeRenderer.getRenderTarget() || appCtx.shadowAtlasCanvas?.isScreenPass) &&
        (appCtx.contactShadowController?.allowPersistence?.(),
        groundReflections.allowPersistence()),
      !ctx.shouldStartPresentation &&
        afterRenderArgs[2] === appCtx.threeCamera &&
        ctx.reflectionModeIndex > 0 &&
        ((ctx.shouldStartPresentation = true), renderStudioFrame()));
  };
  function buildCameraPose(poseTarget = appCtx.orbitControls.target.clone()) {
    const clone8 = appCtx.threeCamera.position.clone();
    (appCtx.orbitControls.dispose(),
      (appCtx.orbitControls = createOrbitControls(appCtx.threeCamera)),
      appCtx.threeCamera.position.copy(clone8),
      appCtx.orbitControls.target.copy(poseTarget));
    const poseDistance = Math.max(clone8.distanceTo(poseTarget), 0.001);
    ((appCtx.orbitControls.minDistance = Math.min(ctx.isPerspectiveCameraMode ? 0.1 : 2, poseDistance)),
      (appCtx.orbitControls.maxDistance = Math.max(100, poseDistance * 2)),
      (appCtx.orbitControls.minZoom = Math.min(0.35, appCtx.threeCamera.zoom)),
      (appCtx.orbitControls.maxZoom = Math.max(ctx.isPerspectiveCameraMode ? 100 : 6, appCtx.threeCamera.zoom)),
      (appCtx.orbitControls.maxPolarAngle = MAX_CAMERA_POLAR_ANGLE2),
      (appCtx.orbitControls.enableRotate = true),
      (appCtx.orbitControls.enabled = ctx.isOrbitEnabled),
      appCtx.orbitControls.update(),
      applyOrbitControlSettings(),
      configureOrbitControls(),
      syncViewOffset(),
      appCtx.threeCamera.updateMatrixWorld());
  }
  return {
    reportLifecycle(lifecycleEvent: any, lifecycleDetail: any) {
      emitRuntimeDiagnostic(lifecycleEvent, lifecycleDetail);
    },
    onCameraChange(changedCamera: any) {
      const domElement9 = appCtx.threeRenderer.domElement;
      return (
        domElement9.addEventListener("hb-i3d-camera-frame", changedCamera),
        () => domElement9.removeEventListener("hb-i3d-camera-frame", changedCamera)
      );
    },
    createFrameLoop: (frameLoopCallback: any) => createDemandFrameLoop2(frameLoopCallback),
    setPresentedVisible(presentedVisible: any) {
      appCtx.threeRenderer.domElement.dispatchEvent?.(
        new CustomEvent("hb-i3d-parent-visibility", {
          detail: presentedVisible === true,
        }),
      );
    },
    THREE: ns2,
    constrainCameraPose: constrainCameraPose2,
    container: selectElement("#preview-3d"),
    canvas: appCtx.threeRenderer.domElement,
    get groundReflections() {
      return groundReflections;
    },
    invalidateReflections(reflectionInvalidateReason: any) {
      groundReflections.changed(reflectionInvalidateReason);
    },
    get modelRoot() {
      return appCtx.sceneRootNode;
    },
    get retainedModelRoots() {
      return [...retainedFloorsByKey.values()].map((environmentEntry) => environmentEntry.node);
    },
    get overlayScene() {
      return appCtx.threeScene;
    },
    get backgroundFloor() {
      return getPreviewFloorMode() === "all" ? "all" : appCtx.activeFloorId;
    },
    get backgroundFloorTransition() {
      return floorTransition.active && ctx.unusedRenderState
        ? {
            from: ctx.unusedRenderState,
            amount: ctx.unusedRenderCounter,
          }
        : null;
    },
    get sceneRevision() {
      return appCtx.sceneRevisionCount;
    },
    get environmentRevision() {
      return appCtx.sceneRevisionCount + ":" + appCtx.curtainFrameKey;
    },
    prepareEnvironmentMaterials() {
      appCtx.regionLightController?.prepareMaterials();
    },
    setEnvironmentScene(environmentScene: any) {
      ctx.floorRetentionService = environmentScene;
    },
    setEnvironmentAirflow(environmentAirflow: any) {
      ctx.sceneRetentionService = environmentAirflow;
    },
    setCurtainSync(curtainSync: any) {
      ctx.releaseCurtains = curtainSync;
    },
    setTelevisionSync(televisionSync: any) {
      ctx.releaseTelevisionScreens = televisionSync;
    },
    setStartupDeviceSync(startupDeviceSync: any) {
      ctx.releaseStartupDeviceSync = startupDeviceSync;
    },
    curtainFrame({
      key: curtainKey,
      structure: curtainStructure,
      floorIds: curtainFloorIds = [],
      moving: runStudioRenderLoopIsCurtainMoving,
    }: any) {
      const hasCurtainKeyChanged = curtainKey !== appCtx.curtainStructureJson,
        Dr2 = appCtx.isCurtainMoving;
      if (!(!hasCurtainKeyChanged && Dr2 === runStudioRenderLoopIsCurtainMoving)) {
        if (hasCurtainKeyChanged)
          try {
            const parseCurtainFrame = (curtainPayloadJson: any) => {
                const curtainPanelsByKey = new Map();
                for (const curtainEntryPair of JSON.parse(curtainPayloadJson)) {
                  const curtainEntryValue = curtainEntryPair[1];
                  (curtainPanelsByKey.has(curtainEntryValue) ||
                    curtainPanelsByKey.set(curtainEntryValue, []),
                    curtainPanelsByKey.get(curtainEntryValue).push(curtainEntryPair));
                }
                return curtainPanelsByKey;
              },
              previousCurtainPanels = parseCurtainFrame(appCtx.curtainStructureJson),
              currentCurtainPanels = parseCurtainFrame(curtainKey);
            groundReflections.changed(
              [
                ...new Set([...previousCurtainPanels.keys(), ...currentCurtainPanels.keys()]),
              ].filter(
                (curtainPanelKey) =>
                  JSON.stringify(previousCurtainPanels.get(curtainPanelKey)) !==
                  JSON.stringify(currentCurtainPanels.get(curtainPanelKey)),
              ),
            );
          } catch {
            groundReflections.changed(curtainFloorIds);
          }
        (curtainStructure !== appCtx.curtainFrameKey &&
          (appCtx.lightPrecompileController?.prepareRoot(appCtx.sceneRootNode),
          appCtx.regionLightController?.invalidate()),
          (ctx.invalidationBounds = [...new Set([...ctx.backgroundBoundaries, ...curtainFloorIds])]),
          (ctx.backgroundBoundaries = curtainFloorIds),
          (hasCurtainKeyChanged || runStudioRenderLoopIsCurtainMoving) &&
            (Dr2 || (resetLightEffectStates(), sampleLightTransitions(performance.now(), true)),
            hasCurtainKeyChanged && (ctx.shouldRefreshGeometry = true),
            (appCtx.modelRevisionCounter += 1),
            (appCtx.isFrameDirty = true),
            setFadeOverlay(false)),
          (appCtx.curtainStructureJson = curtainKey),
          (appCtx.isCurtainMoving = runStudioRenderLoopIsCurtainMoving),
          (appCtx.curtainFrameKey = curtainStructure),
          runStudioRenderLoopIsCurtainMoving || scheduleControlsRestore(),
          renderStudioFrame());
      }
    },
    requestRender() {
      refreshSceneRender({
        preserveLightCache: true,
      });
    },
    /** 动态体（电视画面/喷雾/流光）发生变化：下一帧强制重建静态帧缓存。 */
    requestEffectRender() {
      (appCtx.compiledShaderCache?.clear(),
        (deps.shouldForceEffectFrame = true),
        (appCtx.isLightCacheReady = true),
        appCtx.lightingScheduler?.wake());
    },
    /** 登记某组动态对象：它们变化时只重绘叠加层，不重算静态帧。 */
    setDynamicRenderObjects(renderObjectKey: any, renderObjects: any[] = []) {
      effectCache?.setDynamicObjects(renderObjectKey, renderObjects) && renderStudioFrame();
    },
    requestDynamicRender() {
      isEmbeddedStage
        ? (appCtx.compiledShaderCache?.clear(),
          (deps.shouldForceEffectFrame = true),
          (appCtx.isLightCacheReady = true),
          appCtx.lightingScheduler?.wake())
        : refreshSceneRender({
            preserveLightCache: true,
          });
    },
    setBackgroundTheme(backgroundTheme: any) {
      ((appCtx.backgroundController = backgroundTheme), prepareReflectionTargets());
    },
    backgroundFrame(backgroundValue: any, { separate: separateBackground = false } = {}) {
      const isBackgroundEnabled = backgroundValue === true;
      (isBackgroundEnabled !== appCtx.isBackgroundMoving &&
        ((appCtx.isBackgroundMoving = isBackgroundEnabled),
        isEmbedStageMode ||
          (isBackgroundEnabled
            ? (resetLightEffectStates(), sampleLightTransitions(performance.now(), true))
            : (appCtx.modelRevisionCounter++, (appCtx.isFrameDirty = true), scheduleControlsRestore()))),
        separateBackground && isBackgroundEnabled
          ? ((appCtx.isLightCacheDeferred = true), appCtx.lightingScheduler?.wake())
          : renderStudioFrame());
    },
    setVacuumMoving(vacuumMoving: any) {
      const isVacuumMovingRequested = vacuumMoving === true;
      isVacuumMovingRequested !== appCtx.isVacuumMoving &&
        ((appCtx.isVacuumMoving = isVacuumMovingRequested),
        appCtx.vacuumMoveCount++,
        isVacuumMovingRequested
          ? (resetLightEffectStates(), sampleLightTransitions(performance.now(), true))
          : (appCtx.modelRevisionCounter++, (appCtx.isFrameDirty = true), scheduleControlsRestore()),
        renderStudioFrame());
    },
    setLockMoving(lockMoving: any) {
      const isLockMovingRequested = lockMoving === true;
      isLockMovingRequested !== appCtx.isLockMoving &&
        ((appCtx.isLockMoving = isLockMovingRequested),
        appCtx.lockMoveCount++,
        isLockMovingRequested
          ? (resetLightEffectStates(), sampleLightTransitions(performance.now(), true))
          : (appCtx.modelRevisionCounter++, (appCtx.isFrameDirty = true), scheduleControlsRestore()),
        renderStudioFrame());
    },
    environmentModelPose(environmentPose: any, poseFloorId: any) {
      let poseRoot: any;
      if (
        (appCtx.sceneRootNode?.traverse((poseCandidateNode: any) => {
          poseCandidateNode.userData?.environmentFloorId === environmentPose &&
            poseCandidateNode.userData?.environmentModelId === poseFloorId &&
            (poseRoot = poseCandidateNode);
        }),
        !poseRoot)
      )
        return null;
      ((poseRoot = poseRoot.userData.vacuumMobileRoot || poseRoot),
        poseRoot.updateWorldMatrix(true, true));
      const poseBoundsBox = new ns2.Box3(),
        poseResultBox = new ns2.Box3();
      return (
        poseRoot.traverse((poseMesh: any) => {
          if (!(!poseMesh.isMesh || !poseMesh.geometry)) {
            for (
              let poseAncestorNode = poseMesh;
              poseAncestorNode && poseAncestorNode !== poseRoot;
              poseAncestorNode = poseAncestorNode.parent
            )
              if (poseAncestorNode.userData?.environmentEffect) return;
            (poseMesh.geometry.computeBoundingBox(),
              poseMesh.geometry.boundingBox &&
                poseBoundsBox.union(
                  poseResultBox
                    .copy(poseMesh.geometry.boundingBox)
                    .applyMatrix4(poseMesh.matrixWorld),
                ));
          }
        }),
        poseBoundsBox.isEmpty()
          ? null
          : {
              center: poseBoundsBox.getCenter(new ns2.Vector3()).toArray(),
              size: poseBoundsBox.getSize(new ns2.Vector3()).toArray(),
              forward: new ns2.Vector3(0, 0, 1).transformDirection(poseRoot.matrixWorld).toArray(),
            }
      );
    },
    setEnvironmentActive(environmentActive: any) {
      const isEnvironmentActiveRequested = environmentActive === true;
      isEnvironmentActiveRequested !== appCtx.isEnvironmentActive &&
        (isEnvironmentActiveRequested &&
          (resetLightEffectStates(), sampleLightTransitions(performance.now(), true)),
        (appCtx.isEnvironmentActive = isEnvironmentActiveRequested),
        isEnvironmentActiveRequested || scheduleControlsRestore(),
        refreshSceneRender());
    },
    pickEnvironmentModel(
      pointerClientX: any,
      pointerClientY: any,
      pickFloorEntries: any[] = [],
      pickSpreadRadius = 0,
    ) {
      if (!appCtx.sceneRootNode || !pickFloorEntries.length) return null;
      const canvasClientRect = appCtx.threeRenderer.domElement.getBoundingClientRect();
      if (!canvasClientRect.width || !canvasClientRect.height) return null;
      const usedModelKeySet = new Set(
          pickFloorEntries.map((usedModelEntry) =>
            JSON.stringify([usedModelEntry.floorId, usedModelEntry.modelId]),
          ),
        ),
        entriesByMesh = new Map(),
        pickableMeshes: any = [],
        visitedModelKeySet = new Set();
      (appCtx.sceneRootNode.updateWorldMatrix(true, true),
        appCtx.threeCamera.updateMatrixWorld(),
        appCtx.sceneRootNode.traverse((pickMesh: any) => {
          if (!pickMesh.isMesh) return;
          let currentPickEntry: any = null;
          for (
            let pickAncestorNode = pickMesh;
            pickAncestorNode;
            pickAncestorNode = pickAncestorNode.parent
          ) {
            if (!pickAncestorNode.visible || pickAncestorNode.userData?.environmentEffect) return;
            !currentPickEntry &&
              pickAncestorNode.userData?.environmentModelId &&
              (currentPickEntry = {
                modelId: pickAncestorNode.userData.environmentModelId,
                floorId: pickAncestorNode.userData.environmentFloorId,
              });
          }
          !currentPickEntry ||
            !usedModelKeySet.has(
              JSON.stringify([currentPickEntry.floorId, currentPickEntry.modelId]),
            ) ||
            !(Array.isArray(pickMesh.material) ? pickMesh.material : [pickMesh.material]).some(
              (renderableNode: any) =>
                renderableNode && renderableNode.visible !== false && renderableNode.opacity !== 0,
            ) ||
            (entriesByMesh.set(pickMesh, currentPickEntry),
            pickableMeshes.push(pickMesh),
            pickMesh.userData?.curtainMotionPanel &&
              visitedModelKeySet.add(
                JSON.stringify([currentPickEntry.floorId, currentPickEntry.modelId]),
              ));
        }));
      const renderedMeshes = pickableMeshes.filter((filterMesh: any) => {
          const meshEntry = entriesByMesh.get(filterMesh);
          return (
            !visitedModelKeySet.has(JSON.stringify([meshEntry.floorId, meshEntry.modelId])) ||
            filterMesh.userData?.curtainMotionPanel
          );
        }),
        pickRaycaster = new ns2.Raycaster(),
        clampedSpreadRadius = Math.max(0, Math.min(12, pickSpreadRadius)),
        sampleOffsets = [
          [0, 0],
          ...(clampedSpreadRadius
            ? [
                [clampedSpreadRadius, 0],
                [-clampedSpreadRadius, 0],
                [0, clampedSpreadRadius],
                [0, -clampedSpreadRadius],
                [clampedSpreadRadius * 0.7, clampedSpreadRadius * 0.7],
                [-clampedSpreadRadius * 0.7, clampedSpreadRadius * 0.7],
                [clampedSpreadRadius * 0.7, -clampedSpreadRadius * 0.7],
                [-clampedSpreadRadius * 0.7, -clampedSpreadRadius * 0.7],
              ]
            : []),
        ],
        objectsByMesh = new Map();
      for (const raycastMesh of renderedMeshes) {
        const floorId = entriesByMesh.get(raycastMesh).floorId;
        (objectsByMesh.has(floorId) || objectsByMesh.set(floorId, []),
          objectsByMesh.get(floorId).push(raycastMesh));
      }
      for (const [sampleOffsetX, sampleOffsetY] of sampleOffsets) {
        const sampleNdcPoint = new ns2.Vector2(
          ((pointerClientX + sampleOffsetX - canvasClientRect.left) / canvasClientRect.width) * 2 -
            1,
          1 -
            ((pointerClientY + sampleOffsetY - canvasClientRect.top) / canvasClientRect.height) * 2,
        );
        let nearestHit: any = null;
        for (const [raycastObject, raycastTargets] of objectsByMesh) {
          appCtx.overviewStackController
            ? appCtx.overviewStackController.rayForFloor(raycastObject, sampleNdcPoint, pickRaycaster)
            : pickRaycaster.setFromCamera(sampleNdcPoint, appCtx.threeCamera);
          for (const rayIntersection of pickRaycaster.intersectObjects(raycastTargets, false)) {
            const hitMaterial = Array.isArray(rayIntersection.object.material)
              ? rayIntersection.object.material[rayIntersection.face?.materialIndex || 0]
              : rayIntersection.object.material;
            hitMaterial?.visible !== false &&
              hitMaterial?.opacity !== 0 &&
              (!nearestHit || rayIntersection.distance < nearestHit.distance) &&
              (nearestHit = rayIntersection);
          }
        }
        if (nearestHit) return entriesByMesh.get(nearestHit.object);
      }
      return null;
    },
    get camera() {
      return appCtx.threeCamera;
    },
    presentationCamera(presentationCameraRoot: any) {
      if (typeof presentationCameraRoot != "string")
        for (
          let presentationAncestor = presentationCameraRoot;
          presentationAncestor;
          presentationAncestor = presentationAncestor.parent
        ) {
          const presentationFloorId =
            presentationAncestor.userData?.floorId ||
            presentationAncestor.userData?.environmentFloorId ||
            presentationAncestor.userData?.regionFloorId;
          if (presentationFloorId) {
            presentationCameraRoot = String(presentationFloorId);
            break;
          }
        }
      return appCtx.overviewStackController?.cameraForFloor(presentationCameraRoot) || appCtx.threeCamera;
    },
    presentationRay(rayCamera: any, rayClientX: any, rayClientY: any) {
      return appCtx.overviewStackController
        ? appCtx.overviewStackController.rayForFloor(rayCamera, rayClientX, rayClientY)
        : (rayClientY.setFromCamera(rayClientX, appCtx.threeCamera), rayClientY);
    },
    get controls() {
      return appCtx.orbitControls;
    },
    get document() {
      return appCtx.studioProject;
    },
    get defaults() {
      return DEFAULT_BASE_LIGHTING2;
    },
    get regionLighting() {
      return appCtx.regionLightController;
    },
    invalidateRegionLighting() {
      (appCtx.regionLightController?.sync(appCtx.threeCamera), renderStudioFrame());
    },
    transformCamera(cameraFromState: any, cameraToState: any, immediateCameraTransform = false) {
      return transformSceneCamera2(
        cameraFromState,
        zn4,
        appCtx.studioProject,
        cameraToState,
        immediateCameraTransform,
      );
    },
    async readSceneUpdate(sceneUpdatePayload: any) {
      const sceneUpdateParams = new URLSearchParams(window.location.search),
        sceneUpdateQuery = new URLSearchParams({
          projectId: sceneUpdateParams.get("projectId") || "",
          since: currentSceneSyncSinceKey(),
        }),
        sceneUpdateResponse = await withRequestTimeout2(
          15000,
          async (sceneUpdatePayloadAbortSignal) => {
            const sceneUpdateFetchResponse = await fetch(
              "/api/v1/modules/interaction3d/scenes/" +
                encodeURIComponent(sceneUpdateParams.get("sceneId") || "") +
                "/current?" +
                sceneUpdateQuery,
              {
                credentials: "same-origin",
                signal: sceneUpdatePayloadAbortSignal,
              },
            );
            if (sceneUpdateFetchResponse.status === 204) return null;
            if (!sceneUpdateFetchResponse.ok) throw new Error("户型同步暂时不可用");
            return sceneUpdateFetchResponse.json();
          },
          sceneUpdatePayload,
        );
      if (!sceneUpdateResponse) return null;
      const remoteSceneDocument = normalizeStudioDocument(
        sceneUpdateResponse.scene,
        studioDocumentDeps(),
      );
      // C4：决策是纯函数（只读运行时快照与脏标记），不读写 loadedDraft / 保存版本线。
      const sceneSyncDecision = studioSceneSyncController.decide(remoteSceneDocument);
      if (sceneSyncDecision.kind === "deferred") return null;
      if (sceneSyncDecision.kind === "ignored") {
        // embedded 预览永不参与同步；「无视觉变化」说明内容已一致，推进游标避免重复传输。
        if (sceneSyncDecision.reason === "no-visual-change") rememberSceneSyncKey(sceneUpdateResponse);
        return null;
      }
      if (
        sceneSyncDecision.kind === "full-reload" ||
        sceneSyncDecision.kind === "flush-then-reload"
      ) {
        // 全量推送：本地脏时先保存；冲突 / 保存失败时绝不覆盖本地运行时草稿。
        if (sceneSyncDecision.kind === "flush-then-reload") {
          const sceneSyncFlushOutcome = await flushSceneSyncRuntime();
          if (sceneSyncFlushOutcome !== "saved") return null;
          // 保存成功后本地内容已经是服务端最新，而本轮载荷是保存前的陈旧快照；
          // 直接丢弃本轮，下一轮再比较（一致即 ignored），避免用旧载荷回滚本地。
          return null;
        }
        // 本地干净：交回 stage 的 adopt 流程（replaceScene(full) → applyLoadedDraft），
        // 由它采纳新保存基线，同时保留相机 / 活动楼层 / 灯光过渡。
        rememberSceneSyncKey(sceneUpdateResponse);
        return { ...sceneUpdateResponse, scene: remoteSceneDocument };
      }
      // 非全量：只就地更新运行时楼层 / 灯光 / 楼层名，不碰 loadedDraft、dirty 与 revision。
      const sceneSyncOutcome = await studioSceneSyncController.handleRemoteScene(remoteSceneDocument);
      refreshAfterSceneSyncOutcome(sceneSyncOutcome);
      if (sceneSyncOutcome.kind === "merge-floors" || sceneSyncOutcome.kind === "lighting-only")
        rememberSceneSyncKey(sceneUpdateResponse);
      return null;
    },
    get savedScene() {
      return appCtx.loadedDraft;
    },
    async replaceScene(replacementScene: any) {
      const zn6 = normalizeStudioDocument(replacementScene.scene, studioDocumentDeps()),
        replaceScenePlan = sceneUpdatePlan2(normalizeStudioDocument(appCtx.loadedDraft.scene, studioDocumentDeps()), zn6);
      if (
        (floorTransition.finish(),
        trimRetainedFloors(
          replaceScenePlan.full || replaceScenePlan.lighting
            ? null
            : new Set(replaceScenePlan.floors),
        ),
        hasActiveLightTransition(),
        (ctx.cameraRestoreState = null),
        (ctx.orbitTargetVector = null),
        (ctx.renderRootRef = null),
        (ctx.renderKeyRef = undefined),
        (ctx.viewportBaseCamera = null),
        (ctx.isEntranceComplete = false),
        (ctx.hasControlsRestored = true),
        (ctx.cameraRootRef = null),
        (ctx.cameraFirstChildRef = null),
        !replaceScenePlan.full)
      ) {
        // 非全量（C4）：只就地合并受影响楼层与基础灯光（保留本地视图设置与灯组开关），
        // 绝不整体替换 studioProject，也**不改写 loadedDraft** —— 保存基线只由全量路径维护。
        const runtimeSceneProject = appCtx.studioProject;
        ((runtimeSceneProject.baseLighting = zn6.baseLighting),
          mergeFloors(runtimeSceneProject, zn6, replaceScenePlan.floors),
          ctx.overviewStackOption !== undefined &&
            (runtimeSceneProject.uniformOverviewStack = ctx.overviewStackOption),
          (appCtx.studioState = getActiveFloor().scene),
          syncFloorGroups(new Set(replaceScenePlan.floors)),
          Promise.allSettled(preloadDefaultModels()));
        return;
      }
      (await applyLoadedDraft(replacementScene),
        ctx.overviewStackOption !== undefined &&
          (appCtx.studioProject.uniformOverviewStack = ctx.overviewStackOption));
    },
    coverSceneUpdate() {
      appCtx.compiledShaderCache?.clear();
      const thumbnailCanvas = document.createElement("canvas");
      ((thumbnailCanvas.width = appCtx.threeRenderer.domElement.width),
        (thumbnailCanvas.height = appCtx.threeRenderer.domElement.height),
        appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera));
      const thumbnailPainter = thumbnailCanvas.getContext("2d");
      (thumbnailPainter!.drawImage(appCtx.threeRenderer.domElement, 0, 0),
        previewLightCacheCanvasElement.hidden ||
          thumbnailPainter!.drawImage(
            previewLightCacheCanvasElement,
            0,
            0,
            thumbnailCanvas.width,
            thumbnailCanvas.height,
          ));
      const visibility = appCtx.threeRenderer.domElement.style.visibility,
        visibility2 = previewLightCacheCanvasElement.style.visibility;
      return (
        (appCtx.threeRenderer.domElement.style.visibility = "hidden"),
        (previewLightCacheCanvasElement.style.visibility = "hidden"),
        Object.assign(thumbnailCanvas.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          zIndex: "6",
          pointerEvents: "auto",
        }),
        thumbnailCanvas.setAttribute("aria-label", "正在同步户型"),
        selectElement("#preview-3d").append(thumbnailCanvas),
        () => {
          ((appCtx.threeRenderer.domElement.style.visibility = visibility),
            (previewLightCacheCanvasElement.style.visibility = visibility2),
            thumbnailCanvas.remove());
        }
      );
    },
    getOrbitCenter() {
      return computeCameraTarget(appCtx.orbitControls.target).toArray();
    },
    setOrbitPivot(orbitPivot: any) {
      ((ctx.orbitTargetVector = orbitPivot ? new ns2.Vector3().fromArray(orbitPivot) : null),
        configureOrbitControls());
    },
    orbitCameraPose(orbitPose: any, topRotation: any) {
      const structuredClone2 = structuredClone(orbitPose),
        normalizedTopRotation = finite2(topRotation, 0) % (Math.PI * 2);
      if (
        Math.abs(normalizedTopRotation) < 1e-12 ||
        Math.abs(Math.abs(normalizedTopRotation) - Math.PI * 2) < 1e-12
      )
        return structuredClone2;
      ctx.orbitTargetVector ||
        (ctx.orbitTargetVector = computeCameraTarget(new ns2.Vector3().fromArray(orbitPose.target)));
      const setFromAxisAngle = new ns2.Quaternion().setFromAxisAngle(
        new ns2.Vector3(0, 1, 0),
        normalizedTopRotation,
      );
      for (const cameraPoseKey of ["position", "target"])
        structuredClone2[cameraPoseKey] = new ns2.Vector3()
          .fromArray(orbitPose[cameraPoseKey])
          .sub(ctx.orbitTargetVector)
          .applyQuaternion(setFromAxisAngle)
          .add(ctx.orbitTargetVector)
          .toArray();
      let array2 = new ns2.Vector3().fromArray(orbitPose.up || [0, 1, 0]);
      const sub5 = new ns2.Vector3()
        .fromArray(orbitPose.position)
        .sub(new ns2.Vector3().fromArray(orbitPose.target));
      if (array2.lengthSq() < 1e-12 || array2.clone().cross(sub5).lengthSq() < 1e-12) {
        const degToRad7 = ns2.MathUtils.degToRad(finite2(orbitPose.topRotation, 0));
        ((array2 = new ns2.Vector3(Math.sin(degToRad7), 0, -Math.cos(degToRad7))),
          array2.clone().cross(sub5).lengthSq() < 1e-12 && array2.set(1, 0, 0));
      }
      return (
        (structuredClone2.up = array2.applyQuaternion(setFromAxisAngle).toArray()),
        structuredClone2
      );
    },
    setFocusViewport(focusViewport: any) {
      const focusWeight = clamp2(finite2(focusViewport, 0), 0, 0.7);
      focusWeight !== ctx.stereoSampleIndex &&
        ((ctx.stereoSampleIndex = focusWeight),
        syncViewOffset(),
        refreshSceneRender({
          preserveLightCache: false,
        }));
    },
    beginCameraMotion(
      runStudioRenderLoopCameraMode: any,
      cameraAnimationEnabled: any,
      motionReason = "focus",
    ) {
      motionPresentation.camera(!!cameraAnimationEnabled, {
        live: motionReason === "focus",
      });
      const cameraState = this.cameraState(),
        shouldAnimateCamera =
          cameraAnimationEnabled &&
          (ctx.cameraMotionSpec || cameraState.mode !== runStudioRenderLoopCameraMode),
        bo4 = shouldAnimateCamera
          ? (ctx.cameraMotionSpec?.height ?? computeVisibleHeight(appCtx.threeCamera, appCtx.orbitControls.target))
          : 0,
        startCameraWeight =
          ctx.cameraMotionSpec?.weight ?? (cameraState.mode === "perspective" ? 1 : 0);
      return (
        (ctx.cameraMotionSpec = null),
        (ctx.isSnapshotMode = true),
        (ctx.isRenderLoopOverviewMode = !!cameraAnimationEnabled),
        (ctx.isViewTransitioning = false),
        areLightsEnabled() &&
          (resetLightEffectStates(),
          sampleLightTransitions(performance.now()),
          setupSceneShadows(appCtx.sceneRootNode, {
            rebuildAtlas: false,
          }),
          renderStudioFrame()),
        setCameraMode(runStudioRenderLoopCameraMode, {
          preserveView: true,
          deferControlUpdate: true,
        }),
        buildCameraPose(),
        configureOrbitControls(),
        // 自动旋转 / idle 回位保持静置像素比；仅用户 focus / 交互走运动降采样。
        motionReason !== "idle" && handleOrbitStart(),
        shouldAnimateCamera
          ? ((ctx.cameraMotionSpec = {
              fromHeight: bo4,
              toHeight: computeCameraFrameDistance(cameraAnimationEnabled),
              height: bo4,
              fromWeight: startCameraWeight,
              toWeight: runStudioRenderLoopCameraMode === "perspective" ? 1 : 0,
              weight: startCameraWeight,
            }),
            cameraState)
          : this.cameraState()
      );
    },
    applyCameraFrame(targetCameraMode: any, targetCameraPose: any, cameraBlendWeight: any) {
      const cameraBlendValue = clamp2(finite2(cameraBlendWeight, 0), 0, 0.7),
        isCameraWeightEqual = cameraBlendValue === ctx.stereoSampleIndex;
      ((ctx.stereoSampleIndex = cameraBlendValue),
        this.applyCameraPose(targetCameraMode, targetCameraPose, isCameraWeightEqual),
        motionPresentation.advance(targetCameraPose));
    },
    applyCameraPose(cameraViewState: any, poseWeight = 1, applyPoseImmediately = true) {
      ((cameraViewState = constrainCameraPose2(cameraViewState)),
        ctx.cameraMotionSpec &&
          (poseWeight >= 1
            ? (ctx.cameraMotionSpec = null)
            : ((ctx.cameraMotionSpec.height =
                ctx.cameraMotionSpec.fromHeight +
                (ctx.cameraMotionSpec.toHeight - ctx.cameraMotionSpec.fromHeight) * poseWeight),
              (ctx.cameraMotionSpec.weight =
                ctx.cameraMotionSpec.fromWeight +
                (ctx.cameraMotionSpec.toWeight - ctx.cameraMotionSpec.fromWeight) * poseWeight))),
        handleOrbitChange());
      const ut7 = cameraSettings();
      ((ut7.cameraView = cameraViewState.view || "free"),
        (ut7.cameraTopRotation = cameraViewState.topRotation || 0),
        (ut7.cameraFocalLength = cameraViewState.focalLength || 50),
        appCtx.threeCamera.position.fromArray(cameraViewState.position),
        appCtx.orbitControls.target.fromArray(cameraViewState.target),
        appCtx.threeCamera.up.fromArray(cameraViewState.up || [0, 1, 0]),
        (appCtx.threeCamera.zoom = cameraViewState.zoom),
        (appCtx.threeCamera.userData.frameSize = cameraViewState.frameSize || 10),
        (appCtx.threeCamera.userData.cameraView = ut7.cameraView),
        (appCtx.threeCamera.userData.topRotation = ut7.cameraTopRotation),
        appCtx.threeCamera.isOrthographicCamera
          ? applyOrthoFrame(
              appCtx.threeCamera.userData.frameSize,
              appCtx.threeCamera.userData.viewportAspect || 1,
            )
          : applyCameraFocalLength(),
        appCtx.threeCamera.lookAt(appCtx.orbitControls.target),
        updateCameraPlanes(appCtx.threeCamera, appCtx.orbitControls.target),
        appCtx.threeCamera.updateMatrixWorld(),
        syncViewOffset(),
        refreshSceneRender({
          preserveLightCache: applyPoseImmediately,
        }));
    },
    endCameraMotion() {
      (motionPresentation.camera(false),
        (ctx.isSnapshotMode = false),
        (ctx.isRenderLoopOverviewMode = false),
        buildCameraPose(),
        handleOrbitEnd(),
        refreshSceneRender(),
        typeof appCtx.prewarmState < "u" &&
          appCtx.prewarmState === controlsRestoreOptions &&
          !lightTransitionsByLight.size &&
          (ctx.overviewTimeoutHandle !== null && window.clearTimeout(ctx.overviewTimeoutHandle),
          (ctx.overviewTimeoutHandle = window.setTimeout(scheduleControlsRestore, 180))));
    },
    setUniformOverviewStack(uniformOverviewEnabled: any) {
      ctx.overviewStackOption =
        typeof uniformOverviewEnabled == "boolean" ? uniformOverviewEnabled : undefined;
      const resolvedUniformOverview =
        ctx.overviewStackOption ?? appCtx.loadedDraft.scene.uniformOverviewStack === true;
      appCtx.studioProject.uniformOverviewStack !== resolvedUniformOverview &&
        (this.finishFloorTransition(),
        (appCtx.studioProject.uniformOverviewStack = resolvedUniformOverview),
        (ctx.orbitTargetVector = null),
        (ctx.renderRootRef = null),
        groundReflections.changed(),
        refreshSceneRender({
          scene: true,
        }));
    },
    setFloorGap(floorGapValue: any) {
      const clampedFloorGap = Number.isFinite(floorGapValue) ? clamp2(floorGapValue, 0, 20) : null;
      if (clampedFloorGap !== null || ctx.unusedRenderHandle !== null) {
        const previewFloorGap =
          clampedFloorGap ?? normalizeStudioDocument(appCtx.loadedDraft.scene, studioDocumentDeps()).previewFloorGap;
        if (Math.abs(appCtx.studioProject.previewFloorGap - previewFloorGap) > 0.000001) {
          floorTransition.finish();
          const isOverviewAllFloors = getPreviewFloorMode() === "all",
            take = isOverviewAllFloors
              ? floorTransition.take(
                  appCtx.studioProject.floors.map((overviewFloorEntry: any) => overviewFloorEntry.id),
                  cameraTargetForFloor,
                  true,
                )
              : [];
          try {
            appCtx.studioProject.previewFloorGap = previewFloorGap;
            for (const reusableTransition of take)
              floorTransition.reuse(
                reusableTransition,
                cameraTargetForFloor(reusableTransition.id),
              );
          } finally {
            isOverviewAllFloors && suspendReflections(false);
          }
          isOverviewAllFloors &&
            ((ctx.orbitTargetVector = null),
            (ctx.renderRootRef = null),
            computeSceneExtent(),
            refreshSceneRender({
              scene: true,
              shadows: true,
            }));
        }
      }
      ctx.unusedRenderHandle = clampedFloorGap;
    },
    appearance(appearanceSettings: any) {
      const appearanceSceneStyle =
          appearanceSettings.sceneStyle === "warm-wood" ? "warm-wood" : "default",
        appearanceWallOpacity =
          typeof appearanceSettings.wallOpacity == "number" &&
          Number.isFinite(appearanceSettings.wallOpacity)
            ? clamp2(appearanceSettings.wallOpacity, 0, 1)
            : null;
      if (
        (appCtx.regionLightController?.setSceneStyle?.(appearanceSceneStyle),
        appearanceSceneStyle !== appCtx.sceneStyle || appearanceWallOpacity !== appCtx.wallOpacityValue)
      ) {
        (this.finishFloorTransition(), trimRetainedFloors());
        const cameraState2 = this.cameraState();
        ((appCtx.sceneStyle = appearanceSceneStyle),
          (appCtx.wallOpacityValue = appearanceWallOpacity),
          rebuildFloorLayers(),
          (ctx.orbitTargetVector = null),
          (ctx.renderRootRef = null),
          this.restoreCamera(cameraState2));
      }
      const appearanceSignatureJson = JSON.stringify([
        appearanceSettings.baseLighting,
        appearanceSettings.lightingMode,
        appearanceSceneStyle,
        appearanceWallOpacity,
      ]);
      appearanceSignatureJson !== ctx.lastRenderSignature &&
        (trimRetainedFloors(),
        (ctx.lastRenderSignature = appearanceSignatureJson),
        groundReflections.changed());
      const normalizedGroundReflection = normalizeGroundReflection2(
        appearanceSettings.groundReflection,
      );
      groundReflections.configure(normalizedGroundReflection) &&
        ((appCtx.reflectionSettingsJson = JSON.stringify(groundReflections.settings)),
        refreshSceneRender());
      const lightRegionOverrides =
          appCtx.regionLightController?.setOverrides(appearanceSettings.lightRegionOverrides || {}) ??
          appearanceSettings.lightRegionOverrides ??
          {},
        lightRegionOverridesJson = JSON.stringify(lightRegionOverrides);
      (lightRegionOverridesJson !== ctx.lastStateJson &&
        ((ctx.lastStateJson = lightRegionOverridesJson),
        groundReflections.changed(),
        refreshSceneRender()),
        (ctx.hasBaseLightingApplied = !!appearanceSettings.baseLighting));
      const clampedRenderScale = clamp2(finite2(appearanceSettings.renderScale, 1), 0.25, 2),
        clampedMotionRenderScale =
          typeof appearanceSettings.motionRenderScale == "number" &&
          Number.isFinite(appearanceSettings.motionRenderScale)
            ? clamp2(appearanceSettings.motionRenderScale, 0.25, 1)
            : null;
      (clampedRenderScale !== appCtx.basePixelRatio || clampedMotionRenderScale !== appCtx.adaptivePixelRatio) &&
        ((appCtx.basePixelRatio = clampedRenderScale),
        (appCtx.adaptivePixelRatio = clampedMotionRenderScale),
        appCtx.threeRenderer.setPixelRatio(computeRenderPixelRatio(appCtx.isRenderSuppressed)),
        resizeStudioRenderer(),
        refreshSceneRender());
      const hasBackgroundVisibilityChanged =
          ctx.isBackgroundVisible !== (appearanceSettings.backgroundVisible !== false),
        resolvedBackgroundTheme = appCtx.backgroundController?.theme || "grid",
        hasBackgroundThemeChanged = appCtx.backgroundThemeName !== resolvedBackgroundTheme;
      ((appCtx.backgroundThemeName = resolvedBackgroundTheme),
        (ctx.isBackgroundVisible = appearanceSettings.backgroundVisible !== false),
        document.body.classList.toggle("is-background-hidden", !ctx.isBackgroundVisible),
        prepareReflectionTargets());
      const normalizedAppearanceLighting = normalizeBaseLighting2(
        appearanceSettings.baseLighting || appCtx.studioProject.baseLighting,
      );
      (appCtx.regionLightController?.setFloorBrightness(normalizedAppearanceLighting.floorBrightness) &&
        refreshSceneRender(),
        JSON.stringify(normalizedAppearanceLighting) !== JSON.stringify(appCtx.baseLightingSettings) &&
          applyBaseLighting(normalizedAppearanceLighting),
        (hasBackgroundVisibilityChanged || hasBackgroundThemeChanged) && refreshSceneRender());
    },
    floorDefaultCamera(defaultCameraFloorId: any) {
      const fixedCameraView =
        defaultCameraFloorId === "all"
          ? zn4?.combinedFixedCameraView
          : zn4?.floors.find((cameraFloorEntry: any) => cameraFloorEntry.id === defaultCameraFloorId)
              ?.scene.settings?.fixedCameraView;
      if (!fixedCameraView) return null;
      const resolvedPreviewAspect =
          appCtx.threeCamera.userData.viewportAspect ||
          Math.max(
            selectElement("#preview-3d").clientWidth /
              Math.max(selectElement("#preview-3d").clientHeight, 1),
            0.1,
          ),
        floorDefaultCameraOptions = {
          mode: fixedCameraView.mode,
          view: fixedCameraView.view,
          topRotation: fixedCameraView.topRotation,
          position: [
            fixedCameraView.position.x,
            fixedCameraView.position.y,
            fixedCameraView.position.z,
          ],
          target: [fixedCameraView.target.x, fixedCameraView.target.y, fixedCameraView.target.z],
          zoom: 1,
          frameSize: resolveFrameSize(fixedCameraView, resolvedPreviewAspect),
          focalLength: fixedCameraView.focalLength || 50,
        };
      return transformSceneCamera2(
        floorDefaultCameraOptions,
        zn4,
        appCtx.studioProject,
        defaultCameraFloorId,
      );
    },
    get floorTransitionActive() {
      return floorTransition.active;
    },
    advanceFloorTransition(transitionProgressRatio: any, transitionFrame: any) {
      ((ctx.unusedRenderCounter = clamp2(transitionProgressRatio, 0, 1)),
        ctx.transitionRange &&
          (appCtx.animatedTransitionValue =
            ctx.transitionRange.from +
            (ctx.transitionRange.to - ctx.transitionRange.from) * transitionProgressRatio));
      const floorTransitionFrameOptions = transitionFrame
        ? {
            height: ctx.cameraMotionSpec
              ? ctx.cameraMotionSpec.fromHeight +
                (ctx.cameraMotionSpec.toHeight - ctx.cameraMotionSpec.fromHeight) * transitionProgressRatio
              : computeCameraFrameDistance(transitionFrame),
            weight: ctx.cameraMotionSpec
              ? ctx.cameraMotionSpec.fromWeight +
                (ctx.cameraMotionSpec.toWeight - ctx.cameraMotionSpec.fromWeight) * transitionProgressRatio
              : transitionFrame.mode === "perspective"
                ? 1
                : 0,
            distance: new ns2.Vector3()
              .fromArray(transitionFrame.position)
              .distanceTo(new ns2.Vector3().fromArray(transitionFrame.target)),
          }
        : null;
      (scheduleTask("motion-and-settle", () =>
        floorTransition.sample(
          transitionProgressRatio,
          transitionFrame,
          floorTransitionFrameOptions,
        ),
      ),
        transitionProgressRatio >= 1 &&
          ((ctx.transitionRange = null), (appCtx.animatedTransitionValue = null)));
    },
    setFloorSlideCameras(floorSlideCameras: any, floorSlideViews: any) {
      const measureCameraDistance = (slidePose: any) =>
        new ns2.Vector3()
          .fromArray(slidePose.position)
          .distanceTo(new ns2.Vector3().fromArray(slidePose.target));
      floorTransition.setSlideCameras(floorSlideCameras, floorSlideViews, {
        from: {
          height: ctx.cameraMotionSpec?.fromHeight ?? computeCameraFrameDistance(floorSlideCameras),
          weight:
            ctx.cameraMotionSpec?.fromWeight ?? (floorSlideCameras.mode === "perspective" ? 1 : 0),
          distance: measureCameraDistance(floorSlideCameras),
        },
        to: {
          height: computeCameraFrameDistance(floorSlideViews),
          weight: floorSlideViews.mode === "perspective" ? 1 : 0,
          distance: measureCameraDistance(floorSlideViews),
        },
      });
    },
    finishFloorTransition() {
      (floorTransition.finish(),
        (ctx.transitionRange = null),
        (appCtx.animatedTransitionValue = null),
        typeof isPerformanceDiagnostics < "u" &&
          isPerformanceDiagnostics &&
          diagnosticsState.floorSwitch &&
          (diagnosticsState.floorSwitch.until = performance.now() + 400));
    },
    get floorCacheSize() {
      return retainedFloorsByKey.size;
    },
    profileFrameWork: scheduleTask,
    recordFloorFrame(recordedFloorId: any, recordedFrame: any) {
      typeof recordFloorSwitchTick == "function" &&
        recordFloorSwitchTick(recordedFloorId, recordedFrame);
    },
    get floorEffectsFollow() {
      return We3;
    },
    transitionFloor(transitionFloorId: any) {
      ((ctx.unusedRenderState = getPreviewFloorMode() === "all" ? "all" : appCtx.activeFloorId),
        (ctx.unusedRenderCounter = 0),
        typeof isPerformanceDiagnostics < "u" &&
          isPerformanceDiagnostics &&
          (diagnosticsState.floorSwitch = {
            target: transitionFloorId,
            last: performance.now(),
            until: Infinity,
            frames: 0,
            maxMs: 0,
            longFrames: 0,
            cpuMs: 0,
          }));
      const sortedFloorIds = [...appCtx.studioProject.floors]
          .sort(
            (firstSortedFloor, secondSortedFloor) =>
              firstSortedFloor.elevation - secondSortedFloor.elevation,
          )
          .map((sortedFloorRecord) => sortedFloorRecord.id),
        capturedFramesByKey = new Map(),
        frameForFloor = (cacheFloorId: any) => {
          const frameCacheKey = JSON.stringify([getPreviewFloorMode(), cacheFloorId]);
          if (capturedFramesByKey.has(frameCacheKey))
            return capturedFramesByKey.get(frameCacheKey).clone();
          const cachedFloor = appCtx.studioProject.floors.find(
              (cachedFloorRecord: any) => cachedFloorRecord.id === cacheFloorId,
            ),
            cachedFloorPpm = cachedFloor.scene.calibration?.pixelsPerMeter || 1,
            worldPoint = this.worldPoint(cacheFloorId, 0, 0, 0),
            setPosition = new ns2.Matrix4()
              .makeBasis(
                this.worldPoint(cacheFloorId, cachedFloorPpm, 0, 0).sub(worldPoint),
                new ns2.Vector3(0, 1, 0),
                this.worldPoint(cacheFloorId, 0, cachedFloorPpm, 0).sub(worldPoint),
              )
              .setPosition(worldPoint);
          return (capturedFramesByKey.set(frameCacheKey, setPosition), setPosition.clone());
        },
        isTransitionAllFloors = getPreviewFloorMode() === "all";
      ((ctx.transitionRange = {
        from: appCtx.animatedTransitionValue ?? (isTransitionAllFloors ? 1 : 0),
        to: transitionFloorId === "all" ? 1 : 0,
      }),
        (appCtx.animatedTransitionValue = ctx.transitionRange.from));
      const transitionScopeKey = isTransitionAllFloors ? "all" : appCtx.activeFloorId,
        detachedRecords = scheduleTask("detach-source", () =>
          floorTransition.take(
            isTransitionAllFloors ? sortedFloorIds : [appCtx.activeFloorId],
            frameForFloor,
            isTransitionAllFloors,
          ),
        );
      for (const detachedRecord of detachedRecords)
        ((detachedRecord.cacheKey ||= transitionScopeKey),
          (detachedRecord.cacheEpoch ??= ctx.cacheEpoch));
      const isSingleFloorTransition = !isTransitionAllFloors && transitionFloorId !== "all";
      let unionBounds;
      if (isSingleFloorTransition)
        unionBounds = computeVisibleHeight(appCtx.threeCamera, appCtx.orbitControls.target) * 1.2;
      else {
        const floorBoundsBox = new ns2.Box3();
        for (const capturedRecord of detachedRecords)
          capturedRecord.node.traverseVisible((transitionFloorIdVisibleNode: any) => {
            if (
              !transitionFloorIdVisibleNode.isMesh ||
              !transitionFloorIdVisibleNode.geometry ||
              ["background", "grid", "contact-shadow"].includes(
                transitionFloorIdVisibleNode.userData?.exportRole,
              )
            )
              return;
            const geometry = transitionFloorIdVisibleNode.isInstancedMesh
              ? transitionFloorIdVisibleNode
              : transitionFloorIdVisibleNode.geometry;
            (geometry.boundingBox || geometry.computeBoundingBox(),
              geometry.boundingBox &&
                floorBoundsBox.union(
                  geometry.boundingBox
                    .clone()
                    .applyMatrix4(transitionFloorIdVisibleNode.matrixWorld),
                ));
          });
        const size4 = floorBoundsBox.getSize(new ns2.Vector3());
        unionBounds = Math.max(20, size4.x, size4.z) * 1.5;
      }
      const normalize4 = isSingleFloorTransition
          ? new ns2.Vector3(0, 1, 0).applyQuaternion(appCtx.threeCamera.quaternion).normalize()
          : null,
        indexOf =
          detachedRecords.find((scrollRecord: any) => Number.isFinite(scrollRecord.scrollPosition))
            ?.scrollPosition ?? sortedFloorIds.indexOf(transitionScopeKey),
        indexOf2 = sortedFloorIds.indexOf(transitionFloorId),
        slice2 = isSingleFloorTransition
          ? sortedFloorIds.slice(
              Math.min(Math.floor(indexOf), indexOf2),
              Math.max(Math.ceil(indexOf), indexOf2) + 1,
            )
          : [],
        transitionFloorOrder =
          transitionFloorId === "all"
            ? sortedFloorIds
            : [
                transitionFloorId,
                ...slice2.filter((orderedFloorId) => orderedFloorId !== transitionFloorId),
              ],
        orderedRecords = transitionFloorOrder.map(
          (destFloorId) =>
            detachedRecords.find(
              (capturedFloorRecord: any) =>
                capturedFloorRecord.id === destFloorId &&
                capturedFloorRecord.cacheEpoch === ctx.cacheEpoch,
            ) || retainedFloorsByKey.get(destFloorId),
        ),
        readyRecordCount = orderedRecords.filter(Boolean).length;
      if (isSingleFloorTransition || transitionFloorId === "all")
        for (let captureIndex = 0; captureIndex < transitionFloorOrder.length; captureIndex++) {
          if (orderedRecords[captureIndex]) continue;
          this.setFloor(transitionFloorOrder[captureIndex]);
          const singleCaptureRecord = floorTransition.capture(
            [transitionFloorOrder[captureIndex]],
            frameForFloor,
            false,
          )[0];
          ((singleCaptureRecord.frame = singleCaptureRecord.baseFrame.clone()),
            (singleCaptureRecord.cacheKey = transitionFloorOrder[captureIndex]),
            (singleCaptureRecord.cacheEpoch = ctx.cacheEpoch),
            singleCaptureRecord.node.removeFromParent(),
            (orderedRecords[captureIndex] = singleCaptureRecord));
        }
      const allCapturedRecords = orderedRecords.every(Boolean) ? orderedRecords : null;
      if (
        (allCapturedRecords && readyRecordCount === transitionFloorOrder.length
          ? renderLoopStats.reusedTransitions++
          : renderLoopStats.rebuiltTransitions++,
        allCapturedRecords && (renderLoopStats.reusedFloors += readyRecordCount),
        (appCtx.threeRenderer.domElement.dataset.floorReuseStats = JSON.stringify(renderLoopStats)),
        allCapturedRecords)
      ) {
        for (const capturedFloorEntry of allCapturedRecords)
          (ctx.floorRetentionService?.releaseRoot?.(capturedFloorEntry.node),
            appCtx.regionLightController?.releaseRoot?.(capturedFloorEntry.node),
            retainedFloorsByKey.delete(capturedFloorEntry.id));
      } else trimRetainedFloors(new Set(transitionFloorOrder));
      scheduleTask("set-destination", () =>
        this.setFloor(transitionFloorId, allCapturedRecords, frameForFloor),
      );
      const orbitCenter = this.getOrbitCenter(),
        destinationRecords = scheduleTask("capture-destination", () =>
          floorTransition.capture(
            transitionFloorOrder,
            frameForFloor,
            transitionFloorId === "all" || transitionFloorOrder.length > 1,
          ),
        );
      for (const destinationRecord of destinationRecords)
        ((destinationRecord.cacheKey = transitionFloorId),
          (destinationRecord.cacheEpoch = ctx.cacheEpoch));
      return (
        scheduleTask("begin-motion", () =>
          floorTransition.begin(
            detachedRecords,
            destinationRecords,
            sortedFloorIds,
            unionBounds,
            isSingleFloorTransition,
            normalize4,
            transitionFloorId,
          ),
        ),
        appCtx.contactShadowController?.prepareMotion?.(),
        ctx.releaseCurtains?.(),
        ctx.releaseTelevisionScreens?.(),
        orbitCenter
      );
    },
    setFloor(appliedFloorId: any, reusedFloorIds: any = null, resolveFloorTarget = cameraTargetForFloor) {
      const appliedFloor =
          appCtx.studioProject.floors.find(
            (appliedFloorRecord: any) => appliedFloorRecord.id === appliedFloorId,
          ) || appCtx.studioProject.floors[0],
        appliedFloorMode =
          appliedFloorId === "all" && appCtx.studioProject.floors.length > 1 ? "all" : "active";
      if (!(
        !reusedFloorIds &&
        appCtx.activeFloorId === appliedFloor.id &&
        getPreviewFloorMode() === appliedFloorMode
      )) {
        if (
          ((lightTransitionsByLight.size ||
            (typeof appCtx.prewarmState < "u" && appCtx.prewarmState === controlsRestoreOptions)) &&
            hasActiveLightTransition(),
          (ctx.isEntranceComplete = false),
          (ctx.hasControlsRestored = true),
          (appCtx.activeFloorId = appliedFloor.id),
          (appCtx.studioProject.activeFloorId = appliedFloor.id),
          (appCtx.studioState = appliedFloor.scene),
          reusedFloorIds)
        ) {
          ((appCtx.studioProject.previewFloorMode = appliedFloorMode),
            updateFloorPreviewButtons(),
            refreshFloorControls());
          const lowestFloorId = [...appCtx.studioProject.floors].sort(
            (firstSortedElevationFloor, secondSortedElevationFloor) =>
              firstSortedElevationFloor.elevation - secondSortedElevationFloor.elevation,
          )[0].id;
          for (const reusedFloorId of reusedFloorIds)
            floorTransition
              .reuse(reusedFloorId, resolveFloorTarget(reusedFloorId.id))
              .traverse((reusedFloorNode: any) => {
                ["background", "grid"].includes(reusedFloorNode.userData?.exportRole) &&
                  ((reusedFloorNode.userData.floorBackgroundHidden =
                    appliedFloorMode === "all" && reusedFloorId.id !== lowestFloorId),
                  (reusedFloorNode.visible =
                    ctx.isBackgroundVisible &&
                    (!reusedFloorNode.userData.floorBackgroundHidden ||
                      reusedFloorNode.userData.backgroundThemeKeepVisible === true) &&
                    !reusedFloorNode.userData.backgroundThemeHidden));
              });
          ((appCtx.sceneRootNode.userData.regionFloorId = appliedFloor.id),
            appCtx.regionLightController &&
              appCtx.sceneRootNode.traverse((sceneLightNode: any) => {
                if (!sceneLightNode.isLight || !sceneLightNode.userData.lightItemId) return;
                const matchedLightItem = appCtx.studioProject.floors
                  .find(
                    (lightFloorRecord: any) =>
                      lightFloorRecord.id === sceneLightNode.userData.lightFloorId,
                  )
                  ?.scene.items.find(
                    (lightItemRecord: any) => lightItemRecord.id === sceneLightNode.userData.lightItemId,
                  );
                matchedLightItem &&
                  appCtx.regionLightController.register(sceneLightNode, matchedLightItem);
              }),
            setupSceneShadows(appCtx.sceneRootNode),
            setCameraMode(getCameraMode(), {
              preserveView: false,
            }),
            refreshSceneRender({
              scene: true,
              shadows: true,
            }),
            computeSceneExtent(),
            updateCameraView());
        } else
          setPreviewFloor(appliedFloorId === "all" ? "all" : "active", {
            persist: false,
          });
        ctx.orbitTargetVector = null;
      }
    },
    worldPoint: planToWorldForFloor,
    presentationPoint(pointFloorId: any, pointPlanX: any, pointPlanY: any, pointElevation = 0.1) {
      const pointFloorRecord = floorTransition.records.find(
          (pointRecordEntry: any) => pointRecordEntry.id === pointFloorId,
        ),
        transformPresentationPoint = (transformedPoint: any) =>
          transformedPoint && appCtx.overviewStackController
            ? appCtx.overviewStackController.presentationPoint(pointFloorId, transformedPoint)
            : transformedPoint;
      if (!pointFloorRecord)
        return transformPresentationPoint(
          planToWorldForFloor(pointFloorId, pointPlanX, pointPlanY, pointElevation),
        );
      const pointFloor = appCtx.studioProject.floors.find(
        (pointFloorEntry: any) => pointFloorEntry.id === pointFloorId,
      );
      if (!pointFloor) return null;
      pointFloorRecord.node.updateWorldMatrix(true, false);
      const pointFloorPpm = pointFloor.scene.calibration?.pixelsPerMeter || 1;
      return transformPresentationPoint(
        new ns2.Vector3(pointPlanX / pointFloorPpm, pointElevation, pointPlanY / pointFloorPpm)
          .applyMatrix4(pointFloorRecord.baseFrame)
          .applyMatrix4(pointFloorRecord.node.matrixWorld),
      );
    },
    get lightStatePatchReady() {
      return ctx.isEntranceComplete && !ctx.hasControlsRestored;
    },
    setLightStates: applyLightEffects,
    onStartupEffectsProgress(startupEffectsProgress: any) {
      return (
        progressListenerSet.add(startupEffectsProgress),
        startupEffectsProgress(ctx.reflectionDetailMode),
        () => progressListenerSet.delete(startupEffectsProgress)
      );
    },
    setEditorEffects: applyShadowSettings,
    mapLightEffectState: (lightEffectStateInput: any) => mapLightEffectState2(lightEffectStateInput),
    lightEffectColorHex: (lightColorHexInput: any) => lightEffectColorHex2(lightColorHexInput),
    cameraState(applyCameraStateImmediately = false) {
      return (
        applyCameraStateImmediately && buildCameraPose(),
        {
          position: appCtx.threeCamera.position.toArray(),
          target: appCtx.orbitControls.target.toArray(),
          zoom: appCtx.threeCamera.zoom,
          mode: appCtx.threeCamera.isPerspectiveCamera ? "perspective" : "orthographic",
          up: appCtx.threeCamera.up.toArray(),
          frameSize: appCtx.threeCamera.userData.frameSize || 10,
          view: getCameraView(),
          topRotation: getCameraTopRotation(),
          focalLength: getCameraFocalLength(),
        }
      );
    },
    setCameraProjection(cameraProjection: any) {
      ((cameraSettings().cameraMode =
        cameraProjection === "perspective" ? "perspective" : "orthographic"),
        setCameraMode(cameraSettings().cameraMode, {
          preserveView: true,
          deferControlUpdate: true,
        }),
        buildCameraPose());
    },
    setCameraFocalLength(cameraFocalLength: any) {
      ((cameraSettings().cameraFocalLength = clamp2(finite2(cameraFocalLength, 50), 18, 120)),
        applyCameraFocalLength(),
        refreshSceneRender());
    },
    setCameraInteraction(cameraInteractionOptions: CameraInteractionOptions = {}) {
      const rotationMode = ["horizontal", "vertical"].includes(
          cameraInteractionOptions.rotationMode!,
        )
          ? cameraInteractionOptions.rotationMode
          : "free",
        isCameraInteractionEnabled = cameraInteractionOptions.enabled === true,
        isPanEnabled = cameraInteractionOptions.panEnabled !== false,
        isZoomEnabled = cameraInteractionOptions.zoomEnabled !== false,
        isFocusEditingEnabled = cameraInteractionOptions.focusEditing === true,
        cameraInteractionChanged =
          ctx.isOrbitEnabled !== isCameraInteractionEnabled ||
          ctx.cameraViewMode !== rotationMode ||
          ctx.shouldEnablePan !== isPanEnabled ||
          ctx.shouldEnableZoom !== isZoomEnabled ||
          ctx.isPerspectiveCameraMode !== isFocusEditingEnabled;
      ((ctx.isOrbitEnabled = isCameraInteractionEnabled),
        (ctx.cameraViewMode = rotationMode!),
        (ctx.shouldEnablePan = isPanEnabled),
        (ctx.shouldEnableZoom = isZoomEnabled),
        (ctx.isPerspectiveCameraMode = isFocusEditingEnabled),
        (ctx.cameraForwardVector =
          isFocusEditingEnabled &&
          Array.isArray(cameraInteractionOptions.focusPoint) &&
          cameraInteractionOptions.focusPoint.length === 3 &&
          cameraInteractionOptions.focusPoint.every(Number.isFinite)
            ? new ns2.Vector3().fromArray(cameraInteractionOptions.focusPoint)
            : null),
        cameraInteractionChanged
          ? buildCameraPose()
          : (appCtx.orbitControls.enabled = isCameraInteractionEnabled),
        configureOrbitControls());
    },
    whenPresented() {
      return (
        (ctx.cameraRestoreState ||= (async () => {
          const appInstance = appCtx.studioProject,
            isCurrentAppInstance = () =>
              !assetLoaderState.disposed && appCtx.studioProject === appInstance;
          (stageLoadTiming("presentation-start"),
            (appCtx.isExternalModelPending = true),
            window.clearTimeout(appCtx.modelLoadTimeoutId),
            (appCtx.modelLoadTimeoutId = null));
          const cl2 = preloadDefaultModels();
          let settledTimerHandle;
          const modelsSettledPromise = Promise.allSettled(cl2).then(
            () => (stageLoadTiming("models-settled"), true),
          );
          let cameraReadyResolve;
          try {
            if (
              ((cameraReadyResolve = await Promise.race([
                modelsSettledPromise,
                new Promise((cameraReadyResolver) => {
                  settledTimerHandle = window.setTimeout(() => cameraReadyResolver(false), 8000);
                }),
              ])),
              !isCurrentAppInstance())
            )
              return;
            cameraReadyResolve || stageLoadTiming("model-wait-timeout");
            const jo2 = appCtx.isSceneStillLoading;
            if (jo2) {
              if (((appCtx.isModelLoadPending = false), isEmbeddedStage)) {
                if (!(await waitForSceneRevision())) return;
              } else
                ((appCtx.isSceneStillLoading = false),
                  requestSceneRebuild({
                    force: true,
                    precompile: true,
                  }));
            } else appCtx.isModelLoadPending && finishModelLoad();
            if (
              (await new Promise(requestAnimationFrame),
              !isCurrentAppInstance() ||
                (jo2 &&
                  (this.restoreCamera(
                    ctx.savedCameraState?.value || null,
                    ctx.savedCameraState?.projection || null,
                  ),
                  (ctx.savedCameraState = null),
                  await waitForSceneReady(ctx.floorRetentionService)),
                !isCurrentAppInstance()))
            )
              return;
            stageLoadTiming("replacement-frame");
          } finally {
            (window.clearTimeout(settledTimerHandle),
              appCtx.studioProject === appInstance &&
                ((appCtx.isExternalModelPending = false),
                isCurrentAppInstance() && appCtx.isModelLoadPending && requestSceneRender()));
          }
          for (
            renderStudioFrame(), await new Promise(requestAnimationFrame);
            !isEmbeddedStage && appCtx.contactShadowController?.isPending() && canBuildScene();
          )
            await new Promise(requestAnimationFrame);
          isCurrentAppInstance() &&
            (stageLoadTiming("settled-frame"),
            prepareReflectionTargets(),
            stageLoadTiming("presentation-background-ready"),
            await waitForStageReady(),
            isCurrentAppInstance() &&
              (stageLoadTiming(isEmbedStageMode ? "light-cache-not-required" : "light-cache-ready"),
              stageLoadTiming("final-render-start"),
              appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera),
              stageLoadTiming("final-render-end"),
              await new Promise(requestAnimationFrame),
              isCurrentAppInstance() &&
                (stageLoadTiming("presented"),
                geometryCacheHandle?.presented?.(),
                stageStartup2?.furnitureCache?.presented?.(),
                stageLoadTiming(
                  cameraReadyResolve ? "complete-model-frame" : "fallback-model-frame",
                ),
                startupPresentation.start(),
                (modelPresentationState.presented = true))));
        })()),
        ctx.cameraRestoreState
      );
    },
    setCameraView(runStudioRenderLoopCameraView: any) {
      ((cameraSettings().cameraView = runStudioRenderLoopCameraView === "top" ? "top" : "free"),
        setCameraView(cameraSettings().cameraView, {
          force: true,
        }));
    },
    getCameraMotionState() {
      return ctx.cameraMotionSpec
        ? {
            ...ctx.cameraMotionSpec,
          }
        : null;
    },
    restoreCamera(restoredCameraState: any, cameraRestoreOptions: any = null) {
      if (
        (appCtx.isSceneStillLoading &&
          (ctx.savedCameraState = {
            value: restoredCameraState,
            projection: cameraRestoreOptions,
          }),
        (restoredCameraState = constrainCameraPose2(restoredCameraState)),
        (ctx.cameraMotionSpec = null),
        !restoredCameraState)
      ) {
        (updateCameraView(), buildCameraPose());
        return;
      }
      const ut8 = cameraSettings();
      ((ut8.cameraMode = restoredCameraState.mode),
        (ut8.cameraView = restoredCameraState.view || "free"),
        (ut8.cameraTopRotation = restoredCameraState.topRotation || 0),
        (ut8.cameraFocalLength = restoredCameraState.focalLength || 50),
        setCameraMode(restoredCameraState.mode, {
          preserveView: false,
        }),
        appCtx.threeCamera.position.fromArray(restoredCameraState.position),
        restoredCameraState.up && appCtx.threeCamera.up.fromArray(restoredCameraState.up),
        appCtx.orbitControls.target.fromArray(restoredCameraState.target),
        (appCtx.threeCamera.zoom = restoredCameraState.zoom),
        restoredCameraState.frameSize &&
          (appCtx.threeCamera.userData.frameSize = restoredCameraState.frameSize),
        (appCtx.threeCamera.userData.cameraView = ut8.cameraView),
        (appCtx.threeCamera.userData.topRotation = ut8.cameraTopRotation),
        updateCameraPlanes(appCtx.threeCamera, appCtx.orbitControls.target),
        resizeStudioRenderer({
          preserveCanvasSize: true,
        }),
        buildCameraPose(appCtx.orbitControls.target.clone()),
        (ctx.cameraMotionSpec = cameraRestoreOptions
          ? {
              ...cameraRestoreOptions,
            }
          : null),
        syncViewOffset(),
        refreshSceneRender());
    },
    topView() {
      setCameraView("top", {
        force: true,
      });
    },
  };

}
