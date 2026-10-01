import { entityPowerIsOn, entityToggleCommand } from "./entity-power.js?v=20260818-airer-v1";
const switchDomainSet = new Set(["switch", "input_boolean", "light", "fan"]);
export function resolveSceneControlMode(controlMode, entityId = "") {
  return ["switch", "scene"].includes(controlMode)
    ? controlMode
    : switchDomainSet.has(entityId.split(".")[0])
      ? "switch"
      : "scene";
}
export function sceneModeState(stateEntityId, entityState, sceneControlMode) {
  const entityStateValue = entityState?.newState?.state ?? entityState?.state,
    isMomentary = resolveSceneControlMode(sceneControlMode, stateEntityId) === "scene";
  return {
    momentary: isMomentary,
    active: !isMomentary && entityPowerIsOn(stateEntityId, entityState),
    available:
      !!stateEntityId &&
      entityStateValue != null &&
      entityStateValue !== "unavailable" &&
      (isMomentary || entityStateValue !== "unknown"),
  };
}
export function sceneModeCommand(targetEntityId, stateRecord, entityControlMode) {
  const sceneState = sceneModeState(targetEntityId, stateRecord, entityControlMode);
  if (!sceneState.available) throw new Error("情景模式关联实体不可用。");
  const entityDomain = targetEntityId.split(".")[0];
  return !sceneState.momentary && ["climate", "media_player", "water_heater"].includes(entityDomain)
    ? {
        ...entityToggleCommand(targetEntityId, stateRecord),
        entityId: targetEntityId,
      }
    : {
        domain: entityDomain,
        service: ["button", "input_button"].includes(entityDomain)
          ? "press"
          : sceneState.momentary || !sceneState.active
            ? "turn_on"
            : "turn_off",
        entityId: targetEntityId,
      };
}
export function bindSceneMode(hostElement, navigationElement, component, sceneRuntime) {
  const componentProperties = component.properties || {},
    boundEntityId = component.bindings?.entity?.entityId || "",
    resolvedControlMode = resolveSceneControlMode(componentProperties.controlMode, boundEntityId);
  let boundEntityState = sceneRuntime.states?.get(boundEntityId),
    previewState = sceneRuntime.previewState || "auto",
    isBusy = false,
    isPulseActive = false,
    errorText = "",
    isDisposed = false,
    timeoutId = null;
  const runningAnimationSet = new Set(),
    clampUnitValue = (opacityValue, fallbackOpacity) =>
      Number.isFinite(Number(opacityValue))
        ? Math.max(0, Math.min(1, Number(opacityValue)))
        : fallbackOpacity,
    isAnimationEnabled = componentProperties.activationAnimation !== "none";
  hostElement.classList.toggle("has-animation", isAnimationEnabled);
  function syncSceneModeUi() {
    if (isDisposed) return;
    const currentSceneState = sceneModeState(boundEntityId, boundEntityState, resolvedControlMode),
      isActive =
        sceneRuntime.editable && previewState !== "auto"
          ? previewState === "on"
          : currentSceneState.available && (currentSceneState.active || isPulseActive);
    (navigationElement.classList.toggle("active", isActive),
      navigationElement.style.setProperty(
        "--navigation-text-opacity",
        String(
          clampUnitValue(
            isActive ? componentProperties.textActiveOpacity : componentProperties.textIdleOpacity,
            isActive ? 0.9 : 0.4,
          ),
        ),
      ),
      navigationElement.style.setProperty(
        "--navigation-icon-opacity",
        String(
          clampUnitValue(
            isActive ? componentProperties.iconActiveOpacity : componentProperties.iconIdleOpacity,
            isActive ? 0.9 : 0.3,
          ),
        ),
      ),
      (hostElement.dataset.state = currentSceneState.available
        ? currentSceneState.active
          ? "on"
          : "off"
        : "unavailable"),
      hostElement.setAttribute("aria-busy", String(isBusy)),
      hostElement.setAttribute(
        "aria-disabled",
        String(!currentSceneState.available || isBusy || !!sceneRuntime.editable),
      ),
      (hostElement.tabIndex = sceneRuntime.editable || !currentSceneState.available ? -1 : 0),
      currentSceneState.momentary
        ? hostElement.removeAttribute("aria-pressed")
        : hostElement.setAttribute("aria-pressed", String(currentSceneState.active)),
      hostElement.classList.toggle(
        "is-unavailable",
        !sceneRuntime.editable && !currentSceneState.available,
      ),
      (hostElement.title =
        errorText ||
        (boundEntityId
          ? currentSceneState.available
            ? ""
            : "关联实体不可用"
          : "请在编辑器中绑定实体")));
  }
  function playActivationAnimation() {
    if (!isAnimationEnabled || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      return;
    for (const runningAnimation of runningAnimationSet) runningAnimation.cancel();
    runningAnimationSet.clear();
    const iconElement = navigationElement.querySelector(".hb-navigation-icon");
    if (!iconElement?.animate) return;
    const iconAnimation = iconElement.animate(
      [
        {
          transform: "translate(-50%,-50%) scale(1)",
          offset: 0,
        },
        {
          transform: "translate(-50%,-50%) scale(.86)",
          offset: 0.18,
        },
        {
          transform: "translate(-50%,-50%) scale(1.09)",
          offset: 0.48,
        },
        {
          transform: "translate(-50%,-50%) scale(.98)",
          offset: 0.73,
        },
        {
          transform: "translate(-50%,-50%) scale(1)",
          offset: 1,
        },
      ],
      {
        duration: 460,
        easing: "ease-in-out",
      },
    );
    (runningAnimationSet.add(iconAnimation),
      iconAnimation.finished
        .catch(() => {})
        .finally(() => runningAnimationSet.delete(iconAnimation)));
  }
  async function handleSceneModeClick(clickEvent) {
    if (!sceneRuntime.editable && (clickEvent?.stopPropagation(), !(isBusy || isDisposed)))
      try {
        const sceneCommand = sceneModeCommand(boundEntityId, boundEntityState, resolvedControlMode);
        if (
          ((isBusy = true),
          (isPulseActive = false),
          (errorText = ""),
          clearTimeout(timeoutId),
          hostElement.classList.remove("is-error"),
          syncSceneModeUi(),
          playActivationAnimation(),
          await sceneRuntime.callEntityService(
            sceneCommand.domain,
            sceneCommand.service,
            sceneCommand.entityId,
            sceneCommand.data || {},
          ),
          isDisposed)
        )
          return;
        sceneModeState(boundEntityId, boundEntityState, resolvedControlMode).momentary &&
          isAnimationEnabled &&
          ((isPulseActive = true),
          (timeoutId = setTimeout(() => {
            ((isPulseActive = false), syncSceneModeUi());
          }, 700)));
      } catch (commandError) {
        isDisposed ||
          (hostElement.classList.add("is-error"),
          (errorText = commandError.message || "情景模式触发失败"),
          sceneRuntime.onError?.(commandError));
      } finally {
        isDisposed || ((isBusy = false), syncSceneModeUi());
      }
  }
  hostElement.addEventListener("click", handleSceneModeClick);
  const sceneModeController = {
    update(nextEntityState, nextPreviewState = previewState) {
      ((boundEntityState = nextEntityState), (previewState = nextPreviewState), syncSceneModeUi());
    },
    destroy() {
      ((isDisposed = true), clearTimeout(timeoutId));
      for (const activeAnimation of runningAnimationSet) activeAnimation.cancel();
      (runningAnimationSet.clear(), hostElement.removeEventListener("click", handleSceneModeClick));
    },
  };
  return (
    (hostElement.sceneModeController = sceneModeController),
    sceneRuntime.cleanup?.(() => sceneModeController.destroy()),
    syncSceneModeUi(),
    sceneModeController
  );
}
