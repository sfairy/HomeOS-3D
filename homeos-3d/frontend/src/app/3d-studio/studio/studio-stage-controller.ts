/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { state } from "./studio-state.js";
import {
  markDocumentDirty,
  normalizeStudioDocument
} from "./studio-document-save.js";
import { createStageBackgroundController } from "./studio-stage-background.js";
import { createLightTransitionController } from "./studio-light-transition.js";
import { createStageRuntimeController } from "./studio-stage-runtime.js";
import {
  applyShadowBudget,
  cameraSettingsSource,
  currentCameraView,
  fitDirectionalShadowCamera,
  invalidateRender,
  rebuildPreviewScene,
  refreshPreviewScene,
  requestRenderFrame,
  scheduleLightCacheBuild
} from "./studio-render-pipeline.js";
import {
  floorWorldMatrix,
  worldPointForFloor
} from "./studio-overview-center.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import { createDemandFrameLoop } from "../../bridge/frame-loop.js";
import { constrainCameraPose } from "./studio-camera-constraints.js";
import {
  currentPreviewFloorMode,
  getCurrentFloor,
  isAdaptiveLightCacheEnabled,
  lightCacheCanvasElement,
  selectElement,
  setLightCacheVisible
} from "./studio-plan-render.js";
import { isRegionLightingEnabled } from "./studio-architecture.js";
import {
  DEFAULT_BASE_LIGHTING,
  finite,
  normalizeBaseLighting
} from "../loaders/studio-normalization.js";
import { transformSceneCamera } from "../../bridge/scene-frame.js";
import { withRequestTimeout } from "../../utils/request-timeout.js";
import { SCENE_REQUEST_TIMEOUT_MS } from "../../utils/api-fetch.js";
import { sceneUpdatePlan } from "../../bridge/scene-update.js";
import {
  applyBaseLightingSettings,
  handleStageResize
} from "./studio-export-dialogs.js";
import { LIGHT_ITEM_TYPES } from "./studio-item-types.js";
import { switchPreviewFloor } from "./studio-floor-switch.js";
import {
  releaseAllDeferredModels,
  syncPreviewFloorButtons
} from "./studio-ui-refresh.js";
import {
  forcePreviewRebuild,
  loadStudioRecord
} from "./studio-document-io.js";
import { clamp } from "../plan/geometry.js";
import {
  applyFocalLength,
  currentFocalLength,
  currentTopRotationDeg,
  finishCameraMotion,
  handleCameraMotionMoved,
  measureVisibleHeight,
  startCameraMotion,
  updateCameraClipPlanes
} from "./studio-camera-presets.js";
import {
  applyCameraMode,
  applyOrthographicFrame,
  currentCameraMode,
  resetCameraView
} from "./studio-camera-mode.js";
import { targetPixelRatio } from "./studio-render-quality.js";
import { syncCameraViewControls } from "./studio-control-sync.js";
import {
  lightEffectColorHex,
  mapLightEffectState
} from "../../bridge/light-motion.js";
import { applyCameraView } from "./studio-camera-snapshot.js";

export function setPreviewFloorMode(mode: any, { persist: persistPreviewMode = true } = {}) {
  if (state.studioDocument) {
    state.studioDocument.previewFloorMode =
      mode === "all" && state.studioDocument.floors.length > 1 ? "all" : "active";
    syncPreviewFloorButtons();
    syncCameraViewControls();
    applyCameraMode(currentCameraMode(), {
      preserveView: false
    });
    Promise.allSettled(releaseAllDeferredModels());
    refreshPreviewScene();
    resetCameraView();
    if (persistPreviewMode) {
      markDocumentDirty();
    }
  }
}

/**
 * 等待自适应灯光缓存构建完成（最多 1.8 秒），导出取图前用它确保光照已就绪。
 * @returns {Promise<void>} 缓存就绪或超时后 resolve。
 */
export async function waitForLightCacheSettle() {
  if (!isAdaptiveLightCacheEnabled()) {
    return;
  }
  scheduleLightCacheBuild(0);
  const lightCacheWaitDeadline = performance.now() + 1800;
  while (
    isAdaptiveLightCacheEnabled() &&
    (!state.isLightCacheReady || state.needsLightCacheRefresh || lightCacheCanvasElement.hidden) &&
    performance.now() < lightCacheWaitDeadline
  ) {
    await new Promise(requestAnimationFrame);
  }
}

/**
 * 创建舞台控制器：把楼层缓存、位姿与相机混合投影、灯光过渡/渐变、轨道控制覆盖等运行时操作封装成一组闭包接口。
 * @returns {object} 舞台控制器对象，暴露相机帧监听、帧循环、楼层切换、灯光状态应用等接口。
 */
export function createStageController() {
  if (state.renderer.debug) {
    state.renderer.debug.checkShaderErrors = false;
  }
  const referenceProjectDocument = normalizeStudioDocument(
    state.savedSceneRecord.referenceScene || state.savedSceneRecord.scene
  );
  let lastRequestedFloorGap: any = null;

  const floorCacheStats = {
    reusedTransitions: 0,
    rebuiltTransitions: 0,
    reusedFloors: 0
  };
  let appearanceSignature = "";

  state.lightingChannel?.close();
  state.lightingChannel = null;

  let environmentAirflowController: any = null;
  let curtainSyncHandler: any = null;
  let televisionSyncHandler: any = null;
  let needsSpotShadowRefresh = false;
  let shadowRefreshModelRoot: any;
  let shadowRefreshSceneRevision: any;
  let shadowCastingLights: any = [];
  let curtainBoundsBoxes: any = [];
  let previousCurtainFloorIds: any = [];
  let contactShadowFloorIds: any = [];
  const stageBackgroundController = createStageBackgroundController();

  let presentedPromise;

  let isBaseLightingPreviewActive = false;

  let uniformOverviewStackOverride: any;
  let overviewStackAnimation: any = null;

  let isCameraMotionRunning = false;
  let isControlInteractionActive = false;

  const lightTransitionController = createLightTransitionController({
    isCameraMotionRunning: () => isCameraMotionRunning,
    isControlInteractionActive: {
      get: () => isControlInteractionActive,
      set: (next: any) => {
        isControlInteractionActive = next;
      }
    }
  });
  const stageRuntimeController = createStageRuntimeController({
    isCameraMotionRunning: () => isCameraMotionRunning,
    isControlInteractionActive: {
      get: () => isControlInteractionActive,
      set: (next: any) => {
        isControlInteractionActive = next;
      }
    },
    lightTransitionController: () => lightTransitionController
  });

  /**
   * 暂停或恢复编辑器特效（地面反射），并把当前特效状态写到渲染容器的 dataset 便于排查。
   * @param {boolean} areEditorEffectsPaused 是否暂停特效。
   * @param {boolean} isLightPreviewMode 是否灯光预览模式（预览时仍保留反射）。
   */
  function setEditorEffects(areEditorEffectsPaused: any, isLightPreviewMode: any) {
    const shouldSuspendReflections = areEditorEffectsPaused && !isLightPreviewMode;
    state.renderer.domElement.dataset.editorEffects = areEditorEffectsPaused
      ? isLightPreviewMode
        ? "light-preview"
        : "paused"
      : "runtime";
    if (stageRuntimeController.floorEffectsController.areFloorEffectsPaused !== shouldSuspendReflections) {
      stageRuntimeController.floorEffectsController.areFloorEffectsPaused = shouldSuspendReflections;
      stageRuntimeController.floorEffectsController.groundReflectionsController.setSuspended?.(stageRuntimeController.floorEffectsController.areFloorEffectsPaused || stageRuntimeController.floorEffectsController.areReflectionsSuspended);
      requestRenderFrame();
    }
  }

  state.contactShadowController?.setFrameProvider?.((frameProviderFloorId: any) => {
    const frameProviderRecord = stageRuntimeController.floorTransitionController.records.find(
      frameProviderEntry => frameProviderEntry.id === frameProviderFloorId
    );
    if (frameProviderRecord) {
      frameProviderRecord.node.updateWorldMatrix(true, false);
      return frameProviderRecord.node.matrixWorld.clone().multiply(frameProviderRecord.baseFrame);
    } else {
      return floorWorldMatrix(frameProviderFloorId);
    }
  });
  state.regionLightController?.setMotionTransformProvider?.((motionTransformFloorId: any) => {
    const motionTransformRecord = stageRuntimeController.floorTransitionController.records.find(
      motionTransformEntry => motionTransformEntry.id === motionTransformFloorId
    );
    if (motionTransformRecord) {
      motionTransformRecord.node.updateWorldMatrix(true, false);
      return (motionTransformRecord.lightingTransform ||= new threeModuleMin.Matrix4())
        .copy(motionTransformRecord.node.matrixWorld)
        .invert()
        .premultiply(state.previewModelRoot.matrixWorld);
    } else {
      return null;
    }
  });
  globalThis.window?.addEventListener(
    "pagehide",
    () => {
      stageRuntimeController.floorTransitionController.finish();
      stageRuntimeController.floorCacheController.releaseFloorCache();
    },
    {
      once: true
    }
  );
  globalThis.window?.addEventListener("pagehide", () => stageRuntimeController.floorEffectsController.groundReflectionsController.dispose(), {
    once: true
  });
  const overlayOnBeforeRender = state.previewOverlayScene.onBeforeRender;
  const shadowRefreshProbeMesh = new threeModuleMin.Mesh(
    new threeModuleMin.BufferGeometry().setAttribute(
      "position",
      new threeModuleMin.Float32BufferAttribute([], 3)
    ),
    new threeModuleMin.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false
    })
  );
  shadowRefreshProbeMesh.name = "interaction3d-curtain-shadow-refresh";
  shadowRefreshProbeMesh.frustumCulled = false;
  shadowRefreshProbeMesh.renderOrder = -1000000000;
  shadowRefreshProbeMesh.layers.enableAll();
  shadowRefreshProbeMesh.onBeforeRender = () => {
    if (needsSpotShadowRefresh && !stageRuntimeController.floorEffectsController.areShadowsFrozen) {
      needsSpotShadowRefresh = state.spotShadowAtlasController
        ? !state.spotShadowAtlasController.refreshGeometry(state.previewModelRoot, curtainBoundsBoxes)
        : false;
    }
  };
  state.previewOverlayScene.add(shadowRefreshProbeMesh);
  globalThis.window?.addEventListener(
    "pagehide",
    () => {
      shadowRefreshProbeMesh.removeFromParent();
      shadowRefreshProbeMesh.geometry.dispose();
      shadowRefreshProbeMesh.material.dispose();
    },
    {
      once: true
    }
  );
  state.previewOverlayScene.onBeforeRender = function (...overlayRenderArguments: any[]) {
    if (stageRuntimeController.floorEffectsController.groundReflectionsController.stats.inCapture) {
      return;
    }
    stageRuntimeController.floorEffectsController.restoreShadowIntensity();
    if (!stageRuntimeController.floorEffectsController.areShadowsFrozen) {
      curtainSyncHandler?.();
    }
    televisionSyncHandler?.();
    if (needsSpotShadowRefresh && !stageRuntimeController.floorEffectsController.areShadowsFrozen) {
      if (
        shadowRefreshModelRoot !== state.previewModelRoot ||
        shadowRefreshSceneRevision !== state.sceneCacheRevision
      ) {
        shadowRefreshModelRoot = state.previewModelRoot;
        shadowRefreshSceneRevision = state.sceneCacheRevision;
        shadowCastingLights = [];
        curtainBoundsBoxes = [];
        state.previewModelRoot?.updateWorldMatrix(true, true);
        state.previewModelRoot?.traverse((shadowTraversedNode: any) => {
          if (shadowTraversedNode.userData?.environmentModelType === "curtain") {
            curtainBoundsBoxes.push(new threeModuleMin.Box3().setFromObject(shadowTraversedNode));
          }
        });
        state.previewOverlayScene.traverse((sceneLightNode: any) => {
          if (sceneLightNode.isLight && sceneLightNode.castShadow && sceneLightNode.shadow) {
            shadowCastingLights.push(sceneLightNode);
          }
        });
      }
      for (const shadowCastingLight of shadowCastingLights) {
        shadowCastingLight.shadow.needsUpdate = true;
      }
      state.contactShadowController?.invalidate(contactShadowFloorIds, true);
    }
    overlayOnBeforeRender?.apply(this, overlayRenderArguments);
    if (!stageRuntimeController.floorEffectsController.areShadowsFrozen) {
      stageRuntimeController.floorCacheController.environmentSceneController?.setRoot(
        state.previewModelRoot,
        state.sceneCacheRevision + ":" + state.environmentStructureKey
      );
      environmentAirflowController?.setRoot(state.previewModelRoot, state.sceneCacheRevision);
    }
    stageBackgroundController.applyBackgroundVisibility();
    stageRuntimeController.syncPreviewProjection();
    if (!state.renderer.getRenderTarget()) {
      stageRuntimeController.floorEffectsController.groundReflectionsController.render(overlayRenderArguments[2], {
        worldMatricesCurrent: true
      });
      const reflectionStatsJson = JSON.stringify({
        ...stageRuntimeController.floorEffectsController.groundReflectionsController.stats
      });
      if (state.renderer.domElement.dataset.reflectionStats !== reflectionStatsJson) {
        state.renderer.domElement.dataset.reflectionStats = reflectionStatsJson;
      }
    }
  };

  return {
    onCameraChange(cameraFrameListener: any) {
      const cameraFrameCanvas = state.renderer.domElement;
      cameraFrameCanvas.addEventListener("hb-i3d-camera-frame", cameraFrameListener);
      return () =>
        cameraFrameCanvas.removeEventListener("hb-i3d-camera-frame", cameraFrameListener);
    },
    createFrameLoop: (frameLoopOptions: any) => createDemandFrameLoop(frameLoopOptions),
    setPresentedVisible(isStagePresented: any) {
      state.renderer.domElement.dispatchEvent?.(
        new CustomEvent("hb-i3d-parent-visibility", {
          detail: isStagePresented === true
        })
      );
    },
    THREE: threeModuleMin,
    constrainCameraPose: constrainCameraPose,
    container: selectElement("#preview-3d"),
    canvas: state.renderer.domElement,
    get groundReflections() {
      return stageRuntimeController.floorEffectsController.groundReflectionsController;
    },
    invalidateReflections(reflectionChangeKey: any) {
      stageRuntimeController.floorEffectsController.groundReflectionsController.changed(reflectionChangeKey);
    },
    get modelRoot() {
      return state.previewModelRoot;
    },
    get overlayScene() {
      return state.previewOverlayScene;
    },
    get sceneRevision() {
      return state.sceneCacheRevision;
    },
    get environmentRevision() {
      return state.sceneCacheRevision + ":" + state.environmentStructureKey;
    },
    setEnvironmentScene(environmentSceneSync: any) {
      stageRuntimeController.floorCacheController.environmentSceneController = environmentSceneSync;
    },
    setEnvironmentAirflow(environmentAirflowSync: any) {
      environmentAirflowController = environmentAirflowSync;
    },
    setCurtainSync(curtainFrameSync: any) {
      curtainSyncHandler = curtainFrameSync;
    },
    setTelevisionSync(televisionFrameSync: any) {
      televisionSyncHandler = televisionFrameSync;
    },
    curtainFrame({
      key: nextCurtainFrameKey,
      structure: nextEnvironmentStructureKey,
      floorIds: movingCurtainFloorIds = [],
      moving: isCurtainMovingNow
    }: any) {
      const didCurtainFrameChange = nextCurtainFrameKey !== state.curtainFrameKey;
      const wasCurtainMoving = state.isCurtainMoving;
      if (!!didCurtainFrameChange || wasCurtainMoving !== isCurtainMovingNow) {
        if (didCurtainFrameChange) {
          try {
            const parseCurtainFrames = (serializedCurtainFrames: any) => {
              const curtainRowsByFloorId = new Map();
              for (const curtainFrameRow of JSON.parse(serializedCurtainFrames)) {
                const curtainRowFloorId = curtainFrameRow[1];
                if (!curtainRowsByFloorId.has(curtainRowFloorId)) {
                  curtainRowsByFloorId.set(curtainRowFloorId, []);
                }
                curtainRowsByFloorId.get(curtainRowFloorId).push(curtainFrameRow);
              }
              return curtainRowsByFloorId;
            };
            const previousCurtainRows = parseCurtainFrames(state.curtainFrameKey);
            const nextCurtainRows = parseCurtainFrames(nextCurtainFrameKey);
            stageRuntimeController.floorEffectsController.groundReflectionsController.changed(
              [...new Set([...previousCurtainRows.keys(), ...nextCurtainRows.keys()])].filter(
                changedCurtainFloorId =>
                  JSON.stringify(previousCurtainRows.get(changedCurtainFloorId)) !==
                  JSON.stringify(nextCurtainRows.get(changedCurtainFloorId))
              )
            );
          } catch {
            stageRuntimeController.floorEffectsController.groundReflectionsController.changed(movingCurtainFloorIds);
          }
        }
        if (nextEnvironmentStructureKey !== state.environmentStructureKey) {
          state.spotShadowAtlasController?.prepareRoot(state.previewModelRoot);
          state.regionLightController?.invalidate();
        }
        contactShadowFloorIds = [
          ...new Set([...previousCurtainFloorIds, ...movingCurtainFloorIds])
        ];
        previousCurtainFloorIds = movingCurtainFloorIds;
        if (didCurtainFrameChange || isCurtainMovingNow) {
          if (!wasCurtainMoving) {
            lightTransitionController.beginLightTransitionSession();
            lightTransitionController.syncLightTransitionSession(performance.now(), true);
          }
          if (didCurtainFrameChange) {
            needsSpotShadowRefresh = true;
          }
          state.lightCacheRevision += 1;
          state.needsLightCacheRefresh = true;
          setLightCacheVisible(false);
        }
        state.curtainFrameKey = nextCurtainFrameKey;
        state.isCurtainMoving = isCurtainMovingNow;
        state.environmentStructureKey = nextEnvironmentStructureKey;
        if (!isCurtainMovingNow) {
          lightTransitionController.endLightTransitionSession();
        }
        requestRenderFrame();
      }
    },
    requestRender() {
      invalidateRender({
        preserveLightCache: true
      });
    },
    setBackgroundTheme(backgroundThemeSyncController: any) {
      stageBackgroundController.backgroundThemeController = backgroundThemeSyncController;
      stageBackgroundController.applyBackgroundVisibility();
    },
    backgroundFrame(isBackgroundFrameShown: any) {
      const shouldShowBackground = isBackgroundFrameShown === true;
      if (shouldShowBackground !== state.isBackgroundFrameVisible) {
        state.isBackgroundFrameVisible = shouldShowBackground;
        if (!isRegionLightingEnabled) {
          if (shouldShowBackground) {
            lightTransitionController.beginLightTransitionSession();
            lightTransitionController.syncLightTransitionSession(performance.now(), true);
          } else {
            state.lightCacheRevision++;
            state.needsLightCacheRefresh = true;
            lightTransitionController.endLightTransitionSession();
          }
        }
      }
      requestRenderFrame();
    },
    setVacuumMoving(isVacuumMovingRequested: any) {
      const shouldVacuumMove = isVacuumMovingRequested === true;
      if (shouldVacuumMove !== state.isVacuumMoving) {
        state.isVacuumMoving = shouldVacuumMove;
        if (shouldVacuumMove) {
          lightTransitionController.beginLightTransitionSession();
          lightTransitionController.syncLightTransitionSession(performance.now(), true);
        } else {
          state.lightCacheRevision++;
          state.needsLightCacheRefresh = true;
          lightTransitionController.endLightTransitionSession();
        }
        requestRenderFrame();
      }
    },
    environmentModelPose(poseFloorId: any, poseModelId: any) {
      let environmentModelRoot: any;
      state.previewModelRoot?.traverse((poseSceneNode: any) => {
        if (
          poseSceneNode.userData?.environmentFloorId === poseFloorId &&
          poseSceneNode.userData?.environmentModelId === poseModelId
        ) {
          environmentModelRoot = poseSceneNode;
        }
      });
      if (!environmentModelRoot) {
        return null;
      }
      environmentModelRoot = environmentModelRoot.userData.vacuumMobileRoot || environmentModelRoot;
      environmentModelRoot.updateWorldMatrix(true, true);
      const environmentModelBounds = new threeModuleMin.Box3();
      const environmentMeshBounds = new threeModuleMin.Box3();
      environmentModelRoot.traverse((boundsMeshNode: any) => {
        if (!!boundsMeshNode.isMesh && !!boundsMeshNode.geometry) {
          for (
            let boundsAncestorNode = boundsMeshNode;
            boundsAncestorNode && boundsAncestorNode !== environmentModelRoot;
            boundsAncestorNode = boundsAncestorNode.parent
          ) {
            if (boundsAncestorNode.userData?.environmentEffect) {
              return;
            }
          }
          boundsMeshNode.geometry.computeBoundingBox();
          if (boundsMeshNode.geometry.boundingBox) {
            environmentModelBounds.union(
              environmentMeshBounds
                .copy(boundsMeshNode.geometry.boundingBox)
                .applyMatrix4(boundsMeshNode.matrixWorld)
            );
          }
        }
      });
      if (environmentModelBounds.isEmpty()) {
        return null;
      } else {
        return {
          center: environmentModelBounds.getCenter(new threeModuleMin.Vector3()).toArray(),
          size: environmentModelBounds.getSize(new threeModuleMin.Vector3()).toArray(),
          forward: new threeModuleMin.Vector3(0, 0, 1)
            .transformDirection(environmentModelRoot.matrixWorld)
            .toArray()
        };
      }
    },
    setEnvironmentActive(isEnvironmentActiveRequested: any) {
      const shouldEnvironmentActivate = isEnvironmentActiveRequested === true;
      if (shouldEnvironmentActivate !== state.isEnvironmentActive) {
        if (shouldEnvironmentActivate) {
          lightTransitionController.beginLightTransitionSession();
          lightTransitionController.syncLightTransitionSession(performance.now(), true);
        }
        state.isEnvironmentActive = shouldEnvironmentActivate;
        if (!shouldEnvironmentActivate) {
          lightTransitionController.endLightTransitionSession();
        }
        invalidateRender();
      }
    },
    pickEnvironmentModel(
      pickClientX: any,
      pickClientY: any,
      pickModelReferences: any = [],
      requestedSampleRadiusPx = 0
    ) {
      if (!state.previewModelRoot || !pickModelReferences.length) {
        return null;
      }
      const pickCanvasRect = state.renderer.domElement.getBoundingClientRect();
      if (!pickCanvasRect.width || !pickCanvasRect.height) {
        return null;
      }
      const pickModelKeys = new Set(
        pickModelReferences.map((pickModelReference: any) =>
          JSON.stringify([pickModelReference.floorId, pickModelReference.modelId])
        )
      );
      const pickModelReferenceByMesh = new Map();
      const pickCandidateMeshes: any = [];
      const curtainPanelModelKeys = new Set();
      state.previewModelRoot.updateWorldMatrix(true, true);
      state.previewCamera.updateMatrixWorld();
      state.previewModelRoot.traverse((pickMeshNode: any) => {
        if (!pickMeshNode.isMesh) {
          return;
        }
        let pickedModelReference = null;
        for (
          let pickAncestorNode = pickMeshNode;
          pickAncestorNode;
          pickAncestorNode = pickAncestorNode.parent
        ) {
          if (!pickAncestorNode.visible || pickAncestorNode.userData?.environmentEffect) {
            return;
          }
          if (!pickedModelReference && pickAncestorNode.userData?.environmentModelId) {
            pickedModelReference = {
              modelId: pickAncestorNode.userData.environmentModelId,
              floorId: pickAncestorNode.userData.environmentFloorId
            };
          }
        }
        if (
          !!pickedModelReference &&
          !!pickModelKeys.has(
            JSON.stringify([pickedModelReference.floorId, pickedModelReference.modelId])
          ) &&
          !!(
            Array.isArray(pickMeshNode.material) ? pickMeshNode.material : [pickMeshNode.material]
          ).some(
            (pickMeshMaterial: any) =>
              pickMeshMaterial &&
              pickMeshMaterial.visible !== false &&
              pickMeshMaterial.opacity !== 0
          )
        ) {
          pickModelReferenceByMesh.set(pickMeshNode, pickedModelReference);
          pickCandidateMeshes.push(pickMeshNode);
          if (pickMeshNode.userData?.curtainMotionPanel) {
            curtainPanelModelKeys.add(
              JSON.stringify([pickedModelReference.floorId, pickedModelReference.modelId])
            );
          }
        }
      });
      const pickableMeshes = pickCandidateMeshes.filter((pickableMeshNode: any) => {
        const pickableModelReference = pickModelReferenceByMesh.get(pickableMeshNode);
        return (
          !curtainPanelModelKeys.has(
            JSON.stringify([pickableModelReference.floorId, pickableModelReference.modelId])
          ) || pickableMeshNode.userData?.curtainMotionPanel
        );
      });
      const pickRaycaster = new threeModuleMin.Raycaster();
      const clampedSampleRadiusPx = Math.max(0, Math.min(12, requestedSampleRadiusPx));
      const pointerSampleOffsets = [
        [0, 0],
        ...(clampedSampleRadiusPx
          ? [
              [clampedSampleRadiusPx, 0],
              [-clampedSampleRadiusPx, 0],
              [0, clampedSampleRadiusPx],
              [0, -clampedSampleRadiusPx],
              [clampedSampleRadiusPx * 0.7, clampedSampleRadiusPx * 0.7],
              [-clampedSampleRadiusPx * 0.7, clampedSampleRadiusPx * 0.7],
              [clampedSampleRadiusPx * 0.7, -clampedSampleRadiusPx * 0.7],
              [-clampedSampleRadiusPx * 0.7, -clampedSampleRadiusPx * 0.7]
            ]
          : [])
      ];
      const pickMeshesByFloorId = new Map();
      for (const pickFloorMesh of pickableMeshes) {
        const pickMeshFloorId = pickModelReferenceByMesh.get(pickFloorMesh).floorId;
        if (!pickMeshesByFloorId.has(pickMeshFloorId)) {
          pickMeshesByFloorId.set(pickMeshFloorId, []);
        }
        pickMeshesByFloorId.get(pickMeshFloorId).push(pickFloorMesh);
      }
      for (const [sampleOffsetX, sampleOffsetY] of pointerSampleOffsets) {
        const samplePointerNdc = new threeModuleMin.Vector2(
          ((pickClientX + sampleOffsetX - pickCanvasRect.left) / pickCanvasRect.width) * 2 - 1,
          1 - ((pickClientY + sampleOffsetY - pickCanvasRect.top) / pickCanvasRect.height) * 2
        );
        let nearestPickHit = null;
        for (const [hitFloorId, hitFloorMeshes] of pickMeshesByFloorId) {
          if (state.overviewStackController) {
            state.overviewStackController.rayForFloor(hitFloorId, samplePointerNdc, pickRaycaster);
          } else {
            pickRaycaster.setFromCamera(samplePointerNdc, state.previewCamera);
          }
          for (const pickIntersection of pickRaycaster.intersectObjects(hitFloorMeshes, false)) {
            const pickHitMaterial = Array.isArray(pickIntersection.object.material)
              ? pickIntersection.object.material[pickIntersection.face?.materialIndex || 0]
              : pickIntersection.object.material;
            if (
              pickHitMaterial?.visible !== false &&
              pickHitMaterial?.opacity !== 0 &&
              (!nearestPickHit || pickIntersection.distance < nearestPickHit.distance)
            ) {
              nearestPickHit = pickIntersection;
            }
          }
        }
        if (nearestPickHit) {
          return pickModelReferenceByMesh.get(nearestPickHit.object);
        }
      }
      return null;
    },
    get camera() {
      return state.previewCamera;
    },
    presentationCamera(cameraFloorOrObject: any) {
      if (typeof cameraFloorOrObject != "string") {
        for (
          let cameraAncestorNode = cameraFloorOrObject;
          cameraAncestorNode;
          cameraAncestorNode = cameraAncestorNode.parent
        ) {
          const cameraObjectFloorId =
            cameraAncestorNode.userData?.floorId ||
            cameraAncestorNode.userData?.environmentFloorId ||
            cameraAncestorNode.userData?.regionFloorId;
          if (cameraObjectFloorId) {
            cameraFloorOrObject = String(cameraObjectFloorId);
            break;
          }
        }
      }
      return state.overviewStackController?.cameraForFloor(cameraFloorOrObject) || state.previewCamera;
    },
    presentationRay(presentationRayFloorId: any, presentationRayNdc: any, presentationRaycaster: any) {
      if (state.overviewStackController) {
        return state.overviewStackController.rayForFloor(
          presentationRayFloorId,
          presentationRayNdc,
          presentationRaycaster
        );
      } else {
        presentationRaycaster.setFromCamera(presentationRayNdc, state.previewCamera);
        return presentationRaycaster;
      }
    },
    get controls() {
      return state.orbitControls;
    },
    get document() {
      return state.studioDocument;
    },
    get defaults() {
      return DEFAULT_BASE_LIGHTING;
    },
    get regionLighting() {
      return state.regionLightController;
    },
    invalidateRegionLighting() {
      state.regionLightController?.sync(state.previewCamera);
      requestRenderFrame();
    },
    transformCamera(transformedCameraState: any, transformedFloorId: any, shouldSwapProject = false) {
      return transformSceneCamera(
        transformedCameraState,
        referenceProjectDocument,
        state.studioDocument,
        transformedFloorId,
        shouldSwapProject
      );
    },
    async readSceneUpdate(sceneSyncAbortSignal: any) {
      const pageQueryParams = new URLSearchParams(window.location.search);
      const sceneSyncQueryParams = new URLSearchParams({
        projectId: pageQueryParams.get("projectId") || "",
        since: state.savedSceneRecord.syncKey || ""
      });
      const sceneSyncResponse = await withRequestTimeout(
        SCENE_REQUEST_TIMEOUT_MS,
        async sceneSyncSignal => {
          const sceneSyncHttpResponse = await fetch(
            "/api/v1/modules/interaction3d/scenes/" +
              encodeURIComponent(pageQueryParams.get("sceneId") || "") +
              "/current?" +
              sceneSyncQueryParams,
            {
              credentials: "same-origin",
              signal: sceneSyncSignal
            }
          );
          if (sceneSyncHttpResponse.status === 204) {
            return null;
          }
          if (!sceneSyncHttpResponse.ok) {
            throw new Error("户型同步暂时不可用");
          }
          return sceneSyncHttpResponse.json();
        },
        sceneSyncAbortSignal
      );
      if (!sceneSyncResponse) {
        return null;
      }
      const incomingUpdatePlan = sceneUpdatePlan(
        normalizeStudioDocument(state.savedSceneRecord.scene),
        normalizeStudioDocument(sceneSyncResponse.scene)
      );
      if (!incomingUpdatePlan.full && !incomingUpdatePlan.floors.length) {
        const incomingStudioDocument = normalizeStudioDocument(sceneSyncResponse.scene);
        state.studioDocument.baseLighting = incomingStudioDocument.baseLighting;
        for (const incomingFloorSummary of incomingStudioDocument.floors) {
          const matchingFloorRecord = state.studioDocument.floors.find(
            (matchedFloorSummary: any) => matchedFloorSummary.id === incomingFloorSummary.id
          );
          if (matchingFloorRecord) {
            matchingFloorRecord.name = incomingFloorSummary.name;
          }
        }
        if (incomingUpdatePlan.lighting && !isBaseLightingPreviewActive) {
          stageRuntimeController.floorCacheController.releaseFloorCache();
          applyBaseLightingSettings(incomingStudioDocument.baseLighting);
        }
        state.savedSceneRecord = sceneSyncResponse;
        return null;
      }
      return sceneSyncResponse;
    },
    get savedScene() {
      return state.savedSceneRecord;
    },
    async replaceScene(replacementStudioRecord: any) {
      const replacementDocument = normalizeStudioDocument(replacementStudioRecord.scene);
      const replacementPlan = sceneUpdatePlan(
        normalizeStudioDocument(state.savedSceneRecord.scene),
        replacementDocument
      );
      stageRuntimeController.floorTransitionController.finish();
      stageRuntimeController.floorCacheController.releaseFloorCache(
        replacementPlan.full || replacementPlan.lighting ? null : new Set(replacementPlan.floors)
      );
      lightTransitionController.teardownLightTransitions();
      presentedPromise = null;
      stageRuntimeController.orbitPivotOverride = null;
      stageRuntimeController.boundsCacheModelRoot = null;
      stageRuntimeController.boundsCacheSceneRevision = undefined;
      stageRuntimeController.boundsCacheCenter = null;
      lightTransitionController.hasReceivedLightStates = false;
      lightTransitionController.forceLightStateRefresh = true;
      stageBackgroundController.backgroundThemeModelRoot = null;
      stageBackgroundController.backgroundThemeFirstChild = null;
      if (!replacementPlan.full) {
        replacementDocument.activeFloorId = state.activeFloorId;
        replacementDocument.previewFloorMode = state.studioDocument.previewFloorMode;
        for (const replacementFloorEntry of replacementDocument.floors) {
          replacementFloorEntry.scene.settings.livePreviewEnabled = true;
          const existingFloorEntry = state.studioDocument.floors.find(
            (existingFloorMatch: any) => existingFloorMatch.id === replacementFloorEntry.id
          );
          if (existingFloorEntry && !replacementPlan.floors.includes(replacementFloorEntry.id)) {
            for (const replacementLightGroup of replacementFloorEntry.scene.lightGroups) {
              const existingLightGroupEntry = existingFloorEntry.scene.lightGroups.find(
                (existingLightGroupMatch: any) => existingLightGroupMatch.id === replacementLightGroup.id
              );
              if (existingLightGroupEntry) {
                replacementLightGroup.enabled = existingLightGroupEntry.enabled;
              }
            }
            for (const replacementLightItem of replacementFloorEntry.scene.items) {
              if (!LIGHT_ITEM_TYPES.has(replacementLightItem.type)) {
                continue;
              }
              const existingLightItemEntry = existingFloorEntry.scene.items.find(
                (existingLightItemMatch: any) => existingLightItemMatch.id === replacementLightItem.id
              );
              if (existingLightItemEntry) {
                replacementLightItem.lightBrightness = existingLightItemEntry.lightBrightness;
                replacementLightItem.lightTemperature = existingLightItemEntry.lightTemperature;
              }
            }
          }
        }
        state.studioDocument = replacementDocument;
        state.savedSceneRecord = replacementStudioRecord;
        if (uniformOverviewStackOverride !== undefined) {
          state.studioDocument.uniformOverviewStack = uniformOverviewStackOverride;
        }
        state.activeScene = getCurrentFloor().scene;
        switchPreviewFloor(new Set(replacementPlan.floors));
        Promise.allSettled(releaseAllDeferredModels());
        return;
      }
      await loadStudioRecord(replacementStudioRecord);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      if (uniformOverviewStackOverride !== undefined) {
        state.studioDocument.uniformOverviewStack = uniformOverviewStackOverride;
      }
    },
    coverSceneUpdate() {
      const sceneCoverCanvas = document.createElement("canvas");
      sceneCoverCanvas.width = state.renderer.domElement.width;
      sceneCoverCanvas.height = state.renderer.domElement.height;
      state.renderer.render(state.previewOverlayScene, state.previewCamera);
      const sceneCoverContext: any = sceneCoverCanvas.getContext("2d");
      sceneCoverContext.drawImage(state.renderer.domElement, 0, 0);
      if (!lightCacheCanvasElement.hidden) {
        sceneCoverContext.drawImage(
          lightCacheCanvasElement,
          0,
          0,
          sceneCoverCanvas.width,
          sceneCoverCanvas.height
        );
      }
      const rendererCanvasVisibility = state.renderer.domElement.style.visibility;
      const lightCacheCanvasVisibility = lightCacheCanvasElement.style.visibility;
      state.renderer.domElement.style.visibility = "hidden";
      lightCacheCanvasElement.style.visibility = "hidden";
      Object.assign(sceneCoverCanvas.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        zIndex: "6",
        pointerEvents: "auto"
      });
      sceneCoverCanvas.setAttribute("aria-label", "正在同步户型");
      selectElement("#preview-3d").append(sceneCoverCanvas);
      return () => {
        state.renderer.domElement.style.visibility = rendererCanvasVisibility;
        lightCacheCanvasElement.style.visibility = lightCacheCanvasVisibility;
        sceneCoverCanvas.remove();
      };
    },
    getOrbitCenter() {
      return stageRuntimeController.resolveOrbitCenter(state.orbitControls.target).toArray();
    },
    setOrbitPivot(orbitPivotPoint: any) {
      stageRuntimeController.orbitPivotOverride = orbitPivotPoint
        ? new threeModuleMin.Vector3().fromArray(orbitPivotPoint)
        : null;
      stageRuntimeController.installOrbitControlsOverrides();
    },
    orbitCameraPose(sourceCameraPose: any, pivotRotationRad: any) {
      const rotatedCameraPose = structuredClone(sourceCameraPose);
      const normalizedRotationRad = finite(pivotRotationRad, 0) % (Math.PI * 2);
      if (
        Math.abs(normalizedRotationRad) < 1e-12 ||
        Math.abs(Math.abs(normalizedRotationRad) - Math.PI * 2) < 1e-12
      ) {
        return rotatedCameraPose;
      }
      stageRuntimeController.orbitPivotOverride ||= stageRuntimeController.resolveOrbitCenter(
        new threeModuleMin.Vector3().fromArray(sourceCameraPose.target)
      );
      const orbitRotationQuaternion = new threeModuleMin.Quaternion().setFromAxisAngle(
        new threeModuleMin.Vector3(0, 1, 0),
        normalizedRotationRad
      );
      for (const poseFieldName of ["position", "target"]) {
        rotatedCameraPose[poseFieldName] = new threeModuleMin.Vector3()
          .fromArray(sourceCameraPose[poseFieldName])
          .sub(stageRuntimeController.orbitPivotOverride)
          .applyQuaternion(orbitRotationQuaternion)
          .add(stageRuntimeController.orbitPivotOverride)
          .toArray();
      }
      let poseUpVector = new threeModuleMin.Vector3().fromArray(sourceCameraPose.up || [0, 1, 0]);
      const poseViewDirection = new threeModuleMin.Vector3()
        .fromArray(sourceCameraPose.position)
        .sub(new threeModuleMin.Vector3().fromArray(sourceCameraPose.target));
      if (
        poseUpVector.lengthSq() < 1e-12 ||
        poseUpVector.clone().cross(poseViewDirection).lengthSq() < 1e-12
      ) {
        const poseTopRotationRad = threeModuleMin.MathUtils.degToRad(
          finite(sourceCameraPose.topRotation, 0)
        );
        poseUpVector = new threeModuleMin.Vector3(
          Math.sin(poseTopRotationRad),
          0,
          -Math.cos(poseTopRotationRad)
        );
        if (poseUpVector.clone().cross(poseViewDirection).lengthSq() < 1e-12) {
          poseUpVector.set(1, 0, 0);
        }
      }
      rotatedCameraPose.up = poseUpVector.applyQuaternion(orbitRotationQuaternion).toArray();
      return rotatedCameraPose;
    },
    setFocusViewport(focusViewportValue: any) {
      const clampedFocusViewport = clamp(finite(focusViewportValue, 0), 0, 0.7);
      if (clampedFocusViewport !== stageRuntimeController.focusViewportRatio) {
        stageRuntimeController.focusViewportRatio = clampedFocusViewport;
        stageRuntimeController.syncPreviewProjection();
        invalidateRender({
          preserveLightCache: false
        });
      }
    },
    beginCameraMotion(blendCameraMode: any, blendCameraPose: any, motionPhaseKind = "focus") {
      stageRuntimeController.floorEffectsController.motionPresentation.camera(!!blendCameraPose, {
        live: motionPhaseKind === "focus"
      });
      const poseBeforeMotion = this.cameraState();
      const shouldBlendProjection =
        blendCameraPose && (stageRuntimeController.cameraBlendState || poseBeforeMotion.mode !== blendCameraMode);
      const blendFromHeight = shouldBlendProjection
        ? (stageRuntimeController.cameraBlendState?.height ?? measureVisibleHeight(state.previewCamera, state.orbitControls.target))
        : 0;
      const blendFromWeight =
        stageRuntimeController.cameraBlendState?.weight ?? (poseBeforeMotion.mode === "perspective" ? 1 : 0);
      stageRuntimeController.cameraBlendState = null;
      isCameraMotionRunning = true;
      isControlInteractionActive = false;
      if (isAdaptiveLightCacheEnabled()) {
        lightTransitionController.beginLightTransitionSession();
        lightTransitionController.syncLightTransitionSession(performance.now());
        applyShadowBudget(state.previewModelRoot, {
          rebuildAtlas: false
        });
        requestRenderFrame();
      }
      applyCameraMode(blendCameraMode, {
        preserveView: true,
        deferControlUpdate: true
      });
      stageRuntimeController.recreateOrbitControls();
      stageRuntimeController.installOrbitControlsOverrides();
      startCameraMotion();
      if (shouldBlendProjection) {
        stageRuntimeController.cameraBlendState = {
          fromHeight: blendFromHeight,
          toHeight: stageRuntimeController.measurePoseVisibleHeight(blendCameraPose),
          height: blendFromHeight,
          fromWeight: blendFromWeight,
          toWeight: blendCameraMode === "perspective" ? 1 : 0,
          weight: blendFromWeight
        };
        return poseBeforeMotion;
      } else {
        return this.cameraState();
      }
    },
    applyCameraFrame(frameCameraPose: any, frameProgress: any, frameFocusViewport: any) {
      const frameFocusViewportValue = clamp(finite(frameFocusViewport, 0), 0, 0.7);
      const isFocusViewportUnchanged = frameFocusViewportValue === stageRuntimeController.focusViewportRatio;
      stageRuntimeController.focusViewportRatio = frameFocusViewportValue;
      this.applyCameraPose(frameCameraPose, frameProgress, isFocusViewportUnchanged);
      stageRuntimeController.floorEffectsController.motionPresentation.advance(frameProgress);
    },
    applyCameraPose(appliedCameraPose: any, appliedProgress = 1, applyPreserveLightCache = true) {
      appliedCameraPose = constrainCameraPose(appliedCameraPose);
      if (stageRuntimeController.cameraBlendState) {
        if (appliedProgress >= 1) {
          stageRuntimeController.cameraBlendState = null;
        } else {
          stageRuntimeController.cameraBlendState.height =
            stageRuntimeController.cameraBlendState.fromHeight +
            (stageRuntimeController.cameraBlendState.toHeight - stageRuntimeController.cameraBlendState.fromHeight) * appliedProgress;
          stageRuntimeController.cameraBlendState.weight =
            stageRuntimeController.cameraBlendState.fromWeight +
            (stageRuntimeController.cameraBlendState.toWeight - stageRuntimeController.cameraBlendState.fromWeight) * appliedProgress;
        }
      }
      handleCameraMotionMoved();
      const activeCameraSettings = cameraSettingsSource();
      activeCameraSettings.cameraView = appliedCameraPose.view || "free";
      activeCameraSettings.cameraTopRotation = appliedCameraPose.topRotation || 0;
      activeCameraSettings.cameraFocalLength = appliedCameraPose.focalLength || 50;
      state.previewCamera.position.fromArray(appliedCameraPose.position);
      state.orbitControls.target.fromArray(appliedCameraPose.target);
      state.previewCamera.up.fromArray(appliedCameraPose.up || [0, 1, 0]);
      state.previewCamera.zoom = appliedCameraPose.zoom;
      state.previewCamera.userData.frameSize = appliedCameraPose.frameSize || 10;
      state.previewCamera.userData.cameraView = activeCameraSettings.cameraView;
      state.previewCamera.userData.topRotation = activeCameraSettings.cameraTopRotation;
      if (state.previewCamera.isOrthographicCamera) {
        applyOrthographicFrame(
          state.previewCamera.userData.frameSize,
          state.previewCamera.userData.viewportAspect || 1
        );
      } else {
        applyFocalLength();
      }
      state.previewCamera.lookAt(state.orbitControls.target);
      updateCameraClipPlanes(state.previewCamera, state.orbitControls.target);
      state.previewCamera.updateMatrixWorld();
      stageRuntimeController.syncPreviewProjection();
      invalidateRender({
        preserveLightCache: applyPreserveLightCache
      });
    },
    endCameraMotion() {
      stageRuntimeController.floorEffectsController.motionPresentation.camera(false);
      isCameraMotionRunning = false;
      stageRuntimeController.recreateOrbitControls();
      finishCameraMotion();
      invalidateRender();
      if (
        typeof state.lightTransitionSession !== "undefined" &&
        state.lightTransitionSession === lightTransitionController.lightTransitionSessionToken &&
        !lightTransitionController.lightTransitionsByLight.size
      ) {
        if (lightTransitionController.lightSettleTimeoutHandle !== null) {
          window.clearTimeout(lightTransitionController.lightSettleTimeoutHandle);
        }
        lightTransitionController.lightSettleTimeoutHandle = window.setTimeout(lightTransitionController.endLightTransitionSession, 180);
      }
    },
    setUniformOverviewStack(uniformOverviewStackFlag: any) {
      uniformOverviewStackOverride =
        typeof uniformOverviewStackFlag == "boolean" ? uniformOverviewStackFlag : undefined;
      const nextUniformOverviewStackFlag =
        uniformOverviewStackOverride ?? state.savedSceneRecord.scene.uniformOverviewStack === true;
      if (state.studioDocument.uniformOverviewStack !== nextUniformOverviewStackFlag) {
        this.finishFloorTransition();
        state.studioDocument.uniformOverviewStack = nextUniformOverviewStackFlag;
        stageRuntimeController.orbitPivotOverride = null;
        stageRuntimeController.boundsCacheModelRoot = null;
        stageRuntimeController.floorEffectsController.groundReflectionsController.changed();
        invalidateRender({
          scene: true
        });
      }
    },
    setFloorGap(floorGapValue: any) {
      const clampedFloorGapOrNull = Number.isFinite(floorGapValue)
        ? clamp(floorGapValue, 0, 20)
        : null;
      if (clampedFloorGapOrNull !== null || lastRequestedFloorGap !== null) {
        const appliedFloorGapValue =
          clampedFloorGapOrNull ?? normalizeStudioDocument(state.savedSceneRecord.scene).previewFloorGap;
        if (Math.abs(state.studioDocument.previewFloorGap - appliedFloorGapValue) > 0.000001) {
          stageRuntimeController.floorTransitionController.finish();
          const isOverviewFloorMode = currentPreviewFloorMode() === "all";
          const detachedFloorRecords = isOverviewFloorMode
            ? stageRuntimeController.floorTransitionController.take(
                state.studioDocument.floors.map((gapFloorId: any) => gapFloorId.id),
                floorWorldMatrix,
                true
              )
            : [];
          try {
            state.studioDocument.previewFloorGap = appliedFloorGapValue;
            for (const reusedFloorRecord of detachedFloorRecords) {
              stageRuntimeController.floorTransitionController.reuse(
                reusedFloorRecord,
                floorWorldMatrix(reusedFloorRecord.id)
              );
            }
          } finally {
            if (isOverviewFloorMode) {
              stageRuntimeController.floorEffectsController.suspendFloorEffects(false);
            }
          }
          if (isOverviewFloorMode) {
            stageRuntimeController.orbitPivotOverride = null;
            stageRuntimeController.boundsCacheModelRoot = null;
            fitDirectionalShadowCamera();
            invalidateRender({
              scene: true,
              shadows: true
            });
          }
        }
      }
      lastRequestedFloorGap = clampedFloorGapOrNull;
    },
    appearance(appearanceOptions: any) {
      // 材质风格与墙体透明度会整体换掉墙面 / 地板 / 门窗 / 灯光的着色方式，
      const nextSceneStyle =
        appearanceOptions.sceneStyle === "warm-wood" ? "warm-wood" : "default";
      const nextWallOpacityOverride =
        typeof appearanceOptions.wallOpacity == "number" &&
        Number.isFinite(appearanceOptions.wallOpacity)
          ? clamp(appearanceOptions.wallOpacity, 0, 1)
          : null;
      if (
        nextSceneStyle !== state.studioSceneStyle ||
        nextWallOpacityOverride !== state.wallOpacityOverride
      ) {
        this.finishFloorTransition();
        stageRuntimeController.floorCacheController.releaseFloorCache();
        const poseBeforeStyleChange = this.cameraState();
        state.studioSceneStyle = nextSceneStyle;
        state.wallOpacityOverride = nextWallOpacityOverride;
        rebuildPreviewScene();
        this.restoreCamera(poseBeforeStyleChange);
      }
      const nextAppearanceSignature = JSON.stringify([
        appearanceOptions.baseLighting,
        appearanceOptions.lightingMode,
        appearanceOptions.lightRegionOverrides,
        nextSceneStyle,
        nextWallOpacityOverride
      ]);
      if (nextAppearanceSignature !== appearanceSignature) {
        stageRuntimeController.floorCacheController.releaseFloorCache();
        appearanceSignature = nextAppearanceSignature;
        stageRuntimeController.floorEffectsController.groundReflectionsController.changed();
      }
      if (stageRuntimeController.floorEffectsController.groundReflectionsController.configure(appearanceOptions.groundReflection)) {
        state.groundReflectionSettingsKey = JSON.stringify(stageRuntimeController.floorEffectsController.groundReflectionsController.settings);
        invalidateRender();
      }
      state.regionLightController?.setOverrides(appearanceOptions.lightRegionOverrides || {});
      isBaseLightingPreviewActive = !!appearanceOptions.baseLighting;
      const nextRenderScale = clamp(finite(appearanceOptions.renderScale, 1), 0.25, 2);
      const nextMotionRenderScale =
        typeof appearanceOptions.motionRenderScale == "number" &&
        Number.isFinite(appearanceOptions.motionRenderScale)
          ? clamp(appearanceOptions.motionRenderScale, 0.25, 1)
          : null;
      if (nextRenderScale !== state.renderScale || nextMotionRenderScale !== state.motionRenderScale) {
        state.renderScale = nextRenderScale;
        state.motionRenderScale = nextMotionRenderScale;
        state.renderer.setPixelRatio(targetPixelRatio(state.isCameraMotionActive));
        handleStageResize();
        invalidateRender();
      }
      // 画布默认透明：缺字段（老实例 / 未设置）一律当作不画背景，只有显式 true 才显示。
      const nextBackgroundVisible = appearanceOptions.backgroundVisible === true;
      const backgroundVisibilityChanged = stageBackgroundController.isBackgroundVisible !== nextBackgroundVisible;
      const nextBackgroundThemeName = stageBackgroundController.backgroundThemeController?.theme || "grid";
      const backgroundThemeNameChanged = state.backgroundTheme !== nextBackgroundThemeName;
      state.backgroundTheme = nextBackgroundThemeName;
      stageBackgroundController.isBackgroundVisible = nextBackgroundVisible;
      document.body.classList.toggle("is-background-hidden", !stageBackgroundController.isBackgroundVisible);
      stageBackgroundController.applyBackgroundVisibility();
      const nextBaseLightingState = normalizeBaseLighting(
        appearanceOptions.baseLighting || state.studioDocument.baseLighting
      );
      if (state.regionLightController?.setFloorBrightness(nextBaseLightingState.floorBrightness)) {
        invalidateRender();
      }
      if (JSON.stringify(nextBaseLightingState) !== JSON.stringify(state.baseLighting)) {
        applyBaseLightingSettings(nextBaseLightingState);
      }
      if (backgroundVisibilityChanged || backgroundThemeNameChanged) {
        invalidateRender();
      }
    },
    floorDefaultCamera(defaultCameraFloorId: any) {
      const savedFloorCameraView =
        defaultCameraFloorId === "all"
          ? referenceProjectDocument?.combinedFixedCameraView
          : referenceProjectDocument?.floors.find(
              (defaultCameraFloorEntry: any) => defaultCameraFloorEntry.id === defaultCameraFloorId
            )?.scene.settings?.fixedCameraView;
      if (!savedFloorCameraView) {
        return null;
      }
      const defaultCameraPose: any = {
        mode: savedFloorCameraView.mode,
        view: savedFloorCameraView.view,
        topRotation: savedFloorCameraView.topRotation,
        position: [
          savedFloorCameraView.position.x,
          savedFloorCameraView.position.y,
          savedFloorCameraView.position.z
        ],
        target: [
          savedFloorCameraView.target.x,
          savedFloorCameraView.target.y,
          savedFloorCameraView.target.z
        ],
        zoom: 1,
        frameSize: savedFloorCameraView.visibleHeight,
        focalLength: savedFloorCameraView.focalLength || 50
      };
      return transformSceneCamera(
        defaultCameraPose,
        referenceProjectDocument,
        state.studioDocument,
        defaultCameraFloorId
      );
    },
    get floorTransitionActive() {
      return stageRuntimeController.floorTransitionController.active;
    },
    advanceFloorTransition(motionProgress: any, floorMotionPose: any) {
      if (overviewStackAnimation) {
        state.overviewStackAmount =
          overviewStackAnimation.from +
          (overviewStackAnimation.to - overviewStackAnimation.from) * motionProgress;
      }
      const floorMotionSample = floorMotionPose
        ? {
            height: stageRuntimeController.cameraBlendState
              ? stageRuntimeController.cameraBlendState.fromHeight +
                (stageRuntimeController.cameraBlendState.toHeight - stageRuntimeController.cameraBlendState.fromHeight) * motionProgress
              : stageRuntimeController.measurePoseVisibleHeight(floorMotionPose),
            weight: stageRuntimeController.cameraBlendState
              ? stageRuntimeController.cameraBlendState.fromWeight +
                (stageRuntimeController.cameraBlendState.toWeight - stageRuntimeController.cameraBlendState.fromWeight) * motionProgress
              : floorMotionPose.mode === "perspective"
                ? 1
                : 0,
            distance: new threeModuleMin.Vector3()
              .fromArray(floorMotionPose.position)
              .distanceTo(new threeModuleMin.Vector3().fromArray(floorMotionPose.target))
          }
        : null;
      stageRuntimeController.floorTransitionController.sample(motionProgress, floorMotionPose, floorMotionSample);
      if (motionProgress >= 1) {
        overviewStackAnimation = null;
        state.overviewStackAmount = null;
      }
    },
    setFloorSlideCameras(slideFromPose: any, slideToPose: any) {
      /**
       * 量出某台机位的相机到目标点的直线距离。
       * @param {object} measuredPose 机位（position / target 为三元数组）。
       * @returns {number} 相机到目标的距离（米）。
       */
      const poseCameraDistance = (measuredPose: any) =>
        new threeModuleMin.Vector3()
          .fromArray(measuredPose.position)
          .distanceTo(new threeModuleMin.Vector3().fromArray(measuredPose.target));
      stageRuntimeController.floorTransitionController.setSlideCameras(slideFromPose, slideToPose, {
        from: {
          height: stageRuntimeController.cameraBlendState?.fromHeight ?? stageRuntimeController.measurePoseVisibleHeight(slideFromPose),
          weight: stageRuntimeController.cameraBlendState?.fromWeight ?? (slideFromPose.mode === "perspective" ? 1 : 0),
          distance: poseCameraDistance(slideFromPose)
        },
        to: {
          height: stageRuntimeController.measurePoseVisibleHeight(slideToPose),
          weight: slideToPose.mode === "perspective" ? 1 : 0,
          distance: poseCameraDistance(slideToPose)
        }
      });
    },
    finishFloorTransition() {
      stageRuntimeController.floorTransitionController.finish();
      overviewStackAnimation = null;
      state.overviewStackAmount = null;
    },
    get floorCacheSize() {
      return stageRuntimeController.floorCacheController.floorTransitionCacheById.size;
    },
    get floorEffectsFollow() {
      return stageRuntimeController.floorEffectsController.areFloorEffectsFollowed;
    },
    transitionFloor(transitionTargetFloorId: any) {
      const floorIdsByElevationOrder = [...state.studioDocument.floors]
        .sort(
          (elevationLeftFloor, elevationRightFloor) =>
            elevationLeftFloor.elevation - elevationRightFloor.elevation
        )
        .map(orderedFloorEntry => orderedFloorEntry.id);
      /**
       * @returns {THREE.Matrix4} 该楼层的变换矩阵。
       */
      const floorMatrixForId = (matrixTargetFloorId: any) => {
        const matrixTargetFloor = state.studioDocument.floors.find(
          (matrixFloorMatch: any) => matrixFloorMatch.id === matrixTargetFloorId
        );
        const matrixTargetScale = matrixTargetFloor.scene.calibration?.pixelsPerMeter || 1;
        const matrixTargetOrigin = this.worldPoint(matrixTargetFloorId, 0, 0, 0);
        return new threeModuleMin.Matrix4()
          .makeBasis(
            this.worldPoint(matrixTargetFloorId, matrixTargetScale, 0, 0).sub(matrixTargetOrigin),
            new threeModuleMin.Vector3(0, 1, 0),
            this.worldPoint(matrixTargetFloorId, 0, matrixTargetScale, 0).sub(matrixTargetOrigin)
          )
          .setPosition(matrixTargetOrigin);
      };
      const isOverviewStackMode = currentPreviewFloorMode() === "all";
      overviewStackAnimation = {
        from: state.overviewStackAmount ?? (isOverviewStackMode ? 1 : 0),
        to: transitionTargetFloorId === "all" ? 1 : 0
      };
      state.overviewStackAmount = overviewStackAnimation.from;
      const transitionSourceFloorKey = isOverviewStackMode ? "all" : state.activeFloorId;
      const transitionDetachedRecords = stageRuntimeController.floorTransitionController.take(
        isOverviewStackMode ? floorIdsByElevationOrder : [state.activeFloorId],
        floorMatrixForId,
        isOverviewStackMode
      );
      for (const transitionDetachedRecord of transitionDetachedRecords) {
        transitionDetachedRecord.cacheKey ||= transitionSourceFloorKey;
        transitionDetachedRecord.cacheEpoch ??= stageRuntimeController.floorCacheController.floorCacheEpoch;
      }
      const transitionBoundsBox = new threeModuleMin.Box3();
      for (const boundsTraversedRecord of transitionDetachedRecords) {
        boundsTraversedRecord.node.traverseVisible((boundsSceneNode: any) => {
          if (
            !!boundsSceneNode.isMesh &&
            !!boundsSceneNode.geometry &&
            !["background", "grid", "contact-shadow"].includes(boundsSceneNode.userData?.exportRole)
          ) {
            if (!boundsSceneNode.geometry.boundingBox) {
              boundsSceneNode.geometry.computeBoundingBox();
            }
            if (boundsSceneNode.geometry.boundingBox) {
              transitionBoundsBox.union(
                boundsSceneNode.geometry.boundingBox
                  .clone()
                  .applyMatrix4(boundsSceneNode.matrixWorld)
              );
            }
          }
        });
      }
      const transitionBoundsSize = transitionBoundsBox.getSize(new threeModuleMin.Vector3());
      const isAdjacentFloorTransition = !isOverviewStackMode && transitionTargetFloorId !== "all";
      const transitionCameraUp = isAdjacentFloorTransition
        ? new threeModuleMin.Vector3(0, 1, 0).applyQuaternion(state.previewCamera.quaternion).normalize()
        : null;
      const transitionVisibleHeight = isAdjacentFloorTransition
        ? measureVisibleHeight(state.previewCamera, state.orbitControls.target) * 1.2
        : Math.max(20, transitionBoundsSize.x, transitionBoundsSize.z) * 1.5;
      const sourceFloorScrollPosition =
        transitionDetachedRecords.find((scrollRecordEntry: any) =>
          Number.isFinite(scrollRecordEntry.scrollPosition)
        )?.scrollPosition ?? floorIdsByElevationOrder.indexOf(transitionSourceFloorKey);
      const destinationElevationIndex = floorIdsByElevationOrder.indexOf(transitionTargetFloorId);
      const intermediateTransitionFloorIds = isAdjacentFloorTransition
        ? floorIdsByElevationOrder.slice(
            Math.min(Math.floor(sourceFloorScrollPosition), destinationElevationIndex),
            Math.max(Math.ceil(sourceFloorScrollPosition), destinationElevationIndex) + 1
          )
        : [];
      const transitionFloorIdList =
        transitionTargetFloorId === "all"
          ? floorIdsByElevationOrder
          : [
              transitionTargetFloorId,
              ...intermediateTransitionFloorIds.filter(
                filteredTransitionFloorId => filteredTransitionFloorId !== transitionTargetFloorId
              )
            ];
      const transitionRecordList = transitionFloorIdList.map(
        mappedFloorId =>
          transitionDetachedRecords.find(
            (matchedTransitionRecord: any) =>
              matchedTransitionRecord.id === mappedFloorId &&
              matchedTransitionRecord.cacheEpoch === stageRuntimeController.floorCacheController.floorCacheEpoch
          ) || stageRuntimeController.floorCacheController.floorTransitionCacheById.get(mappedFloorId)
      );
      const reusableTransitionCount = transitionRecordList.filter(Boolean).length;
      if (isAdjacentFloorTransition) {
        for (
          let capturedFloorIndex = 0;
          capturedFloorIndex < transitionFloorIdList.length;
          capturedFloorIndex++
        ) {
          if (transitionRecordList[capturedFloorIndex]) {
            continue;
          }
          this.setFloor(transitionFloorIdList[capturedFloorIndex]);
          const capturedFloorRecord = stageRuntimeController.floorTransitionController.capture(
            [transitionFloorIdList[capturedFloorIndex]],
            floorMatrixForId,
            false
          )[0];
          capturedFloorRecord.frame = capturedFloorRecord.baseFrame.clone();
          capturedFloorRecord.cacheKey = transitionFloorIdList[capturedFloorIndex];
          capturedFloorRecord.cacheEpoch = stageRuntimeController.floorCacheController.floorCacheEpoch;
          capturedFloorRecord.node.removeFromParent();
          transitionRecordList[capturedFloorIndex] = capturedFloorRecord;
        }
      }
      const reusableTransitionRecords = transitionRecordList.every(Boolean)
        ? transitionRecordList
        : null;
      if (reusableTransitionRecords && reusableTransitionCount === transitionFloorIdList.length) {
        floorCacheStats.reusedTransitions++;
      } else {
        floorCacheStats.rebuiltTransitions++;
      }
      if (reusableTransitionRecords) {
        floorCacheStats.reusedFloors += reusableTransitionCount;
      }
      state.renderer.domElement.dataset.floorReuseStats = JSON.stringify(floorCacheStats);
      if (reusableTransitionRecords) {
        for (const releasedTransitionRecord of reusableTransitionRecords) {
          stageRuntimeController.floorCacheController.environmentSceneController?.releaseRoot?.(releasedTransitionRecord.node);
          state.regionLightController?.releaseRoot?.(releasedTransitionRecord.node);
          stageRuntimeController.floorCacheController.floorTransitionCacheById.delete(releasedTransitionRecord.id);
        }
      } else {
        stageRuntimeController.floorCacheController.releaseFloorCache(new Set(transitionFloorIdList));
      }
      this.setFloor(transitionTargetFloorId, reusableTransitionRecords, floorMatrixForId);
      const destinationOrbitCenter = this.getOrbitCenter();
      const destinationFloorRecords = stageRuntimeController.floorTransitionController.capture(
        transitionFloorIdList,
        floorMatrixForId,
        transitionTargetFloorId === "all" || transitionFloorIdList.length > 1
      );
      for (const positionedFloorRecord of destinationFloorRecords) {
        positionedFloorRecord.cacheKey = transitionTargetFloorId;
        positionedFloorRecord.cacheEpoch = stageRuntimeController.floorCacheController.floorCacheEpoch;
      }
      stageRuntimeController.floorTransitionController.begin(
        transitionDetachedRecords,
        destinationFloorRecords,
        floorIdsByElevationOrder,
        transitionVisibleHeight,
        isAdjacentFloorTransition,
        transitionCameraUp,
        transitionTargetFloorId
      );
      curtainSyncHandler?.();
      televisionSyncHandler?.();
      return destinationOrbitCenter;
    },
    setFloor(setFloorId: any, setFloorRecords: any = null, floorMatrixResolver = floorWorldMatrix) {
      const floorRecordForId =
        state.studioDocument.floors.find((activeFloorEntry: any) => activeFloorEntry.id === setFloorId) ||
        state.studioDocument.floors[0];
      const nextPreviewFloorMode =
        setFloorId === "all" && state.studioDocument.floors.length > 1 ? "all" : "active";
      if (
        !!setFloorRecords ||
        state.activeFloorId !== floorRecordForId.id ||
        currentPreviewFloorMode() !== nextPreviewFloorMode
      ) {
        if (
          lightTransitionController.lightTransitionsByLight.size ||
          (typeof state.lightTransitionSession !== "undefined" &&
            state.lightTransitionSession === lightTransitionController.lightTransitionSessionToken)
        ) {
          lightTransitionController.teardownLightTransitions();
        }
        lightTransitionController.hasReceivedLightStates = false;
        lightTransitionController.forceLightStateRefresh = true;
        state.activeFloorId = floorRecordForId.id;
        state.studioDocument.activeFloorId = floorRecordForId.id;
        state.activeScene = floorRecordForId.scene;
        if (setFloorRecords) {
          state.studioDocument.previewFloorMode = nextPreviewFloorMode;
          syncPreviewFloorButtons();
          syncCameraViewControls();
          const lowestElevationFloorId = [...state.studioDocument.floors].sort(
            (floorSortLeft, floorSortRight) => floorSortLeft.elevation - floorSortRight.elevation
          )[0].id;
          for (const restoredFloorRecord of setFloorRecords) {
            stageRuntimeController.floorTransitionController
              .reuse(restoredFloorRecord, floorMatrixResolver(restoredFloorRecord.id))
              .traverse((restoreSceneNode: any) => {
                if (["background", "grid"].includes(restoreSceneNode.userData?.exportRole)) {
                  restoreSceneNode.userData.floorBackgroundHidden =
                    nextPreviewFloorMode === "all" &&
                    restoredFloorRecord.id !== lowestElevationFloorId;
                  restoreSceneNode.visible =
                    stageBackgroundController.isBackgroundVisible &&
                    (!restoreSceneNode.userData.floorBackgroundHidden ||
                      restoreSceneNode.userData.backgroundThemeKeepVisible === true) &&
                    !restoreSceneNode.userData.backgroundThemeHidden;
                }
              });
          }
          state.previewModelRoot.userData.regionFloorId = floorRecordForId.id;
          if (state.regionLightController) {
            state.previewModelRoot.traverse((lightRegistrarSceneNode: any) => {
              if (
                !lightRegistrarSceneNode.isLight ||
                !lightRegistrarSceneNode.userData.lightItemId
              ) {
                return;
              }
              const registrableLightItem = state.studioDocument.floors
                .find(
                  (registrableFloorEntry: any) =>
                    registrableFloorEntry.id === lightRegistrarSceneNode.userData.lightFloorId
                )
                ?.scene.items.find(
                  (registrableLightItemMatch: any) =>
                    registrableLightItemMatch.id === lightRegistrarSceneNode.userData.lightItemId
                );
              if (registrableLightItem) {
                state.regionLightController.register(lightRegistrarSceneNode, registrableLightItem);
              }
            });
          }
          applyShadowBudget(state.previewModelRoot);
          applyCameraMode(currentCameraMode(), {
            preserveView: false
          });
          invalidateRender({
            scene: true,
            shadows: true
          });
          fitDirectionalShadowCamera();
          resetCameraView();
        } else {
          setPreviewFloorMode(setFloorId === "all" ? "all" : "active", {
            persist: false
          });
        }
        stageRuntimeController.orbitPivotOverride = null;
      }
    },
    worldPoint: worldPointForFloor,
    presentationPoint(
      presentationFloorId: any,
      presentationPlanX: any,
      presentationPlanY: any,
      presentationElevationMeters = 0.1
    ) {
      const presentationFloorRecord = stageRuntimeController.floorTransitionController.records.find(
        presentationRecordMatch => presentationRecordMatch.id === presentationFloorId
      );
      /**
       * @returns {THREE.Vector3|null} 展示坐标点；无控制器时即原值。
       */
      const toPresentationPoint = (presentationWorldPoint: any) =>
        presentationWorldPoint && state.overviewStackController
          ? state.overviewStackController.presentationPoint(presentationFloorId, presentationWorldPoint)
          : presentationWorldPoint;
      if (!presentationFloorRecord) {
        return toPresentationPoint(
          worldPointForFloor(
            presentationFloorId,
            presentationPlanX,
            presentationPlanY,
            presentationElevationMeters
          )
        );
      }
      const presentationFloorEntry = state.studioDocument.floors.find(
        (presentationFloorMatch: any) => presentationFloorMatch.id === presentationFloorId
      );
      if (!presentationFloorEntry) {
        return null;
      }
      presentationFloorRecord.node.updateWorldMatrix(true, false);
      const presentationFloorScale = presentationFloorEntry.scene.calibration?.pixelsPerMeter || 1;
      return toPresentationPoint(
        new threeModuleMin.Vector3(
          presentationPlanX / presentationFloorScale,
          presentationElevationMeters,
          presentationPlanY / presentationFloorScale
        )
          .applyMatrix4(presentationFloorRecord.baseFrame)
          .applyMatrix4(presentationFloorRecord.node.matrixWorld)
      );
    },
    setLightStates: lightTransitionController.applyLightStates,
    setEditorEffects: setEditorEffects,
    mapLightEffectState: (mappedLightState: any) => mapLightEffectState(mappedLightState),
    lightEffectColorHex: (mappedKelvin: any) => lightEffectColorHex(mappedKelvin),
    cameraState(shouldResetOrbitControls = false) {
      if (shouldResetOrbitControls) {
        stageRuntimeController.recreateOrbitControls();
      }
      return {
        position: state.previewCamera.position.toArray(),
        target: state.orbitControls.target.toArray(),
        zoom: state.previewCamera.zoom,
        mode: state.previewCamera.isPerspectiveCamera ? "perspective" : "orthographic",
        up: state.previewCamera.up.toArray(),
        frameSize: state.previewCamera.userData.frameSize || 10,
        view: currentCameraView(),
        topRotation: currentTopRotationDeg(),
        focalLength: currentFocalLength()
      };
    },
    setCameraProjection(projectionCameraMode: any) {
      cameraSettingsSource().cameraMode =
        projectionCameraMode === "perspective" ? "perspective" : "orthographic";
      applyCameraMode(cameraSettingsSource().cameraMode, {
        preserveView: true,
        deferControlUpdate: true
      });
      stageRuntimeController.recreateOrbitControls();
    },
    setCameraFocalLength(focalLengthValue: any) {
      cameraSettingsSource().cameraFocalLength = clamp(finite(focalLengthValue, 50), 18, 120);
      applyFocalLength();
      invalidateRender();
    },
    setCameraInteraction(interactionOptions: any = {}) {
      const controlRotationMode = ["horizontal", "vertical"].includes(
        interactionOptions.rotationMode
      )
        ? interactionOptions.rotationMode
        : "free";
      const shouldEnableControls = interactionOptions.enabled === true;
      const shouldEnablePan = interactionOptions.panEnabled !== false;
      const shouldEnableZoom = interactionOptions.zoomEnabled !== false;
      const interactionChanged =
        stageRuntimeController.isCameraInteractionEnabled !== shouldEnableControls ||
        stageRuntimeController.rotationConstraintMode !== controlRotationMode ||
        stageRuntimeController.controlsPanEnabled !== shouldEnablePan ||
        stageRuntimeController.controlsZoomEnabled !== shouldEnableZoom;
      stageRuntimeController.isCameraInteractionEnabled = shouldEnableControls;
      stageRuntimeController.rotationConstraintMode = controlRotationMode;
      stageRuntimeController.controlsPanEnabled = shouldEnablePan;
      stageRuntimeController.controlsZoomEnabled = shouldEnableZoom;
      if (interactionChanged) {
        stageRuntimeController.recreateOrbitControls();
      } else {
        state.orbitControls.enabled = shouldEnableControls;
      }
      stageRuntimeController.installOrbitControlsOverrides();
    },
    whenPresented() {
      presentedPromise ||= (async () => {
        const deferredModelReleasePromises = releaseAllDeferredModels();
        let presentTimeoutHandle;
        try {
          await Promise.race([
            Promise.allSettled(deferredModelReleasePromises),
            new Promise(resolvePresentTimeout => {
              presentTimeoutHandle = window.setTimeout(resolvePresentTimeout, 8000);
            })
          ]);
        } finally {
          window.clearTimeout(presentTimeoutHandle);
        }
        forcePreviewRebuild();
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        stageBackgroundController.applyBackgroundVisibility();
        await waitForLightCacheSettle();
        state.renderer.render(state.previewOverlayScene, state.previewCamera);
        await new Promise(requestAnimationFrame);
      })();
      return presentedPromise;
    },
    setCameraView(cameraViewName: any) {
      cameraSettingsSource().cameraView = cameraViewName === "top" ? "top" : "free";
      applyCameraView(cameraSettingsSource().cameraView, {
        force: true
      });
    },
    getCameraMotionState() {
      if (stageRuntimeController.cameraBlendState) {
        return {
          ...stageRuntimeController.cameraBlendState
        };
      } else {
        return null;
      }
    },
    restoreCamera(restoredCameraPose: any, restoredCameraFloorId: any = null) {
      restoredCameraPose = constrainCameraPose(restoredCameraPose);
      stageRuntimeController.cameraBlendState = null;
      if (!restoredCameraPose) {
        resetCameraView();
        stageRuntimeController.recreateOrbitControls();
        return;
      }
      const restoredCameraSettings = cameraSettingsSource();
      restoredCameraSettings.cameraMode = restoredCameraPose.mode;
      restoredCameraSettings.cameraView = restoredCameraPose.view || "free";
      restoredCameraSettings.cameraTopRotation = restoredCameraPose.topRotation || 0;
      restoredCameraSettings.cameraFocalLength = restoredCameraPose.focalLength || 50;
      applyCameraMode(restoredCameraPose.mode, {
        preserveView: false
      });
      state.previewCamera.position.fromArray(restoredCameraPose.position);
      if (restoredCameraPose.up) {
        state.previewCamera.up.fromArray(restoredCameraPose.up);
      }
      state.orbitControls.target.fromArray(restoredCameraPose.target);
      state.previewCamera.zoom = restoredCameraPose.zoom;
      if (restoredCameraPose.frameSize) {
        state.previewCamera.userData.frameSize = restoredCameraPose.frameSize;
      }
      state.previewCamera.userData.cameraView = restoredCameraSettings.cameraView;
      state.previewCamera.userData.topRotation = restoredCameraSettings.cameraTopRotation;
      updateCameraClipPlanes(state.previewCamera, state.orbitControls.target);
      handleStageResize();
      stageRuntimeController.recreateOrbitControls(state.orbitControls.target.clone());
      stageRuntimeController.cameraBlendState = restoredCameraFloorId
        ? {
            ...restoredCameraFloorId
          }
        : null;
      stageRuntimeController.syncPreviewProjection();
      invalidateRender();
    },
    topView() {
      applyCameraView("top", {
        force: true
      });
    }
  };
}
