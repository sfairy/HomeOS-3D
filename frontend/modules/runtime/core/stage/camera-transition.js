/*
 * 相机过渡与跟随。
 *
 * 聚焦/楼层切换的相机过渡推进、相机交互开关，以及扫地机跟随视角。
 *
 * 由 core/stage.js 的 mountStage 外提而来：这里只放函数，对外部状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 stage.js 里的 getter/setter，读到的始终是调用时刻的值。
 */
export function createCameraTransition(ctx) {
  /**
   * 启动一次相机过渡。
   */
  function beginCameraTransition(
    targetCameraPose,
    focused,
    immediateTransition = false,
    onTransitionDone,
    transitionOwner = "focus",
    floorFrame = null
  ) {
    const transitionTargetPose =
      transitionOwner === "follow-return"
        ? targetCameraPose
        : ctx.constrainCameraPose(targetCameraPose);
    const transitionFromPose = ctx.stageOptions.beginCameraMotion(
      transitionTargetPose.mode,
      transitionTargetPose,
      transitionOwner
    );
    if (transitionOwner === "floor") {
      ctx.stageOptions.setFloorSlideCameras?.(transitionFromPose, transitionTargetPose);
    }
    const isImmediate =
      immediateTransition || ctx.prefersReducedMotionNow();
    ctx.cameraTransition = {
      from: transitionFromPose,
      to: structuredClone(transitionTargetPose),
      inset: ctx.focusViewportInset,
      targetInset: focused ? ctx.computePanelInsetRatio() : 0,
      transition: ctx.createDampedCameraMotion(ctx.THREE, transitionFromPose, transitionTargetPose, {
        immediate: isImmediate,
        owner: transitionOwner,
        floorFrame: floorFrame
      }),
      focused: focused,
      owner: transitionOwner,
      started: performance.now(),
      done: onTransitionDone
    };
    ctx.updateIdleControllers();
    syncCameraInteraction();
    advanceCameraTransition(ctx.cameraTransition.started);
    ctx.wakeFrameLoop();
  }

  // 推进相机过渡动画，由渲染循环每帧调用。
  function advanceCameraTransition(transitionTimestamp) {
    if (!ctx.cameraTransition) {
      return;
    }
    const activeCameraTransition = ctx.cameraTransition;
    const elapsedMs = Math.max(0, transitionTimestamp - ctx.cameraTransition.started);
    const transitionProgress = ctx.cameraTransition.transition.progress(elapsedMs);
    // 记下当前进度：楼层过渡末段允许用户按下即接管相机（见 canvas 的 pointerdown），
    // 那个判断读的必须是本帧刚算出的值。
    ctx.cameraTransition.amount = transitionProgress;
    ctx.focusViewportInset =
      ctx.cameraTransition.inset +
      (ctx.cameraTransition.targetInset - ctx.cameraTransition.inset) * transitionProgress;
    const transitionPose = ctx.cameraTransition.transition.sample(elapsedMs);
    if (ctx.cameraTransition.owner === "floor") {
      ctx.stageOptions.advanceFloorTransition?.(transitionProgress, transitionPose);
    }
    if (ctx.stageOptions.applyCameraFrame) {
      ctx.stageOptions.applyCameraFrame(transitionPose, transitionProgress, ctx.focusViewportInset);
    } else {
      ctx.stageOptions.applyCameraPose(transitionPose, transitionProgress);
      ctx.stageOptions.setFocusViewport(ctx.focusViewportInset);
    }
    if (
      ctx.cameraTransition.owner === "floor" &&
      transitionProgress >= 0.9 &&
      !ctx.cameraTransition.presentationRevealed
    ) {
      ctx.cameraTransition.presentationRevealed = true;
      ctx.renderStage();
    }
    if (
      ctx.cameraTransition.owner === "floor" &&
      transitionProgress >= 0.9 &&
      !ctx.cameraTransition.markersRevealed
    ) {
      ctx.cameraTransition.markersRevealed = true;
      ctx.updateMarkerVisibility();
      ctx.updateMarkerPositions(true);
    }
    if (
      ctx.cameraTransition.transition.settled(elapsedMs) &&
      ctx.cameraTransition === activeCameraTransition
    ) {
      ctx.cameraTransition = null;
      ctx.stageOptions.endCameraMotion();
      syncCameraInteraction();
      activeCameraTransition.done?.();
      ctx.updateIdleControllers();
    }
  }

  // 同步相机交互控制权：范围编辑器打开时交给它，本次直接返回。
  function syncCameraInteraction() {
    if (ctx.isRangeEditorOpen && ctx.rangeEditor?.syncCameraInteraction) {
      ctx.rangeEditor.syncCameraInteraction();
      return;
    }
    if (ctx.isRangeEditorOpen || ctx.followedVacuumId) {
      ctx.stageOptions.setCameraInteraction({
        enabled: false,
        panEnabled: false,
        zoomEnabled: false
      });
      return;
    }
    const cameraConfig = {
      ...ctx.config.camera,
      ...ctx.resolvePageBehavior(ctx.config, ctx.activeModule).interaction
    };
    const isFreeInteraction =
      ctx.isViewEditing || ctx.focusMode === "edit" || (ctx.isEditing && !ctx.focusMode && !ctx.cameraTransition);
    ctx.stageOptions.setCameraInteraction({
      enabled:
        !ctx.markerDragState &&
        (isFreeInteraction ||
          (ctx.isInteractive &&
            (!ctx.focusMode || ctx.focusMode === "panel") &&
            !ctx.cameraTransition &&
            !ctx.isIdleRotating)),
      rotationMode: isFreeInteraction ? "free" : cameraConfig.rotationMode,
      panEnabled: isFreeInteraction,
      zoomEnabled: isFreeInteraction
    });
  }

  /**
   * 聚焦到某个绑定：选中它、把相机推到其 focusCamera 姿态，并按需打开设备面板。
   */
  function focusBinding(focusId, focusModeName = "runtime", immediateFocus = false) {
    const focusedBinding = ctx.findBinding(focusId);
    if (!focusedBinding || focusedBinding.modelAvailable === false) {
      return;
    }
    if (ctx.lightEffectPreview) {
      ctx.lightEffectPreview = null;
      ctx.applyLightStates();
    }
    if (ctx.focusedId === focusId && ctx.focusMode === focusModeName && focusModeName === "runtime") {
      ctx.exitFocus();
      return;
    }
    if (["runtime", "panel"].includes(focusModeName) && (!ctx.isInteractive || ctx.isOverviewMode())) {
      return;
    }
    ctx.idleFocusExit.activity();
    if (focusModeName === "panel") {
      if (ctx.focusRestoreCameraPose || ctx.cameraTransition) {
        ctx.exitFocus({
          immediate: true
        });
      }
      ctx.focusedId = focusId;
      ctx.focusMode = "panel";
      ctx.controlErrorElement.textContent = "";
      ctx.lightPanelElement.removeAttribute("inert");
      ctx.lightPanelElement.classList.add("is-open");
      ctx.updatePanelChrome();
      ctx.renderLightPanel();
      syncCameraInteraction();
      ctx.updateIdleControllers();
      ctx.postToHost({
        type: "focus-state",
        active: false,
        panelOpen: true,
        id: focusId
      });
      ctx.maybeOpenDevicePopup(focusedBinding);
      return;
    }
    ctx.focusRestoreCameraPose ||= ctx.stageOptions.cameraState(true);
    const focusAnchor =
      focusedBinding.deviceKind === "presence"
        ? ctx.presenceScene.anchor(focusedBinding.id.slice(9))
        : focusedBinding.modelId
          ? ctx.stageOptions.environmentModelPose?.(focusedBinding.floorId, focusedBinding.modelId)
          : null;
    const focusTarget =
      focusAnchor?.center ||
      ctx.stageOptions
        .worldPoint(
          focusedBinding.floorId,
          focusedBinding.x,
          focusedBinding.y,
          focusedBinding.height
        )
        ?.toArray();
    if (!focusTarget) {
      return;
    }
    ctx.focusedId = focusId;
    ctx.focusMode = focusModeName;
    ctx.controlErrorElement.textContent = "";
    if (ctx.isEditing || !ctx.isFocusableDevice(focusedBinding) || focusedBinding.clickAction !== "focus") {
      ctx.lightPanelElement.removeAttribute("inert");
      ctx.lightPanelElement.classList.add("is-open");
    } else {
      ctx.lightPanelElement.setAttribute("inert", "");
      ctx.lightPanelElement.classList.remove("is-open");
    }
    ctx.stageOptions.setOrbitPivot(null);
    ctx.updatePanelChrome();
    ctx.renderLightPanel();
    const baseCameraPose = ctx.config.camera || ctx.savedCameraPose || ctx.focusRestoreCameraPose;
    const focusPose =
      focusedBinding.focusCamera ||
      (focusedBinding.modelId
        ? ctx.automaticAirConditionerCamera(
            ctx.THREE,
            {
              ...baseCameraPose,
              viewportAspect: ctx.canvasElement.clientWidth / Math.max(1, ctx.canvasElement.clientHeight)
            },
            focusTarget,
            focusAnchor?.forward,
            focusAnchor?.size,
            focusedBinding.deviceKind === "nas"
              ? {
                  minimumFrameSize: 0.7,
                  minimumDistance: 0.6
                }
              : {}
          )
        : ctx.automaticLightCamera(ctx.THREE, baseCameraPose, focusTarget));
    if (!ctx.isEditing) {
      ctx.postToHost({
        type: "focus-state",
        active: true,
        id: focusId
      });
    }
    beginCameraTransition(focusPose, true, immediateFocus, () => {
      if (focusedBinding.deviceKind !== "camera") {
        ctx.maybeOpenDevicePopup(focusedBinding);
      }
    });
    if (focusedBinding.deviceKind === "camera") {
      ctx.maybeOpenDevicePopup(focusedBinding);
    }
  }

  // 每帧推进跟随相机：目标点取扫地机世界坐标再抬高 0.05 米，
  // 否则相机会贴地、被机身自己挡住。
  function updateVacuumFollow(deltaSeconds) {
    if (!ctx.followedVacuumId) {
      return;
    }
    const followWorldPosition = ctx.vacuumMotion.worldPosition(ctx.followedVacuumId);
    // 需要绑定的 floorId / modelId 才能查模型锚点：相机取景对准房间里的模型，
    // 而不是只盯着机体自身坐标。
    const followedVacuumBinding = (ctx.config.devices?.vacuums || []).find(
      followedVacuum => followedVacuum.id === ctx.followedVacuumId
    );
    if (!followWorldPosition || !followedVacuumBinding) {
      stopVacuumFollow();
      return;
    }
    const followAnchorCenter = ctx.stageOptions.environmentModelPose(
      followedVacuumBinding.floorId,
      followedVacuumBinding.modelId
    )?.center;
    // 取景点优先用模型锚点中心（相机看向房间整体）；模型尚未就绪时退回机体世界坐标。
    // 统一抬高 0.05 米：地板高度处相机会贴地并被机身自己遮挡。
    const followRevealTarget = (
      followAnchorCenter ? new ctx.THREE.Vector3(...followAnchorCenter) : followWorldPosition.clone()
    ).add(new ctx.THREE.Vector3(0, 0.05, 0));
    const followPose = ctx.vacuumFollowPose(ctx.followCameraPose, followRevealTarget.toArray());
    const followCameraTarget = new ctx.THREE.Vector3(...followPose.position);
    ctx.vacuumFollowCamera.reveal(
      ctx.stageOptions,
      followedVacuumBinding,
      followRevealTarget,
      followCameraTarget
    );
    ctx.stageOptions.setFocusViewport(0);
    ctx.stageOptions.applyCameraPose(followPose);
  }

  /**
   * 退出扫地机跟随视角。
   */
  function stopVacuumFollow(restoreCamera = true) {
    if (!ctx.followedVacuumId) {
      return;
    }
    const previousCameraState = ctx.preFollowCameraState;
    ctx.followedVacuumId = "";
    ctx.preFollowCameraState = null;
    ctx.followCameraPose = null;
    ctx.vacuumFollowCamera.reset();
    ctx.postToHost({
      type: "vacuum-follow-state",
      active: false
    });
    ctx.followButton.textContent = "跟随漫游";
    ctx.followButton.setAttribute("aria-pressed", "false");
    ctx.stageOptions.endCameraMotion();
    if (restoreCamera && previousCameraState) {
      beginCameraTransition(
        previousCameraState,
        false,
        false,
        () => ctx.stageOptions.restoreCamera(previousCameraState),
        "follow-return"
      );
    }
    syncCameraInteraction();
    ctx.updateIdleControllers();
  }
  return { advanceCameraTransition, beginCameraTransition, focusBinding, stopVacuumFollow, syncCameraInteraction, updateVacuumFollow };
}
