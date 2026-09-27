/*
 * 相机过渡与跟随。
 */

type CameraPose = Record<string, unknown> & {
  mode?: string;
  position?: number[];
};

type BindingLike = {
  id?: string;
  modelAvailable?: boolean;
  deviceKind?: string;
  modelId?: string;
  floorId?: unknown;
  x?: number;
  y?: number;
  height?: unknown;
  focusCamera?: CameraPose;
  clickAction?: string;
  [key: string]: unknown;
};

type CameraTransitionState = {
  from: unknown;
  to: unknown;
  inset: number;
  targetInset: number;
  transition: {
    progress: (elapsedMs: number) => number;
    sample: (elapsedMs: number) => CameraPose;
    settled: (elapsedMs: number) => boolean;
  };
  focused: boolean;
  owner: string;
  started: number;
  done?: (() => void) | null;
  amount?: number;
  presentationRevealed?: boolean;
  markersRevealed?: boolean;
};

type CameraTransitionCtx = {
  constrainCameraPose: (pose: CameraPose) => CameraPose;
  stageOptions: {
    beginCameraMotion: (mode: unknown, pose: CameraPose, owner: string) => CameraPose;
    setFloorSlideCameras?: (from: CameraPose, to: CameraPose) => void;
    advanceFloorTransition?: (progress: number, pose: CameraPose) => void;
    applyCameraFrame?: (pose: CameraPose, progress: number, inset: number) => void;
    applyCameraPose: (pose: CameraPose, progress?: number) => void;
    setFocusViewport: (inset: number) => void;
    endCameraMotion: () => void;
    setCameraInteraction: (config: Record<string, unknown>) => void;
    cameraState: (absolute?: boolean) => CameraPose;
    setOrbitPivot: (pivot: unknown) => void;
    environmentModelPose?: (floorId: unknown, modelId: unknown) => { center?: number[]; forward?: unknown; size?: unknown } | null;
    worldPoint: (floorId: unknown, x: unknown, y: unknown, height: unknown) => { toArray: () => number[] } | null;
    restoreCamera: (pose: CameraPose) => void;
  };
  prefersReducedMotionNow: () => boolean;
  cameraTransition: CameraTransitionState | null;
  focusViewportInset: number;
  computePanelInsetRatio: () => number;
  createDampedCameraMotion: (THREE: unknown, from: CameraPose, to: CameraPose, options: Record<string, unknown>) => CameraTransitionState["transition"];
  THREE: {
    Vector3: new (...args: number[]) => {
      clone: () => { add: (v: unknown) => { toArray: () => number[] } };
      add: (v: unknown) => { toArray: () => number[] };
      toArray: () => number[];
    };
  };
  updateIdleControllers: () => void;
  wakeFrameLoop: () => void;
  renderStage: () => void;
  updateMarkerVisibility: () => void;
  updateMarkerPositions: (immediate?: boolean) => void;
  isRangeEditorOpen: boolean;
  rangeEditor?: { syncCameraInteraction?: () => void };
  followedVacuumId: string;
  config: {
    camera?: CameraPose;
    devices?: { vacuums?: Array<{ id?: string; floorId?: unknown; modelId?: unknown }> };
    [key: string]: unknown;
  };
  resolvePageBehavior: (config: unknown, module: unknown) => { interaction?: Record<string, unknown> };
  activeModule: unknown;
  isViewEditing: boolean;
  focusMode?: string | null;
  isEditing: boolean;
  markerDragState?: unknown;
  isInteractive: boolean;
  isIdleRotating: boolean;
  findBinding: (id: string) => BindingLike | null | undefined;
  lightEffectPreview: unknown;
  applyLightStates: () => void;
  focusedId?: string | null;
  exitFocus: (options?: { immediate?: boolean }) => void;
  isOverviewMode: () => boolean;
  idleFocusExit: { activity: () => void };
  focusRestoreCameraPose: CameraPose | null;
  controlErrorElement: { textContent: string };
  lightPanelElement: HTMLElement;
  updatePanelChrome: () => void;
  renderLightPanel: () => void;
  postToHost: (message: Record<string, unknown>) => void;
  maybeOpenDevicePopup: (binding: BindingLike) => void;
  presenceScene: { anchor: (id: string) => { center?: number[]; forward?: unknown; size?: unknown } | null };
  isFocusableDevice: (binding: BindingLike) => boolean;
  canvasElement: HTMLElement;
  automaticAirConditionerCamera: (...args: unknown[]) => CameraPose;
  automaticLightCamera: (...args: unknown[]) => CameraPose;
  savedCameraPose?: CameraPose;
  vacuumMotion: { worldPosition: (id: string) => { clone: () => { add: (v: unknown) => { toArray: () => number[] } } } | null };
  vacuumFollowPose: (pose: unknown, target: number[]) => CameraPose & { position: number[] };
  followCameraPose: unknown;
  vacuumFollowCamera: {
    reveal: (...args: unknown[]) => void;
    reset: () => void;
  };
  preFollowCameraState: CameraPose | null;
  followButton: HTMLElement;
};

export function createCameraTransition(ctx: CameraTransitionCtx) {
  /**
   * 启动一次相机过渡。
   */
  function beginCameraTransition(
    targetCameraPose: CameraPose,
    focused: boolean,
    immediateTransition = false,
    onTransitionDone?: (() => void) | null,
    transitionOwner = "focus",
    floorFrame: unknown = null
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
  function advanceCameraTransition(transitionTimestamp: number) {
    if (!ctx.cameraTransition) {
      return;
    }
    const activeCameraTransition = ctx.cameraTransition;
    const elapsedMs = Math.max(0, transitionTimestamp - ctx.cameraTransition.started);
    const transitionProgress = ctx.cameraTransition.transition.progress(elapsedMs);
    // 记下当前进度：楼层过渡末段允许用户按下即接管相机（见 canvas 的 pointerdown），
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
  function focusBinding(focusId: string, focusModeName = "runtime", immediateFocus = false) {
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
    // 「runtime / panel」两种模式在展示场景里要用户可交互才生效；编辑态是例外 ——
    if (
      !ctx.isEditing &&
      ["runtime", "panel"].includes(focusModeName) &&
      (!ctx.isInteractive || ctx.isOverviewMode())
    ) {
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
        ? ctx.presenceScene.anchor(String(focusedBinding.id || "").slice(9))
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
    // 摄像头 / 扫地机有宿主侧原生弹窗：与镜头过渡并行打开，别等阻尼飞完才出窗
    // （原先只有 camera 即时开，vacuum 默认 focus-panel 会卡一整段过渡，体感明显偏慢）。
    const opensHostDevicePopup =
      focusedBinding.deviceKind === "camera" || focusedBinding.deviceKind === "vacuum";
    beginCameraTransition(focusPose, true, immediateFocus, () => {
      if (!opensHostDevicePopup) {
        ctx.maybeOpenDevicePopup(focusedBinding);
      }
    });
    if (opensHostDevicePopup) {
      ctx.maybeOpenDevicePopup(focusedBinding);
    }
  }

  // 每帧推进跟随相机：目标点取扫地机世界坐标再抬高 0.05 米，
  function updateVacuumFollow(_deltaSeconds: number) {
    if (!ctx.followedVacuumId) {
      return;
    }
    const followWorldPosition = ctx.vacuumMotion.worldPosition(ctx.followedVacuumId);
    // 需要绑定的 floorId / modelId 才能查模型锚点：相机取景对准房间里的模型，
    const followedVacuumBinding = (ctx.config.devices?.vacuums || []).find(
      (followedVacuum: { id?: string }) => followedVacuum.id === ctx.followedVacuumId
    );
    if (!followWorldPosition || !followedVacuumBinding) {
      stopVacuumFollow();
      return;
    }
    const followAnchorCenter = ctx.stageOptions.environmentModelPose?.(
      followedVacuumBinding.floorId,
      followedVacuumBinding.modelId
    )?.center;
    // 取景点优先用模型锚点中心（相机看向房间整体）；模型尚未就绪时退回机体世界坐标。
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
