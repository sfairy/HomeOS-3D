/*
 * 宿主消息处理。
 */
// 通用设备的六个品类（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）在运行侧也是**合法的模块名**：
import { GENERIC_DEVICE_KINDS } from "../../device/device-profiles.js";
// 展示态的「模块 / 品类 → 所属页签」归一：与页签清单同一份实现，别在下面再抄一张表。
import { moduleTabOf } from "./module-tabs.js";

type AnyObj = Record<string, any>;

export function createHostMessageHandler(ctx: any) {
  /**
   * 宿主消息总入口：先做同源 + 来源窗口 + channel 三重校验，再按 type 分发。
   */
  function handleHostMessage(messageEvent: any) {
    // 释放后一律不处理：pagehide 之后仍可能有已排队的 message 到达，而下面每个分支
    if (ctx.isDisposed) {
      return;
    }
    if (
      messageEvent.origin !== location.origin ||
      messageEvent.source !== window.parent ||
      messageEvent.data?.channel !== "hb-i3d-v1"
    ) {
      return;
    }
    const message = messageEvent.data;
    ctx.wakeFrameLoop();
    if (message.type === "navigation-editing") {
      // 导航位置调整态走这条轻量通道，不复用 config：config 会整份替换配置、重算楼层与相机，
      ctx.navigationEditing = message.active === true;
      ctx.updatePanelChrome();
    } else if (message.type === "presentation-layout") {
      if (
        Number.isFinite(message.width) &&
        message.width > 0 &&
        Number.isFinite(message.height) &&
        message.height > 0
      ) {
        ctx.presentationLayout = {
          width: message.width,
          height: message.height
        };
        ctx.layoutStage();
      }
    } else if (message.type === "config") {
      if (ctx.isSceneUpdating) {
        // 场景替换进行中：先挂起这条 config 并保留整个事件（后面会重放），
        ctx.queuedConfigMessage = messageEvent;
        return;
      }
      ctx.isRangeEditorOnly = message.rangeEditorOnly === true;
      ctx.isRangeEditingAllowed = message.allowRangeEditing === true || message.editing === true;
      if (
        ctx.isRangeEditorOpen &&
        (!ctx.isRangeEditingAllowed ||
          message.viewEditing === true ||
          message.properties?.lightingMode !== "region" ||
          message.properties?.floorSelection !== ctx.sceneProperties.floorSelection ||
          JSON.stringify(message.properties?.camera) !== JSON.stringify(ctx.sceneProperties.camera) ||
          JSON.stringify(message.properties?.lightRegionOverrides || ({} as AnyObj)) !==
            JSON.stringify(ctx.sceneProperties.lightRegionOverrides || ({} as AnyObj)))
      ) {
        ctx.rangeEditor?.close();
      }
      ctx.hasUserInteracted = false;
      if (
        message.editing ||
        message.viewEditing ||
        ctx.sceneProperties.floorSelection !== message.properties.floorSelection ||
        JSON.stringify(ctx.sceneProperties.floorCameras) !==
          JSON.stringify(message.properties.floorCameras)
      ) {
        ctx.pendingFloorId = "";
        ctx.pendingModule = "";
      }
      ctx.sceneProperties = structuredClone(message.properties);
      if (!ctx.hasInitializedFloor && !message.editing && !message.viewEditing) {
        ctx.hasInitializedFloor = true;
        if (ctx.stageOptions.document.floors.length > 1) {
          ctx.pendingFloorId = "all";
        }
      }
      if (
        ctx.pendingFloorId &&
        ctx.pendingFloorId !== "all" &&
        !ctx.stageOptions.document.floors.some((validFloorEntry: any) => validFloorEntry.id === ctx.pendingFloorId)
      ) {
        ctx.pendingFloorId = "";
      }
      if (
        message?.editing ||
        message?.viewEditing ||
        (ctx.sceneProperties.floorSelection !== ctx.config.floorSelection && !ctx.pendingFloorId)
      ) {
        ctx.stageOptions.finishFloorTransition?.();
      }
      ctx.stageOptions.setFloorGap?.(ctx.sceneProperties.floorGap);
      ctx.stageOptions.setUniformOverviewStack?.(ctx.sceneProperties.uniformOverviewStack);
      message.properties = ctx.normalizeSceneConfig({
        ...ctx.sceneProperties,
        ...(ctx.pendingFloorId
          ? {
              floorSelection: ctx.pendingFloorId
            }
          : {})
      });
      if (ctx.pendingFloorId && ctx.savedCameraPose) {
        message.properties.camera = ctx.savedCameraPose;
      } else if (ctx.pendingFloorId && ctx.pendingFloorId !== ctx.sceneProperties.floorSelection) {
        message.properties.camera = ctx.transformCameraPose(
          ctx.sceneProperties.floorCameras?.[ctx.pendingFloorId] || null,
          ctx.pendingFloorId
        );
      }
      ctx.idleRotation.activity();
      ctx.idleIconVisibility.activity();
      ctx.idleFocusExit.activity();
      const isCameraChanged =
        (ctx.isViewEditing && message.viewEditing !== true) ||
        JSON.stringify(ctx.config.camera) !== JSON.stringify(message.properties.camera);
      if (
        (ctx.focusMode || ctx.focusRestoreCameraPose || ctx.cameraTransition) &&
        (isCameraChanged ||
          // 材质风格与墙体透明度都会整体改变画面，和换楼层一样必须先退出聚焦，
          ctx.config.sceneStyle !== message.properties.sceneStyle ||
          ctx.config.wallOpacity !== message.properties.wallOpacity ||
          ctx.config.floorSelection !== message.properties.floorSelection ||
          ctx.isEditing !== (message.editing === true) ||
          message.viewEditing === true ||
          (ctx.isEditing && ctx.selectedId !== (message.selectedId || "")))
      ) {
        ctx.exitFocus({
          immediate: true
        });
        if (ctx.cameraTransition) {
          ctx.cameraTransition = null;
          ctx.stageOptions.finishFloorTransition?.();
          ctx.stageOptions.endCameraMotion();
        }
      }
      ctx.config = structuredClone(message.properties);
      ctx.isEditing = message.editing === true;
      ctx.isViewEditing = message.viewEditing === true;
      // 导航位置调整态：平时由 navigation-editing 轻量消息设置，这里跟随 config 兜一次
      ctx.navigationEditing = message.navigationEditing === true;
      ctx.selectedId = message.selectedId || "";
      // config 携带的是全量状态，直接整份替换；增量合并只发生在 states 消息。
      ctx.statesByEntityId = message.states || ({} as AnyObj);
      ctx.isEditorCanvas = message.editorCanvas === true && !ctx.isEditing;
      // 材质风格同时落在 body 上：3D 舞台之外的宿主 UI（弹窗、灯控面板等）
      if (document.body?.dataset) {
        document.body.dataset.sceneStyle =
          ctx.config.sceneStyle === "warm-wood" ? "warm-wood" : "default";
      }
      // 配置整份替换后，空调状态也跟着变了：先把「上次使用的模式」补齐。
      ctx.observeAllClimates();
      // 第二个参数带上整份配置：背景控制器据此判断是否切到暖阳、是否停掉动态背景。
      ctx.backgroundTheme.configure(ctx.config.backgroundTheme, ctx.config);
      ctx.isInteractive = !ctx.isEditing && message.interactive === true;
      ctx.editingVacuumId = message.editingVacuumId || "";
      ctx.configuredModules = ctx.configuredModuleKinds(ctx.config);
      let nextModule = ctx.isEditing
        ?           [
            "security",
            "climate",
            "cover",
            "temperature-humidity",
            "nas",
            "television",
            "vacuum",
            "vacuum-shortcut",
            // 通用设备：编辑器把 editingModule 设成品类名（fridge / plant / …），
            ...GENERIC_DEVICE_KINDS
          ].includes(message.editingModule)
          ? message.editingModule
          : "light"
        : // 展示态：模块 / 品类 → 它所属的页签。这份映射与页签清单同源
          // （core/stage/module-tabs.js），别再就地抄一份 —— 两份漂移时症状同样是
          // 「页面切过去了、页签看着没选中」，且浏览器零报错。
          moduleTabOf(ctx.activeModule);
      if (!ctx.isEditing && nextModule !== "overview" && !ctx.configuredModules.includes(nextModule)) {
        nextModule = "light";
      }
      if (ctx.pendingModule && !ctx.configuredModules.includes(ctx.pendingModule)) {
        ctx.pendingModule = "";
      }
      if (ctx.activeModule !== nextModule) {
        ctx.stopVacuumFollow();
        ctx.exitFocus({
          immediate: true
        });
        ctx.cancelModuleTransition();
        ctx.activeModule = nextModule;
        ctx.markerPointsById.clear();
      }
      for (const pendingLightRequest of ctx.lightRequestsById.values()) {
        if (
          pendingLightRequest.next &&
          (!ctx.isInteractive ||
            !(ctx.config.lights || []).some(
              (pendingLightEntry: any) => pendingLightEntry.entityId === pendingLightRequest.entityId
            ))
        ) {
          ctx.lightPreview.reject(pendingLightRequest.entityId, pendingLightRequest.next.previewToken);
          pendingLightRequest.next = null;
        }
      }
      ctx.applyPageBehavior();
      ctx.updateIdleControllers();
      ctx.stageOptions.appearance(
        ctx.isRangeEditorOpen
          ? {
              ...ctx.config,
              lightRegionOverrides: ctx.stageOptions.regionLighting.getOverrides()
            }
          : ctx.config
      );
      const activeFloorId =
        ctx.stageOptions.document.floors.some(
          (activeFloorEntry: any) => activeFloorEntry.id === ctx.config.floorSelection
        ) || ctx.config.floorSelection === "all"
          ? ctx.config.floorSelection
          : ctx.stageOptions.document.floors[0].id;
      if (!ctx.isEditing && activeFloorId === "all") {
        ctx.activeModule = "overview";
      }
      if (ctx.currentFloorId !== activeFloorId) {
        ctx.stopVacuumFollow(false);
        ctx.currentFloorId = activeFloorId;
        ctx.stageOptions.setFloor(activeFloorId);
        ctx.stageOptions.restoreCamera(
          ctx.constrainCameraPose(ctx.config.camera || ctx.stageOptions.floorDefaultCamera?.(activeFloorId))
        );
        ctx.savedCameraPose = ctx.stageOptions.cameraState();
      } else if (isCameraChanged) {
        ctx.stageOptions.restoreCamera(ctx.constrainCameraPose(ctx.config.camera || ctx.savedCameraPose));
        ctx.savedCameraPose = ctx.stageOptions.cameraState();
      }
      ctx.syncCameraInteraction();
      ctx.toolbarElement.hidden = true;
      ctx.updatePanelChrome();
      if (ctx.isViewEditing || (!ctx.isEditing && !ctx.isInteractive)) {
        ctx.exitFocus({
          immediate: true
        });
      }
      ctx.renderMarkers();
      // 记录本次配置的代次；下面的呈现等待只在代次未被超越时回报结果，
      const configRevision = ++ctx.configRevisionCount;
      (ctx.isPresented ? Promise.resolve() : ctx.stageOptions.whenPresented())
        .then(() => {
          if (!ctx.isDisposed && configRevision === ctx.configRevisionCount) {
            ctx.isPresented = true;
            ctx.updateIdleControllers();
            ctx.updateMarkerPositions(true);
            ctx.postToHost({
              type: "presented",
              configId: message.configId,
              camera: ctx.transformCameraPose(ctx.stageOptions.cameraState(), ctx.config.floorSelection, true)
            });
          }
        })
        .catch((presentationFailure: any) => {
          if (!ctx.isDisposed && configRevision === ctx.configRevisionCount) {
            ctx.postToHost({
              type: "error",
              message: presentationFailure.message || "户型画面准备失败，请重新载入。"
            });
          }
        });
    } else if (message.type === "vacuum-room-result") {
      clearTimeout(ctx.vacuumRoomTimersById.get(message.id));
      ctx.vacuumRoomTimersById.delete(message.id);
      const roomMarker = ctx.markersById.get(message.id);
      if (roomMarker) {
        roomMarker.disabled = false;
        roomMarker.title = message.error || "";
      }
      if (message.error) {
        ctx.moduleEmptyElement.hidden = false;
        ctx.moduleEmptyElement.textContent = message.error;
      }
    } else if (message.type === "range-editor") {
      if (message.flush === true) {
        const rangeEditorBlockedReason =
          !ctx.isRangeEditingAllowed || !ctx.isRangeEditorOpen ? "请先打开照射范围编辑。" : "";
        if (!rangeEditorBlockedReason) {
          ctx.rangeEditor.flush();
        }
        ctx.postToHost({
          type: "range-editor-state",
          active: ctx.isRangeEditorOpen,
          requestId: message.requestId,
          ...(rangeEditorBlockedReason
            ? {
                error: rangeEditorBlockedReason
              }
            : {})
        });
      } else if (message.open === false) {
        ctx.isRangeEditorBusy = !!message.requestId;
        try {
          ctx.rangeEditor?.close();
        } finally {
          ctx.isRangeEditorBusy = false;
        }
        if (message.requestId) {
          ctx.postToHost({
            type: "range-editor-state",
            active: false,
            requestId: message.requestId
          });
        }
      } else {
        ctx.openRangeEditor(message.requestId);
      }
    } else if (message.type === "range-save-result") {
      ctx.rangeEditor?.setSaveStatus?.(message.error || "");
    } else if (message.type === "activity-state") {
      ctx.hasActivityState = true;
      ctx.isPageVisible = message.visible === true;
      ctx.isPresentedVisible =
        message.presentedVisible === undefined ? ctx.isPageVisible : message.presentedVisible === true;
      ctx.stageOptions.setPresentedVisible?.(ctx.isPresentedVisible);
      ctx.syncVacuumMaps();
      if (!ctx.isPageVisible) {
        ctx.hasUserInteracted = false;
      }
      ctx.updateIdleControllers();
    } else if (message.type === "user-activity") {
      ctx.hasUserInteracted = false;
      ctx.lastActivityTimestamp = performance.now();
      ctx.updateMarkerVisibility();
      ctx.isActivityHeld = message.held === true;
      ctx.updateActivityHolds();
    } else if (message.type === "dismiss-focus") {
      ctx.idleRotation.activity();
      ctx.idleIconVisibility.activity();
      ctx.exitFocus({
        immediate: message.immediate === true
      });
    } else if (message.type === "states") {
      ctx.statesByEntityId =
        message.patch === true
          ? {
              ...ctx.statesByEntityId,
              ...(message.states || ({} as AnyObj))
            }
          : message.states || ({} as AnyObj);
      // 状态更新是记录「上次使用的模式」的主要时机，必须放在灯光 reconcile 之前，
      ctx.observeAllClimates();
      for (const reconciledLightEntry of ctx.config.lights || []) {
        if (
          message.patch !== true ||
          Object.hasOwn(message.states || ({} as AnyObj), reconciledLightEntry.entityId)
        ) {
          ctx.lightPreview.reconcile(
            reconciledLightEntry.entityId,
            ctx.readLightState(reconciledLightEntry.entityId)
          );
        }
      }
      ctx.renderMarkers();
    } else if (message.type === "control-result") {
      if (ctx.televisionRequestsById.has(message.requestId)) {
        ctx.settleTelevisionRequest(message.requestId, message.error);
      } else if (ctx.coverRequestsById.has(message.requestId)) {
        ctx.settleCoverRequest(message.requestId, message.error);
      } else if (ctx.climateRequestsById.has(message.requestId)) {
        ctx.settleClimateRequest(message.requestId, message.error);
      } else if (ctx.deviceRequestsById.has(message.requestId)) {
        ctx.settleDeviceRequest(message.requestId, message.error);
      } else {
        ctx.settleLightCommand(message.requestId, message.error || "", message.timedOut === true);
      }
    } else if (message.type === "editor-command" && ctx.isEditing) {
      try {
        if (message.command === "presence-top-view") {
          const { floorId: topViewFloorId, box: topViewBox } = message.value || ({} as AnyObj);
          if (
            !topViewBox ||
            ![topViewBox.x, topViewBox.y, topViewBox.w, topViewBox.h].every(Number.isFinite) ||
            topViewBox.w <= 0 ||
            topViewBox.h <= 0
          ) {
            throw new Error("顶视图范围无效。");
          }
          const topViewCenter = ctx.stageOptions.worldPoint(
            topViewFloorId,
            topViewBox.x + topViewBox.w / 2,
            topViewBox.y + topViewBox.h / 2,
            0
          );
          const topViewMin = ctx.stageOptions.worldPoint(topViewFloorId, topViewBox.x, topViewBox.y, 0);
          const topViewMax = ctx.stageOptions.worldPoint(
            topViewFloorId,
            topViewBox.x + topViewBox.w,
            topViewBox.y + topViewBox.h,
            0
          );
          if (!topViewCenter || !topViewMin || !topViewMax) {
            throw new Error("请选择有效楼层。");
          }
          const topViewFrameSize = Math.max(
            Math.abs(topViewMax.z - topViewMin.z),
            Math.abs(topViewMax.x - topViewMin.x) /
              (ctx.canvasElement.clientWidth / Math.max(1, ctx.canvasElement.clientHeight))
          );
          ctx.exitFocus({
            immediate: true
          });
          ctx.stageOptions.restoreCamera({
            mode: "orthographic",
            view: "top",
            topRotation: 0,
            position: [
              topViewCenter.x,
              topViewCenter.y + Math.max(20, topViewFrameSize * 2),
              topViewCenter.z
            ],
            target: topViewCenter.toArray(),
            up: [0, 0, -1],
            zoom: 1,
            frameSize: topViewFrameSize
          });
        } else if (message.command === "presence-3d-view") {
          ctx.stageOptions.setCameraView?.("free");
          ctx.stageOptions.restoreCamera(
            ctx.config.camera || ctx.stageOptions.floorDefaultCamera?.(ctx.currentFloorId) || ctx.savedCameraPose
          );
        } else if (message.command === "presence-preview-walk") {
          ctx.isPresencePreviewWalk = message.value === true;
          ctx.syncPresenceScene();
        } else if (message.command === "presence-show-hit-range") {
          ctx.isPresenceHitRangeVisible = message.value === true;
          ctx.layoutPresenceHitBoxes();
        } else if (message.command === "edit-follow-camera") {
          const cameraBinding = ctx.findBinding(message.id);
          if (cameraBinding?.deviceKind !== "vacuum") {
            throw new Error("请选择扫地机。");
          }
          ctx.focusBinding(message.id, "edit", true);
          const cameraTarget =
            ctx.stageOptions.environmentModelPose(cameraBinding.floorId, cameraBinding.modelId)
              ?.center || ctx.stageOptions.cameraState().target;
          ctx.beginCameraTransition(
            cameraBinding.followCamera ||
              ctx.vacuumBirdCamera(ctx.config.camera || ctx.stageOptions.cameraState(), cameraTarget),
            false,
            true
          );
        } else if (message.command === "edit-light-camera") {
          ctx.focusBinding(message.id, "edit", true);
        } else if (message.command === "preview-light-camera") {
          ctx.focusBinding(message.id, "preview");
        } else if (message.command === "preview-device-panel") {
          // 编辑器「实时预览弹窗」：只按面板模式打开该绑定的弹窗，不动相机、不发设备指令。
          ctx.focusBinding(message.id, "panel");
        } else if (message.command === "preview-light-effect") {
          if (
            ![
              "brightnessMin",
              "brightnessMax",
              "temperatureMin",
              "temperatureMax",
              "defaults"
            ].includes(message.value)
          ) {
            throw new Error("请选择要预览的效果。");
          }
          if (!ctx.findBinding(message.id)) {
            throw new Error("灯光按钮已移除。");
          }
          if (!ctx.findBinding(message.id).entityId) {
            throw new Error("请先绑定实体，再预览灯光效果。");
          }
          ctx.focusBinding(message.id, "preview");
          ctx.lightEffectPreview = {
            id: message.id,
            kind: message.value
          };
          ctx.applyLightStates({
            preview: true
          });
          ctx.renderLightPanel();
        } else if (message.command === "cancel-light-camera") {
          ctx.exitFocus({
            immediate: true
          });
        } else {
          if (ctx.focusMode !== "edit" || message.id !== ctx.focusedId) {
            throw new Error(
              ctx.activeModule === "nas"
                ? "请先调整这台NAS的聚焦视角。"
                : ctx.activeModule === "cover"
                  ? "请先调整这幅窗帘的聚焦视角。"
                  : ctx.activeModule === "climate"
                    ? "请先调整这台空调的聚焦视角。"
                    : ctx.activeModule === "temperature-humidity"
                      ? "请先调整这个温湿度计的聚焦视角。"
                      : "请先调整这盏灯的聚焦视角。"
            );
          }
          if (message.command === "focus-projection") {
            ctx.stageOptions.setCameraProjection(message.value);
          }
          if (message.command === "focus-focal-length") {
            ctx.stageOptions.setCameraFocalLength(message.value);
          }
        }
        ctx.syncCameraInteraction();
        const cameraSnapshot = ctx.currentCameraSnapshot();
        ctx.postToHost({
          type: "edit",
          action: "focus-camera",
          requestId: message.requestId,
          id: message.id,
          camera: cameraSnapshot
        });
        if (message.command === "save-light-camera") {
          ctx.exitFocus({
            immediate: true
          });
        }
      } catch (editorCommandError: any) {
        ctx.postToHost({
          type: "edit",
          action: "focus-camera",
          requestId: message.requestId,
          error: editorCommandError.message
        });
      }
    } else if (message.type === "editor-command" && ctx.isViewEditing) {
      if (message.command === "projection") {
        ctx.stageOptions.setCameraProjection(message.value);
      }
      if (message.command === "focal-length") {
        ctx.stageOptions.setCameraFocalLength(message.value);
      }
      ctx.syncCameraInteraction();
      if (message.command === "save-camera" || message.requestId) {
        ctx.postToHost({
          type: "edit",
          action: "camera",
          requestId: message.requestId,
          camera: ctx.currentCameraSnapshot()
        });
      }
    }
  }

  /**
   * 应用一次场景（户型 / 模型）替换。
   */
  async function applySceneUpdate(sceneUpdate: any) {
    const previousScene = ctx.stageOptions.savedScene;
    const currentCameraPose = ctx.currentCameraSnapshot();
    ctx.hasUserInteracted =
      ctx.hasUserInteracted ||
      (ctx.hasIdleReturnPending && ctx.pageBehavior.hideIconsWhileRotating === true) ||
      ctx.areIdleIconsHidden;
    ctx.isSceneUpdating = true;
    ctx.idleRotation.activity();
    ctx.updateMarkerVisibility();
    // 先占位成空函数：coverSceneUpdate() 本身可能抛错，此时 finally 仍会调用它，
    let releaseSceneUpdate = () => {};
    // 「模型已经真的换过」。这个标志决定失败后要不要回滚，因此只能在
    let didReplaceScene = false;
    // 真正执行替换：换模型 → 同步楼层 / 外观 → 重算配置与标记。
    const replaceScene = async (nextSceneUpdate: any) => {
      ctx.stageOptions.finishFloorTransition?.();
      await ctx.stageOptions.replaceScene(nextSceneUpdate);
      // 换模型这一步已经成功，从此刻起失败才需要回滚。
      didReplaceScene = true;
      if (ctx.isDisposed) {
        return;
      }
      ctx.stageOptions.setFloorGap?.(ctx.sceneProperties.floorGap);
      ctx.stageOptions.setUniformOverviewStack?.(ctx.sceneProperties.uniformOverviewStack);
      ctx.config = ctx.normalizeSceneConfig({
        ...ctx.sceneProperties,
        ...(ctx.pendingFloorId
          ? {
              floorSelection: ctx.pendingFloorId
            }
          : {})
      });
      const updateActiveFloorId =
        ctx.stageOptions.document.floors.some(
          (updateFloorEntry: any) => updateFloorEntry.id === ctx.config.floorSelection
        ) || ctx.config.floorSelection === "all"
          ? ctx.config.floorSelection
          : ctx.stageOptions.document.floors[0].id;
      ctx.currentFloorId = updateActiveFloorId;
      ctx.stageOptions.setFloor(updateActiveFloorId);
      ctx.stageOptions.appearance(ctx.config);
      ctx.savedCameraPose = ctx.transformCameraPose(
        ctx.sceneProperties.floorCameras?.[updateActiveFloorId] ||
          ctx.sceneProperties.camera ||
          currentCameraPose,
        updateActiveFloorId
      );
      ctx.stageOptions.restoreCamera(ctx.transformCameraPose(currentCameraPose, updateActiveFloorId));
      ctx.applyLightStates({
        immediate: true
      });
      await ctx.stageOptions.whenPresented();
    };
    try {
      releaseSceneUpdate = ctx.stageOptions.coverSceneUpdate();
      ctx.stageOptions.setCameraInteraction({
        enabled: false
      });
      await replaceScene(sceneUpdate);
      if (!ctx.isDisposed) {
        ctx.postToHost({
          type: "model-metadata",
          metadata: ctx.buildMetadata()
        });
      }
    } catch (sceneUpdateError) {
      if (didReplaceScene && !ctx.isDisposed) {
        try {
          await replaceScene(previousScene);
        } catch (rollbackError) {
          // 回滚自己也失败时不能再往外抛：那样 throw sceneUpdateError 永远走不到，
          console.error("场景替换失败后回滚也失败，已保留最初的错误。", rollbackError);
        }
      }
      throw sceneUpdateError;
    } finally {
      releaseSceneUpdate();
      ctx.isSceneUpdating = false;
      ctx.markerPointsById.clear();
      if (!ctx.isDisposed && (ctx.syncCameraInteraction(), ctx.renderMarkers(), ctx.queuedConfigMessage)) {
        const queuedSceneUpdate = ctx.queuedConfigMessage;
        ctx.queuedConfigMessage = null;
        handleHostMessage(queuedSceneUpdate);
      }
    }
  }
  return { applySceneUpdate, handleHostMessage };
}
