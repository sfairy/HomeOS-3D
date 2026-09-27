/*
 * 输入活动与空闲行为。
 */
export function createInputActivity(ctx) {
  // 记录用户活动：刷新最后活动时间戳；ESC 顺便退出扫地机跟随视角。
  function trackUserInput(inputEvent) {
    if (ctx.followedVacuumId && inputEvent.key === "Escape") {
      ctx.stopVacuumFollow();
    }
    ctx.lastActivityTimestamp = performance.now();
    ctx.hasUserInteracted = false;
    ctx.updateMarkerVisibility();
    if (inputEvent.type === "pointerdown") {
      ctx.activePointerIds.add(inputEvent.pointerId);
    }
    if (inputEvent.type === "pointerup" || inputEvent.type === "pointercancel") {
      ctx.activePointerIds.delete(inputEvent.pointerId);
    }
    if (inputEvent.type === "keydown") {
      ctx.pressedKeys.add(inputEvent.code || inputEvent.key);
    }
    if (inputEvent.type === "keyup") {
      ctx.pressedKeys.delete(inputEvent.code || inputEvent.key);
    }
    updateActivityHolds();
  }

  function clearInputState() {
    ctx.activePointerIds.clear();
    ctx.pressedKeys.clear();
    ctx.isActivityHeld = false;
    updateActivityHolds();
  }

  // 只要有指针按下或按键未松开就保持「活动中」，暂停空闲旋转与隐藏。
  function updateActivityHolds() {
    const isHeld = ctx.isActivityHeld || ctx.activePointerIds.size > 0 || ctx.pressedKeys.size > 0;
    ctx.idleRotation.hold(isHeld);
    ctx.idleIconVisibility.hold(isHeld);
    ctx.idleFocusExit.hold(isHeld);
    ctx.wakeFrameLoop();
  }

  // 把页面行为（自动旋转、空闲隐藏图标、空闲退出聚焦）下发给三个空闲控制器。
  function applyPageBehavior() {
    ctx.pageBehavior = ctx.resolvePageBehavior(ctx.config, ctx.activeModule);
    ctx.idleRotation.configure(ctx.pageBehavior.autoRotate);
    ctx.idleIconVisibility.configure(ctx.pageBehavior.idleHideIcons);
    ctx.idleFocusExit.configure(ctx.pageBehavior.idleExitFocus);
    ctx.syncCameraInteraction();
    if (!ctx.pageBehavior.hideIconsWhileRotating) {
      ctx.areIconsHiddenByRotation = false;
      ctx.idleIconHideDeadline = 0;
    }
  }

  // 统一开关空闲控制器：只有已呈现、页面可见、可交互且行为允许时才启用。
  function updateIdleControllers() {
    const canAnimate =
      ctx.isPresented &&
      ctx.isPageVisible &&
      ctx.isInteractive &&
      !ctx.isEditing &&
      !ctx.isViewEditing &&
      !ctx.isRangeEditorOpen &&
      !document.hidden &&
      !ctx.isDisposed;
    if (!canAnimate) {
      clearInputState();
    }
    ctx.idleRotation.setAvailable(
      canAnimate &&
        !ctx.followedVacuumId &&
        !ctx.focusedId &&
        !ctx.focusMode &&
        (!ctx.cameraTransition || ctx.cameraTransition.owner === "idle")
    );
    ctx.idleFocusExit.setAvailable(
      canAnimate && !!ctx.focusedId && ["runtime", "panel"].includes(ctx.focusMode) && !ctx.cameraTransition
    );
    ctx.idleIconVisibility.setAvailable(canAnimate);
    ctx.frameLoop?.setAvailable(!document.hidden && (!ctx.hasActivityState || ctx.isPresentedVisible));
    if (document.hidden || !ctx.isPresentedVisible) {
      ctx.backgroundTheme.suspend();
    }
    ctx.wakeFrameLoop();
  }
  return { applyPageBehavior, clearInputState, trackUserInput, updateActivityHolds, updateIdleControllers };
}
