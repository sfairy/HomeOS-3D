import {
  createPopupLayoutPreview,
  createFocusDevicePopup,
} from "./popup-preview.js?v=20260925-canvas-scale-v2";
import { createLightStream } from "./light-stream.js?v=20260921-fan-v2";
import { GENERIC_DEVICE_KINDS, genericDeviceProfile } from "./device-profiles.js";
const { vacuumStatusBinding: vacuumStatusBinding } = await (import.meta.url.startsWith("file:")
    ? import(new URL("../../static/renderer/vacuum-runtime.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/renderer/vacuum-runtime.js?v=20260925-vacuum-state-v2-20260926-speaker-v1",
          import.meta.url,
        )
      )),
  { temperatureHumidityEntities: temperatureHumidityEntities } = await (import.meta.url.startsWith(
    "file:",
  )
    ? import(new URL("../../static/modules/interaction3d/temperature-humidity.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/modules/interaction3d/temperature-humidity.js?v=20260925-environment-label-v1",
          import.meta.url,
        )
      )),
  INTERACTION3D_API_BASE = "/api/v1/modules/interaction3d",
  mountDiagnosticsByInstance = new Map(),
  reportThrottleState = {
    started: 0,
    count: 0,
  },
  runtimeInstanceToken = Date.now() + "-" + Math.random().toString(36).slice(2),
  NUMERIC_COUNT_FIELDS = [
    "loadSequence",
    "frameLoads",
    "sourceRevision",
    "floorCount",
    "durationMs",
    "pending",
    "active",
    "queued",
    "replacementFrames",
    "width",
    "height",
    "dpr",
    "fromCategory",
    "toCategory",
    "geometries",
    "textures",
    "programs",
    "mapPixels",
    "mapTextures",
  ],
  ACCEPTED_EVENT_CODES = new Set([
    "mount-initial",
    "mount-repeat",
    "category-switch-start",
    "category-switch-applied",
    "page-hide",
    "page-show",
    "gpu-lost",
    "gpu-restored",
  ]);
function sanitizeCounts(rawCounts = {}) {
  const sanitizedCounts = {};
  for (const numericField of NUMERIC_COUNT_FIELDS)
    typeof rawCounts?.[numericField] == "number" &&
      Number.isFinite(rawCounts[numericField]) &&
      (sanitizedCounts[numericField] = Math.max(0, Math.min(1000000000, rawCounts[numericField])));
  for (const booleanField of ["replacementPending", "persisted"])
    typeof rawCounts?.[booleanField] == "boolean" &&
      (sanitizedCounts[booleanField] = rawCounts[booleanField]);
  return sanitizedCounts;
}
function createBreadcrumbStore() {
  const breadcrumbStorageKey = "ha-bridge:i3d-reload-breadcrumbs:v1",
    readStoredBreadcrumbs = () => {
      try {
        const storedBreadcrumbsJson = window.sessionStorage?.getItem(breadcrumbStorageKey);
        if (!storedBreadcrumbsJson || storedBreadcrumbsJson.length > 65536) return [];
        const parsedBreadcrumbs = JSON.parse(storedBreadcrumbsJson),
          readAtMs = Date.now();
        return Array.isArray(parsedBreadcrumbs)
          ? parsedBreadcrumbs
              .slice(-16)
              .filter(
                (rawBreadcrumb) =>
                  rawBreadcrumb &&
                  typeof rawBreadcrumb.key == "string" &&
                  rawBreadcrumb.key.length < 180 &&
                  typeof rawBreadcrumb.document == "string" &&
                  rawBreadcrumb.document.length < 80 &&
                  Array.isArray(rawBreadcrumb.events),
              )
              .map((rawEntry) => ({
                key: rawEntry.key,
                document: rawEntry.document,
                events: rawEntry.events
                  .slice(-8)
                  .filter(
                    (rawEvent) =>
                      rawEvent &&
                      ACCEPTED_EVENT_CODES.has(rawEvent.code) &&
                      Number.isFinite(rawEvent.at) &&
                      readAtMs >= rawEvent.at &&
                      readAtMs - rawEvent.at <= 900000,
                  )
                  .map((rawValidEvent) => ({
                    code: rawValidEvent.code,
                    at: rawValidEvent.at,
                    counts: sanitizeCounts(rawValidEvent.counts),
                  })),
              }))
              .filter((rawKeptEntry) => rawKeptEntry.events.length)
          : [];
      } catch {
        return [];
      }
    };
  return {
    previous(lookupKey) {
      const matchedBreadcrumb = readStoredBreadcrumbs().find(
        (candidateBreadcrumb) => candidateBreadcrumb.key === lookupKey,
      );
      return matchedBreadcrumb && matchedBreadcrumb.document !== runtimeInstanceToken
        ? matchedBreadcrumb.events
        : [];
    },
    remember(rememberKey, breadcrumbEventCode, breadcrumbEventCounts) {
      if (ACCEPTED_EVENT_CODES.has(breadcrumbEventCode))
        try {
          const storedBreadcrumbs = readStoredBreadcrumbs(),
            existingBreadcrumb = storedBreadcrumbs.find(
              (candidateEntry) => candidateEntry.key === rememberKey,
            ),
            breadcrumbEvents =
              existingBreadcrumb?.document === runtimeInstanceToken
                ? existingBreadcrumb.events
                : [];
          breadcrumbEvents.push({
            code: breadcrumbEventCode,
            at: Date.now(),
            counts: sanitizeCounts(breadcrumbEventCounts),
          });
          const remainingBreadcrumbs = storedBreadcrumbs.filter(
            (removedEntry) => removedEntry.key !== rememberKey,
          );
          remainingBreadcrumbs.push({
            key: rememberKey,
            document: runtimeInstanceToken,
            events: breadcrumbEvents.slice(-8),
          });
          const trimmedBreadcrumbs = remainingBreadcrumbs.slice(-16);
          for (; JSON.stringify(trimmedBreadcrumbs).length > 32768;) trimmedBreadcrumbs.shift();
          window.sessionStorage?.setItem(breadcrumbStorageKey, JSON.stringify(trimmedBreadcrumbs));
        } catch {}
    },
  };
}
const BREADCRUMB_CODE_MESSAGES = Object.freeze({
  "mount-initial": ["info", "3D 组件首次挂载"],
  "mount-repeat": ["warning", "3D 组件在当前页面重新挂载"],
  "category-switch-start": ["info", "3D 开始切换分类"],
  "category-switch-applied": ["info", "3D 分类状态已应用"],
  "page-hide": ["info", "3D 所在页面离开"],
  "page-show": ["info", "3D 所在页面显示"],
  "load-scene-change": ["info", "3D 户型切换，重新载入舞台"],
  "load-mode-change": ["info", "3D 灯光模式切换，重新载入舞台"],
  "load-bfcache": ["info", "3D 页面从返回缓存恢复，重新载入已释放的舞台"],
  "iframe-load-unexpected": ["warning", "3D 子页面出现非主动载入"],
  "stage-ready-repeat": ["warning", "3D 子页面重复初始化"],
  "source-adopt-start": ["info", "3D 开始采纳保存的户型修改"],
  "source-adopt-complete": ["info", "3D 已采纳保存的户型修改"],
  "source-adopt-failed": ["warning", "3D 户型修改采纳失败，尝试恢复原场景"],
  "gpu-lost": ["warning", "3D 图形上下文丢失"],
  "gpu-restored": ["info", "3D 图形上下文恢复"],
  "models-loading-resumed": ["info", "3D 已展示后再次加载模型"],
  "models-completion-resumed": ["info", "3D 已展示后再次完成模型替换"],
});
function createLifecycleReporter(projectId, componentId) {
  try {
    const sanitizeIdSegment = (rawIdSegment) =>
        /^[\w-]{1,80}$/.test(String(rawIdSegment || "")) ? String(rawIdSegment) : "",
      reportContext = {
        projectId: sanitizeIdSegment(projectId),
        componentId: sanitizeIdSegment(componentId),
        phase: "interaction3d-lifecycle",
      },
      readNowMs = () => globalThis.performance?.now?.() ?? Date.now(),
      nowMs = readNowMs(),
      diagnosticsKey = JSON.stringify([reportContext.projectId, reportContext.componentId]);
    for (const [staleKey, staleDiagnostics] of mountDiagnosticsByInstance)
      nowMs - staleDiagnostics.at > 900000 && mountDiagnosticsByInstance.delete(staleKey);
    const mountDiagnostics = mountDiagnosticsByInstance.get(diagnosticsKey) || {
      at: nowMs,
      mounts: 0,
      events: new Map(),
    };
    for (
      mountDiagnostics.at = nowMs,
        mountDiagnostics.mounts = Math.min(1000000, mountDiagnostics.mounts + 1),
        mountDiagnosticsByInstance.delete(diagnosticsKey),
        mountDiagnosticsByInstance.set(diagnosticsKey, mountDiagnostics);
      mountDiagnosticsByInstance.size > 64;
    )
      mountDiagnosticsByInstance.delete(mountDiagnosticsByInstance.keys().next().value);
    const mountCount = mountDiagnostics.mounts,
      breadcrumbStore = createBreadcrumbStore(),
      previousEvents = mountCount === 1 ? breadcrumbStore.previous(diagnosticsKey) : [],
      reportLifecycleEvent = (lifecycleEventCode, lifecycleEventCounts = {}) => {
        try {
          if (!Object.prototype.hasOwnProperty.call(BREADCRUMB_CODE_MESSAGES, lifecycleEventCode))
            return;
          breadcrumbStore.remember(diagnosticsKey, lifecycleEventCode, lifecycleEventCounts);
          const hostLogger = window.HABridgeLog;
          if (typeof hostLogger?.report != "function") return;
          const eventAtMs = readNowMs(),
            lastReportAtMs = mountDiagnostics.events.get(lifecycleEventCode);
          if (
            (lastReportAtMs !== undefined && eventAtMs - lastReportAtMs < 5000) ||
            ((eventAtMs - reportThrottleState.started >= 60000 ||
              eventAtMs < reportThrottleState.started) &&
              ((reportThrottleState.started = eventAtMs), (reportThrottleState.count = 0)),
            reportThrottleState.count >= 30)
          )
            return;
          (mountDiagnostics.events.set(lifecycleEventCode, eventAtMs), reportThrottleState.count++);
          const reportPayload = {
            build: "20260927-reload-diagnostics-v2",
            mountCount: mountCount,
            ...sanitizeCounts(lifecycleEventCounts),
          };
          lifecycleEventCode === "mount-initial" &&
            previousEvents.length &&
            (reportPayload.previousEvents = previousEvents);
          const navigationType =
            globalThis.performance?.getEntriesByType?.("navigation")?.[0]?.type;
          ["navigate", "reload", "back_forward", "prerender"].includes(navigationType) &&
            (reportPayload.navigation = navigationType);
          const [reportLevel, eventMessage] = BREADCRUMB_CODE_MESSAGES[lifecycleEventCode];
          Promise.resolve(
            hostLogger.report(
              reportLevel,
              "3D 运行生命周期",
              eventMessage,
              {
                ...reportContext,
                code: lifecycleEventCode,
              },
              JSON.stringify(reportPayload),
            ),
          ).catch(() => {});
        } catch {}
      };
    return (
      reportLifecycleEvent(mountCount === 1 ? "mount-initial" : "mount-repeat"),
      reportLifecycleEvent
    );
  } catch {
    return () => {};
  }
}
export function mountInteraction3d(
  hostElement,
  {
    component: componentDescriptor,
    context: runtimeContext = {},
    editing: isEditing = false,
    editingModule: editingModuleKind = "light",
    editingSecurityKind = "",
    editingVacuumId = "",
    rangeEditorOnly: isRangeEditorOnly = false,
    onEdit = () => {},
    onReady = () => {},
    onStates: onStatesUpdate = null,
    onPresented = () => {},
    onLoadError = () => {},
    onFocusChange = () => {},
  },
) {
  hostElement.className = "hb-interaction3d-runtime";
  let componentProperties = structuredClone(componentDescriptor.properties || {}),
    isDisposed = false,
    isAuthorized = true,
    selectedId = "",
    loadingTimeoutId,
    componentMetadata,
    isPageHidden = false;
  const canPrewarmStage = () =>
    runtimeContext.prewarmStage === true &&
    !isScenePresented &&
    !hasLoadFailed &&
    !isPreviewSuspended;
  let popupLayoutPreview = null,
    focusDevicePopup = null;
  function disposeFocusDevicePopup() {
    (focusDevicePopup?.dispose(), (focusDevicePopup = null));
  }
  const collectVacuumEntries = () =>
    (componentProperties.devices?.vacuums || []).map((vacuumEntry) =>
      vacuumStatusBinding(vacuumEntry, runtimeContext.entityMetadata),
    );
  function openFocusDevicePopup(popupTargetId) {
    disposeFocusDevicePopup();
    const focusDeviceKind = popupTargetId?.startsWith("camera:")
        ? "camera"
        : popupTargetId?.startsWith("vacuum:") || editingModuleKind === "vacuum"
          ? "vacuum"
          : null,
      focusDeviceId = popupTargetId?.replace(/^(camera|vacuum):/, ""),
      focusDeviceItem = (
        focusDeviceKind === "camera"
          ? componentProperties.security?.cameras
          : focusDeviceKind === "vacuum"
            ? collectVacuumEntries()
            : []
      )?.find((deviceCandidate) => deviceCandidate.id === focusDeviceId);
    if (!focusDeviceItem) return;
    const createdFocusPopup = createFocusDevicePopup(hostElement, {
      kind: focusDeviceKind,
      item: focusDeviceItem,
      getLayout: () => presentationLayout,
      getSettings: () => ({
        ...componentProperties.popupLayout,
        opacity: componentProperties.popupOpacity,
      }),
      getStates: getCurrentStates,
      panelDocument: runtimeContext.document,
    });
    ((focusDevicePopup = createdFocusPopup),
      createdFocusPopup.ready.catch((popupReadyError) => {
        focusDevicePopup === createdFocusPopup &&
          (disposeFocusDevicePopup(), onLoadError(popupReadyError));
      }));
  }
  function closePopupLayoutPreview() {
    (disposeFocusDevicePopup(), popupLayoutPreview?.dispose(), (popupLayoutPreview = null));
  }
  let isScenePresented = false,
    isViewEditing = false,
    requestIdCounter = 0,
    configIdCounter = 0,
    defaultCamera,
    activeCamera =
      componentProperties.floorCameras?.[componentProperties.floorSelection] ||
      componentProperties.camera,
    lastConfigJson = "",
    isPreviewSuspended = false,
    isFocusActive = false,
    isFocusPanelOpen = false,
    isStageReady = false,
    hasBeenConnected = false,
    hasLoadFailed = false,
    reloadGeneration = 0,
    isRangeEditing = false;
  const pendingEditsByRequestId = new Map(),
    pendingRangeRequestsByRequestId = new Map(),
    editSubscribersSet = new Set(),
    normalizeLightingMode = () => "region";
  function createStageFrameElement() {
    const frameElement = document.createElement("iframe");
    let frameLoadCount = 0,
      lastContentDocument;
    return (
      frameElement.addEventListener("load", () => {
        if (!(isDisposed || frameElement !== stageFrameElement)) {
          try {
            if (frameElement.contentWindow?.location?.href === "about:blank") return;
            const contentDocument = frameElement.contentDocument;
            if (contentDocument && contentDocument === lastContentDocument) return;
            lastContentDocument = contentDocument;
          } catch {}
          ++frameLoadCount > 1 &&
            reportRuntimeLifecycle("iframe-load-unexpected", {
              frameLoads: frameLoadCount,
              loadSequence: reloadGeneration,
            });
        }
      }),
      (frameElement.title = "3D 交互户型"),
      (frameElement.className = "i3d-frame"),
      frameElement.setAttribute("allow", "fullscreen"),
      runtimeContext.editable &&
        !isEditing &&
        !isViewEditing &&
        !isRangeEditing &&
        (frameElement.style.pointerEvents = "none"),
      frameElement
    );
  }
  let stageFrameElement = createStageFrameElement();
  const loadingElement = document.createElement("p");
  ((loadingElement.className = "i3d-loading"),
    loadingElement.setAttribute("role", "status"),
    hostElement.replaceChildren(stageFrameElement, loadingElement));
  const hostProjectId = runtimeContext.document?.projectId || "",
    reportRuntimeLifecycle = createLifecycleReporter(hostProjectId, componentDescriptor.id),
    postToStageFrame = (frameMessage) => {
      !isDisposed &&
        stageFrameElement.contentWindow &&
        stageFrameElement.contentWindow.postMessage(
          {
            channel: "hb-i3d-v1",
            ...frameMessage,
          },
          location.origin,
        );
    };
  function notifyEditSubscribers(editState) {
    onEdit(editState);
    for (const subscriber of [...editSubscribersSet]) subscriber(editState);
  }
  function setRangeEditingState(isActive, errorMessage = "") {
    const nextRangeEditing = isActive === true;
    (nextRangeEditing === isRangeEditing && !errorMessage) ||
      ((isRangeEditing = nextRangeEditing),
      hostElement.classList.toggle("is-range-editing", nextRangeEditing),
      runtimeContext.editable &&
        !isEditing &&
        (stageFrameElement.style.pointerEvents =
          nextRangeEditing || isViewEditing ? "auto" : "none"),
      notifyEditSubscribers({
        action: "range-editor-state",
        active: nextRangeEditing,
        ...(errorMessage
          ? {
              error: errorMessage,
            }
          : {}),
      }));
  }
  let hasPresentedStage = false,
    isReloadPending = false,
    wasStageActive,
    wasStageVisible,
    isPageFrozen = false,
    lastActivityAtMs = -Infinity;
  const heldPointerIdsSet = new Set(),
    heldKeyCodesSet = new Set(),
    hasHeldInput = () => heldPointerIdsSet.size > 0 || heldKeyCodesSet.size > 0;
  let isStageIntersecting = typeof IntersectionObserver > "u";
  function syncPreviewSuspension() {
    const topOpenPreviewDialog = [
        ...(document.querySelectorAll?.("dialog[data-i3d-preview-scope][open]") || []),
      ].at(-1),
      isOtherPreviewOpen = !!(topOpenPreviewDialog && !topOpenPreviewDialog.contains(hostElement));
    isPreviewSuspended === isOtherPreviewOpen ||
      isDisposed ||
      ((isPreviewSuspended = isOtherPreviewOpen),
      hostElement.setAttribute("data-preview-suspended", String(isOtherPreviewOpen)),
      clearTimeout(loadingTimeoutId),
      isOtherPreviewOpen ||
        (!isScenePresented &&
          componentProperties.sceneId &&
          !hasLoadFailed &&
          scheduleLoadTimeout(),
        isStageReady && publishStates(),
        lightStream && onStatesUpdate?.(getCurrentStates()),
        focusDevicePopup?.updateStates?.(),
        vacuumPopup?.updateStates?.(getCurrentStates()),
        sendConfigUpdate()),
      refreshActivityState());
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
        contentVisibilityAuto: true,
      }) === false
    )
      return false;
    for (
      let visibilityProbeElement = hostElement;
      visibilityProbeElement;
      visibilityProbeElement = visibilityProbeElement.parentElement
    ) {
      if (
        visibilityProbeElement.hidden ||
        visibilityProbeElement.inert ||
        visibilityProbeElement.getAttribute?.("aria-hidden") === "true"
      )
        return false;
      const visibilityProbeStyle = window.getComputedStyle?.(visibilityProbeElement);
      if (
        visibilityProbeStyle &&
        (visibilityProbeStyle.display === "none" ||
          visibilityProbeStyle.visibility === "hidden" ||
          visibilityProbeStyle.visibility === "collapse" ||
          Number(visibilityProbeStyle.opacity) === 0)
      )
        return false;
    }
    const hostRect = hostElement.getBoundingClientRect(),
      viewportWidthPx = document.documentElement?.clientWidth || window.innerWidth || Infinity,
      viewportHeightPx = document.documentElement?.clientHeight || window.innerHeight || Infinity;
    return (
      hostRect.width > 0 &&
      hostRect.height > 0 &&
      (hostRect.left || 0) < viewportWidthPx &&
      (hostRect.top || 0) < viewportHeightPx &&
      (hostRect.right ?? (hostRect.left || 0) + hostRect.width) > 0 &&
      (hostRect.bottom ?? (hostRect.top || 0) + hostRect.height) > 0
    );
  }
  function refreshActivityState(forceRefresh = false) {
    if (isDisposed) return;
    syncLightStreamActive();
    const isStageOnScreen =
        isAuthorized &&
        !isPreviewSuspended &&
        !isPageFrozen &&
        !isPageHidden &&
        document.hidden !== true &&
        document.visibilityState !== "hidden" &&
        isStageIntersecting &&
        isHostActuallyVisible(),
      isPrewarmAllowed = isAuthorized && canPrewarmStage() && !isPageFrozen && !document.hidden,
      isStageActive =
        hasPresentedStage &&
        isScenePresented &&
        !isEditing &&
        !runtimeContext.editable &&
        !isViewEditing &&
        isStageOnScreen;
    (isStageActive || (heldPointerIdsSet.clear(), heldKeyCodesSet.clear()),
      (forceRefresh ||
        isStageActive !== wasStageActive ||
        (isStageOnScreen || isPrewarmAllowed) !== wasStageVisible) &&
        ((wasStageActive = isStageActive),
        (wasStageVisible = isStageOnScreen || isPrewarmAllowed),
        (lastActivityAtMs = -Infinity),
        postToStageFrame({
          type: "activity-state",
          visible: isStageActive,
          presentedVisible: isStageOnScreen || isPrewarmAllowed,
        })));
  }
  function handleActivityInput(inputEvent) {
    if (isDisposed || inputEvent.isTrusted === false) return;
    const hasHeldInputAtEntry = hasHeldInput();
    (inputEvent.type === "pointerdown" && heldPointerIdsSet.add(inputEvent.pointerId),
      (inputEvent.type === "pointerup" || inputEvent.type === "pointercancel") &&
        heldPointerIdsSet.delete(inputEvent.pointerId),
      inputEvent.type === "keydown" && heldKeyCodesSet.add(inputEvent.code || inputEvent.key),
      inputEvent.type === "keyup" && heldKeyCodesSet.delete(inputEvent.code || inputEvent.key));
    const inputAtMs = globalThis.performance?.now?.() ?? Date.now();
    (hasHeldInput() === hasHeldInputAtEntry && inputAtMs - lastActivityAtMs < 200) ||
      (refreshActivityState(),
      (lastActivityAtMs = inputAtMs),
      wasStageActive &&
        postToStageFrame({
          type: "user-activity",
          held: hasHeldInput(),
        }));
  }
  function handleWindowBlur() {
    if (isDisposed) return;
    const hasHeldInputOnBlur = hasHeldInput();
    (heldPointerIdsSet.clear(),
      heldKeyCodesSet.clear(),
      refreshActivityState(),
      hasHeldInputOnBlur &&
        wasStageActive &&
        ((lastActivityAtMs = globalThis.performance?.now?.() ?? Date.now()),
        postToStageFrame({
          type: "user-activity",
          held: false,
        })));
  }
  function handlePageHide(pageHideEvent) {
    (reportRuntimeLifecycle("page-hide", {
      persisted: pageHideEvent?.persisted === true,
    }),
      closePopupLayoutPreview(),
      isVacuumPopupOpen && dismissFocus(true),
      (isPageFrozen = true),
      refreshActivityState());
  }
  function handlePageShow(pageShowEvent) {
    (reportRuntimeLifecycle("page-show", {
      persisted: pageShowEvent?.persisted === true,
    }),
      (isPageFrozen = false),
      pageShowEvent?.persisted && !isDisposed
        ? reloadStageFrame("load-bfcache")
        : refreshActivityState());
  }
  function handleVisibilityChange() {
    (document.hidden && closePopupLayoutPreview(), refreshActivityState());
  }
  let latestStatesByEntityId = {},
    lastPublishedStates = null,
    supportsStatePatches = false;
  const lightStream =
    typeof window.WebSocket == "function"
      ? createLightStream({
          onStates(incomingStates) {
            ((latestStatesByEntityId = incomingStates),
              fetchClimateCapabilities(),
              !isPreviewSuspended &&
                (focusDevicePopup?.updateStates?.(),
                vacuumPopup?.updateStates?.(incomingStates),
                onStatesUpdate?.(incomingStates),
                isStageReady && publishStates()));
          },
          onPatch(statePatch) {
            ((latestStatesByEntityId = {
              ...latestStatesByEntityId,
              ...statePatch,
            }),
              !isPreviewSuspended &&
                (focusDevicePopup?.updateStates?.(),
                vacuumPopup?.updateStates?.(latestStatesByEntityId),
                onStatesUpdate?.(latestStatesByEntityId),
                isStageReady && publishStates(statePatch)));
          },
        })
      : null;
  function syncLightStreamActive() {
    if (!lightStream || isDisposed) return;
    hostElement.isConnected === true && (hasBeenConnected = true);
    let isStageVisible =
      isAuthorized &&
      !hasLoadFailed &&
      !!componentProperties.sceneId &&
      !isPageFrozen &&
      !isPageHidden &&
      document.hidden !== true &&
      document.visibilityState !== "hidden" &&
      !(hasBeenConnected && hostElement.isConnected === false);
    for (
      let ancestorElement = hostElement;
      isStageVisible && ancestorElement;
      ancestorElement = ancestorElement.parentElement
    ) {
      const ancestorStyle = window.getComputedStyle?.(ancestorElement);
      (ancestorElement.hidden ||
        ancestorElement.inert ||
        ancestorElement.getAttribute?.("aria-hidden") === "true" ||
        ancestorStyle?.display === "none" ||
        ["hidden", "collapse"].includes(ancestorStyle?.visibility)) &&
        (isStageVisible = false);
    }
    lightStream.setActive(
      isStageVisible || (isAuthorized && canPrewarmStage() && !isPageFrozen && !document.hidden),
    );
  }
  function findCurtainMotorReverseEntities() {
    const entityMetadata = runtimeContext.entityMetadata;
    return !entityMetadata?.get || !entityMetadata?.values
      ? []
      : (componentProperties.environment?.curtains || []).flatMap((curtain) => {
          const curtainMetadata = entityMetadata.get(curtain.entityId);
          if (!curtainMetadata?.deviceId) return [];
          const motorReverseCandidates = [...entityMetadata.values()].filter(
            (candidateMetadata) =>
              candidateMetadata.deviceId === curtainMetadata.deviceId &&
              (!curtainMetadata.platform ||
                !candidateMetadata.platform ||
                candidateMetadata.platform === curtainMetadata.platform) &&
              ["switch", "select"].includes(
                candidateMetadata.domain || candidateMetadata.entityId?.split(".")[0],
              ) &&
              !candidateMetadata.disabledBy &&
              !["disabled", "missing"].includes(candidateMetadata.status) &&
              /motor_reverse|电机反向/i.test(
                (candidateMetadata.entityId || "") +
                  " " +
                  (candidateMetadata.name || "") +
                  " " +
                  (candidateMetadata.translationKey || ""),
              ),
          );
          return motorReverseCandidates.length === 1
            ? [
                {
                  entityId: motorReverseCandidates[0].entityId,
                  coverEntityId: curtain.entityId,
                },
              ]
            : [];
        });
  }
  let temperatureUnit = null,
    lastCapabilityFetchAtMs = 0,
    isFetchingCapabilities = false;
  async function fetchClimateCapabilities() {
    if (
      isDisposed ||
      !isAuthorized ||
      !(
        (componentProperties.environment?.waterHeaters || []).length ||
        (componentProperties.environment?.airConditioners || []).length
      ) ||
      typeof fetch != "function" ||
      isFetchingCapabilities ||
      Date.now() - lastCapabilityFetchAtMs < 60000
    )
      return;
    ((isFetchingCapabilities = true), (lastCapabilityFetchAtMs = Date.now()));
    const capabilityAbortController = new AbortController();
    activeRequestsSet.add(capabilityAbortController);
    const capabilityTimeoutId = setTimeout(() => capabilityAbortController.abort(), 10000);
    try {
      const capabilityResponse = await fetch(
        INTERACTION3D_API_BASE +
          "/" +
          ((componentProperties.environment?.airConditioners || []).length
            ? "climate"
            : "water-heater") +
          "-capabilities",
        {
          credentials: "same-origin",
          signal: capabilityAbortController.signal,
        },
      );
      if (!capabilityResponse.ok) return;
      const { temperatureUnit: reportedTemperatureUnit } = await capabilityResponse.json();
      if (isDisposed) return;
      const normalizedTemperatureUnit = ["°C", "°F", "K"].includes(reportedTemperatureUnit)
        ? reportedTemperatureUnit
        : null;
      normalizedTemperatureUnit !== temperatureUnit &&
        ((temperatureUnit = normalizedTemperatureUnit),
        (lastPublishedStates = null),
        publishStates());
    } catch {
    } finally {
      (clearTimeout(capabilityTimeoutId),
        activeRequestsSet.delete(capabilityAbortController),
        (isFetchingCapabilities = false));
    }
  }
  function mergeMotorReverseStates(statesMap, patchStates) {
    const mergedStates = {
      ...(patchStates || statesMap),
    };
    for (const [stateEntityId, rawState] of Object.entries(mergedStates)) {
      if (!/^(water_heater|climate)\./.test(stateEntityId) || !rawState || !temperatureUnit)
        continue;
      const stateEntry = rawState.newState || rawState;
      mergedStates[stateEntityId] = {
        ...stateEntry,
        attributes: {
          ...stateEntry.attributes,
          temperature_unit: temperatureUnit,
        },
      };
    }
    for (const motorReversePair of findCurtainMotorReverseEntities()) {
      if (
        patchStates &&
        !(motorReversePair.entityId in patchStates) &&
        !(motorReversePair.coverEntityId in patchStates)
      )
        continue;
      const coverState = statesMap[motorReversePair.coverEntityId];
      if (!coverState) continue;
      const motorReverseState =
          statesMap[motorReversePair.entityId]?.newState || statesMap[motorReversePair.entityId],
        motorReverseText = String(motorReverseState?.state || "")
          .trim()
          .toLowerCase(),
        isMotorReverseEnabled =
          motorReverseState?.available === false
            ? null
            : [
                  "on",
                  "true",
                  "1",
                  "enabled",
                  "开启",
                  "打开",
                  "reverse",
                  "reversed",
                  "反向",
                ].includes(motorReverseText)
              ? true
              : ["off", "false", "0", "disabled", "关闭", "normal", "forward", "正向"].includes(
                    motorReverseText,
                  )
                ? false
                : null;
      mergedStates[motorReversePair.coverEntityId] = {
        ...(coverState.newState || coverState),
        motorReverse: {
          entityId: motorReversePair.entityId,
          enabled: isMotorReverseEnabled,
        },
      };
    }
    return mergedStates;
  }
  const collectGenericDeviceEntries = () =>
      GENERIC_DEVICE_KINDS.flatMap(
        (deviceKind) =>
          componentProperties.devices?.[genericDeviceProfile(deviceKind).collection] || [],
      ),
    collectDeviceExtraEntities = () =>
      collectGenericDeviceEntries().flatMap(
        (genericDeviceEntry) => genericDeviceEntry.extraControls || [],
      ),
    collectGenericDeviceEntities = () =>
      collectGenericDeviceEntries().flatMap((deviceEntry) => {
        const genericStatusRules = deviceEntry.statusRules || {},
          genericHealthRules = Array.isArray(genericStatusRules.health)
            ? genericStatusRules.health
            : genericStatusRules.health
              ? [genericStatusRules.health]
              : [];
        return [
          ...(deviceEntry.extraControls || []),
          ...[deviceEntry.batteryEntityId, deviceEntry.chargingEntityId]
            .filter(Boolean)
            .map((relatedEntityId) => ({
              entityId: relatedEntityId,
            })),
          genericStatusRules.power,
          ...genericHealthRules,
        ].filter(Boolean);
      }),
    collectWaterHeaterEntities = () =>
      (componentProperties.environment?.waterHeaters || []).flatMap((waterHeaterEntry) => {
        const waterHeaterStatusRules = waterHeaterEntry.statusRules || {},
          waterHeaterHealthRules = Array.isArray(waterHeaterStatusRules.health)
            ? waterHeaterStatusRules.health
            : [waterHeaterStatusRules.health];
        return [waterHeaterStatusRules.power, ...waterHeaterHealthRules].filter(Boolean);
      }),
    collectEnvironmentExtraEntities = () =>
      [
        ...(componentProperties.environment?.airConditioners || []),
        ...(componentProperties.environment?.airers || []),
        ...(componentProperties.environment?.fans || []),
        ...(componentProperties.environment?.airPurifiers || []),
        ...(componentProperties.environment?.waterHeaters || []),
      ].flatMap((environmentEntry) => environmentEntry.extraControls || []),
    collectLockEntities = () =>
      (componentProperties.security?.locks || []).flatMap((lockEntry) =>
        [
          "entityId",
          "doorEntityId",
          "doorEventEntityId",
          "doorOpenEntityId",
          "doorCloseEntityId",
          "batteryEntityId",
          "lowBatteryEntityId",
          "tamperEntityId",
        ]
          .map((entityKey) => ({
            entityId: lockEntry[entityKey],
          }))
          .filter((filteredLockEntry) => filteredLockEntry.entityId),
      ),
    collectTrackedEntities = () => [
      ...collectLockEntities(),
      ...collectGenericDeviceEntities(),
      ...collectWaterHeaterEntities(),
      ...findCurtainMotorReverseEntities(),
      ...collectEnvironmentExtraEntities(),
      ...(componentProperties.security?.cameras || []),
      ...(componentProperties.security?.presenceSensors || []),
      ...collectVacuumEntries(),
      ...collectVacuumEntries().flatMap((vacuumConfigEntry) =>
        [
          ...(vacuumConfigEntry.relatedEntityIds || []).map((vacuumRelatedEntityId) => ({
            entityId: vacuumRelatedEntityId,
          })),
          vacuumConfigEntry.map,
          ...(vacuumConfigEntry.shortcuts || []),
        ].filter(Boolean),
      ),
      ...(componentProperties.lights || []),
      ...(componentProperties.environment?.airConditioners || []),
      ...(componentProperties.environment?.airers || []),
      ...(componentProperties.environment?.fans || []),
      ...(componentProperties.environment?.airPurifiers || []),
      ...(componentProperties.environment?.waterHeaters || []),
      ...(componentProperties.environment?.curtains || []),
      ...temperatureHumidityEntities(componentProperties.environment?.temperatureHumidity),
      ...(componentProperties.devices?.nas || []),
      ...(componentProperties.devices?.speakers || []),
      ...(componentProperties.devices?.televisions || []),
      ...(componentProperties.devices?.televisions || [])
        .filter((televisionEntry) => televisionEntry.powerEntityId)
        .map((televisionWithPower) => ({
          entityId: televisionWithPower.powerEntityId,
        })),
      ...(componentProperties.devices?.nas || []).flatMap((nasEntry) => {
        const nasStatusSource = nasEntry.statusSource;
        return (nasStatusSource?.metrics || []).filter(
          (metricEntry) =>
            !nasStatusSource.visibleMetrics ||
            nasStatusSource.visibleMetrics.includes(metricEntry.entityId) ||
            metricEntry.entityId === nasStatusSource.primaryEntityId,
        );
      }),
    ];
  function isKnownSelectionId(selectionId) {
    return typeof selectionId != "string" || !selectionId
      ? false
      : (componentProperties.lights || []).some((lightEntry) => lightEntry.id === selectionId) ||
          (componentProperties.security?.locks || []).some(
            (lockConfigEntry) => selectionId === "lock:" + lockConfigEntry.id,
          ) ||
          (componentProperties.security?.cameras || []).some(
            (cameraEntry) => selectionId === "camera:" + cameraEntry.id,
          ) ||
          (componentProperties.security?.presenceSensors || []).some(
            (presenceSensorEntry) => selectionId === "presence:" + presenceSensorEntry.id,
          ) ||
          (componentProperties.environment?.curtainGroups || []).some(
            (curtainGroupEntry) => selectionId === "cover:curtain-group:" + curtainGroupEntry.id,
          )
        ? true
        : [
            [
              "climate",
              [
                ...(componentProperties.environment?.airConditioners || []),
                ...(componentProperties.environment?.fans || []),
                ...(componentProperties.environment?.airPurifiers || []),
                ...(componentProperties.environment?.waterHeaters || []),
              ],
            ],
            [
              "cover",
              [
                ...(componentProperties.environment?.curtains || []),
                ...(componentProperties.environment?.airers || []),
              ],
            ],
            ...GENERIC_DEVICE_KINDS.map((genericDeviceKind) => [
              genericDeviceKind,
              componentProperties.devices?.[genericDeviceProfile(genericDeviceKind).collection],
            ]),
            ["nas", componentProperties.devices?.nas],
            ["speaker", componentProperties.devices?.speakers],
            ["television", componentProperties.devices?.televisions],
            ["vacuum", componentProperties.devices?.vacuums],
          ].some(([deviceKey, deviceConfigList]) =>
            (deviceConfigList || []).some(
              (deviceConfigEntry) =>
                typeof deviceConfigEntry.id == "string" &&
                deviceConfigEntry.id &&
                selectionId === deviceKey + ":" + deviceConfigEntry.id,
            ),
          );
  }
  const getCurrentStates = () =>
      lightStream
        ? latestStatesByEntityId
        : Object.fromEntries(
            collectTrackedEntities().map((trackedEntry) => [
              trackedEntry.entityId,
              runtimeContext.states?.get(trackedEntry.entityId) || null,
            ]),
          ),
    publishStates = (incomingPatch = null) => {
      if (isPreviewSuspended || isPageHidden) return;
      const currentStates = getCurrentStates();
      if (lightStream && currentStates === lastPublishedStates) return;
      const shouldSendPatch = !!lightStream && supportsStatePatches && incomingPatch !== null;
      (postToStageFrame({
        type: "states",
        states: mergeMotorReverseStates(currentStates, shouldSendPatch ? incomingPatch : null),
        ...(shouldSendPatch
          ? {
              patch: true,
            }
          : {}),
      }),
        (lastPublishedStates = currentStates),
        lightStream || (focusDevicePopup?.updateStates?.(), onStatesUpdate?.(currentStates)));
    },
    registeredStateEntityIdsSet = new Set();
  function configureStateSubscriptions() {
    if (lightStream) {
      (lightStream.configure(
        collectTrackedEntities().map((subscribedEntry) => subscribedEntry.entityId),
        {
          additionalEntityIds: [
            ...collectLockEntities().map((lockedEntity) => lockedEntity.entityId),
            ...collectGenericDeviceEntities().map(
              (genericDeviceEntity) => genericDeviceEntity.entityId,
            ),
            ...collectWaterHeaterEntities().map((waterHeaterEntity) => waterHeaterEntity.entityId),
            ...collectEnvironmentExtraEntities().map(
              (environmentExtraEntity) => environmentExtraEntity.entityId,
            ),
            ...findCurtainMotorReverseEntities().map(
              (motorReverseEntity) => motorReverseEntity.entityId,
            ),
            ...(componentProperties.lights || []).map((lightEntity) => lightEntity.entityId),
            ...(componentProperties.security?.presenceSensors || []).map(
              (presenceSensorEntity) => presenceSensorEntity.entityId,
            ),
            ...(componentProperties.devices?.televisions || []).map(
              (televisionPowerEntity) => televisionPowerEntity.powerEntityId,
            ),
            ...collectVacuumEntries().flatMap((vacuumEntityEntry) => [
              ...(vacuumEntityEntry.relatedEntityIds || []),
              ...(vacuumEntityEntry.shortcuts || []).map(
                (shortcutEntity) => shortcutEntity.entityId,
              ),
            ]),
            ...(componentProperties.environment?.airers || []).map(
              (airerEntity) => airerEntity.entityId,
            ),
            ...(componentProperties.environment?.fans || []).map((fanEntity) => fanEntity.entityId),
            ...(componentProperties.environment?.airPurifiers || []).map(
              (airPurifierEntity) => airPurifierEntity.entityId,
            ),
            ...(componentProperties.environment?.waterHeaters || []).map(
              (waterHeaterExtraEntity) => waterHeaterExtraEntity.entityId,
            ),
          ],
        },
      ),
        syncLightStreamActive());
      return;
    }
    for (const registeredEntry of collectTrackedEntities())
      registeredEntry.entityId &&
        !registeredStateEntityIdsSet.has(registeredEntry.entityId) &&
        (registeredStateEntityIdsSet.add(registeredEntry.entityId),
        runtimeContext.registerRuntimeStateHandler?.(registeredEntry.entityId, publishStates));
  }
  function sendConfigUpdate() {
    if (!isStageReady || isDisposed || isPreviewSuspended) return;
    fetchClimateCapabilities();
    const configPayload = {
        properties: {
          ...componentProperties,
          devices: {
            ...componentProperties.devices,
            vacuums: collectVacuumEntries(),
          },
          lightingMode: normalizeLightingMode(componentProperties.lightingMode),
        },
        editing: isEditing,
        editingModule: editingModuleKind,
        editingSecurityKind: editingSecurityKind,
        editingVacuumId: editingVacuumId,
        rangeEditorOnly: isRangeEditorOnly,
        viewEditing: isViewEditing,
        editorCanvas: !!runtimeContext.editable && !isEditing,
        allowRangeEditing: isAuthorized && (isEditing || !!runtimeContext.editable),
        interactive: !isEditing && !runtimeContext.editable,
        selectedId: selectedId,
      },
      configJson = JSON.stringify(configPayload);
    if (configJson === lastConfigJson) {
      (updatePresentationLayout(), refreshActivityState(), publishStates());
      return;
    }
    ((lastConfigJson = configJson),
      (hasPresentedStage = false),
      (isReloadPending = true),
      refreshActivityState(true),
      updatePresentationLayout(true),
      postToStageFrame({
        type: "config",
        configId: ++configIdCounter,
        ...configPayload,
        states: mergeMotorReverseStates(getCurrentStates()),
      }),
      (lastPublishedStates = getCurrentStates()),
      isScenePresented || refreshActivityState(true));
  }
  function syncBackgroundHidden() {
    (hostElement.classList.toggle(
      "is-background-hidden",
      componentProperties.backgroundVisible === false,
    ),
      (hostElement.dataset.sceneStyle =
        componentProperties.sceneStyle === "warm-wood" ? "warm-wood" : "default"));
  }
  function setFocusActive(nextFocusActive) {
    isFocusActive !== nextFocusActive &&
      ((isFocusActive = nextFocusActive), onFocusChange(nextFocusActive));
  }
  function rejectPendingEdits(editRejectReason) {
    for (const pendingEdit of pendingEditsByRequestId.values())
      (clearTimeout(pendingEdit.timeout), pendingEdit.reject(new Error(editRejectReason)));
    pendingEditsByRequestId.clear();
  }
  function rejectPendingRangeRequests(rangeRejectReason) {
    for (const pendingRangeRequest of pendingRangeRequestsByRequestId.values())
      (clearTimeout(pendingRangeRequest.timeout),
        pendingRangeRequest.reject(new Error(rangeRejectReason)));
    pendingRangeRequestsByRequestId.clear();
  }
  function dismissFocus(immediate = false) {
    ((isVacuumPopupOpen = false),
      (activeCameraSelectionId = activeVacuumSelectionId = ""),
      closeCameraPreview(),
      closeVacuumPopup(),
      (isFocusPanelOpen = false),
      setFocusActive(false),
      postToStageFrame({
        type: "dismiss-focus",
        immediate: immediate,
      }));
  }
  let cameraPreview = null,
    openCameraPreviewId = "",
    activeCameraSelectionId = "";
  const closeCameraPreview = () => {
    const previousCameraPreview = cameraPreview;
    ((cameraPreview = null), (openCameraPreviewId = ""), previousCameraPreview?.close?.());
  };
  let vacuumPopup = null,
    openVacuumPopupId = "",
    activeVacuumSelectionId = "",
    isVacuumPopupOpen = false;
  const closeVacuumPopup = () => {
    const previousVacuumPopup = vacuumPopup;
    ((vacuumPopup = null), (openVacuumPopupId = ""), previousVacuumPopup?.close?.());
  };
  function handleDocumentClickAway(clickEvent) {
    cameraPreview?.contains?.(clickEvent.target) ||
      vacuumPopup?.contains?.(clickEvent.target) ||
      ((isFocusActive || isFocusPanelOpen) &&
        !hostElement.contains(clickEvent.target) &&
        dismissFocus());
  }
  function handleDocumentKeyDown(keyEvent) {
    (keyEvent.key === "Escape" && closePopupLayoutPreview(),
      (isFocusActive || isFocusPanelOpen) && keyEvent.key === "Escape" && dismissFocus());
  }
  function failSceneLoad(failureMessage) {
    ((hasLoadFailed = true),
      (isScenePresented = false),
      (hasPresentedStage = false),
      (isReloadPending = false),
      refreshActivityState(true),
      rejectPendingRangeRequests(failureMessage || "户型画面已关闭，请重新调整照射范围。"),
      postToStageFrame({
        type: "range-editor",
        open: false,
      }),
      setRangeEditingState(false),
      activeRequestsSet.forEach((abortableController) => abortableController.abort()),
      rejectPendingEdits("户型加载失败，请重新载入后调整视角。"),
      dismissFocus(true),
      clearTimeout(loadingTimeoutId),
      hostElement.classList.remove("is-loading"),
      hostElement.classList.add("is-load-error"),
      (loadingElement.hidden = false),
      (loadingElement.textContent = failureMessage || "3D 户型加载失败，请重新载入户型。"),
      onLoadError(new Error(loadingElement.textContent)));
  }
  function reloadStageFrame(reloadReason) {
    if (
      (reloadGeneration &&
        reportRuntimeLifecycle(reloadReason, {
          loadSequence: reloadGeneration + 1,
        }),
      closePopupLayoutPreview(),
      (isVacuumPopupOpen = false),
      (activeCameraSelectionId = activeVacuumSelectionId = ""),
      closeCameraPreview(),
      closeVacuumPopup(),
      (lastConfigJson = ""),
      (lastLayoutJson = ""),
      (presentationLayout = null),
      reloadGeneration++ &&
        (stageFrameElement.removeAttribute("src"),
        (stageFrameElement = createStageFrameElement()),
        hostElement.replaceChildren(stageFrameElement, loadingElement)),
      setRangeEditingState(false),
      activeRequestsSet.forEach((staleController) => staleController.abort()),
      rejectPendingEdits("户型已切换，请在新户型中重新调整视角。"),
      rejectPendingRangeRequests("户型已切换，请在新户型中重新调整照射范围。"),
      (isFocusPanelOpen = false),
      setFocusActive(false),
      (hasLoadFailed = false),
      (isScenePresented = false),
      (isStageReady = false),
      (hasPresentedStage = false),
      (isReloadPending = false),
      refreshActivityState(true),
      clearTimeout(loadingTimeoutId),
      hostElement.classList.remove("is-ready", "is-load-error"),
      hostElement.classList.toggle("is-loading", !!componentProperties.sceneId),
      hostElement.setAttribute("aria-busy", String(!!componentProperties.sceneId)),
      syncBackgroundHidden(),
      configureStateSubscriptions(),
      !componentProperties.sceneId)
    ) {
      ((stageFrameElement.hidden = true),
        (loadingElement.hidden = false),
        (loadingElement.textContent = "请在属性面板中配置 3D 户型"));
      return;
    }
    ((stageFrameElement.hidden = false),
      (loadingElement.hidden = false),
      (loadingElement.textContent = ""),
      loadingElement.setAttribute("aria-label", "正在准备 3D 户型"));
    const wallTrialModes = (new URLSearchParams(window.location.search).get("wall-trial") || "")
        .split(",")
        .filter((wallTrialMode) => ["shader", "single", "depth", "merge"].includes(wallTrialMode))
        .join(","),
      stageFrameUrl =
        INTERACTION3D_API_BASE +
        "/stage.html?" +
        new URLSearchParams({
          sceneId: componentProperties.sceneId,
          projectId: hostProjectId,
          componentId: componentDescriptor.id || "",
          lighting: normalizeLightingMode(componentProperties.lightingMode),
          ...(wallTrialModes
            ? {
                "wall-trial": wallTrialModes,
              }
            : {}),
          ...(new URLSearchParams(window.location.search).get("furniture-runtime") === "compact"
            ? {
                "furniture-runtime": "compact",
              }
            : {}),
          ...(new URLSearchParams(window.location.search).get("reflection-detail") === "low"
            ? {
                "reflection-detail": "low",
              }
            : {}),
          ...(new URLSearchParams(window.location.search).get("performance-diagnostics") === "1"
            ? {
                "performance-diagnostics": "1",
                ...(new URLSearchParams(window.location.search).get("reflection-work") ===
                "baseline"
                  ? {
                      "reflection-work": "baseline",
                    }
                  : {}),
              }
            : {}),
        });
    ((stageFrameElement.src = stageFrameUrl), isPreviewSuspended || scheduleLoadTimeout());
  }
  function scheduleLoadTimeout() {
    loadingTimeoutId = setTimeout(
      () => failSceneLoad("3D 户型加载较慢，请稍候；若一直没有画面，请重新载入户型。"),
      45000,
    );
  }
  const activeRequestsSet = new Set();
  async function handleStageMessage(messageEvent) {
    if (
      isDisposed ||
      messageEvent.origin !== location.origin ||
      messageEvent.source !== stageFrameElement.contentWindow ||
      messageEvent.data?.channel !== "hb-i3d-v1"
    )
      return;
    const stageMessage = messageEvent.data;
    if (
      !isEditing &&
      !runtimeContext.editable &&
      [
        "control",
        "vacuum-room",
        "camera-popup",
        "vacuum-popup",
        "focus-state",
        "vacuum-follow-state",
      ].includes(stageMessage.type) &&
      (isPageHidden ||
        isPageFrozen ||
        isPreviewSuspended ||
        document.hidden ||
        document.visibilityState === "hidden" ||
        !isHostActuallyVisible())
    )
      return;
    if (stageMessage.type === "runtime-diagnostic") {
      [
        "category-switch-start",
        "category-switch-applied",
        "source-adopt-start",
        "source-adopt-complete",
        "source-adopt-failed",
        "gpu-lost",
        "gpu-restored",
        "models-loading-resumed",
        "models-completion-resumed",
      ].includes(stageMessage.code) &&
        reportRuntimeLifecycle(stageMessage.code, {
          ...stageMessage.counts,
          loadSequence: reloadGeneration,
        });
      return;
    }
    if (
      (stageMessage.type === "vacuum-follow-state" &&
        ((isVacuumPopupOpen =
          stageMessage.active === true &&
          isAuthorized &&
          isScenePresented &&
          !isEditing &&
          !runtimeContext.editable),
        isVacuumPopupOpen && closeVacuumPopup(),
        setFocusActive(isVacuumPopupOpen || !!activeCameraSelectionId)),
      stageMessage.type === "vacuum-popup-close" && closeVacuumPopup(),
      stageMessage.type === "camera-popup-close" && closeCameraPreview(),
      stageMessage.type === "presentation-ui" &&
        (popupLayoutPreview?.resize(),
        focusDevicePopup?.resize(),
        vacuumPopup?.updateLayout?.(),
        cameraPreview?.updateLayout?.()),
      stageMessage.type === "camera-popup" &&
        isAuthorized &&
        isScenePresented &&
        !isEditing &&
        !runtimeContext.editable &&
        activeCameraSelectionId === stageMessage.id)
    ) {
      const cameraConfig = (componentProperties.security?.cameras || []).find(
        (cameraCandidate) =>
          "camera:" + cameraCandidate.id === stageMessage.id &&
          cameraCandidate.visible !== false &&
          cameraCandidate.entityId,
      );
      cameraConfig &&
        runtimeContext.openCameraPreview &&
        openCameraPreviewId !== stageMessage.id &&
        (closeCameraPreview(),
        closeVacuumPopup(),
        (openCameraPreviewId = stageMessage.id),
        (cameraPreview = runtimeContext.openCameraPreview(
          cameraConfig,
          () => {
            ((cameraPreview = null), (openCameraPreviewId = ""), dismissFocus());
          },
          {
            root: hostElement,
            frame: stageFrameElement,
            popupOpacity: componentProperties.popupOpacity,
            getPresentationLayout: () => presentationLayout,
            getPopupLayout: () => componentProperties.popupLayout?.camera,
          },
        )));
    }
    if (
      stageMessage.type === "vacuum-popup" &&
      !isVacuumPopupOpen &&
      isAuthorized &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable &&
      activeVacuumSelectionId === stageMessage.id
    ) {
      const vacuumPopupConfig = collectVacuumEntries().find(
        (vacuumCandidate) =>
          "vacuum:" + vacuumCandidate.id === stageMessage.id &&
          vacuumCandidate.visible !== false &&
          vacuumCandidate.entityId,
      );
      vacuumPopupConfig &&
        runtimeContext.openVacuumDetails &&
        openVacuumPopupId !== stageMessage.id &&
        (closeVacuumPopup(),
        (openVacuumPopupId = stageMessage.id),
        (vacuumPopup = runtimeContext.openVacuumDetails(
          vacuumPopupConfig,
          () => {
            ((vacuumPopup = null), (openVacuumPopupId = ""), dismissFocus());
          },
          {
            states: getCurrentStates(),
            root: hostElement,
            frame: stageFrameElement,
            popupOpacity: componentProperties.popupOpacity,
            getPresentationLayout: () => presentationLayout,
            getPopupLayout: () => componentProperties.popupLayout?.general,
          },
        )));
    }
    if (
      stageMessage.type === "vacuum-room" &&
      isAuthorized &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable
    ) {
      const vacuumRoomConfig = collectVacuumEntries().find(
          (vacuumRoomCandidate) =>
            vacuumRoomCandidate.id === stageMessage.vacuumId &&
            vacuumRoomCandidate.visible !== false &&
            vacuumRoomCandidate.entityId,
        ),
        vacuumShortcutConfig = vacuumRoomConfig?.shortcuts?.find(
          (shortcutCandidate) =>
            shortcutCandidate.id === stageMessage.shortcutId &&
            shortcutCandidate.visible !== false &&
            shortcutCandidate.entityId,
        );
      if (
        !vacuumShortcutConfig ||
        stageMessage.id !== "vacuum-room:" + vacuumRoomConfig.id + ":" + vacuumShortcutConfig.id
      )
        return;
      try {
        if (!runtimeContext.runVacuumRoom) throw new Error("清扫操作入口尚未准备好，请刷新页面。");
        (await runtimeContext.runVacuumRoom(vacuumShortcutConfig),
          postToStageFrame({
            type: "vacuum-room-result",
            id: stageMessage.id,
          }));
      } catch (roomError) {
        postToStageFrame({
          type: "vacuum-room-result",
          id: stageMessage.id,
          error: roomError.message,
        });
      }
    }
    if (stageMessage.type === "focus-state" && !isEditing && !runtimeContext.editable) {
      const isFocusSelectionKnown =
        isAuthorized && isScenePresented && isKnownSelectionId(stageMessage.id);
      ((activeCameraSelectionId =
        isFocusSelectionKnown && stageMessage.active === true ? stageMessage.id : ""),
        (activeVacuumSelectionId =
          isFocusSelectionKnown &&
          (stageMessage.active === true || stageMessage.panelOpen === true) &&
          stageMessage.id?.startsWith("vacuum:")
            ? stageMessage.id
            : ""),
        openCameraPreviewId &&
          openCameraPreviewId !== activeCameraSelectionId &&
          closeCameraPreview(),
        openVacuumPopupId && openVacuumPopupId !== activeVacuumSelectionId && closeVacuumPopup(),
        (isFocusPanelOpen = isFocusSelectionKnown && stageMessage.panelOpen === true),
        setFocusActive(
          isVacuumPopupOpen || (isFocusSelectionKnown && stageMessage.active === true),
        ));
    }
    (stageMessage.type === "model-metadata" &&
      ((componentMetadata = stageMessage.metadata), onReady(componentMetadata)),
      stageMessage.type === "ready" &&
        (isStageReady &&
          reportRuntimeLifecycle("stage-ready-repeat", {
            loadSequence: reloadGeneration,
          }),
        (supportsStatePatches = stageMessage.statePatches === true),
        (lastPublishedStates = null),
        (lastConfigJson = ""),
        (hasLoadFailed = false),
        (isStageReady = true),
        (componentMetadata = stageMessage.metadata),
        (defaultCamera = stageMessage.metadata?.camera),
        (activeCamera =
          componentProperties.floorCameras?.[componentProperties.floorSelection] ||
          componentProperties.camera ||
          defaultCamera),
        sendConfigUpdate(),
        isPreviewSuspended && refreshActivityState(true),
        onReady(stageMessage.metadata)),
      stageMessage.type === "presented" &&
        stageMessage.configId === configIdCounter &&
        isReloadPending &&
        ((isReloadPending = false),
        isScenePresented ||
          ((isScenePresented = true),
          (defaultCamera = stageMessage.camera || defaultCamera),
          (activeCamera =
            componentProperties.floorCameras?.[componentProperties.floorSelection] ||
            componentProperties.camera ||
            defaultCamera),
          clearTimeout(loadingTimeoutId),
          hostElement.classList.remove("is-loading", "is-load-error"),
          hostElement.classList.add("is-ready"),
          hostElement.setAttribute("aria-busy", "false"),
          onPresented()),
        (hasPresentedStage = true),
        refreshActivityState()),
      stageMessage.type === "error" && failSceneLoad(stageMessage.message));
    const isRangeEditorAvailable =
      isAuthorized &&
      isScenePresented &&
      (isEditing || runtimeContext.editable) &&
      normalizeLightingMode(componentProperties.lightingMode) === "region";
    if (stageMessage.type === "range-editor-state" && isRangeEditorAvailable) {
      const pendingRangeRequestEntry = pendingRangeRequestsByRequestId.get(stageMessage.requestId);
      if (stageMessage.requestId && !pendingRangeRequestEntry) return;
      (pendingRangeRequestEntry &&
        (clearTimeout(pendingRangeRequestEntry.timeout),
        pendingRangeRequestsByRequestId.delete(stageMessage.requestId),
        stageMessage.active === pendingRangeRequestEntry.open && !stageMessage.error
          ? pendingRangeRequestEntry.resolve()
          : pendingRangeRequestEntry.reject(
              new Error(stageMessage.error || "照射范围编辑未能打开。"),
            )),
        setRangeEditingState(
          stageMessage.active === true && !stageMessage.error,
          stageMessage.error || "",
        ));
    }
    if (
      (stageMessage.type === "range-overrides" &&
        isRangeEditorAvailable &&
        stageMessage.overrides &&
        typeof stageMessage.overrides == "object" &&
        !Array.isArray(stageMessage.overrides) &&
        ((componentProperties.lightRegionOverrides = structuredClone(stageMessage.overrides)),
        notifyEditSubscribers({
          action: "light-region-overrides",
          overrides: structuredClone(componentProperties.lightRegionOverrides),
        })),
      stageMessage.type === "edit" &&
        stageMessage.action === "camera" &&
        runtimeContext.editable &&
        isViewEditing)
    ) {
      const pendingEditEntry = pendingEditsByRequestId.get(stageMessage.requestId);
      pendingEditEntry &&
        ((activeCamera = stageMessage.camera),
        clearTimeout(pendingEditEntry.timeout),
        pendingEditsByRequestId.delete(stageMessage.requestId),
        pendingEditEntry.resolve(stageMessage.camera));
    }
    if (stageMessage.type === "edit" && isEditing && isAuthorized && isScenePresented) {
      if (
        (stageMessage.action === "focus-exited" && disposeFocusDevicePopup(),
        stageMessage.action === "focus-camera")
      ) {
        const respondedEditEntry = pendingEditsByRequestId.get(stageMessage.requestId);
        if (!respondedEditEntry) return;
        respondedEditEntry &&
          (clearTimeout(respondedEditEntry.timeout),
          pendingEditsByRequestId.delete(stageMessage.requestId),
          stageMessage.error
            ? respondedEditEntry.reject(new Error(stageMessage.error))
            : (["edit-light-camera", "preview-light-camera"].includes(respondedEditEntry.command) &&
                openFocusDevicePopup(respondedEditEntry.id),
              ["save-light-camera", "cancel-light-camera", "edit-follow-camera"].includes(
                respondedEditEntry.command,
              ) && disposeFocusDevicePopup(),
              respondedEditEntry.resolve(stageMessage)));
      }
      notifyEditSubscribers(stageMessage);
    }
    if (
      stageMessage.type === "control" &&
      isAuthorized &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable
    ) {
      const controlEntityId = stageMessage.command?.entityId;
      if (
        typeof controlEntityId != "string" ||
        !controlEntityId.trim() ||
        ![
          ...(componentProperties.security?.locks || []),
          ...collectDeviceExtraEntities(),
          ...collectEnvironmentExtraEntities(),
          ...(componentProperties.lights || []),
          ...(componentProperties.environment?.airConditioners || []),
          ...(componentProperties.environment?.airers || []),
          ...(componentProperties.environment?.fans || []),
          ...(componentProperties.environment?.airPurifiers || []),
          ...(componentProperties.environment?.waterHeaters || []),
          ...(componentProperties.environment?.curtains || []),
          ...(componentProperties.devices?.speakers || []),
          ...(componentProperties.devices?.televisions || []),
          ...(componentProperties.devices?.televisions || []).map((televisionConfigEntry) => ({
            entityId: televisionConfigEntry.powerEntityId || televisionConfigEntry.entityId,
          })),
        ].some((controlDeviceEntry) => controlDeviceEntry.entityId === controlEntityId)
      ) {
        postToStageFrame({
          type: "control-result",
          requestId: stageMessage.requestId,
          error: "此实体未绑定到当前 3D 控件，请检查设备配置。",
        });
        return;
      }
      const reloadGenerationSnapshot = reloadGeneration,
        postFrameMessage = (framePayload) => {
          reloadGenerationSnapshot === reloadGeneration &&
            isScenePresented &&
            isAuthorized &&
            postToStageFrame(framePayload);
        },
        controlAbortController = new AbortController();
      activeRequestsSet.add(controlAbortController);
      const controlTimeoutId = setTimeout(() => controlAbortController.abort(), 12000);
      try {
        const controlResponse = await fetch(INTERACTION3D_API_BASE + "/control", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              ...stageMessage.command,
              ...(["lock", "climate", "cover", "fan", "water_heater"].includes(
                stageMessage.command?.domain,
              ) ||
              [
                "climate-extra",
                "airer-extra",
                "speaker",
                "television",
                "fan-extra",
                "purifier-extra",
                "water-heater-extra",
                "device-extra",
              ].includes(stageMessage.command?.deviceKind)
                ? {
                    projectId: hostProjectId,
                    componentId: componentDescriptor.id,
                  }
                : {}),
            }),
            signal: controlAbortController.signal,
          }),
          controlResult = await controlResponse.json().catch(() => ({}));
        if (!controlResponse.ok)
          throw new Error(
            typeof controlResult.detail == "string"
              ? controlResult.detail
              : controlResult.detail?.message || "设备操作失败。",
          );
        postFrameMessage({
          type: "control-result",
          requestId: stageMessage.requestId,
        });
      } catch (controlError) {
        postFrameMessage({
          type: "control-result",
          requestId: stageMessage.requestId,
          error:
            controlError.name === "AbortError"
              ? "请求超时，请检查设备状态。"
              : controlError.message,
          timedOut: controlError.name === "AbortError",
        });
      } finally {
        (clearTimeout(controlTimeoutId), activeRequestsSet.delete(controlAbortController));
      }
    }
  }
  (window.addEventListener("message", handleStageMessage),
    window.addEventListener("pointerdown", handleDocumentClickAway),
    window.addEventListener("keydown", handleDocumentKeyDown));
  const listenerTarget = document.addEventListener ? document : window;
  listenerTarget.addEventListener("hb-i3d-preview-scope", syncPreviewSuspension);
  const activityEventNames = [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "wheel",
      "keydown",
      "keyup",
    ],
    activityListenerOptions = {
      capture: true,
      passive: true,
    };
  for (const activityEventName of activityEventNames)
    listenerTarget.addEventListener(
      activityEventName,
      handleActivityInput,
      activityListenerOptions,
    );
  (listenerTarget.addEventListener("visibilitychange", handleVisibilityChange),
    listenerTarget.addEventListener("transitionend", handleVisibilityChange, true),
    listenerTarget.addEventListener("animationend", handleVisibilityChange, true),
    window.addEventListener("pagehide", handlePageHide),
    window.addEventListener("pageshow", handlePageShow),
    window.addEventListener("blur", handleWindowBlur));
  const intersectionObserver =
    typeof IntersectionObserver > "u"
      ? null
      : new IntersectionObserver(
          (observerEntries) => {
            for (const observerEntry of observerEntries)
              observerEntry.target === hostElement &&
                (isStageIntersecting =
                  observerEntry.isIntersecting && observerEntry.intersectionRatio > 0);
            refreshActivityState();
          },
          {
            threshold: [0, 0.001],
          },
        );
  intersectionObserver?.observe(hostElement);
  let observedAncestorList = [];
  function observeVisibilityAncestors() {
    if (isDisposed) return;
    const ancestorChain = [];
    for (let ancestorNode = hostElement; ancestorNode; ancestorNode = ancestorNode.parentElement)
      ancestorChain.push(ancestorNode);
    if (!(
      ancestorChain.length === observedAncestorList.length &&
      ancestorChain.every(
        (ancestor, ancestorIndex) => ancestor === observedAncestorList[ancestorIndex],
      )
    )) {
      ((observedAncestorList = ancestorChain), mutationObserver?.disconnect());
      for (const observedAncestor of ancestorChain)
        mutationObserver?.observe(observedAncestor, {
          attributes: true,
          childList: true,
          attributeFilter: ["hidden", "inert", "aria-hidden", "style", "class"],
        });
    }
  }
  const mutationObserver =
    typeof MutationObserver > "u"
      ? null
      : new MutationObserver(() => {
          (observeVisibilityAncestors(), updatePresentationLayout());
        });
  observeVisibilityAncestors();
  let lastLayoutJson = "",
    presentationLayout = null;
  function updatePresentationLayout(forceUpdate = false) {
    refreshActivityState();
    const hostBounds = hostElement.getBoundingClientRect();
    if (!hostBounds.width || !hostElement.clientWidth) return;
    const scaleX = hostElement.clientWidth / hostBounds.width,
      scaleY =
        hostElement.clientHeight > 0 && hostBounds.height > 0
          ? hostElement.clientHeight / hostBounds.height
          : scaleX;
    ((stageFrameElement.style.width = hostBounds.width + "px"),
      (stageFrameElement.style.height = hostBounds.height + "px"),
      (stageFrameElement.style.transform =
        scaleX === scaleY ? "scale(" + scaleX + ")" : "scale(" + scaleX + "," + scaleY + ")"));
    const layoutSource =
        componentProperties.layoutMode === "fill"
          ? runtimeContext.document?.canvas
          : componentDescriptor.position,
      layoutScale =
        componentProperties.layoutMode === "fill"
          ? 1
          : Math.max(0.01, Math.min(5, Number(componentDescriptor.style?.scale) || 1)),
      layoutWidth = Number(layoutSource?.width) * layoutScale,
      layoutHeight = Number(layoutSource?.height) * layoutScale,
      resizeContentScale = Number(runtimeContext.document?.canvas?.resizeContentScale),
      safeContentScale =
        Number.isFinite(resizeContentScale) && resizeContentScale > 0 ? resizeContentScale : 1,
      layoutPayload = {
        type: "presentation-layout",
        width:
          (Number.isFinite(layoutWidth) && layoutWidth > 0
            ? layoutWidth
            : hostElement.clientWidth || 1) / safeContentScale,
        height:
          (Number.isFinite(layoutHeight) && layoutHeight > 0
            ? layoutHeight
            : hostElement.clientHeight || 1) / safeContentScale,
      };
    ((presentationLayout = layoutPayload),
      popupLayoutPreview?.resize(),
      focusDevicePopup?.resize(),
      vacuumPopup?.updateLayout?.(),
      cameraPreview?.updateLayout?.());
    const layoutJson = JSON.stringify(layoutPayload);
    (forceUpdate === true || layoutJson !== lastLayoutJson) &&
      ((lastLayoutJson = layoutJson), postToStageFrame(layoutPayload));
  }
  const hostResizeObserver = new ResizeObserver(updatePresentationLayout);
  (hostResizeObserver.observe(hostElement),
    window.addEventListener("resize", updatePresentationLayout),
    syncPreviewSuspension(),
    reloadStageFrame());
  const initialLayoutFrameId = requestAnimationFrame(updatePresentationLayout),
    runtimeHandle = () => {
      if (!isDisposed) {
        (closePopupLayoutPreview(),
          (hasPresentedStage = false),
          refreshActivityState(true),
          setFocusActive(false),
          closeCameraPreview(),
          closeVacuumPopup(),
          lightStream?.dispose(),
          editSubscribersSet.clear(),
          (isRangeEditing = false),
          hostElement.classList.remove("is-range-editing"),
          (isDisposed = true),
          clearTimeout(loadingTimeoutId),
          cancelAnimationFrame(initialLayoutFrameId),
          hostResizeObserver.disconnect(),
          intersectionObserver?.disconnect(),
          mutationObserver?.disconnect(),
          rejectPendingEdits("户型画面已关闭，请重新调整。"),
          rejectPendingRangeRequests("户型画面已关闭，请重新调整照射范围。"),
          window.removeEventListener("resize", updatePresentationLayout),
          window.removeEventListener("message", handleStageMessage),
          window.removeEventListener("pointerdown", handleDocumentClickAway),
          window.removeEventListener("keydown", handleDocumentKeyDown));
        for (const removedEventName of activityEventNames)
          listenerTarget.removeEventListener(
            removedEventName,
            handleActivityInput,
            activityListenerOptions,
          );
        (listenerTarget.removeEventListener("visibilitychange", handleVisibilityChange),
          listenerTarget.removeEventListener("hb-i3d-preview-scope", syncPreviewSuspension),
          listenerTarget.removeEventListener("transitionend", handleVisibilityChange, true),
          listenerTarget.removeEventListener("animationend", handleVisibilityChange, true),
          window.removeEventListener("pagehide", handlePageHide),
          window.removeEventListener("pageshow", handlePageShow),
          window.removeEventListener("blur", handleWindowBlur),
          activeRequestsSet.forEach((abortedRequest) => abortedRequest.abort()),
          stageFrameElement.removeAttribute("src"),
          hostElement.replaceChildren());
      }
    };
  return (
    (runtimeHandle.update = (
      nextProperties,
      nextSelectedId = selectedId,
      nextEditing = null,
      nextDescriptor = componentDescriptor,
    ) => {
      if (isDisposed) return;
      ((componentDescriptor = nextDescriptor),
        isEditing && nextEditing && nextEditing.module === "security"
          ? ((editingModuleKind = "security"),
            (editingSecurityKind = ["camera", "presence", "lock"].includes(nextEditing.securityKind)
              ? nextEditing.securityKind
              : ""),
            (editingVacuumId = ""))
          : isEditing &&
            nextEditing &&
            [
              "light",
              "climate",
              "fan",
              "purifier",
              "water-heater",
              "airer",
              "cover",
              "nas",
              "television",
              "speaker",
              "vacuum",
              "vacuum-shortcut",
              "temperature-humidity",
              ...GENERIC_DEVICE_KINDS,
            ].includes(nextEditing.module) &&
            ((editingModuleKind = nextEditing.module),
            (editingSecurityKind = ""),
            (editingVacuumId =
              editingModuleKind === "vacuum-shortcut" ? String(nextEditing.vacuumId || "") : "")),
        (nextSelectedId !== selectedId ||
          nextProperties.floorSelection !== componentProperties.floorSelection) &&
          disposeFocusDevicePopup());
      const previousSceneId = componentProperties.sceneId,
        previousCameraJson = JSON.stringify(componentProperties.camera),
        previousLightingMode = normalizeLightingMode(componentProperties.lightingMode),
        previousCameraPreviewJson = JSON.stringify(
          (componentProperties.security?.cameras || []).find(
            (previewCameraCandidate) =>
              "camera:" + previewCameraCandidate.id === openCameraPreviewId,
          ),
        ),
        previousVacuumPopupJson = JSON.stringify(
          (componentProperties.devices?.vacuums || []).find(
            (previewVacuumCandidate) => "vacuum:" + previewVacuumCandidate.id === openVacuumPopupId,
          ),
        ),
        previousFloorSelection = componentProperties.floorSelection;
      ((componentProperties = structuredClone(nextProperties)),
        (selectedId = nextSelectedId),
        configureStateSubscriptions(),
        syncBackgroundHidden(),
        cameraPreview?.updateLayout?.(),
        vacuumPopup?.updateLayout?.(),
        cameraPreview &&
          (previousFloorSelection !== componentProperties.floorSelection ||
            previousCameraPreviewJson !==
              JSON.stringify(
                (componentProperties.security?.cameras || []).find(
                  (refreshedCameraCandidate) =>
                    "camera:" + refreshedCameraCandidate.id === openCameraPreviewId,
                ),
              )) &&
          dismissFocus(true),
        vacuumPopup &&
          (previousFloorSelection !== componentProperties.floorSelection ||
            previousVacuumPopupJson !==
              JSON.stringify(
                (componentProperties.devices?.vacuums || []).find(
                  (refreshedVacuumCandidate) =>
                    "vacuum:" + refreshedVacuumCandidate.id === openVacuumPopupId,
                ),
              )) &&
          dismissFocus(true),
        isViewEditing &&
          (previousSceneId !== componentProperties.sceneId ||
            previousLightingMode !== normalizeLightingMode(componentProperties.lightingMode) ||
            previousCameraJson !== JSON.stringify(componentProperties.camera)) &&
          ((isViewEditing = false),
          (activeCamera =
            componentProperties.floorCameras?.[componentProperties.floorSelection] ||
            componentProperties.camera ||
            defaultCamera),
          hostElement.classList.remove("is-view-editing"),
          (stageFrameElement.style.pointerEvents = "none")),
        previousSceneId !== componentProperties.sceneId ||
        previousLightingMode !== normalizeLightingMode(componentProperties.lightingMode)
          ? reloadStageFrame(
              previousSceneId !== componentProperties.sceneId
                ? "load-scene-change"
                : "load-mode-change",
            )
          : sendConfigUpdate());
    }),
    (runtimeHandle.previewLockMotion = (lockEntityId, shouldOpen = true) =>
      isDisposed ||
      !isEditing ||
      editingModuleKind !== "security" ||
      editingSecurityKind !== "lock" ||
      !lockEntityId
        ? false
        : (postToStageFrame({
            type: "editor-command",
            command: "preview-lock-motion",
            id: lockEntityId,
            value: shouldOpen === false ? "closed" : "open",
          }),
          true)),
    (runtimeHandle.setPageVisible = (isVisible) => {
      isDisposed ||
        isPageHidden === !isVisible ||
        ((isPageHidden = !isVisible),
        (hostElement.inert = isPageHidden || !isAuthorized),
        isPageHidden && (closePopupLayoutPreview(), dismissFocus(true)),
        refreshActivityState(true),
        isPageHidden || (updatePresentationLayout(), lightStream || publishStates()));
    }),
    (runtimeHandle.closePopupLayoutPreview = closePopupLayoutPreview),
    (runtimeHandle.previewPopupLayout = (layoutKind, layoutOptions = {}) =>
      isDisposed ||
      !isAuthorized ||
      !runtimeContext.editable ||
      isPageHidden ||
      document.hidden ||
      isPreviewSuspended ||
      isViewEditing ||
      isRangeEditing ||
      !["general", "camera"].includes(layoutKind)
        ? false
        : (popupLayoutPreview ||
            (dismissFocus(true),
            (popupLayoutPreview = createPopupLayoutPreview(
              hostElement,
              () => presentationLayout,
              closePopupLayoutPreview,
            ))),
          popupLayoutPreview.update(layoutKind, layoutOptions),
          true)),
    (runtimeHandle.command = (command) =>
      postToStageFrame({
        type: "editor-command",
        command: command,
      })),
    (runtimeHandle.subscribeEdit = (listener) =>
      isDisposed || typeof listener != "function"
        ? () => {}
        : (editSubscribersSet.add(listener), () => editSubscribersSet.delete(listener))),
    (runtimeHandle.openRangeEditor = () => {
      if (
        (closePopupLayoutPreview(),
        isDisposed || !isAuthorized || !(isEditing || runtimeContext.editable))
      )
        return Promise.reject(new Error("请在已授权的控件编辑器中调整照射范围。"));
      if (!isScenePresented)
        return Promise.reject(new Error("户型还在加载，请稍候再调整照射范围。"));
      if (normalizeLightingMode(componentProperties.lightingMode) !== "region")
        return Promise.reject(new Error("请先选择轻量柔光模式。"));
      if (isRangeEditing) return Promise.resolve();
      const existingRangeRequest = pendingRangeRequestsByRequestId.values().next().value;
      if (existingRangeRequest) return existingRangeRequest.promise;
      isViewEditing && runtimeHandle.setViewEditing(false);
      const rangeRequestId = "range-" + ++requestIdCounter;
      let rangeRequestResolve, rangeRequestReject;
      const rangeRequestPromise = new Promise((rangeResolve, rangeReject) => {
          ((rangeRequestResolve = rangeResolve), (rangeRequestReject = rangeReject));
        }),
        rangeRequestTimeoutId = setTimeout(() => {
          (pendingRangeRequestsByRequestId.delete(rangeRequestId),
            postToStageFrame({
              type: "range-editor",
              open: false,
            }),
            setRangeEditingState(false),
            rangeRequestReject(new Error("打开照射范围编辑超时，请重试。")));
        }, 5000);
      return (
        pendingRangeRequestsByRequestId.set(rangeRequestId, {
          resolve: rangeRequestResolve,
          reject: rangeRequestReject,
          timeout: rangeRequestTimeoutId,
          promise: rangeRequestPromise,
          open: true,
        }),
        postToStageFrame({
          type: "range-editor",
          open: true,
          requestId: rangeRequestId,
        }),
        rangeRequestPromise
      );
    }),
    (runtimeHandle.flushRangeEditor = () => {
      if (isDisposed || !isAuthorized || !isScenePresented || !isRangeEditing)
        return Promise.reject(new Error("请先打开照射范围编辑。"));
      const flushRequestId = "range-" + ++requestIdCounter;
      return new Promise((flushResolve, flushReject) => {
        const flushTimeoutId = setTimeout(() => {
          (pendingRangeRequestsByRequestId.delete(flushRequestId),
            flushReject(new Error("读取照射范围超时，请重试。")));
        }, 5000);
        (pendingRangeRequestsByRequestId.set(flushRequestId, {
          resolve: flushResolve,
          reject: flushReject,
          timeout: flushTimeoutId,
          open: true,
        }),
          postToStageFrame({
            type: "range-editor",
            flush: true,
            requestId: flushRequestId,
          }));
      });
    }),
    (runtimeHandle.closeRangeEditor = ({ flush: shouldFlush = false } = {}) => {
      if ((rejectPendingRangeRequests("照射范围编辑已取消。"), !shouldFlush)) {
        (postToStageFrame({
          type: "range-editor",
          open: false,
        }),
          setRangeEditingState(false));
        return;
      }
      if (isDisposed || !isAuthorized || !isScenePresented)
        return Promise.reject(new Error("户型画面暂不可用，请重新打开照射范围。"));
      const closeRequestId = "range-" + ++requestIdCounter;
      return new Promise((closeResolve, closeReject) => {
        const closeTimeoutId = setTimeout(() => {
          (pendingRangeRequestsByRequestId.delete(closeRequestId),
            closeReject(new Error("读取照射范围超时，请重试。")));
        }, 5000);
        (pendingRangeRequestsByRequestId.set(closeRequestId, {
          resolve: closeResolve,
          reject: closeReject,
          timeout: closeTimeoutId,
          open: false,
        }),
          postToStageFrame({
            type: "range-editor",
            open: false,
            requestId: closeRequestId,
          }));
      });
    }),
    (runtimeHandle.setAuthorized = (nextAuthorized) => {
      const authorizedChanged = isAuthorized !== (nextAuthorized === true);
      ((isAuthorized = nextAuthorized === true),
        (hostElement.inert = !isAuthorized || isPageHidden),
        refreshActivityState(),
        isAuthorized ||
          (closePopupLayoutPreview(),
          runtimeHandle.closeRangeEditor(),
          rejectPendingEdits("授权验证暂不可用，请恢复后重新调整。"),
          dismissFocus(true),
          activeRequestsSet.forEach((activeRequest) => activeRequest.abort())),
        authorizedChanged && (isEditing || runtimeContext.editable) && sendConfigUpdate());
    }),
    Object.defineProperty(runtimeHandle, "metadata", {
      get: () => componentMetadata,
    }),
    Object.defineProperty(runtimeHandle, "presentationLayout", {
      get: () => presentationLayout,
    }),
    Object.defineProperty(runtimeHandle, "ready", {
      get: () => isScenePresented && !isDisposed && isAuthorized,
    }),
    Object.defineProperty(runtimeHandle, "viewEditing", {
      get: () => isViewEditing,
    }),
    Object.defineProperty(runtimeHandle, "viewCamera", {
      get: () => activeCamera,
    }),
    Object.defineProperty(runtimeHandle, "rangeEditing", {
      get: () => isRangeEditing && !isDisposed && isAuthorized,
    }),
    (runtimeHandle.setViewEditing = (nextViewEditing) => {
      if ((nextViewEditing && closePopupLayoutPreview(), !runtimeContext.editable || isDisposed))
        throw new Error("请在编辑器中调整户型视角。");
      if (nextViewEditing && !isScenePresented) throw new Error("户型还在加载，请稍候再调整视角。");
      (nextViewEditing &&
        (isRangeEditing || pendingRangeRequestsByRequestId.size) &&
        runtimeHandle.closeRangeEditor(),
        (isViewEditing = nextViewEditing === true),
        isViewEditing ||
          (activeCamera =
            componentProperties.floorCameras?.[componentProperties.floorSelection] ||
            componentProperties.camera ||
            defaultCamera),
        hostElement.classList.toggle("is-view-editing", isViewEditing),
        (stageFrameElement.style.pointerEvents = isViewEditing || isRangeEditing ? "auto" : "none"),
        sendConfigUpdate());
    }),
    (runtimeHandle.viewCommand = (viewCommandName, viewCommandValue) =>
      new Promise((viewResolve, viewReject) => {
        if (!runtimeContext.editable || !isViewEditing || !isScenePresented || isDisposed) {
          viewReject(new Error("请先进入户型视角调整。"));
          return;
        }
        const viewRequestId = "view-" + ++requestIdCounter,
          viewTimeoutId = setTimeout(() => {
            (pendingEditsByRequestId.delete(viewRequestId),
              viewReject(new Error("读取视角超时，请重试。")));
          }, 5000);
        (pendingEditsByRequestId.set(viewRequestId, {
          resolve: viewResolve,
          reject: viewReject,
          timeout: viewTimeoutId,
        }),
          postToStageFrame({
            type: "editor-command",
            command: viewCommandName,
            value: viewCommandValue,
            requestId: viewRequestId,
          }));
      })),
    (runtimeHandle.captureView = () => runtimeHandle.viewCommand("save-camera")),
    (runtimeHandle.focusCommand = (
      focusCommandName,
      focusTargetId = selectedId,
      focusCommandValue,
    ) =>
      new Promise((focusResolve, focusReject) => {
        if (!isEditing || !isScenePresented || isDisposed || !isAuthorized) {
          focusReject(new Error("户型还在加载，请稍候再设置聚焦视角。"));
          return;
        }
        const focusRequestId = "focus-" + ++requestIdCounter,
          focusTimeoutId = setTimeout(() => {
            (pendingEditsByRequestId.delete(focusRequestId),
              focusReject(new Error("读取聚焦视角超时，请重试。")));
          }, 5000);
        (pendingEditsByRequestId.set(focusRequestId, {
          resolve: focusResolve,
          reject: focusReject,
          timeout: focusTimeoutId,
          command: focusCommandName,
          id: focusTargetId,
        }),
          postToStageFrame({
            type: "editor-command",
            command: focusCommandName,
            id: focusTargetId,
            value: focusCommandValue,
            requestId: focusRequestId,
          }));
      })),
    runtimeHandle
  );
}
