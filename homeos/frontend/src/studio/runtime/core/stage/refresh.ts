/**
 * 舞台刷新与楼层 / 调光区间交互：整屏刷新、场景更新采纳、楼层选择、区间编辑器。
 *
 * 从 `runtime/core/stage.ts` 的 `mountStage()` 闭包切出，依赖袋 `StageRefreshDeps`。
 */

import { resolveRuntimeFloor } from "./floor-navigation";
import { GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2 } from "../../device/generic-device-catalog";
import { buildMetadata } from "./build-metadata";
import { expandGroupMembers, postHostMessage } from "./_shared";
import { mountRegionRangeEditor as mountRegionRangeEditor2 } from "../../config-ui/light-range-editor";
import { pageDimming as pageDimming2, pageModelBindings as pageModelBindings2 } from "../../environment/environment-scene";

/** 依赖袋（宿主 `bootEditor` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。
 * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名
 * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。
 */
export interface StageRefreshDeps {
  isEditing: any;
  isAwaitingFloorViewAdjust: any;
  isRangeEditorOpen: any;
  isCameraMoving: any;
  selectedFloorId: any;
  mountOptions: any;
  stopVacuumFollow: any;
  exitFocusMode: any;
  cancelMarkerDrag: any;
  pendingFloorId: any;
  runModuleSwitchAnimation: any;
  syncLockMotion: any;
  transformFloorCamera: any;
  baseStageConfig: any;
  activeCameraPose: any;
  options: any;
  buildFloorCameraConfig: any;
  activeModule: any;
  pendingModule: any;
  syncNasOverlay: any;
  startCameraMotion: any;
  applyLightStates: any;
  syncVacuumMap: any;
  syncStageVisibility: any;
  sceneCacheByKey: any;
  syncMarkers: any;
  syncPanelChrome: any;
  syncAvailability: any;
  canEditLightRange: any;
  isStagePresented: any;
  isRangeEditorSuppressingClose: any;
  syncCameraInteraction: any;
  presentationLayerElement: any;
  focusVignetteElement: any;
  rangeEditorHandle: any;
  isRangeEditorOnly: any;
  wakeSceneBackground: any;
  renderMarkerPositions: any;
  updateEditorSelection: any;
  configureIdleBehaviors: any;
  syncPresenceScene: any;
  presenceWaves: any;
  text: any;
  stageModelIndex: any;
  deviceStates: any;
  startupProgress: any;
  focusedItemId: any;
  panelDisplayMode: any;
  cameraMotionSnapshot: any;
  carCharging: any;
  environmentScene: any;
  rebuildCurtainMotion: any;
  syncCameraOverlay: any;
  syncEnvironmentLayers: any;
  syncVacuumMotion: any;
  collectModuleBindings: any;
  matchesSelectedFloor: any;
  collectPreviewCovers: any;
  collectClimateBindings: any;
  collectGroupedCovers: any;
  collectNasBindings: any;
  collectSpeakerBindings: any;
  collectTelevisionBindings: any;
  collectGenericDeviceBindings: any;
  collectVacuumBindings: any;
  lockBindings: any;
  securityCameraBindings: any;
  presenceBindings: any;
  screenOutlines: any;
  environmentAirflow: any;
  deviceMist: any;
  rangehoodAirflow: any;
  computerScreens: any;
  syncFloorTabs: any;
  navigationEditing: any;
  isNavigationVisible: any;
  moduleTabsElement: any;
  floorTabsElement: any;
  toggleModuleTabs: any;
  configuredModuleKinds2: any;
  moduleTabsByKind: any;
  restoreFocusWithin: any;
  moduleEmptyElement: any;
  applyDefaultCamera: any;
  hasIdleIconActivity: any;
  isCameraRotating: any;
  pageBehavior: any;
  isUserActive: any;
  idleRotationControl: any;
  isControlBusy: any;
  applyRegionLightingPreset: any;
  lastRenderSignature: any;
  pendingEditorAction: any;
  handleHostMessage: any;
}

export function selectFloorCore(deps: StageRefreshDeps, targetFloorId: any) {
    if (
      deps.isEditing ||
      deps.isAwaitingFloorViewAdjust ||
      deps.isRangeEditorOpen ||
      deps.isCameraMoving ||
      targetFloorId === deps.selectedFloorId ||
      (targetFloorId !== "all" &&
        !deps.mountOptions.document.floors.some((existingFloor: any) => existingFloor.id === targetFloorId))
    )
      return;
    (deps.stopVacuumFollow(false),
      deps.exitFocusMode({
        immediate: true,
        preserveCamera: true,
      }),
      deps.cancelMarkerDrag());
    const cameraState = deps.mountOptions.cameraState(true),
      orbitCenter = deps.mountOptions.getOrbitCenter?.(),
      cameraMotionState = deps.mountOptions.getCameraMotionState?.();
    ((deps.pendingFloorId = targetFloorId),
      deps.runModuleSwitchAnimation(() => {
        (deps.syncLockMotion(), (deps.selectedFloorId = targetFloorId));
        const transitionFloor = deps.mountOptions.transitionFloor
            ? deps.mountOptions.transitionFloor(targetFloorId)
            : (deps.mountOptions.setFloor(targetFloorId), deps.mountOptions.getOrbitCenter?.()),
          floorCameraPose = deps.transformFloorCamera(
            deps.baseStageConfig.floorCameras?.[targetFloorId] ||
              (targetFloorId === deps.baseStageConfig.floorSelection ? deps.baseStageConfig.camera : null),
            targetFloorId,
          ),
          cameraState2 =
            floorCameraPose ||
            deps.mountOptions.floorDefaultCamera?.(targetFloorId) ||
            deps.mountOptions.cameraState();
        ((deps.activeCameraPose = floorCameraPose || cameraState2),
          (deps.options = deps.buildFloorCameraConfig({
            ...deps.baseStageConfig,
            floorSelection: targetFloorId,
          })),
          (deps.options.camera = deps.activeCameraPose),
          targetFloorId === "all"
            ? ((deps.activeModule = "overview"), (deps.pendingModule = ""))
            : deps.pendingModule && ((deps.activeModule = deps.pendingModule), (deps.pendingModule = "")),
          deps.syncLockMotion(),
          deps.syncNasOverlay(),
          deps.mountOptions.restoreCamera(cameraState, cameraMotionState),
          deps.startCameraMotion(
            cameraState2,
            false,
            false,
            () => {
              (deps.mountOptions.finishFloorTransition?.(),
                deps.syncLockMotion(),
                deps.applyLightStates(),
                refreshStageUiCore(deps),
                deps.syncVacuumMap(),
                deps.syncStageVisibility());
            },
            "floor",
            {
              fromPivot: orbitCenter,
              toPivot: transitionFloor,
            },
          ),
          deps.sceneCacheByKey.clear(),
          deps.applyLightStates({
            immediate: true,
          }),
          deps.syncMarkers(),
          deps.syncPanelChrome(),
          deps.syncAvailability());
      }));
  }

export function openRangeEditorCore(deps: StageRefreshDeps, rangeEditorRequestId: any) {
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
      rangeEditorBlockReason = deps.canEditLightRange
        ? deps.mountOptions.regionLighting
          ? deps.isStagePresented
            ? deps.isCameraMoving
              ? "户型正在同步，请稍候再调整照射范围。"
              : deps.isAwaitingFloorViewAdjust
                ? "请先完成户型视角调整，再编辑照射范围。"
                : ""
            : "户型还在加载，请稍候再调整照射范围。"
          : "请先选择轻量柔光模式。"
        : "请在已授权的控件编辑器中调整照射范围。";
    if (rangeEditorBlockReason) {
      postRangeEditorState(false, rangeEditorBlockReason);
      return;
    }
    if (deps.isRangeEditorOpen) {
      postRangeEditorState(true);
      return;
    }
    (deps.exitFocusMode({
      immediate: true,
    }),
      (deps.isRangeEditorOpen = true),
      (deps.isRangeEditorSuppressingClose = true),
      deps.syncAvailability(),
      deps.syncCameraInteraction(),
      refreshStageUiCore(deps),
      (deps.presentationLayerElement.style.display = "none"),
      deps.presentationLayerElement.setAttribute("inert", ""),
      (deps.focusVignetteElement.style.display = "none"));
    try {
      ((deps.rangeEditorHandle ||= mountRegionRangeEditor2(deps.mountOptions, {
        getConfig: () => deps.options,
        standalone: deps.isRangeEditorOnly,
        wake: deps.wakeSceneBackground,
        onChange(rangeOverrides: any = null) {
          deps.canEditLightRange &&
            ((deps.options.lightRegionOverrides = structuredClone(rangeOverrides)),
            (deps.baseStageConfig.lightRegionOverrides = structuredClone(rangeOverrides)),
            postHostMessage({
              type: "range-overrides",
              overrides: rangeOverrides,
            }));
        },
        onClose() {
          ((deps.isRangeEditorOpen = false),
            (deps.presentationLayerElement.style.display = ""),
            deps.presentationLayerElement.removeAttribute("inert"),
            (deps.focusVignetteElement.style.display = ""),
            deps.applyLightStates({
              immediate: true,
            }),
            deps.syncCameraInteraction(),
            refreshStageUiCore(deps),
            deps.syncPanelChrome(),
            deps.renderMarkerPositions(true),
            deps.syncAvailability(),
            deps.isRangeEditorSuppressingClose ||
              postHostMessage({
                type: "range-editor-state",
                active: false,
              }));
        },
      })),
        deps.rangeEditorHandle.open(),
        postRangeEditorState(true));
    } catch (rangeEditorError: any) {
      (deps.rangeEditorHandle?.close(),
        (deps.isRangeEditorOpen = false),
        (deps.presentationLayerElement.style.display = ""),
        deps.presentationLayerElement.removeAttribute("inert"),
        (deps.focusVignetteElement.style.display = ""),
        deps.syncCameraInteraction(),
        refreshStageUiCore(deps),
        deps.syncAvailability(),
        postRangeEditorState(false, rangeEditorError.message || "范围编辑暂时不可用"));
    } finally {
      deps.isRangeEditorSuppressingClose = false;
    }
  }

export function refreshStageUiCore(deps: StageRefreshDeps) {
    (deps.updateEditorSelection(),
      deps.configureIdleBehaviors(),
      deps.syncPresenceScene(),
      deps.presenceWaves.sync({
        bindings: (deps.options.security?.presenceSensors || [])
          .filter((presenceSyncEntry: any) => !deps.isEditing || "presence:" + presenceSyncEntry.id === deps.text)
          .map((presenceSyncSensor: any) => {
            const presenceLayerItem = deps.stageModelIndex.item(
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
        states: deps.deviceStates,
        floorId: deps.selectedFloorId,
        preview: deps.isEditing,
        enabled:
          deps.startupProgress > 0 &&
          deps.activeModule === "security" &&
          !deps.focusedItemId &&
          !deps.panelDisplayMode &&
          !deps.isAwaitingFloorViewAdjust &&
          !deps.isRangeEditorOpen &&
          !deps.mountOptions.floorTransitionActive &&
          deps.cameraMotionSnapshot?.owner !== "floor",
      }),
      deps.syncVacuumMap());
    const floorTransitionActive =
      deps.mountOptions.floorTransitionActive || deps.cameraMotionSnapshot?.owner === "floor";
    if (
      (deps.carCharging.sync({
        root: deps.mountOptions.modelRoot,
        revision: deps.mountOptions.environmentRevision ?? deps.mountOptions.sceneRevision,
        retainedRoots: deps.mountOptions.retainedModelRoots || [],
        bindings: deps.options.devices?.cars || [],
        states: deps.deviceStates,
      }),
      deps.environmentScene.setRoot(
        deps.mountOptions.modelRoot,
        deps.mountOptions.environmentRevision ?? deps.mountOptions.sceneRevision,
      ),
      !floorTransitionActive || deps.cameraMotionSnapshot?.presentationRevealed)
    ) {
      floorTransitionActive ||
        (deps.rebuildCurtainMotion(),
        deps.syncNasOverlay(),
        deps.syncCameraOverlay(),
        deps.syncEnvironmentLayers(),
        deps.syncVacuumMotion());
      const navigationBindings = deps.collectModuleBindings().filter(deps.matchesSelectedFloor),
        modelBindings = expandGroupMembers(
          deps.isEditing
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
                ].includes(deps.activeModule)
                  ? []
                  : deps.collectPreviewCovers()),
              ]
            : [
                ...deps.collectClimateBindings(),
                ...deps.collectGroupedCovers(),
                ...deps.collectNasBindings(),
                ...deps.collectSpeakerBindings(),
                ...deps.collectTelevisionBindings(),
                ...GENERIC_DEVICE_KINDS2.flatMap((deviceKindForBinding) =>
                  deps.collectGenericDeviceBindings(deviceKindForBinding),
                ),
                ...deps.collectVacuumBindings(),
                ...deps.lockBindings(),
                ...deps.securityCameraBindings(),
                ...deps.presenceBindings(),
              ]
                .map((stageBinding) => ({
                  ...stageBinding,
                  id: ["lock", "camera", "presence"].includes(stageBinding.deviceKind)
                    ? stageBinding.id
                    : stageBinding.deviceKind + ":" + stageBinding.id,
                }))
                .concat(deps.collectPreviewCovers()),
        ).filter(
          (availableStageBinding: any) =>
            availableStageBinding.modelAvailable && deps.matchesSelectedFloor(availableStageBinding),
        ),
        pageDimming = pageDimming2(
          deps.options,
          deps.activeModule,
          !!deps.focusedItemId && deps.panelDisplayMode !== "panel",
        ),
        enabled = !deps.isAwaitingFloorViewAdjust && !deps.isRangeEditorOpen && pageDimming.enabled,
        isTemperatureHumidityPreview = deps.isEditing && deps.activeModule === "temperature-humidity",
        sceneBindings = isTemperatureHumidityPreview
          ? []
          : pageModelBindings2(
              deps.mountOptions.document.floors,
              modelBindings,
              pageDimming.page,
              deps.selectedFloorId,
            );
      if (deps.isEditing && !isTemperatureHumidityPreview && deps.text) {
        for (const sceneBinding of modelBindings)
          (sceneBinding.id === deps.text || sceneBinding.entryId === deps.text) &&
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
      (deps.screenOutlines.sync(
        deps.mountOptions.modelRoot,
        deps.mountOptions.environmentRevision ?? deps.mountOptions.sceneRevision,
        sceneBindings.filter(
          (sceneBindingFilter: any) =>
            sceneBindingFilter.deviceKind !== "smallcar" &&
            (!deps.text || sceneBindingFilter.id === deps.text || sceneBindingFilter.entryId === deps.text),
        ),
        !deps.isEditing &&
          !deps.focusedItemId &&
          !deps.isAwaitingFloorViewAdjust &&
          !deps.isRangeEditorOpen &&
          deps.selectedFloorId !== "all" &&
          ["environment", "devices", "vacuum", "security"].includes(pageDimming.page),
      ),
        deps.environmentAirflow.setRoot(deps.mountOptions.modelRoot, deps.mountOptions.sceneRevision),
        deps.deviceMist?.sync({
          root: deps.mountOptions.modelRoot,
          revision: deps.mountOptions.environmentRevision ?? deps.mountOptions.sceneRevision,
          bindings: sceneBindings,
          states: deps.deviceStates,
          enabled: enabled && !deps.isEditing,
          sceneStyle: deps.options.sceneStyle,
        }),
        deps.rangehoodAirflow?.sync({
          root: deps.mountOptions.modelRoot,
          revision: deps.mountOptions.environmentRevision ?? deps.mountOptions.sceneRevision,
          bindings: sceneBindings,
          states: deps.deviceStates,
          enabled: enabled && !deps.isEditing,
        }),
        deps.computerScreens?.sync({
          root: deps.mountOptions.modelRoot,
          revision: deps.mountOptions.environmentRevision ?? deps.mountOptions.sceneRevision,
          bindings: sceneBindings,
          states: deps.deviceStates,
        }),
        deps.environmentScene.setMode({
          enabled: enabled,
          saturation: pageDimming.saturation,
          dimStrength: enabled ? pageDimming.strength : 0,
          bindings: sceneBindings,
          animateBindings: !deps.isEditing && !deps.isAwaitingFloorViewAdjust,
          states: deps.deviceStates,
          focusedId: deps.focusedItemId,
          selectedId: deps.isEditing ? deps.text : "",
        }),
        deps.environmentAirflow.setState({
          enabled:
            deps.startupProgress > 0 &&
            !deps.isAwaitingFloorViewAdjust &&
            !deps.isRangeEditorOpen &&
            !isTemperatureHumidityPreview,
          bindings: modelBindings.filter(
            (climateEnvironmentBinding: any) =>
              climateEnvironmentBinding.deviceKind === "climate" &&
              !climateEnvironmentBinding.waterHeater,
          ),
          states: deps.deviceStates,
          focusedId: deps.focusedItemId,
          overview: !deps.focusedItemId || deps.panelDisplayMode === "panel",
        }),
        deps.mountOptions.setEnvironmentActive?.(enabled || deps.environmentScene.isActive));
    }
    const fallbackBindings = deps.collectModuleBindings().filter(deps.matchesSelectedFloor);
    deps.syncFloorTabs();

    const isNavigationDraggable = deps.navigationEditing && deps.isNavigationVisible;
    (deps.moduleTabsElement.classList.toggle("is-navigation-draggable", isNavigationDraggable),
      deps.floorTabsElement.classList.toggle("is-navigation-draggable", isNavigationDraggable),
      !isNavigationDraggable &&
        (deps.moduleTabsElement.classList.remove("is-navigation-dragging"),
        deps.floorTabsElement.classList.remove("is-navigation-dragging")));
    const isAllFloorsSelected = deps.selectedFloorId === "all";
    deps.toggleModuleTabs(
      !deps.isNavigationVisible &&
        (deps.isEditing || deps.isAwaitingFloorViewAdjust || deps.isRangeEditorOpen || isAllFloorsSelected),
    );
    const normalizedModule = ["water-heater", "airer"].includes(deps.activeModule)
      ? "devices"
      : ["overview", "security", "light", "devices", "vacuum"].includes(deps.activeModule)
        ? deps.activeModule
        : "environment";
    (deps.moduleTabsElement.classList.toggle("is-all-floors", isAllFloorsSelected),
      deps.moduleTabsElement.style.setProperty("--i3d-tab-count", String(deps.configuredModuleKinds2.length)),
      deps.moduleTabsElement.style.setProperty(
        "--i3d-selected-tab",
        String(Math.max(0, deps.configuredModuleKinds2.indexOf(normalizedModule))),
      ));
    for (const [tabModuleKind, moduleTabElement] of deps.moduleTabsByKind) {
      const indexOf = deps.configuredModuleKinds2.indexOf(tabModuleKind),
        isModuleTabDisabled = isAllFloorsSelected || indexOf < 0;
      (isModuleTabDisabled && deps.restoreFocusWithin(moduleTabElement),
        (moduleTabElement.hidden = deps.moduleTabsElement.hidden || indexOf < 0),
        (moduleTabElement.disabled = isModuleTabDisabled),
        moduleTabElement.style.setProperty("--i3d-tab-index", String(Math.max(0, indexOf))),
        moduleTabElement.setAttribute("aria-pressed", String(tabModuleKind === normalizedModule)));
    }
    ((deps.moduleEmptyElement.hidden =
      isAllFloorsSelected ||
      deps.moduleTabsElement.hidden ||
      (!deps.pendingModule &&
        (deps.activeModule === "security"
          ? [
              ...(deps.options.security?.locks || []),
              ...(deps.options.security?.presenceSensors || []),
              ...(deps.options.security?.cameras || []),
              ...(deps.options.security?.alarms || []),
            ].some(deps.matchesSelectedFloor)
          : deps.activeModule === "overview" ||
            deps.activeModule === "light" ||
            fallbackBindings.length > 0))),
      (deps.moduleEmptyElement.textContent = deps.pendingModule
        ? "请选择楼层，再使用" + (deps.moduleTabsByKind.get(deps.pendingModule)?.textContent || "控制") + "。"
        : deps.activeModule === "security"
          ? "尚未配置安防相关设备"
          : deps.activeModule === "vacuum"
            ? "尚未配置扫地机相关设备"
            : deps.activeModule === "devices"
              ? "尚未配置相关设备"
              : "尚未配置环境相关设备"));
  }

export async function adoptSceneUpdateCore(deps: StageRefreshDeps, sceneUpdateInput: any) {
    const savedScene = deps.mountOptions.savedScene,
      currentCameraSnapshot = deps.applyDefaultCamera(),
      sceneAdoptStartTime = performance.now(),
      reportLifecycle = (lifecyclePhase: any) => {
        try {
          Promise.resolve(
            deps.mountOptions.reportLifecycle?.(lifecyclePhase, {
              sourceRevision: sceneUpdateInput?.revision,
              floorCount: sceneUpdateInput?.scene?.floors?.length,
              durationMs: Math.max(0, performance.now() - sceneAdoptStartTime),
            }),
          ).catch(() => {});
        } catch { /* 上报 / 观测类调用是 best-effort：观测通道失败不应中断业务主流程 */ }
      };
    (reportLifecycle("source-adopt-start"),
      (deps.hasIdleIconActivity =
        deps.hasIdleIconActivity ||
        (deps.isCameraRotating && deps.pageBehavior.hideIconsWhileRotating === true) ||
        deps.isUserActive),
      (deps.isCameraMoving = true),
      deps.idleRotationControl.activity(),
      deps.syncStageVisibility());
    let releaseSceneCover = () => {},
      hasCoveredScene = false;
    const applySceneUpdate = async (nextSceneUpdate: any) => {
      if (
        (deps.mountOptions.finishFloorTransition?.(),
        await deps.mountOptions.replaceScene(nextSceneUpdate),
        deps.isControlBusy)
      )
        return;
      (deps.mountOptions.setFloorGap?.(deps.baseStageConfig.floorGap),
        deps.mountOptions.setUniformOverviewStack?.(deps.baseStageConfig.uniformOverviewStack));
      const floorSelection2 = deps.pendingFloorId || deps.baseStageConfig.floorSelection,
        // 单层户型不接受 "all"：否则会停在全屋总览，用户找不到唯一的楼层。
        resolvedFloorId =
          resolveRuntimeFloor(deps.mountOptions.document.floors, floorSelection2) ||
          deps.mountOptions.document.floors[0].id;
      (deps.pendingFloorId && (deps.pendingFloorId = resolvedFloorId),
        (deps.options = deps.buildFloorCameraConfig({
          ...deps.baseStageConfig,
          floorSelection: resolvedFloorId,
        })),
        (deps.selectedFloorId = resolvedFloorId),
        resolvedFloorId === "all" && (deps.activeModule = "overview"),
        deps.mountOptions.setFloor(resolvedFloorId),
        deps.mountOptions.appearance(deps.applyRegionLightingPreset(deps.options)),
        (deps.activeCameraPose = deps.transformFloorCamera(
          deps.baseStageConfig.floorCameras?.[resolvedFloorId] ||
            deps.baseStageConfig.camera ||
            currentCameraSnapshot,
          resolvedFloorId,
        )),
        deps.mountOptions.restoreCamera(deps.transformFloorCamera(currentCameraSnapshot, resolvedFloorId)),
        deps.applyLightStates({
          immediate: true,
        }),
        await deps.mountOptions.whenPresented(),
        deps.isControlBusy ||
          deps.applyLightStates({
            immediate: true,
          }));
    };
    try {
      ((releaseSceneCover = deps.mountOptions.coverSceneUpdate()),
        deps.mountOptions.setCameraInteraction({
          enabled: false,
        }),
        (hasCoveredScene = true),
        await applySceneUpdate(sceneUpdateInput),
        deps.isControlBusy ||
          (postHostMessage({
            type: "model-metadata",
            metadata: buildMetadata(deps.mountOptions, deps.transformFloorCamera, deps.options.floorSelection),
          }),
          reportLifecycle("source-adopt-complete")));
    } catch (sceneAdoptError: any) {
      throw (
        reportLifecycle("source-adopt-failed"),
        hasCoveredScene && !deps.isControlBusy && (await applySceneUpdate(savedScene)),
        sceneAdoptError
      );
    } finally {
      if (
        (releaseSceneCover(),
        (deps.isCameraMoving = false),
        deps.sceneCacheByKey.clear(),
        (deps.lastRenderSignature = ""),
        !deps.isControlBusy &&
          (deps.syncCameraInteraction(),
          deps.syncMarkers(),
          deps.renderMarkerPositions(true),
          deps.pendingEditorAction))
      ) {
        const pendingHostMessage = deps.pendingEditorAction;
        ((deps.pendingEditorAction = null), deps.handleHostMessage(pendingHostMessage));
      }
    }
  }
