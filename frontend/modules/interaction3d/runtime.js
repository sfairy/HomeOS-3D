import {
  createPopupLayoutPreview,
  createFocusDevicePopup
} from "./popup-preview.js?v=20260916013557";
import { createLightStream } from "./light-stream.js?v=20260916013557";
const INTERACTION3D_API_BASE = "/api/v1/modules/interaction3d";
export function mountInteraction3d(
  hostElement,
  {
    component: componentDescriptor,
    context: runtimeContext = {},
    editing: isEditing = false,
    editingModule: editingModuleKind = "light",
    editingVacuumId: editingVacuumId = "",
    rangeEditorOnly: isRangeEditorOnly = false,
    onEdit: onEdit = () => {},
    onReady: onReady = () => {},
    onStates: onStatesUpdate = null,
    onPresented: onPresented = () => {},
    onLoadError: onLoadError = () => {},
    onFocusChange: onFocusChange = () => {}
  }
) {
  hostElement.className = "hb-interaction3d-runtime";
  let componentProperties = structuredClone(componentDescriptor.properties || {});
  let isDisposed = false;
  let isAuthorized = true;
  let selectedId = "";
  let loadingTimeoutId;
  let componentMetadata;
  let isPageHidden = false;
  let popupLayoutPreview = null;
  let focusDevicePopup = null;
  function disposeFocusDevicePopup() {
    focusDevicePopup?.dispose();
    focusDevicePopup = null;
  }
  function openFocusDevicePopup(popupTargetId) {
    disposeFocusDevicePopup();
    const focusDeviceKind = popupTargetId?.startsWith("camera:")
      ? "camera"
      : popupTargetId?.startsWith("vacuum:") || editingModuleKind === "vacuum"
        ? "vacuum"
        : null;
    const focusDeviceId = popupTargetId?.replace(/^(camera|vacuum):/, "");
    const focusDeviceItem = (
      focusDeviceKind === "camera"
        ? componentProperties.security?.cameras
        : focusDeviceKind === "vacuum"
          ? componentProperties.devices?.vacuums
          : []
    )?.find(deviceCandidate => deviceCandidate.id === focusDeviceId);
    if (!focusDeviceItem) {
      return;
    }
    const createdFocusPopup = createFocusDevicePopup(hostElement, {
      kind: focusDeviceKind,
      item: focusDeviceItem,
      getLayout: () => presentationLayout,
      getSettings: () => ({
        ...componentProperties.popupLayout,
        opacity: componentProperties.popupOpacity
      }),
      getStates: getCurrentStates,
      panelDocument: runtimeContext.document
    });
    focusDevicePopup = createdFocusPopup;
    createdFocusPopup.ready.catch(popupReadyError => {
      if (focusDevicePopup === createdFocusPopup) {
        disposeFocusDevicePopup();
        onLoadError(popupReadyError);
      }
    });
  }
  function closePopupLayoutPreview() {
    disposeFocusDevicePopup();
    popupLayoutPreview?.dispose();
    popupLayoutPreview = null;
  }
  let isScenePresented = false;
  let isViewEditing = false;
  let requestIdCounter = 0;
  let configIdCounter = 0;
  let defaultCamera;
  let activeCamera =
    componentProperties.floorCameras?.[componentProperties.floorSelection] ||
    componentProperties.camera;
  let lastConfigJson = "";
  let isPreviewSuspended = false;
  let isFocusActive = false;
  let isFocusPanelOpen = false;
  let isStageReady = false;
  let hasBeenConnected = false;
  let hasLoadFailed = false;
  let reloadGeneration = 0;
  let isRangeEditing = false;
  const pendingEditsByRequestId = new Map();
  const pendingRangeRequestsByRequestId = new Map();
  const editSubscribersSet = new Set();
  const normalizeLightingMode = lightingMode => (lightingMode === "region" ? "region" : "standard");
  function createStageFrameElement() {
    const frameElement = document.createElement("iframe");
    frameElement.title = "3D 交互户型";
    frameElement.className = "i3d-frame";
    frameElement.setAttribute("allow", "fullscreen");
    if (runtimeContext.editable && !isEditing && !isViewEditing && !isRangeEditing) {
      frameElement.style.pointerEvents = "none";
    }
    return frameElement;
  }
  let stageFrameElement = createStageFrameElement();
  const loadingElement = document.createElement("p");
  loadingElement.className = "i3d-loading";
  loadingElement.setAttribute("role", "status");
  hostElement.replaceChildren(stageFrameElement, loadingElement);
  const projectId = runtimeContext.document?.projectId || "";
  const postToStageFrame = outgoingMessage => {
    if (!isDisposed && stageFrameElement.contentWindow) {
      stageFrameElement.contentWindow.postMessage(
        {
          channel: "hb-i3d-v1",
          ...outgoingMessage
        },
        location.origin
      );
    }
  };
  function notifyEditSubscribers(editEvent) {
    onEdit(editEvent);
    for (const subscriber of [...editSubscribersSet]) {
      subscriber(editEvent);
    }
  }
  function setRangeEditingState(requestedActive, errorMessage = "") {
    const isRangeEditingActive = requestedActive === true;
    if (isRangeEditingActive !== isRangeEditing || !!errorMessage) {
      isRangeEditing = isRangeEditingActive;
      hostElement.classList.toggle("is-range-editing", isRangeEditingActive);
      if (runtimeContext.editable && !isEditing) {
        stageFrameElement.style.pointerEvents =
          isRangeEditingActive || isViewEditing ? "auto" : "none";
      }
      notifyEditSubscribers({
        action: "range-editor-state",
        active: isRangeEditingActive,
        ...(errorMessage
          ? {
              error: errorMessage
            }
          : {})
      });
    }
  }
  let isSceneActive = false;
  let isAwaitingPresentation = false;
  let lastVisible;
  let lastPresentedVisible;
  let isPageHiddenByEvent = false;
  let lastActivityAtMs = -Infinity;
  const activePointerIdsSet = new Set();
  const heldKeySet = new Set();
  const hasHeldInput = () => activePointerIdsSet.size > 0 || heldKeySet.size > 0;
  let isInViewport = typeof IntersectionObserver === "undefined";
  function syncPreviewSuspension() {
    const topmostScopedDialog = [
      ...(document.querySelectorAll?.("dialog[data-i3d-preview-scope][open]") || [])
    ].at(-1);
    const isCoveredByDialog = !!topmostScopedDialog && !topmostScopedDialog.contains(hostElement);
    if (isPreviewSuspended !== isCoveredByDialog && !isDisposed) {
      isPreviewSuspended = isCoveredByDialog;
      hostElement.setAttribute("data-preview-suspended", String(isCoveredByDialog));
      clearTimeout(loadingTimeoutId);
      if (!isCoveredByDialog) {
        if (!isScenePresented && componentProperties.sceneId && !hasLoadFailed) {
          scheduleLoadTimeout();
        }
        if (isStageReady) {
          publishStates();
        }
        if (lightStream) {
          onStatesUpdate?.(getCurrentStates());
        }
        focusDevicePopup?.updateStates?.();
        vacuumDetailsPopup?.updateStates?.(getCurrentStates());
        sendConfigUpdate();
      }
      refreshActivityState();
    }
  }
  function isHostActuallyVisible() {
    if (
      hostElement.isConnected === false ||
      hostElement.hidden ||
      hostElement.inert ||
      stageFrameElement.hidden ||
      hostElement.checkVisibility?.({
        opacityProperty: true,
        visibilityProperty: true,
        contentVisibilityAuto: true
      }) === false
    ) {
      return false;
    }
    for (
      let visibilityAncestorElement = hostElement;
      visibilityAncestorElement;
      visibilityAncestorElement = visibilityAncestorElement.parentElement
    ) {
      if (
        visibilityAncestorElement.hidden ||
        visibilityAncestorElement.inert ||
        visibilityAncestorElement.getAttribute?.("aria-hidden") === "true"
      ) {
        return false;
      }
      const visibilityAncestorStyle = window.getComputedStyle?.(visibilityAncestorElement);
      if (
        visibilityAncestorStyle &&
        (visibilityAncestorStyle.display === "none" ||
          visibilityAncestorStyle.visibility === "hidden" ||
          visibilityAncestorStyle.visibility === "collapse" ||
          Number(visibilityAncestorStyle.opacity) === 0)
      ) {
        return false;
      }
    }
    const hostBoundingRect = hostElement.getBoundingClientRect();
    const viewportWidthPx = document.documentElement?.clientWidth || window.innerWidth || Infinity;
    const viewportHeightPx =
      document.documentElement?.clientHeight || window.innerHeight || Infinity;
    return (
      hostBoundingRect.width > 0 &&
      hostBoundingRect.height > 0 &&
      (hostBoundingRect.left || 0) < viewportWidthPx &&
      (hostBoundingRect.top || 0) < viewportHeightPx &&
      (hostBoundingRect.right ?? (hostBoundingRect.left || 0) + hostBoundingRect.width) > 0 &&
      (hostBoundingRect.bottom ?? (hostBoundingRect.top || 0) + hostBoundingRect.height) > 0
    );
  }
  function refreshActivityState(forceImmediate = false) {
    if (isDisposed) {
      return;
    }
    syncLightStreamActive();
    const isPresentedVisible =
      isAuthorized &&
      !isPreviewSuspended &&
      !isPageHiddenByEvent &&
      !isPageHidden &&
      document.hidden !== true &&
      document.visibilityState !== "hidden" &&
      isInViewport &&
      isHostActuallyVisible();
    const isVisible =
      isSceneActive &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable &&
      !isViewEditing &&
      isPresentedVisible;
    if (!isVisible) {
      activePointerIdsSet.clear();
      heldKeySet.clear();
    }
    if (
      forceImmediate ||
      isVisible !== lastVisible ||
      isPresentedVisible !== lastPresentedVisible
    ) {
      lastVisible = isVisible;
      lastPresentedVisible = isPresentedVisible;
      lastActivityAtMs = -Infinity;
      postToStageFrame({
        type: "activity-state",
        visible: isVisible,
        presentedVisible: isPresentedVisible
      });
    }
  }
  function handleActivityInputEvent(inputEvent) {
    if (isDisposed || inputEvent.isTrusted === false) {
      return;
    }
    const hadHeldInput = hasHeldInput();
    if (inputEvent.type === "pointerdown") {
      activePointerIdsSet.add(inputEvent.pointerId);
    }
    if (inputEvent.type === "pointerup" || inputEvent.type === "pointercancel") {
      activePointerIdsSet.delete(inputEvent.pointerId);
    }
    if (inputEvent.type === "keydown") {
      heldKeySet.add(inputEvent.code || inputEvent.key);
    }
    if (inputEvent.type === "keyup") {
      heldKeySet.delete(inputEvent.code || inputEvent.key);
    }
    const nowMs = globalThis.performance?.now?.() ?? Date.now();
    if (hasHeldInput() !== hadHeldInput || !(nowMs - lastActivityAtMs < 200)) {
      refreshActivityState();
      lastActivityAtMs = nowMs;
      if (lastVisible) {
        postToStageFrame({
          type: "user-activity",
          held: hasHeldInput()
        });
      }
    }
  }
  function handleWindowBlur() {
    if (isDisposed) {
      return;
    }
    const hadHeldInputBeforeBlur = hasHeldInput();
    activePointerIdsSet.clear();
    heldKeySet.clear();
    refreshActivityState();
    if (hadHeldInputBeforeBlur && lastVisible) {
      lastActivityAtMs = globalThis.performance?.now?.() ?? Date.now();
      postToStageFrame({
        type: "user-activity",
        held: false
      });
    }
  }
  function handlePageHide() {
    closePopupLayoutPreview();
    isPageHiddenByEvent = true;
    refreshActivityState();
  }
  function handlePageShow(pageShowEvent) {
    isPageHiddenByEvent = false;
    if (pageShowEvent?.persisted && !isDisposed) {
      reloadStageFrame();
    } else {
      refreshActivityState();
    }
  }
  function handleVisibilityChange() {
    if (document.hidden) {
      closePopupLayoutPreview();
    }
    refreshActivityState();
  }
  let latestStates = {};
  let lastPublishedStates = null;
  let supportsStatePatches = false;
  const lightStream =
    typeof window.WebSocket == "function"
      ? createLightStream({
          onStates(states) {
            latestStates = states;
            if (!isPreviewSuspended) {
              focusDevicePopup?.updateStates?.();
              vacuumDetailsPopup?.updateStates?.(states);
              onStatesUpdate?.(states);
              if (isStageReady) {
                publishStates();
              }
            }
          },
          onPatch(patch) {
            latestStates = {
              ...latestStates,
              ...patch
            };
            if (!isPreviewSuspended) {
              focusDevicePopup?.updateStates?.();
              vacuumDetailsPopup?.updateStates?.(latestStates);
              onStatesUpdate?.(latestStates);
              if (isStageReady) {
                publishStates(patch);
              }
            }
          }
        })
      : null;
  function syncLightStreamActive() {
    if (!lightStream || isDisposed) {
      return;
    }
    if (hostElement.isConnected === true) {
      hasBeenConnected = true;
    }
    let isStreamActive =
      isAuthorized &&
      !hasLoadFailed &&
      !!componentProperties.sceneId &&
      !isPageHiddenByEvent &&
      !isPageHidden &&
      document.hidden !== true &&
      document.visibilityState !== "hidden" &&
      (!hasBeenConnected || hostElement.isConnected !== false);
    for (
      let ancestorElement = hostElement;
      isStreamActive && ancestorElement;
      ancestorElement = ancestorElement.parentElement
    ) {
      const ancestorStyle = window.getComputedStyle?.(ancestorElement);
      if (
        ancestorElement.hidden ||
        ancestorElement.inert ||
        ancestorElement.getAttribute?.("aria-hidden") === "true" ||
        ancestorStyle?.display === "none" ||
        ["hidden", "collapse"].includes(ancestorStyle?.visibility)
      ) {
        isStreamActive = false;
      }
    }
    lightStream.setActive(isStreamActive);
  }
  function findCurtainMotorReverseEntities() {
    const entityMetadata = runtimeContext.entityMetadata;
    if (!entityMetadata?.get || !entityMetadata?.values) {
      return [];
    } else {
      return (componentProperties.environment?.curtains || []).flatMap(curtain => {
        const curtainMetadata = entityMetadata.get(curtain.entityId);
        if (!curtainMetadata?.deviceId) {
          return [];
        }
        const motorReverseCandidates = [...entityMetadata.values()].filter(
          candidateMetadata =>
            candidateMetadata.deviceId === curtainMetadata.deviceId &&
            (!curtainMetadata.platform ||
              !candidateMetadata.platform ||
              candidateMetadata.platform === curtainMetadata.platform) &&
            ["switch", "select"].includes(
              candidateMetadata.domain || candidateMetadata.entityId?.split(".")[0]
            ) &&
            !candidateMetadata.disabledBy &&
            !["disabled", "missing"].includes(candidateMetadata.status) &&
            /motor_reverse|电机反向/i.test(
              (candidateMetadata.entityId || "") +
                " " +
                (candidateMetadata.name || "") +
                " " +
                (candidateMetadata.translationKey || "")
            )
        );
        if (motorReverseCandidates.length === 1) {
          return [
            {
              entityId: motorReverseCandidates[0].entityId,
              coverEntityId: curtain.entityId
            }
          ];
        } else {
          return [];
        }
      });
    }
  }
  function mergeMotorReverseStates(statesMap, patchStates) {
    const mergedStates = {
      ...(patchStates || statesMap)
    };
    for (const motorReversePair of findCurtainMotorReverseEntities()) {
      if (
        patchStates &&
        !(motorReversePair.entityId in patchStates) &&
        !(motorReversePair.coverEntityId in patchStates)
      ) {
        continue;
      }
      const coverState = statesMap[motorReversePair.coverEntityId];
      if (!coverState) {
        continue;
      }
      const motorReverseEntityState =
        statesMap[motorReversePair.entityId]?.newState || statesMap[motorReversePair.entityId];
      const motorReverseStateText = String(motorReverseEntityState?.state || "")
        .trim()
        .toLowerCase();
      const isMotorReverseEnabled =
        motorReverseEntityState?.available === false
          ? null
          : ["on", "true", "1", "enabled", "开启", "打开", "reverse", "reversed", "反向"].includes(
                motorReverseStateText
              )
            ? true
            : ["off", "false", "0", "disabled", "关闭", "normal", "forward", "正向"].includes(
                  motorReverseStateText
                )
              ? false
              : null;
      mergedStates[motorReversePair.coverEntityId] = {
        ...(coverState.newState || coverState),
        motorReverse: {
          entityId: motorReversePair.entityId,
          enabled: isMotorReverseEnabled
        }
      };
    }
    return mergedStates;
  }
  const collectTrackedEntities = () => [
    ...findCurtainMotorReverseEntities(),
    ...(componentProperties.security?.cameras || []),
    ...(componentProperties.security?.presenceSensors || []),
    ...(componentProperties.devices?.vacuums || []),
    ...(componentProperties.devices?.vacuums || []).flatMap(vacuum =>
      [
        ...(vacuum.relatedEntityIds || []).map(relatedEntityId => ({
          entityId: relatedEntityId
        })),
        vacuum.map,
        ...(vacuum.shortcuts || [])
      ].filter(Boolean)
    ),
    ...(componentProperties.lights || []),
    ...(componentProperties.environment?.airConditioners || []),
    ...(componentProperties.environment?.curtains || []),
    ...(componentProperties.devices?.nas || []),
    ...(componentProperties.devices?.televisions || []),
    ...(componentProperties.devices?.televisions || [])
      .filter(television => television.powerEntityId)
      .map(televisionWithPower => ({
        entityId: televisionWithPower.powerEntityId
      })),
    ...(componentProperties.devices?.nas || []).flatMap(nas => {
      const nasStatusSource = nas.statusSource;
      return (nasStatusSource?.metrics || []).filter(
        nasMetric =>
          !nasStatusSource.visibleMetrics ||
          nasStatusSource.visibleMetrics.includes(nasMetric.entityId) ||
          nasMetric.entityId === nasStatusSource.primaryEntityId
      );
    })
  ];
  function isKnownSelectionId(selectionId) {
    if (typeof selectionId != "string" || !selectionId) {
      return false;
    } else if (
      (componentProperties.lights || []).some(lightItem => lightItem.id === selectionId) ||
      (componentProperties.security?.cameras || []).some(
        cameraDevice => selectionId === "camera:" + cameraDevice.id
      ) ||
      (componentProperties.security?.presenceSensors || []).some(
        presenceSensorDevice => selectionId === "presence:" + presenceSensorDevice.id
      )
    ) {
      return true;
    } else {
      return [
        ["climate", componentProperties.environment?.airConditioners],
        ["cover", componentProperties.environment?.curtains],
        ["nas", componentProperties.devices?.nas],
        ["television", componentProperties.devices?.televisions],
        ["vacuum", componentProperties.devices?.vacuums]
      ].some(([moduleKey, moduleItems]) =>
        (moduleItems || []).some(
          moduleItem =>
            typeof moduleItem.id == "string" &&
            moduleItem.id &&
            selectionId === moduleKey + ":" + moduleItem.id
        )
      );
    }
  }
  const getCurrentStates = () =>
    lightStream
      ? latestStates
      : Object.fromEntries(
          collectTrackedEntities().map(entityRef => [
            entityRef.entityId,
            runtimeContext.states?.get(entityRef.entityId) || null
          ])
        );
  const publishStates = (statePatch = null) => {
    if (isPreviewSuspended || isPageHidden) {
      return;
    }
    const currentStates = getCurrentStates();
    if (lightStream && currentStates === lastPublishedStates) {
      return;
    }
    const shouldSendPatch = !!lightStream && supportsStatePatches && statePatch !== null;
    postToStageFrame({
      type: "states",
      states: mergeMotorReverseStates(currentStates, shouldSendPatch ? statePatch : null),
      ...(shouldSendPatch
        ? {
            patch: true
          }
        : {})
    });
    lastPublishedStates = currentStates;
    if (!lightStream) {
      focusDevicePopup?.updateStates?.();
      onStatesUpdate?.(currentStates);
    }
  };
  const registeredEntityIdsSet = new Set();
  function configureStateSubscriptions() {
    if (lightStream) {
      lightStream.configure(
        collectTrackedEntities().map(primaryEntity => primaryEntity.entityId),
        {
          additionalEntityIds: [
            ...findCurtainMotorReverseEntities().map(
              motorReverseEntity => motorReverseEntity.entityId
            ),
            ...(componentProperties.lights || []).map(lightEntity => lightEntity.entityId),
            ...(componentProperties.security?.presenceSensors || []).map(
              presenceSensorEntity => presenceSensorEntity.entityId
            ),
            ...(componentProperties.devices?.televisions || []).map(
              televisionEntity => televisionEntity.powerEntityId
            ),
            ...(componentProperties.devices?.vacuums || []).flatMap(vacuumEntity => [
              ...(vacuumEntity.relatedEntityIds || []),
              ...(vacuumEntity.shortcuts || []).map(vacuumShortcut => vacuumShortcut.entityId)
            ])
          ]
        }
      );
      syncLightStreamActive();
      return;
    }
    for (const trackedEntity of collectTrackedEntities()) {
      if (trackedEntity.entityId && !registeredEntityIdsSet.has(trackedEntity.entityId)) {
        registeredEntityIdsSet.add(trackedEntity.entityId);
        runtimeContext.registerRuntimeStateHandler?.(trackedEntity.entityId, publishStates);
      }
    }
  }
  function sendConfigUpdate() {
    if (!isStageReady || isDisposed || isPreviewSuspended) {
      return;
    }
    const configPayload = {
      properties: componentProperties,
      editing: isEditing,
      editingModule: editingModuleKind,
      editingVacuumId: editingVacuumId,
      rangeEditorOnly: isRangeEditorOnly,
      viewEditing: isViewEditing,
      editorCanvas: !!runtimeContext.editable && !isEditing,
      allowRangeEditing: isAuthorized && (isEditing || !!runtimeContext.editable),
      interactive: !isEditing && !runtimeContext.editable,
      selectedId: selectedId
    };
    const configJson = JSON.stringify(configPayload);
    if (configJson === lastConfigJson) {
      syncFrameLayout();
      refreshActivityState();
      publishStates();
      return;
    }
    lastConfigJson = configJson;
    isSceneActive = false;
    isAwaitingPresentation = true;
    refreshActivityState(true);
    syncFrameLayout(true);
    postToStageFrame({
      type: "config",
      configId: ++configIdCounter,
      ...configPayload,
      states: mergeMotorReverseStates(getCurrentStates())
    });
    lastPublishedStates = getCurrentStates();
    if (!isScenePresented) {
      refreshActivityState(true);
    }
  }
  function syncBackgroundVisibility() {
    hostElement.classList.toggle(
      "is-background-hidden",
      componentProperties.backgroundVisible === false
    );
  }
  function updateFocusActive(focusActive) {
    if (isFocusActive !== focusActive) {
      isFocusActive = focusActive;
      onFocusChange(focusActive);
    }
  }
  function rejectPendingEdits(reason) {
    for (const pendingEditRequest of pendingEditsByRequestId.values()) {
      clearTimeout(pendingEditRequest.timeout);
      pendingEditRequest.reject(new Error(reason));
    }
    pendingEditsByRequestId.clear();
  }
  function rejectPendingRangeRequests(failureReason) {
    for (const pendingRangeRequest of pendingRangeRequestsByRequestId.values()) {
      clearTimeout(pendingRangeRequest.timeout);
      pendingRangeRequest.reject(new Error(failureReason));
    }
    pendingRangeRequestsByRequestId.clear();
  }
  function dismissFocus(immediate = false) {
    activeFocusTargetId = "";
    closeCameraPreviewPopup();
    closeVacuumDetailsPopup();
    isFocusPanelOpen = false;
    updateFocusActive(false);
    postToStageFrame({
      type: "dismiss-focus",
      immediate: immediate
    });
  }
  let cameraPreviewPopup = null;
  let cameraPreviewTargetId = "";
  let activeFocusTargetId = "";
  const closeCameraPreviewPopup = () => {
    const popupToClose = cameraPreviewPopup;
    cameraPreviewPopup = null;
    cameraPreviewTargetId = "";
    popupToClose?.close?.();
  };
  let vacuumDetailsPopup = null;
  let isVacuumFollowActive = false;
  const closeVacuumDetailsPopup = () => {
    const vacuumPopupToClose = vacuumDetailsPopup;
    vacuumDetailsPopup = null;
    vacuumPopupToClose?.close?.();
  };
  function handleWindowPointerDown(pointerEvent) {
    if (
      !cameraPreviewPopup?.contains?.(pointerEvent.target) &&
      !vacuumDetailsPopup?.contains?.(pointerEvent.target)
    ) {
      if ((isFocusActive || isFocusPanelOpen) && !hostElement.contains(pointerEvent.target)) {
        dismissFocus();
      }
    }
  }
  function handleWindowKeyDown(keyEvent) {
    if (keyEvent.key === "Escape") {
      closePopupLayoutPreview();
    }
    if ((isFocusActive || isFocusPanelOpen) && keyEvent.key === "Escape") {
      dismissFocus();
    }
  }
  function handleStageLoadError(messageText) {
    hasLoadFailed = true;
    isScenePresented = false;
    isSceneActive = false;
    isAwaitingPresentation = false;
    refreshActivityState(true);
    rejectPendingRangeRequests(messageText || "户型画面已关闭，请重新调整照射范围。");
    postToStageFrame({
      type: "range-editor",
      open: false
    });
    setRangeEditingState(false);
    pendingAbortControllersSet.forEach(staleController => staleController.abort());
    rejectPendingEdits("户型加载失败，请重新载入后调整视角。");
    dismissFocus(true);
    clearTimeout(loadingTimeoutId);
    hostElement.classList.remove("is-loading");
    hostElement.classList.add("is-load-error");
    loadingElement.hidden = false;
    loadingElement.textContent = messageText || "3D 户型加载失败，请重新载入户型。";
    onLoadError(new Error(loadingElement.textContent));
  }
  function reloadStageFrame() {
    closePopupLayoutPreview();
    isVacuumFollowActive = false;
    activeFocusTargetId = "";
    closeCameraPreviewPopup();
    closeVacuumDetailsPopup();
    lastConfigJson = "";
    if (reloadGeneration++) {
      stageFrameElement.removeAttribute("src");
      stageFrameElement = createStageFrameElement();
      hostElement.replaceChildren(stageFrameElement, loadingElement);
    }
    setRangeEditingState(false);
    pendingAbortControllersSet.forEach(replacementController => replacementController.abort());
    rejectPendingEdits("户型已切换，请在新户型中重新调整视角。");
    rejectPendingRangeRequests("户型已切换，请在新户型中重新调整照射范围。");
    isFocusPanelOpen = false;
    updateFocusActive(false);
    hasLoadFailed = false;
    isScenePresented = false;
    isStageReady = false;
    isSceneActive = false;
    isAwaitingPresentation = false;
    refreshActivityState(true);
    clearTimeout(loadingTimeoutId);
    hostElement.classList.remove("is-ready", "is-load-error");
    hostElement.classList.toggle("is-loading", !!componentProperties.sceneId);
    hostElement.setAttribute("aria-busy", String(!!componentProperties.sceneId));
    syncBackgroundVisibility();
    configureStateSubscriptions();
    if (!componentProperties.sceneId) {
      stageFrameElement.hidden = true;
      loadingElement.hidden = false;
      loadingElement.textContent = "请在属性面板中配置 3D 户型";
      return;
    }
    stageFrameElement.hidden = false;
    loadingElement.hidden = false;
    loadingElement.textContent = "";
    loadingElement.setAttribute("aria-label", "正在准备 3D 户型");
    const wallTrialParam = (new URLSearchParams(window.location.search).get("wall-trial") || "")
      .split(",")
      .filter(trialMode => ["shader", "single", "depth", "merge"].includes(trialMode))
      .join(",");
    stageFrameElement.src =
      INTERACTION3D_API_BASE +
      "/stage.html?" +
      new URLSearchParams({
        sceneId: componentProperties.sceneId,
        projectId: projectId,
        lighting: normalizeLightingMode(componentProperties.lightingMode),
        ...(wallTrialParam
          ? {
              "wall-trial": wallTrialParam
            }
          : {}),
        ...(new URLSearchParams(window.location.search).get("furniture-runtime") === "compact"
          ? {
              "furniture-runtime": "compact"
            }
          : {}),
        ...(new URLSearchParams(window.location.search).get("reflection-detail") === "low"
          ? {
              "reflection-detail": "low"
            }
          : {}),
        ...(new URLSearchParams(window.location.search).get("performance-diagnostics") === "1"
          ? {
              "performance-diagnostics": "1",
              ...(new URLSearchParams(window.location.search).get("reflection-work") === "baseline"
                ? {
                    "reflection-work": "baseline"
                  }
                : {})
            }
          : {})
      });
    if (!isPreviewSuspended) {
      scheduleLoadTimeout();
    }
  }
  function scheduleLoadTimeout() {
    loadingTimeoutId = setTimeout(
      () => handleStageLoadError("3D 户型加载较慢，请稍候；若一直没有画面，请重新载入户型。"),
      45000
    );
  }
  const pendingAbortControllersSet = new Set();
  async function handleStageMessage(messageEvent) {
    if (
      isDisposed ||
      messageEvent.origin !== location.origin ||
      messageEvent.source !== stageFrameElement.contentWindow ||
      messageEvent.data?.channel !== "hb-i3d-v1"
    ) {
      return;
    }
    const incomingMessage = messageEvent.data;
    if (incomingMessage.type === "vacuum-follow-state") {
      isVacuumFollowActive = incomingMessage.active === true;
      if (isVacuumFollowActive) {
        closeVacuumDetailsPopup();
      }
    }
    if (incomingMessage.type === "vacuum-popup-close") {
      closeVacuumDetailsPopup();
    }
    if (incomingMessage.type === "camera-popup-close") {
      closeCameraPreviewPopup();
    }
    if (
      incomingMessage.type === "camera-popup" &&
      isAuthorized &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable &&
      activeFocusTargetId === incomingMessage.id
    ) {
      const cameraItem = (componentProperties.security?.cameras || []).find(
        cameraCandidate =>
          "camera:" + cameraCandidate.id === incomingMessage.id &&
          cameraCandidate.visible !== false &&
          cameraCandidate.entityId
      );
      if (
        cameraItem &&
        runtimeContext.openCameraPreview &&
        cameraPreviewTargetId !== incomingMessage.id
      ) {
        closeCameraPreviewPopup();
        closeVacuumDetailsPopup();
        cameraPreviewTargetId = incomingMessage.id;
        cameraPreviewPopup = runtimeContext.openCameraPreview(
          cameraItem,
          () => {
            cameraPreviewPopup = null;
            cameraPreviewTargetId = "";
            dismissFocus();
          },
          {
            root: hostElement,
            frame: stageFrameElement,
            popupOpacity: componentProperties.popupOpacity,
            getPresentationLayout: () => presentationLayout,
            getPopupLayout: () => componentProperties.popupLayout?.camera
          }
        );
      }
    }
    if (
      incomingMessage.type === "vacuum-popup" &&
      !isVacuumFollowActive &&
      isAuthorized &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable
    ) {
      const vacuumItem = (componentProperties.devices?.vacuums || []).find(
        vacuumCandidate =>
          "vacuum:" + vacuumCandidate.id === incomingMessage.id &&
          vacuumCandidate.visible !== false &&
          vacuumCandidate.entityId
      );
      if (vacuumItem && runtimeContext.openVacuumDetails) {
        closeVacuumDetailsPopup();
        vacuumDetailsPopup = runtimeContext.openVacuumDetails(
          vacuumItem,
          () => {
            vacuumDetailsPopup = null;
            dismissFocus();
          },
          {
            states: getCurrentStates(),
            root: hostElement,
            frame: stageFrameElement,
            popupOpacity: componentProperties.popupOpacity,
            getPresentationLayout: () => presentationLayout,
            getPopupLayout: () => componentProperties.popupLayout?.general
          }
        );
      }
    }
    if (
      incomingMessage.type === "vacuum-room" &&
      isAuthorized &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable
    ) {
      const vacuumDevice = (componentProperties.devices?.vacuums || []).find(
        vacuumDeviceCandidate =>
          vacuumDeviceCandidate.id === incomingMessage.vacuumId &&
          vacuumDeviceCandidate.visible !== false &&
          vacuumDeviceCandidate.entityId
      );
      const vacuumShortcutItem = vacuumDevice?.shortcuts?.find(
        shortcutCandidate =>
          shortcutCandidate.id === incomingMessage.shortcutId &&
          shortcutCandidate.visible !== false &&
          shortcutCandidate.entityId
      );
      if (
        !vacuumShortcutItem ||
        incomingMessage.id !== "vacuum-room:" + vacuumDevice.id + ":" + vacuumShortcutItem.id
      ) {
        return;
      }
      try {
        if (!runtimeContext.runVacuumRoom) {
          throw new Error("清扫操作入口尚未准备好，请刷新页面。");
        }
        await runtimeContext.runVacuumRoom(vacuumShortcutItem);
        postToStageFrame({
          type: "vacuum-room-result",
          id: incomingMessage.id
        });
      } catch (runRoomError) {
        postToStageFrame({
          type: "vacuum-room-result",
          id: incomingMessage.id,
          error: runRoomError.message
        });
      }
    }
    if (incomingMessage.type === "focus-state" && !isEditing && !runtimeContext.editable) {
      const canFocusSelection =
        isAuthorized && isScenePresented && isKnownSelectionId(incomingMessage.id);
      activeFocusTargetId =
        canFocusSelection && incomingMessage.active === true ? incomingMessage.id : "";
      if (cameraPreviewTargetId && cameraPreviewTargetId !== activeFocusTargetId) {
        closeCameraPreviewPopup();
      }
      isFocusPanelOpen = canFocusSelection && incomingMessage.panelOpen === true;
      updateFocusActive(canFocusSelection && incomingMessage.active === true);
    }
    if (incomingMessage.type === "model-metadata") {
      componentMetadata = incomingMessage.metadata;
      onReady(componentMetadata);
    }
    if (incomingMessage.type === "ready") {
      supportsStatePatches = incomingMessage.statePatches === true;
      lastPublishedStates = null;
      lastConfigJson = "";
      hasLoadFailed = false;
      isStageReady = true;
      componentMetadata = incomingMessage.metadata;
      defaultCamera = incomingMessage.metadata?.camera;
      activeCamera =
        componentProperties.floorCameras?.[componentProperties.floorSelection] ||
        componentProperties.camera ||
        defaultCamera;
      sendConfigUpdate();
      if (isPreviewSuspended) {
        refreshActivityState(true);
      }
      onReady(incomingMessage.metadata);
    }
    if (
      incomingMessage.type === "presented" &&
      incomingMessage.configId === configIdCounter &&
      isAwaitingPresentation
    ) {
      isAwaitingPresentation = false;
      if (!isScenePresented) {
        isScenePresented = true;
        defaultCamera = incomingMessage.camera || defaultCamera;
        activeCamera =
          componentProperties.floorCameras?.[componentProperties.floorSelection] ||
          componentProperties.camera ||
          defaultCamera;
        clearTimeout(loadingTimeoutId);
        hostElement.classList.remove("is-loading", "is-load-error");
        hostElement.classList.add("is-ready");
        hostElement.setAttribute("aria-busy", "false");
        onPresented();
      }
      isSceneActive = true;
      refreshActivityState();
    }
    if (incomingMessage.type === "error") {
      handleStageLoadError(incomingMessage.message);
    }
    const isRangeEditingAvailable =
      isAuthorized &&
      isScenePresented &&
      (isEditing || runtimeContext.editable) &&
      normalizeLightingMode(componentProperties.lightingMode) === "region";
    if (incomingMessage.type === "range-editor-state" && isRangeEditingAvailable) {
      const rangeRequest = pendingRangeRequestsByRequestId.get(incomingMessage.requestId);
      if (incomingMessage.requestId && !rangeRequest) {
        return;
      }
      if (rangeRequest) {
        clearTimeout(rangeRequest.timeout);
        pendingRangeRequestsByRequestId.delete(incomingMessage.requestId);
        if (incomingMessage.active === rangeRequest.open && !incomingMessage.error) {
          rangeRequest.resolve();
        } else {
          rangeRequest.reject(new Error(incomingMessage.error || "照射范围编辑未能打开。"));
        }
      }
      setRangeEditingState(
        incomingMessage.active === true && !incomingMessage.error,
        incomingMessage.error || ""
      );
    }
    if (
      incomingMessage.type === "range-overrides" &&
      isRangeEditingAvailable &&
      incomingMessage.overrides &&
      typeof incomingMessage.overrides == "object" &&
      !Array.isArray(incomingMessage.overrides)
    ) {
      componentProperties.lightRegionOverrides = structuredClone(incomingMessage.overrides);
      notifyEditSubscribers({
        action: "light-region-overrides",
        overrides: structuredClone(componentProperties.lightRegionOverrides)
      });
    }
    if (
      incomingMessage.type === "edit" &&
      incomingMessage.action === "camera" &&
      runtimeContext.editable &&
      isViewEditing
    ) {
      const cameraEditRequest = pendingEditsByRequestId.get(incomingMessage.requestId);
      if (cameraEditRequest) {
        activeCamera = incomingMessage.camera;
        clearTimeout(cameraEditRequest.timeout);
        pendingEditsByRequestId.delete(incomingMessage.requestId);
        cameraEditRequest.resolve(incomingMessage.camera);
      }
    }
    if (incomingMessage.type === "edit" && isEditing && isAuthorized && isScenePresented) {
      if (incomingMessage.action === "focus-exited") {
        disposeFocusDevicePopup();
      }
      if (incomingMessage.action === "focus-camera") {
        const focusEditRequest = pendingEditsByRequestId.get(incomingMessage.requestId);
        if (!focusEditRequest) {
          return;
        }
        if (focusEditRequest) {
          clearTimeout(focusEditRequest.timeout);
          pendingEditsByRequestId.delete(incomingMessage.requestId);
          if (incomingMessage.error) {
            focusEditRequest.reject(new Error(incomingMessage.error));
          } else {
            if (["edit-light-camera", "preview-light-camera"].includes(focusEditRequest.command)) {
              openFocusDevicePopup(focusEditRequest.id);
            }
            if (
              ["save-light-camera", "cancel-light-camera", "edit-follow-camera"].includes(
                focusEditRequest.command
              )
            ) {
              disposeFocusDevicePopup();
            }
            focusEditRequest.resolve(incomingMessage);
          }
        }
      }
      notifyEditSubscribers(incomingMessage);
    }
    if (
      incomingMessage.type === "control" &&
      isAuthorized &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable
    ) {
      const controlEntityId = incomingMessage.command?.entityId;
      if (
        typeof controlEntityId != "string" ||
        !controlEntityId.trim() ||
        ![
          ...(componentProperties.lights || []),
          ...(componentProperties.environment?.airConditioners || []),
          ...(componentProperties.environment?.curtains || []),
          ...(componentProperties.devices?.televisions || []),
          ...(componentProperties.devices?.televisions || []).map(televisionItem => ({
            entityId: televisionItem.powerEntityId || televisionItem.entityId
          }))
        ].some(controlTarget => controlTarget.entityId === controlEntityId)
      ) {
        postToStageFrame({
          type: "control-result",
          requestId: incomingMessage.requestId,
          error: "此实体未绑定到当前 3D 控件，请检查设备配置。"
        });
        return;
      }
      const controlGeneration = reloadGeneration;
      const sendControlResult = resultPayload => {
        if (controlGeneration === reloadGeneration && isScenePresented && isAuthorized) {
          postToStageFrame(resultPayload);
        }
      };
      const controlAbortController = new AbortController();
      pendingAbortControllersSet.add(controlAbortController);
      const controlTimeoutId = setTimeout(() => controlAbortController.abort(), 12000);
      try {
        const controlResponse = await fetch(INTERACTION3D_API_BASE + "/control", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            ...incomingMessage.command,
            ...(["climate", "cover"].includes(incomingMessage.command?.domain) ||
            incomingMessage.command?.deviceKind === "television"
              ? {
                  projectId: projectId,
                  componentId: componentDescriptor.id
                }
              : {})
          }),
          signal: controlAbortController.signal
        });
        const responseBody = await controlResponse.json().catch(() => ({}));
        if (!controlResponse.ok) {
          throw new Error(
            typeof responseBody.detail == "string"
              ? responseBody.detail
              : responseBody.detail?.message || "设备操作失败。"
          );
        }
        sendControlResult({
          type: "control-result",
          requestId: incomingMessage.requestId
        });
      } catch (controlError) {
        sendControlResult({
          type: "control-result",
          requestId: incomingMessage.requestId,
          error:
            controlError.name === "AbortError"
              ? "请求超时，请检查设备状态。"
              : controlError.message,
          timedOut: controlError.name === "AbortError"
        });
      } finally {
        clearTimeout(controlTimeoutId);
        pendingAbortControllersSet.delete(controlAbortController);
      }
    }
  }
  window.addEventListener("message", handleStageMessage);
  window.addEventListener("pointerdown", handleWindowPointerDown);
  window.addEventListener("keydown", handleWindowKeyDown);
  const activityEventTarget = document.addEventListener ? document : window;
  activityEventTarget.addEventListener("hb-i3d-preview-scope", syncPreviewSuspension);
  const ACTIVITY_EVENT_TYPES = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "wheel",
    "keydown",
    "keyup"
  ];
  const ACTIVITY_LISTENER_OPTIONS = {
    capture: true,
    passive: true
  };
  for (const activityEventType of ACTIVITY_EVENT_TYPES) {
    activityEventTarget.addEventListener(
      activityEventType,
      handleActivityInputEvent,
      ACTIVITY_LISTENER_OPTIONS
    );
  }
  activityEventTarget.addEventListener("visibilitychange", handleVisibilityChange);
  activityEventTarget.addEventListener("transitionend", handleVisibilityChange, true);
  activityEventTarget.addEventListener("animationend", handleVisibilityChange, true);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("blur", handleWindowBlur);
  const intersectionObserver =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          observerEntries => {
            for (const observerEntry of observerEntries) {
              if (observerEntry.target === hostElement) {
                isInViewport = observerEntry.isIntersecting && observerEntry.intersectionRatio > 0;
              }
            }
            refreshActivityState();
          },
          {
            threshold: [0, 0.001]
          }
        );
  intersectionObserver?.observe(hostElement);
  let observedAncestorElements = [];
  function observeAncestors() {
    if (isDisposed) {
      return;
    }
    const nextAncestorElements = [];
    for (
      let walkedAncestor = hostElement;
      walkedAncestor;
      walkedAncestor = walkedAncestor.parentElement
    ) {
      nextAncestorElements.push(walkedAncestor);
    }
    if (
      nextAncestorElements.length !== observedAncestorElements.length ||
      !nextAncestorElements.every(
        (ancestorCandidate, ancestorIndex) =>
          ancestorCandidate === observedAncestorElements[ancestorIndex]
      )
    ) {
      observedAncestorElements = nextAncestorElements;
      ancestorMutationObserver?.disconnect();
      for (const observedAncestor of nextAncestorElements) {
        ancestorMutationObserver?.observe(observedAncestor, {
          attributes: true,
          childList: true,
          attributeFilter: ["hidden", "inert", "aria-hidden", "style", "class"]
        });
      }
    }
  }
  const ancestorMutationObserver =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          observeAncestors();
          syncFrameLayout();
        });
  observeAncestors();
  let lastLayoutJson = "";
  let presentationLayout = null;
  function syncFrameLayout(forceLayout = false) {
    refreshActivityState();
    const hostRect = hostElement.getBoundingClientRect();
    if (!hostRect.width || !hostElement.clientWidth) {
      return;
    }
    const scaleX = hostElement.clientWidth / hostRect.width;
    const scaleY =
      hostElement.clientHeight > 0 && hostRect.height > 0
        ? hostElement.clientHeight / hostRect.height
        : scaleX;
    stageFrameElement.style.width = hostRect.width + "px";
    stageFrameElement.style.height = hostRect.height + "px";
    stageFrameElement.style.transform =
      scaleX === scaleY ? "scale(" + scaleX + ")" : "scale(" + scaleX + "," + scaleY + ")";
    const rendererCanvasElement = hostElement.closest?.(".hb-renderer-canvas");
    const canvasRect = rendererCanvasElement?.getBoundingClientRect();
    const layoutReferenceSize =
      componentProperties.layoutMode === "fill"
        ? runtimeContext.document?.canvas
        : componentDescriptor.position;
    const componentScale =
      componentProperties.layoutMode === "fill"
        ? 1
        : Math.max(0.01, Math.min(5, Number(componentDescriptor.style?.scale) || 1));
    const layoutWidthPx =
      canvasRect?.width > 0 && rendererCanvasElement.clientWidth > 0
        ? (hostRect.width * rendererCanvasElement.clientWidth) / canvasRect.width
        : Number(layoutReferenceSize?.width) * componentScale;
    const layoutHeightPx =
      canvasRect?.height > 0 && rendererCanvasElement.clientHeight > 0
        ? (hostRect.height * rendererCanvasElement.clientHeight) / canvasRect.height
        : Number(layoutReferenceSize?.height) * componentScale;
    const layoutMessage = {
      type: "presentation-layout",
      width: layoutWidthPx > 0 ? layoutWidthPx : hostRect.width,
      height: layoutHeightPx > 0 ? layoutHeightPx : hostRect.height
    };
    presentationLayout = layoutMessage;
    popupLayoutPreview?.resize();
    focusDevicePopup?.resize();
    vacuumDetailsPopup?.updateLayout?.();
    cameraPreviewPopup?.updateLayout?.();
    const layoutJson = JSON.stringify(layoutMessage);
    if (forceLayout === true || layoutJson !== lastLayoutJson) {
      lastLayoutJson = layoutJson;
      postToStageFrame(layoutMessage);
    }
  }
  const frameResizeObserver = new ResizeObserver(syncFrameLayout);
  frameResizeObserver.observe(hostElement);
  window.addEventListener("resize", syncFrameLayout);
  syncPreviewSuspension();
  reloadStageFrame();
  const layoutFrameRequestId = requestAnimationFrame(syncFrameLayout);
  const runtimeApi = () => {
    if (!isDisposed) {
      closePopupLayoutPreview();
      isSceneActive = false;
      refreshActivityState(true);
      updateFocusActive(false);
      closeCameraPreviewPopup();
      closeVacuumDetailsPopup();
      lightStream?.dispose();
      editSubscribersSet.clear();
      isRangeEditing = false;
      hostElement.classList.remove("is-range-editing");
      isDisposed = true;
      clearTimeout(loadingTimeoutId);
      cancelAnimationFrame(layoutFrameRequestId);
      frameResizeObserver.disconnect();
      intersectionObserver?.disconnect();
      ancestorMutationObserver?.disconnect();
      rejectPendingEdits("户型画面已关闭，请重新调整。");
      rejectPendingRangeRequests("户型画面已关闭，请重新调整照射范围。");
      window.removeEventListener("resize", syncFrameLayout);
      window.removeEventListener("message", handleStageMessage);
      window.removeEventListener("pointerdown", handleWindowPointerDown);
      window.removeEventListener("keydown", handleWindowKeyDown);
      for (const activityEventTypeToRemove of ACTIVITY_EVENT_TYPES) {
        activityEventTarget.removeEventListener(
          activityEventTypeToRemove,
          handleActivityInputEvent,
          ACTIVITY_LISTENER_OPTIONS
        );
      }
      activityEventTarget.removeEventListener("visibilitychange", handleVisibilityChange);
      activityEventTarget.removeEventListener("hb-i3d-preview-scope", syncPreviewSuspension);
      activityEventTarget.removeEventListener("transitionend", handleVisibilityChange, true);
      activityEventTarget.removeEventListener("animationend", handleVisibilityChange, true);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("blur", handleWindowBlur);
      pendingAbortControllersSet.forEach(pendingController => pendingController.abort());
      stageFrameElement.removeAttribute("src");
      hostElement.replaceChildren();
    }
  };
  runtimeApi.update = (
    nextComponentProperties,
    nextSelectedId = selectedId,
    editContext = null
  ) => {
    if (isDisposed) {
      return;
    }
    if (
      isEditing &&
      editContext &&
      ["light", "climate", "cover", "nas", "television", "vacuum", "vacuum-shortcut"].includes(
        editContext.module
      )
    ) {
      editingModuleKind = editContext.module;
      editingVacuumId =
        editingModuleKind === "vacuum-shortcut" ? String(editContext.vacuumId || "") : "";
    }
    if (
      nextSelectedId !== selectedId ||
      nextComponentProperties.floorSelection !== componentProperties.floorSelection
    ) {
      disposeFocusDevicePopup();
    }
    const previousSceneId = componentProperties.sceneId;
    const previousCameraJson = JSON.stringify(componentProperties.camera);
    const previousLightingMode = normalizeLightingMode(componentProperties.lightingMode);
    const previousPreviewCameraJson = JSON.stringify(
      (componentProperties.security?.cameras || []).find(
        previewCameraCandidate => "camera:" + previewCameraCandidate.id === cameraPreviewTargetId
      )
    );
    const previousFloorSelection = componentProperties.floorSelection;
    componentProperties = structuredClone(nextComponentProperties);
    selectedId = nextSelectedId;
    configureStateSubscriptions();
    syncBackgroundVisibility();
    cameraPreviewPopup?.updateLayout?.();
    vacuumDetailsPopup?.updateLayout?.();
    if (
      cameraPreviewPopup &&
      (previousFloorSelection !== componentProperties.floorSelection ||
        previousPreviewCameraJson !==
          JSON.stringify(
            (componentProperties.security?.cameras || []).find(
              selectedPreviewCamera =>
                "camera:" + selectedPreviewCamera.id === cameraPreviewTargetId
            )
          ))
    ) {
      dismissFocus(true);
    }
    if (
      isViewEditing &&
      (previousSceneId !== componentProperties.sceneId ||
        previousLightingMode !== normalizeLightingMode(componentProperties.lightingMode) ||
        previousCameraJson !== JSON.stringify(componentProperties.camera))
    ) {
      isViewEditing = false;
      activeCamera =
        componentProperties.floorCameras?.[componentProperties.floorSelection] ||
        componentProperties.camera ||
        defaultCamera;
      hostElement.classList.remove("is-view-editing");
      stageFrameElement.style.pointerEvents = "none";
    }
    if (
      previousSceneId !== componentProperties.sceneId ||
      previousLightingMode !== normalizeLightingMode(componentProperties.lightingMode)
    ) {
      reloadStageFrame();
    } else {
      sendConfigUpdate();
    }
  };
  runtimeApi.setPageVisible = pageVisible => {
    if (!isDisposed && isPageHidden !== !pageVisible) {
      isPageHidden = !pageVisible;
      if (isPageHidden) {
        closePopupLayoutPreview();
        dismissFocus(true);
      }
      refreshActivityState(true);
      if (!isPageHidden) {
        syncFrameLayout();
        if (!lightStream) {
          publishStates();
        }
      }
    }
  };
  runtimeApi.closePopupLayoutPreview = closePopupLayoutPreview;
  runtimeApi.previewPopupLayout = (popupKind, previewOptions = {}) =>
    isDisposed ||
    !isAuthorized ||
    !runtimeContext.editable ||
    isPageHidden ||
    document.hidden ||
    isPreviewSuspended ||
    isViewEditing ||
    isRangeEditing ||
    !["general", "camera"].includes(popupKind)
      ? false
      : (popupLayoutPreview ||
          (dismissFocus(true),
          (popupLayoutPreview = createPopupLayoutPreview(
            hostElement,
            () => presentationLayout,
            closePopupLayoutPreview
          ))),
        popupLayoutPreview.update(popupKind, previewOptions),
        true);
  runtimeApi.command = commandName =>
    postToStageFrame({
      type: "editor-command",
      command: commandName
    });
  runtimeApi.subscribeEdit = subscriberCallback =>
    isDisposed || typeof subscriberCallback != "function"
      ? () => {}
      : (editSubscribersSet.add(subscriberCallback),
        () => editSubscribersSet.delete(subscriberCallback));
  runtimeApi.openRangeEditor = () => {
    closePopupLayoutPreview();
    if (isDisposed || !isAuthorized || (!isEditing && !runtimeContext.editable)) {
      return Promise.reject(new Error("请在已授权的控件编辑器中调整照射范围。"));
    }
    if (!isScenePresented) {
      return Promise.reject(new Error("户型还在加载，请稍候再调整照射范围。"));
    }
    if (normalizeLightingMode(componentProperties.lightingMode) !== "region") {
      return Promise.reject(new Error("请先选择轻量柔光模式。"));
    }
    if (isRangeEditing) {
      return Promise.resolve();
    }
    const activeRangeRequest = pendingRangeRequestsByRequestId.values().next().value;
    if (activeRangeRequest) {
      return activeRangeRequest.promise;
    }
    if (isViewEditing) {
      runtimeApi.setViewEditing(false);
    }
    const rangeRequestId = "range-" + ++requestIdCounter;
    let resolveRangeOpen;
    let rejectRangeOpen;
    const rangeOpenPromise = new Promise((resolveOpen, rejectOpen) => {
      resolveRangeOpen = resolveOpen;
      rejectRangeOpen = rejectOpen;
    });
    const rangeOpenTimeoutId = setTimeout(() => {
      pendingRangeRequestsByRequestId.delete(rangeRequestId);
      postToStageFrame({
        type: "range-editor",
        open: false
      });
      setRangeEditingState(false);
      rejectRangeOpen(new Error("打开照射范围编辑超时，请重试。"));
    }, 5000);
    pendingRangeRequestsByRequestId.set(rangeRequestId, {
      resolve: resolveRangeOpen,
      reject: rejectRangeOpen,
      timeout: rangeOpenTimeoutId,
      promise: rangeOpenPromise,
      open: true
    });
    postToStageFrame({
      type: "range-editor",
      open: true,
      requestId: rangeRequestId
    });
    return rangeOpenPromise;
  };
  runtimeApi.flushRangeEditor = () => {
    if (isDisposed || !isAuthorized || !isScenePresented || !isRangeEditing) {
      return Promise.reject(new Error("请先打开照射范围编辑。"));
    }
    const flushRequestId = "range-" + ++requestIdCounter;
    return new Promise((resolveFlush, rejectFlush) => {
      const flushTimeoutId = setTimeout(() => {
        pendingRangeRequestsByRequestId.delete(flushRequestId);
        rejectFlush(new Error("读取照射范围超时，请重试。"));
      }, 5000);
      pendingRangeRequestsByRequestId.set(flushRequestId, {
        resolve: resolveFlush,
        reject: rejectFlush,
        timeout: flushTimeoutId,
        open: true
      });
      postToStageFrame({
        type: "range-editor",
        flush: true,
        requestId: flushRequestId
      });
    });
  };
  runtimeApi.closeRangeEditor = ({ flush: shouldFlush = false } = {}) => {
    rejectPendingRangeRequests("照射范围编辑已取消。");
    if (!shouldFlush) {
      postToStageFrame({
        type: "range-editor",
        open: false
      });
      setRangeEditingState(false);
      return;
    }
    if (isDisposed || !isAuthorized || !isScenePresented) {
      return Promise.reject(new Error("户型画面暂不可用，请重新打开照射范围。"));
    }
    const closeRequestId = "range-" + ++requestIdCounter;
    return new Promise((resolveClose, rejectClose) => {
      const closeTimeoutId = setTimeout(() => {
        pendingRangeRequestsByRequestId.delete(closeRequestId);
        rejectClose(new Error("读取照射范围超时，请重试。"));
      }, 5000);
      pendingRangeRequestsByRequestId.set(closeRequestId, {
        resolve: resolveClose,
        reject: rejectClose,
        timeout: closeTimeoutId,
        open: false
      });
      postToStageFrame({
        type: "range-editor",
        open: false,
        requestId: closeRequestId
      });
    });
  };
  runtimeApi.setAuthorized = authorized => {
    const hasAuthorizationChanged = isAuthorized !== (authorized === true);
    isAuthorized = authorized === true;
    hostElement.inert = !isAuthorized;
    refreshActivityState();
    if (!isAuthorized) {
      closePopupLayoutPreview();
      runtimeApi.closeRangeEditor();
      rejectPendingEdits("授权验证暂不可用，请恢复后重新调整。");
      dismissFocus(true);
      pendingAbortControllersSet.forEach(expiredController => expiredController.abort());
    }
    if (hasAuthorizationChanged && (isEditing || runtimeContext.editable)) {
      sendConfigUpdate();
    }
  };
  Object.defineProperty(runtimeApi, "metadata", {
    get: () => componentMetadata
  });
  Object.defineProperty(runtimeApi, "presentationLayout", {
    get: () => presentationLayout
  });
  Object.defineProperty(runtimeApi, "ready", {
    get: () => isScenePresented && !isDisposed && isAuthorized
  });
  Object.defineProperty(runtimeApi, "viewEditing", {
    get: () => isViewEditing
  });
  Object.defineProperty(runtimeApi, "viewCamera", {
    get: () => activeCamera
  });
  Object.defineProperty(runtimeApi, "rangeEditing", {
    get: () => isRangeEditing && !isDisposed && isAuthorized
  });
  runtimeApi.setViewEditing = viewEditingEnabled => {
    if (viewEditingEnabled) {
      closePopupLayoutPreview();
    }
    if (!runtimeContext.editable || isDisposed) {
      throw new Error("请在编辑器中调整户型视角。");
    }
    if (viewEditingEnabled && !isScenePresented) {
      throw new Error("户型还在加载，请稍候再调整视角。");
    }
    if (viewEditingEnabled && (isRangeEditing || pendingRangeRequestsByRequestId.size)) {
      runtimeApi.closeRangeEditor();
    }
    isViewEditing = viewEditingEnabled === true;
    if (!isViewEditing) {
      activeCamera =
        componentProperties.floorCameras?.[componentProperties.floorSelection] ||
        componentProperties.camera ||
        defaultCamera;
    }
    hostElement.classList.toggle("is-view-editing", isViewEditing);
    stageFrameElement.style.pointerEvents = isViewEditing || isRangeEditing ? "auto" : "none";
    sendConfigUpdate();
  };
  runtimeApi.viewCommand = (viewCommandName, viewCommandValue) =>
    new Promise((resolveView, rejectView) => {
      if (!runtimeContext.editable || !isViewEditing || !isScenePresented || isDisposed) {
        rejectView(new Error("请先进入户型视角调整。"));
        return;
      }
      const viewRequestId = "view-" + ++requestIdCounter;
      const viewTimeoutId = setTimeout(() => {
        pendingEditsByRequestId.delete(viewRequestId);
        rejectView(new Error("读取视角超时，请重试。"));
      }, 5000);
      pendingEditsByRequestId.set(viewRequestId, {
        resolve: resolveView,
        reject: rejectView,
        timeout: viewTimeoutId
      });
      postToStageFrame({
        type: "editor-command",
        command: viewCommandName,
        value: viewCommandValue,
        requestId: viewRequestId
      });
    });
  runtimeApi.captureView = () => runtimeApi.viewCommand("save-camera");
  runtimeApi.focusCommand = (focusCommandName, focusTargetId = selectedId, focusCommandValue) =>
    new Promise((resolveFocus, rejectFocus) => {
      if (!isEditing || !isScenePresented || isDisposed || !isAuthorized) {
        rejectFocus(new Error("户型还在加载，请稍候再设置聚焦视角。"));
        return;
      }
      const focusRequestId = "focus-" + ++requestIdCounter;
      const focusTimeoutId = setTimeout(() => {
        pendingEditsByRequestId.delete(focusRequestId);
        rejectFocus(new Error("读取聚焦视角超时，请重试。"));
      }, 5000);
      pendingEditsByRequestId.set(focusRequestId, {
        resolve: resolveFocus,
        reject: rejectFocus,
        timeout: focusTimeoutId,
        command: focusCommandName,
        id: focusTargetId
      });
      postToStageFrame({
        type: "editor-command",
        command: focusCommandName,
        id: focusTargetId,
        value: focusCommandValue,
        requestId: focusRequestId
      });
    });
  return runtimeApi;
}
