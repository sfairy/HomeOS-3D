import { createAccessMonitor } from "./access-monitor.js?v=20260905-interaction3d-v1-20260905-i3d-polish-v1-20260906-access-state-v2-access-poll-30s-v1";
import { createInteraction3dCover } from "./cover.js?v=20260905-interaction3d-cover-v1-20260908-access-lock-v1";
import { createInteraction3dFocusLayout } from "./focus-layout.js?v=20260911-navigation-light-v14";
export async function requestInteraction3dAccess() {
  const abortController = new AbortController(),
    accessTimeoutId = setTimeout(() => abortController.abort(), 5000);
  try {
    const accessResponse = await fetch("/api/v1/modules/interaction3d/access", {
      cache: "no-store",
      credentials: "same-origin",
      signal: abortController.signal,
    });
    if (!accessResponse.ok) {
      const accessError = new Error(
        accessResponse.status === 403
          ? "3D 交互授权不可用，请在授权信息中查看。"
          : accessResponse.status === 401
            ? "登录状态已失效，请重新登录。"
            : "暂时无法验证 3D 交互授权，请稍候重试。",
      );
      throw ((accessError.status = accessResponse.status), accessError);
    }
    const responseBody = await accessResponse.json();
    if (
      responseBody?.allowed !== true ||
      !Number.isFinite(Number(responseBody.validForSeconds)) ||
      Number(responseBody.validForSeconds) <= 0
    ) {
      const accessGrantError = new Error("暂时无法验证 3D 交互授权，请稍候重试。");
      throw (
        (accessGrantError.status = responseBody?.allowed === false ? 403 : 502),
        accessGrantError
      );
    }
    return responseBody;
  } finally {
    clearTimeout(accessTimeoutId);
  }
}
let accessMonitor;
const editorViewsById = new Map(),
  viewListenersById = new Map();
function emitEditorViewEvent(editorViewId, listenerError) {
  for (const viewListener of viewListenersById.get(editorViewId) || []) viewListener(listenerError);
}
export function getInteraction3dEditorView(editorId) {
  return editorViewsById.get(editorId);
}
export function waitInteraction3dEditorView(targetEditorId) {
  return new Promise((resolveView, rejectView) => {
    const removeViewWaiter = () => {
        (clearTimeout(waitTimeoutId),
          viewListenersById.get(targetEditorId)?.delete(handleViewUpdate),
          viewListenersById.get(targetEditorId)?.size || viewListenersById.delete(targetEditorId));
      },
      handleViewUpdate = (viewError) => {
        const editorView = editorViewsById.get(targetEditorId);
        viewError
          ? (removeViewWaiter(), rejectView(viewError))
          : editorView?.ready &&
            editorView.metadata &&
            (removeViewWaiter(), resolveView(editorView));
      },
      waitTimeoutId = setTimeout(() => {
        (removeViewWaiter(), rejectView(new Error("户型准备较慢，请稍候重试。")));
      }, 25000);
    (viewListenersById.has(targetEditorId) || viewListenersById.set(targetEditorId, new Set()),
      viewListenersById.get(targetEditorId).add(handleViewUpdate),
      handleViewUpdate());
  });
}
export function cancelOtherInteraction3dViews(currentEditorId) {
  for (const [otherEditorId, otherEditorView] of editorViewsById)
    (otherEditorId !== currentEditorId &&
      otherEditorView.viewEditing &&
      otherEditorView.setViewEditing(false),
      otherEditorId !== currentEditorId && otherEditorView.closePopupLayoutPreview?.(),
      otherEditorId !== currentEditorId &&
        otherEditorView.rangeEditing &&
        otherEditorView.closeRangeEditor?.());
}
function getAccessMonitor() {
  return (
    accessMonitor ||
    ((accessMonitor = createAccessMonitor({
      requestGrant: requestInteraction3dAccess,
    })),
    document.addEventListener("visibilitychange", () =>
      document.hidden ? accessMonitor.suspend() : accessMonitor.resume(),
    ),
    window.addEventListener("pagehide", () => accessMonitor.suspend()),
    window.addEventListener("pageshow", () => {
      document.hidden || accessMonitor.resume();
    }),
    document.hidden && accessMonitor.suspend(),
    accessMonitor)
  );
}
export function subscribeInteraction3dAccess(onAccessChange) {
  return getAccessMonitor().subscribe(onAccessChange);
}
export function renderInteraction3d(component, options = {}) {
  const hostElement = document.createElement("section");
  ((hostElement.className = "hb-interaction3d-host"),
    hostElement.setAttribute("aria-label", "3D 交互"));
  let isDisposed = false,
    isMounting = false,
    isMounted = false,
    operationCount = 0,
    interaction3dInstance,
    isPageVisible = options.prewarmStage !== true;
  hostElement.setInteraction3dPageVisible = (shouldShowPage) => {
    ((isPageVisible = shouldShowPage !== false),
      interaction3dInstance?.setPageVisible?.(isPageVisible));
  };
  let styleLinkElement;
  const focusLayout = createInteraction3dFocusLayout(hostElement, options);
  (hostElement.classList.toggle(
    "is-background-hidden",
    component.properties?.backgroundVisible === false,
  ),
    (hostElement.updateInteraction3d = (nextComponent, contentDocument) => {
      ((component = nextComponent),
        (options.document = contentDocument),
        hostElement.classList.toggle(
          "is-background-hidden",
          component.properties?.backgroundVisible === false,
        ),
        interaction3dInstance?.update(component.properties || {}, undefined, null, component),
        focusLayout.refresh());
    }));
  function lockInteraction3d() {
    (focusLayout.setActive(false),
      (operationCount += 1),
      (isMounting = false),
      (isMounted = false),
      editorViewsById.get(component.id) === interaction3dInstance &&
        editorViewsById.delete(component.id),
      isDisposed ||
        emitEditorViewEvent(component.id, new Error("3D 户型暂不可用，请检查授权或重新载入。")),
      interaction3dInstance?.(),
      (interaction3dInstance = null),
      styleLinkElement?.remove(),
      (styleLinkElement = null),
      hostElement.dataset.access !== "locked" &&
        hostElement.replaceChildren(createInteraction3dCover()),
      (hostElement.dataset.access = "locked"),
      hostElement.setAttribute("aria-busy", "false"));
  }
  const unsubscribeAccess = subscribeInteraction3dAccess(async (accessState) => {
    if (isDisposed) return;
    if (!accessState.allowed) {
      if (accessState.status === "denied") return lockInteraction3d(accessState.message);
      if ((interaction3dInstance?.setAuthorized(false), hostElement.dataset.access === "locked")) {
        hostElement.setAttribute("aria-busy", accessState.status === "checking" ? "true" : "false");
        return;
      }
      if (
        ((hostElement.dataset.access = "pending"),
        hostElement.setAttribute("aria-busy", "true"),
        !isMounted)
      ) {
        ((operationCount += 1), (isMounting = false));
        const pendingElement = document.createElement("div");
        ((pendingElement.className = "i3d-access-pending"),
          pendingElement.setAttribute("role", "status"),
          pendingElement.setAttribute("aria-label", "正在准备 3D 户型"),
          hostElement.replaceChildren(pendingElement));
      }
      return;
    }
    if (isMounted) {
      (interaction3dInstance?.setAuthorized(true),
        (hostElement.dataset.access = "allowed"),
        hostElement.setAttribute("aria-busy", "false"),
        options.editable && emitEditorViewEvent(component.id));
      return;
    }
    if (isMounting) return;
    isMounting = true;
    const operationToken = ++operationCount;
    try {
      const runtimeModule =
        await import("../../../api/v1/modules/interaction3d/runtime.js?v=20260927-follow-ui-v1-20260914-popup-preview-v1-warm-popups-v1-20260923-lazy-stage-v1-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v2-reload-diagnostics-v2");
      if (isDisposed || operationToken !== operationCount || document.hidden) return;
      ((styleLinkElement = document.createElement("link")),
        (styleLinkElement.rel = "stylesheet"),
        (styleLinkElement.href =
          "/api/v1/modules/interaction3d/runtime.css?v=20260923-lock-entity-spacing-v2-20260926-fan-v1"),
        hostElement.append(styleLinkElement));
      const mountElement = document.createElement("div");
      (hostElement.replaceChildren(styleLinkElement, mountElement),
        (interaction3dInstance = runtimeModule.mountInteraction3d(mountElement, {
          component: component,
          context: options,
          onPresented: () => {
            (focusLayout.refresh(), options.editable && emitEditorViewEvent(component.id));
          },
          onLoadError: (loadError) => {
            options.editable && emitEditorViewEvent(component.id, loadError);
          },
          onFocusChange: (isFocused) => focusLayout.setActive(isFocused),
        })),
        interaction3dInstance.setPageVisible?.(isPageVisible),
        options.editable && editorViewsById.set(component.id, interaction3dInstance),
        (hostElement.dataset.access = "allowed"),
        hostElement.setAttribute("aria-busy", "false"),
        (isMounted = true));
    } catch {
      if (!isDisposed && operationToken === operationCount) {
        (styleLinkElement?.remove(), (styleLinkElement = null));
        const errorElement = document.createElement("div");
        ((errorElement.className = "i3d-access-pending"),
          (errorElement.textContent = "户型暂时无法载入，请稍候重试。"),
          errorElement.setAttribute("role", "status"),
          hostElement.replaceChildren(errorElement),
          (hostElement.dataset.access = "pending"),
          options.editable &&
            emitEditorViewEvent(component.id, new Error(errorElement.textContent)));
      }
    } finally {
      operationToken === operationCount && (isMounting = false);
    }
  });
  return (
    options.cleanup?.(() => {
      ((isDisposed = true),
        unsubscribeAccess(),
        lockInteraction3d("3D 交互已停止。"),
        focusLayout.dispose());
    }),
    hostElement
  );
}
