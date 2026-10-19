/**
 * 舞台相机运动与标记交互：聚焦 / 退出聚焦、拖动与标记激活、相机交互同步。
 *
 * 从 `runtime/core/stage.ts` 的 `mountStage()` 闭包切出，依赖袋 `StageCameraMotionDeps`。
 */

import { automaticAirConditionerCamera as automaticAirConditionerCamera2, automaticLightCamera as automaticLightCamera2 } from "../../camera/camera-motion";
import { climateState as climateState2 } from "../../climate/climate-state";
import { coverControl as coverControl2 } from "../../cover/cover-state";
import { curtainGroupEntryId as curtainGroupEntryId2 } from "../../cover/cover-groups";
import { genericDeviceProfile as genericDeviceProfile2, isGenericDeviceKind as isGenericDeviceKind2 } from "../../device/generic-device-catalog";
import { postHostMessage } from "./_shared";
import { resolvePageBehavior as resolvePageBehavior2 } from "../idle-rotation";
import { televisionPower as televisionPower2 } from "../../television/television-state";
import { vacuumStatusPresentation as vacuumStatusPresentation2 } from "../../vacuum/vacuum-map";

/** 依赖袋（宿主 `bootEditor` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。
 * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名
 * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。
 */
export interface StageCameraMotionDeps {
  isRangeEditorOpen: any;
  rangeEditorHandle: any;
  followVacuumId: any;
  mountOptions: any;
  options: any;
  activeModule: any;
  isAwaitingFloorViewAdjust: any;
  panelDisplayMode: any;
  isEditing: any;
  cameraMotionSnapshot: any;
  getFocusedEntry: any;
  computeGroupBounds: any;
  presenceScene: any;
  activePointerDrag: any;
  isControlReady: any;
  isIdleRotationRunning: any;
  focusInset: any;
  refreshStageUi: any;
  syncStageVisibility: any;
  renderMarkerPositions: any;
  exitFollowMode: any;
  syncAvailability: any;
  climatePanel: any;
  lightModeMenu: any;
  lightColorPicker: any;
  coverPanel: any;
  coverGroupPanel: any;
  televisionPanel: any;
  speakerPanel: any;
  focusedItemId: any;
  idleReturnCamera: any;
  lightEditPreview: any;
  hasPendingStageRefresh: any;
  restoreFocusWithin: any;
  lightPanelSection: any;
  syncPanelChrome: any;
  startCameraMotion: any;
  applyLightStates: any;
  findBindingById: any;
  isOverviewOrAllFloors: any;
  idleFocusExitControl: any;
  controlErrorElement: any;
  updateDevicePanel: any;
  handleMarkerActivate: any;
  isPanelDeviceKind: any;
  activeCameraPose: any;
  three: any;
  canvasElement: any;
  text: any;
  syncMarkers: any;
  vacuumOverlayByKey: any;
  map: any;
  isControlBusy: any;
  deviceStates: any;
  mediaControlRequestsByRequestId: any;
  controlMediaDevice: any;
  readCoverFeedback: any;
  coverPanelOptions: any;
  readLightState: any;
  runLightCommand: any;
  screenPointToFloor: any;
  stageModelIndex: any;
}

export function syncCameraInteractionCore(deps: StageCameraMotionDeps) {
    if (deps.isRangeEditorOpen && deps.rangeEditorHandle?.syncCameraInteraction) {
      deps.rangeEditorHandle.syncCameraInteraction();
      return;
    }
    if (deps.isRangeEditorOpen || deps.followVacuumId) {
      deps.mountOptions.setCameraInteraction({
        enabled: false,
        panEnabled: false,
        zoomEnabled: false,
      });
      return;
    }
    const cameraInteractionConfig = {
        ...deps.options.camera,
        ...resolvePageBehavior2(deps.options, deps.activeModule).interaction,
      },
      isFreeCameraMode =
        deps.isAwaitingFloorViewAdjust ||
        deps.panelDisplayMode === "edit" ||
        (deps.isEditing && !deps.panelDisplayMode && !deps.cameraMotionSnapshot),
      editedEntry = deps.panelDisplayMode === "edit" ? deps.getFocusedEntry() : null,
      anchor =
        editedEntry &&
        (editedEntry.isCurtainGroup
          ? deps.computeGroupBounds(editedEntry)
          : editedEntry.deviceKind === "presence"
            ? deps.presenceScene.anchor(editedEntry.id.slice(9))
            : editedEntry.modelId
              ? deps.mountOptions.environmentModelPose?.(editedEntry.floorId, editedEntry.modelId)
              : null),
      editFocusPoint = editedEntry
        ? anchor?.center ||
          deps.mountOptions
            .worldPoint(editedEntry.floorId, editedEntry.x, editedEntry.y, editedEntry.height)
            ?.toArray()
        : null;
    const documentPanEnabled = cameraInteractionConfig.panEnabled !== false;
    const documentZoomEnabled = cameraInteractionConfig.zoomEnabled !== false;
    // Vue 总览条经 window 旗标切换「视角锁定」，避免 runtime 包与 SPA facade 交叉依赖
    const facadeViewLocked = !!(globalThis as any).__homeosDisplayViewLocked;
    const viewLocked = cameraInteractionConfig.viewLocked === true || facadeViewLocked;
    deps.mountOptions.setCameraInteraction({
      enabled:
        !deps.activePointerDrag &&
        (isFreeCameraMode ||
          (deps.isControlReady &&
            (!deps.panelDisplayMode || deps.panelDisplayMode === "panel") &&
            !deps.cameraMotionSnapshot &&
            !deps.isIdleRotationRunning)),
      rotationMode: isFreeCameraMode ? "free" : cameraInteractionConfig.rotationMode,
      // 总览尊重文档 interaction 配置；编辑/调层模式始终可平移缩放；显式锁定时关闭
      panEnabled: !viewLocked && (isFreeCameraMode || documentPanEnabled),
      zoomEnabled: !viewLocked && (isFreeCameraMode || documentZoomEnabled),
      focusEditing: deps.panelDisplayMode === "edit",
      focusPoint: editFocusPoint,
    });
  }

export function advanceCameraMotionCore(deps: StageCameraMotionDeps, frameTimestampInput: any) {
    if (!deps.cameraMotionSnapshot) return;
    const now = performance.now(),
      sampledFrameTimestamp = now - frameTimestampInput > 50 ? now : frameTimestampInput,
      clampedFrameTimestamp = Math.max(
        sampledFrameTimestamp,
        deps.cameraMotionSnapshot.lastFrame ?? deps.cameraMotionSnapshot.started,
      );
    (deps.cameraMotionSnapshot.firstFrame &&
      ((deps.cameraMotionSnapshot.lastFrame = clampedFrameTimestamp),
      (deps.cameraMotionSnapshot.firstFrame = false)),
      (deps.cameraMotionSnapshot.elapsed += Math.min(
        50,
        Math.max(
          0,
          clampedFrameTimestamp - (deps.cameraMotionSnapshot.lastFrame ?? clampedFrameTimestamp),
        ),
      )),
      (deps.cameraMotionSnapshot.lastFrame = clampedFrameTimestamp));
    const trackedCameraMotion = deps.cameraMotionSnapshot,
      elapsed = deps.cameraMotionSnapshot.elapsed,
      progress = deps.cameraMotionSnapshot.transition.progress(elapsed);
    ((deps.cameraMotionSnapshot.amount = progress),
      (deps.focusInset =
        deps.cameraMotionSnapshot.inset +
        (deps.cameraMotionSnapshot.targetInset - deps.cameraMotionSnapshot.inset) * progress));
    const sample = deps.cameraMotionSnapshot.transition.sample(elapsed);
    (deps.cameraMotionSnapshot.owner === "floor" &&
      deps.mountOptions.advanceFloorTransition?.(progress, sample),
      deps.mountOptions.applyCameraFrame
        ? deps.mountOptions.applyCameraFrame(sample, progress, deps.focusInset)
        : (deps.mountOptions.applyCameraPose(sample, progress),
          deps.mountOptions.setFocusViewport(deps.focusInset)),
      deps.cameraMotionSnapshot.owner === "floor" &&
        progress >= 0.9 &&
        !deps.cameraMotionSnapshot.presentationRevealed &&
        ((deps.cameraMotionSnapshot.presentationRevealed = true), deps.refreshStageUi()),
      deps.cameraMotionSnapshot.owner === "floor" &&
        progress >= 0.9 &&
        !deps.cameraMotionSnapshot.markersRevealed &&
        ((deps.cameraMotionSnapshot.markersRevealed = true),
        deps.syncStageVisibility(),
        deps.renderMarkerPositions(true)),
      deps.cameraMotionSnapshot.owner === "focus" &&
        !deps.cameraMotionSnapshot.focused &&
        progress >= 0.99 &&
        deps.exitFollowMode(),
      deps.cameraMotionSnapshot.transition.settled(elapsed) &&
        deps.cameraMotionSnapshot === trackedCameraMotion &&
        ((deps.cameraMotionSnapshot = null),
        deps.mountOptions.endCameraMotion(),
        syncCameraInteractionCore(deps),
        trackedCameraMotion.done?.(),
        deps.syncAvailability()));
  }

export function exitFocusModeCore(deps: StageCameraMotionDeps, exitOptions: { immediate?: boolean; preserveCamera?: boolean } = {}) {
    if (
      (deps.climatePanel.cancelPending?.(),
      deps.lightModeMenu.close(),
      deps.lightColorPicker.cancel(),
      deps.coverPanel.deactivate(),
      typeof deps.coverGroupPanel < "u" && deps.coverGroupPanel.deactivate(),
      deps.getFocusedEntry()?.deviceKind === "vacuum" &&
        postHostMessage({
          type: "vacuum-popup-close",
        }),
      deps.getFocusedEntry()?.deviceKind === "camera" &&
        postHostMessage({
          type: "camera-popup-close",
        }),
      deps.televisionPanel.hide(),
      deps.speakerPanel.hide(),
      !deps.focusedItemId && !deps.panelDisplayMode && (!deps.idleReturnCamera || exitOptions.immediate !== true))
    )
      return;
    const hasLightEffectPreview = !!deps.lightEditPreview;
    deps.lightEditPreview = null;
    const hasEditFocus = !!(deps.panelDisplayMode && deps.isEditing);
    ((deps.hasPendingStageRefresh = !!(
      deps.idleReturnCamera &&
      !deps.isEditing &&
      deps.panelDisplayMode !== "panel" &&
      exitOptions.immediate !== true &&
      !exitOptions.preserveCamera
    )),
      (deps.focusedItemId = ""),
      (deps.panelDisplayMode = ""),
      deps.restoreFocusWithin(deps.lightPanelSection),
      deps.lightPanelSection.classList.remove("is-open"),
      deps.lightPanelSection.setAttribute("inert", ""),
      deps.syncPanelChrome(),
      postHostMessage({
        type: "focus-state",
        active: false,
      }),
      exitOptions.preserveCamera
        ? ((deps.cameraMotionSnapshot = null),
          (deps.idleReturnCamera = null),
          deps.mountOptions.setOrbitPivot(null))
        : deps.idleReturnCamera &&
          deps.startCameraMotion(deps.idleReturnCamera, false, exitOptions.immediate === true, () => {
            ((deps.idleReturnCamera = null), deps.mountOptions.setOrbitPivot(null));
          }),
      deps.syncAvailability(),
      hasEditFocus &&
        postHostMessage({
          type: "edit",
          action: "focus-exited",
        }),
      hasLightEffectPreview && deps.applyLightStates(),
      syncCameraInteractionCore(deps));
  }

export function focusMarkerByIdCore(deps: StageCameraMotionDeps, targetMarkerId: any, focusMode = "runtime", isImmediate = false) {
    const targetMarkerItem = deps.findBindingById(targetMarkerId);
    // 门锁与其它 panel 设备一致：直播允许 focus / panel（lock-panel 负责控制）
    if (!targetMarkerItem) return;
    const isCameraEditMode = focusMode === "edit";
    /**
     * 编辑态挂上选中/面板状态但不移动相机。
     *
     * 模型缺失或算不出聚焦点时，以前直接 return：相机不会切到自由模式，
     * 「调整视角」看起来毫无反应，紧接着「保存视角」还会被会话守卫拒绝。
     */
    const applyFocusChrome = () => {
      ((deps.focusedItemId = targetMarkerId),
        (deps.panelDisplayMode = focusMode),
        (deps.controlErrorElement.textContent = ""),
        deps.isEditing ||
        !deps.isPanelDeviceKind(targetMarkerItem) ||
        targetMarkerItem.clickAction !== "focus"
          ? (deps.lightPanelSection.removeAttribute("inert"),
            deps.lightPanelSection.classList.add("is-open"))
          : (deps.lightPanelSection.setAttribute("inert", ""),
            deps.lightPanelSection.classList.remove("is-open")),
        deps.mountOptions.setOrbitPivot(null),
        deps.syncPanelChrome(),
        deps.updateDevicePanel());
    };
    if (targetMarkerItem.modelAvailable === false) {
      if (!isCameraEditMode) return;
      (deps.idleReturnCamera ||= deps.mountOptions.cameraState(true));
      (applyFocusChrome(), syncCameraInteractionCore(deps));
      return;
    }
    if (deps.focusedItemId !== targetMarkerId) {
      deps.lightModeMenu.close();
      deps.lightColorPicker.cancel();
    }
    if (
      (deps.lightEditPreview && ((deps.lightEditPreview = null), deps.applyLightStates()),
      deps.focusedItemId === targetMarkerId && deps.panelDisplayMode === focusMode && focusMode === "runtime")
    ) {
      exitFocusModeCore(deps);
      return;
    }
    if (
      !deps.isEditing &&
      ["runtime", "panel"].includes(focusMode) &&
      (!deps.isControlReady || deps.isOverviewOrAllFloors())
    )
      return;
    if ((deps.idleFocusExitControl.activity(), focusMode === "panel")) {
      ((deps.idleReturnCamera || deps.cameraMotionSnapshot) &&
        exitFocusModeCore(deps, {
          immediate: true,
        }),
        (deps.focusedItemId = targetMarkerId),
        (deps.panelDisplayMode = "panel"),
        (deps.controlErrorElement.textContent = ""),
        deps.lightPanelSection.removeAttribute("inert"),
        deps.lightPanelSection.classList.add("is-open"),
        deps.syncPanelChrome(),
        deps.updateDevicePanel(),
        syncCameraInteractionCore(deps),
        deps.syncAvailability(),
        postHostMessage({
          type: "focus-state",
          active: false,
          panelOpen: true,
          id: targetMarkerId,
        }),
        deps.handleMarkerActivate(targetMarkerItem));
      return;
    }
    deps.idleReturnCamera ||= deps.mountOptions.cameraState(true);
    const anchor2 = targetMarkerItem.isCurtainGroup
        ? deps.computeGroupBounds(targetMarkerItem)
        : targetMarkerItem.deviceKind === "presence"
          ? deps.presenceScene.anchor(targetMarkerItem.id.slice(9))
          : targetMarkerItem.modelId
            ? deps.mountOptions.environmentModelPose?.(
                targetMarkerItem.floorId,
                targetMarkerItem.modelId,
              )
            : null,
      focusWorldPoint =
        anchor2?.center ||
        deps.mountOptions
          .worldPoint(
            targetMarkerItem.floorId,
            targetMarkerItem.x,
            targetMarkerItem.y,
            targetMarkerItem.height,
          )
          ?.toArray();
    if (!focusWorldPoint) {
      if (!isCameraEditMode) return;
      (deps.idleReturnCamera ||= deps.mountOptions.cameraState(true));
      (applyFocusChrome(), syncCameraInteractionCore(deps));
      return;
    }
    applyFocusChrome();
    const camera = deps.options.camera || deps.activeCameraPose || deps.idleReturnCamera,
      focusCamera =
        targetMarkerItem.focusCamera ||
        (targetMarkerItem.modelId
          ? automaticAirConditionerCamera2(
              deps.three,
              {
                ...camera,
                viewportAspect: deps.canvasElement.clientWidth / Math.max(1, deps.canvasElement.clientHeight),
              },
              focusWorldPoint,
              anchor2?.forward,
              anchor2?.size,
              targetMarkerItem.deviceKind === "nas"
                ? {
                    minimumFrameSize: 0.7,
                    minimumDistance: 0.6,
                  }
                : {},
            )
          : automaticLightCamera2(deps.three, camera, focusWorldPoint));
    (deps.isEditing ||
      postHostMessage({
        type: "focus-state",
        active: true,
        id: targetMarkerId,
      }),
      deps.startCameraMotion(focusCamera, true, isImmediate, () => {}),
      (targetMarkerItem.deviceKind === "camera" || targetMarkerItem.deviceKind === "vacuum") &&
        deps.handleMarkerActivate(targetMarkerItem));
  }

export function activateMarkerCore(deps: StageCameraMotionDeps, activatedMarkerId: any, isShortcut = false) {
    if (!deps.isEditing && deps.isOverviewOrAllFloors()) return;
    const activatedMarkerItem = deps.findBindingById(activatedMarkerId);
    if (
      !activatedMarkerItem ||
      // 编辑态允许选中「模型已被删除」的条目，否则这些设备在编辑器里点不开、也没法重设视角。
      (!deps.isEditing && activatedMarkerItem.modelAvailable === false) ||
      (!deps.isEditing && (activatedMarkerItem.overviewQuip || activatedMarkerItem.passiveSensor)) ||
      (deps.followVacuumId && !deps.isEditing) ||
      (!deps.isEditing &&
        ["temperature-humidity", "smallcar"].includes(activatedMarkerItem.deviceKind))
    )
      return;
    const markerClickAction = activatedMarkerItem.clickAction || "focus";
    if (deps.isEditing) {
      ((deps.text = activatedMarkerId),
        postHostMessage({
          type: "edit",
          action: "select",
          id: activatedMarkerId,
        }),
        deps.syncMarkers());
      return;
    }
    if (activatedMarkerItem.deviceKind === "camera") {
      deps.isControlReady && activatedMarkerItem.entityId && focusMarkerByIdCore(deps, activatedMarkerId);
      return;
    }
    if (activatedMarkerItem.deviceKind === "vacuum-room") {
      if (
        !deps.isControlReady ||
        !activatedMarkerItem.entityId ||
        deps.vacuumOverlayByKey.has(activatedMarkerId)
      )
        return;
      const roomTimeoutHandle = setTimeout(() => {
        deps.vacuumOverlayByKey.delete(activatedMarkerId);
        const roomMarkerElement = deps.map.get(activatedMarkerId);
        roomMarkerElement &&
          ((roomMarkerElement.disabled = false),
          (roomMarkerElement.title = "请求超时，请检查设备状态"));
      }, 14000);
      (deps.vacuumOverlayByKey.set(activatedMarkerId, roomTimeoutHandle),
        deps.map.get(activatedMarkerId) && (deps.map.get(activatedMarkerId).disabled = true),
        postHostMessage({
          type: "vacuum-room",
          id: activatedMarkerId,
          vacuumId: activatedMarkerItem.vacuumId,
          shortcutId: activatedMarkerItem.shortcutId,
        }));
      return;
    }
    const isTurnOnAction = ["turn-on", "turn-on-focus", "turn-on-panel"].includes(
        markerClickAction,
      ),
      openPanelOrRuntime = () => {
        const targetFocusMode = markerClickAction === "turn-on-panel" ? "panel" : "runtime";
        (deps.focusedItemId === activatedMarkerId && deps.panelDisplayMode === targetFocusMode) ||
          focusMarkerByIdCore(deps, activatedMarkerId, targetFocusMode);
      },
      reportMarkerError = (markerError: any) => {
        if (deps.isControlBusy) return;
        const roomMarkerElementRef = deps.map.get(activatedMarkerId);
        (roomMarkerElementRef && (roomMarkerElementRef.title = markerError.message),
          deps.focusedItemId === activatedMarkerId &&
            ((deps.controlErrorElement.textContent = markerError.message), deps.updateDevicePanel()));
      };
    if (activatedMarkerItem.deviceKind === "television" && isTurnOnAction) {
      if (!deps.isControlReady) return;
      const televisionPowerState = televisionPower2(activatedMarkerItem, deps.deviceStates);
      if (
        (markerClickAction !== "turn-on" && !televisionPowerState.on && openPanelOrRuntime(),
        !televisionPowerState.available ||
          !televisionPowerState.supported ||
          [...deps.mediaControlRequestsByRequestId.values()].some(
            (powerCommandEntry) => powerCommandEntry.entityId === televisionPowerState.entityId,
          ))
      )
        return;
      deps.controlMediaDevice(televisionPowerState.command, activatedMarkerItem).catch(
        reportMarkerError,
      );
      return;
    }
    if (deps.isPanelDeviceKind(activatedMarkerItem)) {
      const active2 =
        isShortcut &&
        activatedMarkerItem.deviceKind === "vacuum" &&
        vacuumStatusPresentation2(activatedMarkerItem, deps.deviceStates).active;
      focusMarkerByIdCore(deps, 
        activatedMarkerId,
        active2 || activatedMarkerItem.clickAction === "panel" ? "panel" : "runtime",
      );
      return;
    }
    if (activatedMarkerItem.deviceKind === "cover") {
      if (isTurnOnAction) {
        if (!deps.isControlReady) return;
        const coverEntryList = (
            activatedMarkerItem.isCurtainGroup
              ? activatedMarkerItem.memberItems
              : [activatedMarkerItem]
          )
            .filter((coverFilterItem: any) => coverFilterItem.modelAvailable !== false)
            .map((coverMapItem: any) => ({
              item: coverMapItem,
              state: deps.readCoverFeedback(coverMapItem),
            }))
            .filter(({ state: availableCoverState }: any) => availableCoverState.available),
          some3 = coverEntryList.some(({ state: movingCoverState }: any) => movingCoverState.moving),
          some4 = coverEntryList.some(
            ({ state: openCoverState }: any) =>
              openCoverState.on || openCoverState.position > 0 || openCoverState.state === "open",
          ),
          coverServiceName = some3 ? "stop_cover" : some4 ? "close_cover" : "open_cover";
        markerClickAction !== "turn-on" && !some3 && !some4 && openPanelOrRuntime();
        const commandedEntityIdSet = new Set();
        for (const { item: coverCommandItem, state: coverCommandState } of coverEntryList)
          if (!(
            (coverServiceName === "open_cover" && !coverCommandState.closedConfirmed) ||
            (some3 && !coverCommandState.moving) ||
            commandedEntityIdSet.has(coverCommandItem.entityId)
          ))
            try {
              const coverControlCommand = coverControl2(
                coverCommandState,
                coverServiceName,
                undefined,
              );
              (commandedEntityIdSet.add(coverCommandItem.entityId),
                deps.coverPanelOptions
                  .onControl(coverControlCommand, coverCommandItem)
                  .catch(reportMarkerError));
            } catch (coverCommandError: any) {
              reportMarkerError(coverCommandError);
            }
        return;
      }
      focusMarkerByIdCore(deps, activatedMarkerId, markerClickAction === "panel" ? "panel" : "runtime");
      return;
    }
    if (activatedMarkerItem.modelId) {
      const markerClimateState = climateState2(
        activatedMarkerItem.entityId,
        (deps.deviceStates as any)[activatedMarkerItem.entityId],
      );
      if (
        (activatedMarkerItem.climateType === "bath-heater" ||
          activatedMarkerItem.airPurifier ||
          activatedMarkerItem.waterHeater) &&
        !activatedMarkerItem.entityId
      ) {
        focusMarkerByIdCore(deps, 
          activatedMarkerId,
          markerClickAction === "turn-on-panel" ? "panel" : "runtime",
        );
        return;
      }
      const isFocusTurnOn = ["turn-on-focus", "turn-on-panel"].includes(markerClickAction);
      if (
        markerClickAction === "turn-on" ||
        (isFocusTurnOn && markerClimateState.available && markerClimateState.on)
      ) {
        (deps.climatePanel.update({
          item: activatedMarkerItem,
          state: markerClimateState,
          states: deps.deviceStates,
          editing: deps.isEditing || !deps.isControlReady || !activatedMarkerItem.modelAvailable,
        }),
          deps.climatePanel.power?.({
            toggle: true,
          }));
        return;
      }
      ((markerClickAction === "turn-on-focus" &&
        deps.focusedItemId === activatedMarkerId &&
        deps.panelDisplayMode === "runtime") ||
        focusMarkerByIdCore(deps, 
          activatedMarkerId,
          markerClickAction === "turn-on-panel" ? "panel" : "runtime",
        ),
        markerClickAction !== "focus" &&
          deps.focusedItemId === activatedMarkerId &&
          deps.climatePanel.power?.({
            toggle: false,
          }));
      return;
    }
    const markerLightState = deps.readLightState(activatedMarkerItem.entityId);
    if (markerClickAction === "turn-on") {
      markerLightState.available &&
        deps.runLightCommand("power", !markerLightState.on, activatedMarkerItem);
      return;
    }
    if (
      ["turn-on-focus", "turn-on-panel"].includes(markerClickAction) &&
      markerLightState.available &&
      markerLightState.on
    ) {
      deps.runLightCommand("power", false, activatedMarkerItem);
      return;
    }
    if (markerClickAction === "turn-on-panel") {
      (focusMarkerByIdCore(deps, activatedMarkerId, "panel"),
        markerLightState.available &&
          !markerLightState.on &&
          deps.runLightCommand("power", true, activatedMarkerItem));
      return;
    }
    ((markerClickAction === "turn-on-focus" &&
      deps.focusedItemId === activatedMarkerId &&
      deps.panelDisplayMode === "runtime") ||
      focusMarkerByIdCore(deps, activatedMarkerId),
      deps.focusedItemId === activatedMarkerId &&
        deps.panelDisplayMode === "runtime" &&
        markerClickAction === "turn-on-focus" &&
        markerLightState.available &&
        !markerLightState.on &&
        deps.runLightCommand("power", true));
  }

export function beginMarkerDragCore(deps: StageCameraMotionDeps, dragStartEvent: any, dragMarkerId: any) {
    if (!deps.isEditing || deps.panelDisplayMode || dragStartEvent.button !== 0) return;
    (dragStartEvent.preventDefault(), dragStartEvent.stopPropagation());
    const dragMarkerItem = deps.findBindingById(dragMarkerId);
    if (!dragMarkerItem) return;
    if (dragMarkerItem.deviceKind === "presence") {
      ((deps.text = dragMarkerId),
        deps.refreshStageUi(),
        postHostMessage({
          type: "edit",
          action: "select",
          id: dragMarkerId,
        }));
      return;
    }
    ((deps.text = dragMarkerId),
      deps.refreshStageUi(),
      postHostMessage({
        type: "edit",
        action: "select",
        id: dragMarkerId,
      }));
    const dragStartFloorPoint = deps.screenPointToFloor(dragStartEvent, dragMarkerItem);
    ((deps.activePointerDrag = {
      id: dragMarkerId,
      pointerId: dragStartEvent.pointerId,
      clientX: dragStartEvent.clientX,
      clientY: dragStartEvent.clientY,
      original: {
        x: dragMarkerItem.x,
        y: dragMarkerItem.y,
      },
      point: {
        x: dragMarkerItem.x,
        y: dragMarkerItem.y,
      },
      height: dragMarkerItem.height,
      offset: dragStartFloorPoint
        ? {
            x: dragMarkerItem.x - dragStartFloorPoint.x,
            y: dragMarkerItem.y - dragStartFloorPoint.y,
          }
        : {
            x: 0,
            y: 0,
          },
      moved: false,
    }),
      dragStartEvent.currentTarget.setPointerCapture(dragStartEvent.pointerId),
      (deps.mountOptions.controls.enabled = false));
  }

export function endMarkerDragCore(deps: StageCameraMotionDeps, dragEndEvent: any) {
    if (!(!deps.activePointerDrag || deps.activePointerDrag.pointerId !== dragEndEvent.pointerId)) {
      if (deps.activePointerDrag.moved) {
        dragEndEvent.currentTarget.dataset.dragged = "true";
        const draggedMarkerItem = deps.findBindingById(deps.activePointerDrag.id),
          draggedTargetEntry =
            draggedMarkerItem.deviceKind === "temperature-humidity"
              ? deps.options.environment?.temperatureHumidity?.find(
                  (humidityCollectionItem: any) => humidityCollectionItem.id === draggedMarkerItem.id,
                )
              : draggedMarkerItem.isCurtainGroup
                ? deps.options.environment?.curtainGroups?.find(
                    (curtainGroupCollectionItem: any) =>
                      curtainGroupEntryId2(curtainGroupCollectionItem) === draggedMarkerItem.id,
                  )
                : draggedMarkerItem.securityAlarm
                  ? deps.options.security?.alarms?.find(
                      (alarmCollectionItem: any) =>
                        (alarmCollectionItem.kind || "smoke") +
                          ":" +
                          alarmCollectionItem.id ===
                        draggedMarkerItem.id,
                    )
                  : draggedMarkerItem.deviceKind === "camera"
                  ? deps.options.security?.cameras?.find(
                      (cameraCollectionItem: any) =>
                        "camera:" + cameraCollectionItem.id === draggedMarkerItem.id,
                    )
                  : draggedMarkerItem.deviceKind === "vacuum-room"
                    ? deps.options.devices?.vacuums
                        ?.find(
                          (vacuumCollectionItem: any) =>
                            vacuumCollectionItem.id === draggedMarkerItem.vacuumId,
                        )
                        ?.shortcuts?.find(
                          (shortcutCollectionItem: any) =>
                            shortcutCollectionItem.id === draggedMarkerItem.shortcutId,
                        )
                    : deps.activeModule === "light"
                      ? draggedMarkerItem
                      : (isGenericDeviceKind2(deps.activeModule)
                          ? deps.options.devices?.[genericDeviceProfile2(deps.activeModule).collection] || []
                          : ["nas", "television", "speaker", "vacuum"].includes(deps.activeModule)
                            ? deps.options.devices?.[
                                deps.activeModule === "vacuum"
                                  ? "vacuums"
                                  : deps.activeModule === "speaker"
                                    ? "speakers"
                                    : deps.activeModule === "television"
                                      ? "televisions"
                                      : "nas"
                              ] || []
                            : deps.options.environment?.[
                                deps.activeModule === "airer"
                                  ? "airers"
                                  : deps.activeModule === "cover"
                                    ? "curtains"
                                    : deps.activeModule === "water-heater"
                                      ? "waterHeaters"
                                      : deps.activeModule === "fan"
                                        ? "fans"
                                        : deps.activeModule === "purifier"
                                          ? "airPurifiers"
                                          : "airConditioners"
                              ] || []
                        ).find(
                          (deviceCollectionItem: any) =>
                            deviceCollectionItem.id === deps.activePointerDrag.id,
                        ),
          nextMarkerPosition = {
            ...deps.activePointerDrag.point,
          };
        if (draggedMarkerItem.deviceKind === "smallcar") {
          const smallcarSceneItem = deps.stageModelIndex.item(
            draggedMarkerItem.floorId,
            draggedMarkerItem.modelId,
          );
          ((nextMarkerPosition.x -= smallcarSceneItem?.x ?? 0),
            (nextMarkerPosition.y -= smallcarSceneItem?.y ?? 0));
        }
        (draggedTargetEntry && Object.assign(draggedTargetEntry, nextMarkerPosition),
          postHostMessage({
            type: "edit",
            action: "position",
            id: draggedMarkerItem.id,
            ...nextMarkerPosition,
          }));
      }
      ((deps.activePointerDrag = null), syncCameraInteractionCore(deps));
    }
  }
