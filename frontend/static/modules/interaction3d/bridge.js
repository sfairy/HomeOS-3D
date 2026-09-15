import { createAccessMonitor } from "./access-monitor.js?v=20260916013557";
import { createInteraction3dCover } from "./cover.js?v=20260916013557";
import { createInteraction3dFocusLayout } from "./focus-layout.js?v=20260916013557";
export async function requestInteraction3dAccess() {
  const abortController = new AbortController();
  const abortTimeoutId = setTimeout(() => abortController.abort(), 5000);
  try {
    const accessResponse = await fetch("/api/v1/modules/interaction3d/access", {
      cache: "no-store",
      credentials: "same-origin",
      signal: abortController.signal
    });
    if (!accessResponse.ok) {
      const accessError = new Error(
        accessResponse.status === 403
          ? "3D 交互授权不可用，请在授权信息中查看。"
          : accessResponse.status === 401
            ? "登录状态已失效，请重新登录。"
            : "暂时无法验证 3D 交互授权，请稍候重试。"
      );
      accessError.status = accessResponse.status;
      throw accessError;
    }
    const accessGrant = await accessResponse.json();
    if (
      accessGrant?.allowed !== true ||
      !Number.isFinite(Number(accessGrant.validForSeconds)) ||
      Number(accessGrant.validForSeconds) <= 0
    ) {
      const grantError = new Error("暂时无法验证 3D 交互授权，请稍候重试。");
      grantError.status = accessGrant?.allowed === false ? 403 : 502;
      throw grantError;
    }
    return accessGrant;
  } finally {
    clearTimeout(abortTimeoutId);
  }
}
let accessMonitor;
const editorViewByComponentId = new Map();
const waitersByComponentId = new Map();
function notifyViewReady(componentId, error) {
  for (const waiter of waitersByComponentId.get(componentId) || []) {
    waiter(error);
  }
}
export function getInteraction3dEditorView(requestedComponentId) {
  return editorViewByComponentId.get(requestedComponentId);
}
export function waitInteraction3dEditorView(pendingComponentId) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeoutId);
      waitersByComponentId.get(pendingComponentId)?.delete(handleViewReady);
      if (!waitersByComponentId.get(pendingComponentId)?.size) {
        waitersByComponentId.delete(pendingComponentId);
      }
    };
    const handleViewReady = viewError => {
      const editorView = editorViewByComponentId.get(pendingComponentId);
      if (viewError) {
        cleanup();
        reject(viewError);
      } else if (editorView?.ready && editorView.metadata) {
        cleanup();
        resolve(editorView);
      }
    };
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("户型准备较慢，请稍候重试。"));
    }, 25000);
    if (!waitersByComponentId.has(pendingComponentId)) {
      waitersByComponentId.set(pendingComponentId, new Set());
    }
    waitersByComponentId.get(pendingComponentId).add(handleViewReady);
    handleViewReady();
  });
}
export function cancelOtherInteraction3dViews(activeComponentId) {
  for (const [viewComponentId, otherView] of editorViewByComponentId) {
    if (viewComponentId !== activeComponentId && otherView.viewEditing) {
      otherView.setViewEditing(false);
    }
    if (viewComponentId !== activeComponentId) {
      otherView.closePopupLayoutPreview?.();
    }
    if (viewComponentId !== activeComponentId && otherView.rangeEditing) {
      otherView.closeRangeEditor?.();
    }
  }
}
function getAccessMonitor() {
  return (
    accessMonitor ||
    ((accessMonitor = createAccessMonitor({
      requestGrant: requestInteraction3dAccess
    })),
    document.addEventListener("visibilitychange", () =>
      document.hidden ? accessMonitor.suspend() : accessMonitor.resume()
    ),
    window.addEventListener("pagehide", () => accessMonitor.suspend()),
    window.addEventListener("pageshow", () => {
      if (!document.hidden) {
        accessMonitor.resume();
      }
    }),
    document.hidden && accessMonitor.suspend(),
    accessMonitor)
  );
}
export function subscribeInteraction3dAccess(onAccessChange) {
  return getAccessMonitor().subscribe(onAccessChange);
}
export function renderInteraction3d(component, context = {}) {
  const hostElement = document.createElement("section");
  hostElement.className = "hb-interaction3d-host";
  hostElement.setAttribute("aria-label", "3D 交互");
  let isDisposed = false;
  let isLoading = false;
  let isMounted = false;
  let loadToken = 0;
  let runtime;
  let isPageVisible = true;
  hostElement.setInteraction3dPageVisible = isVisible => {
    isPageVisible = isVisible !== false;
    runtime?.setPageVisible?.(isPageVisible);
  };
  let stylesheetElement;
  const focusLayout = createInteraction3dFocusLayout(hostElement, context);
  hostElement.classList.toggle(
    "is-background-hidden",
    component.properties?.backgroundVisible === false
  );
  hostElement.updateInteraction3d = (nextComponent, nextContext) => {
    component = nextComponent;
    context.document = nextContext;
    hostElement.classList.toggle(
      "is-background-hidden",
      component.properties?.backgroundVisible === false
    );
    runtime?.update(component.properties || {});
    focusLayout.refresh();
  };
  function handleAccessLost() {
    focusLayout.setActive(false);
    loadToken += 1;
    isLoading = false;
    isMounted = false;
    if (editorViewByComponentId.get(component.id) === runtime) {
      editorViewByComponentId.delete(component.id);
    }
    if (!isDisposed) {
      notifyViewReady(component.id, new Error("3D 户型暂不可用，请检查授权或重新载入。"));
    }
    runtime?.();
    runtime = null;
    stylesheetElement?.remove();
    stylesheetElement = null;
    if (hostElement.dataset.access !== "locked") {
      hostElement.replaceChildren(createInteraction3dCover());
    }
    hostElement.dataset.access = "locked";
    hostElement.setAttribute("aria-busy", "false");
  }
  const unsubscribeAccess = subscribeInteraction3dAccess(async accessState => {
    if (isDisposed) {
      return;
    }
    if (!accessState.allowed) {
      if (accessState.status === "denied") {
        return handleAccessLost(accessState.message);
      }
      runtime?.setAuthorized(false);
      if (hostElement.dataset.access === "locked") {
        hostElement.setAttribute("aria-busy", accessState.status === "checking" ? "true" : "false");
        return;
      }
      hostElement.dataset.access = "pending";
      hostElement.setAttribute("aria-busy", "true");
      if (!isMounted) {
        loadToken += 1;
        isLoading = false;
        const pendingElement = document.createElement("div");
        pendingElement.className = "i3d-access-pending";
        pendingElement.setAttribute("role", "status");
        pendingElement.setAttribute("aria-label", "正在准备 3D 户型");
        hostElement.replaceChildren(pendingElement);
      }
      return;
    }
    if (isMounted) {
      runtime?.setAuthorized(true);
      hostElement.dataset.access = "allowed";
      hostElement.setAttribute("aria-busy", "false");
      if (context.editable) {
        notifyViewReady(component.id);
      }
      return;
    }
    if (isLoading) {
      return;
    }
    isLoading = true;
    const currentLoadToken = ++loadToken;
    try {
      const runtimeModule =
        await import("/api/v1/modules/interaction3d/runtime.js?v=20260916013557");
      if (isDisposed || currentLoadToken !== loadToken || document.hidden) {
        return;
      }
      stylesheetElement = document.createElement("link");
      stylesheetElement.rel = "stylesheet";
      stylesheetElement.href =
        "/api/v1/modules/interaction3d/runtime.css?v=20260916013557";
      hostElement.append(stylesheetElement);
      const runtimeContainerElement = document.createElement("div");
      hostElement.replaceChildren(stylesheetElement, runtimeContainerElement);
      runtime = runtimeModule.mountInteraction3d(runtimeContainerElement, {
        component: component,
        context: context,
        onPresented: () => {
          focusLayout.refresh();
          if (context.editable) {
            notifyViewReady(component.id);
          }
        },
        onLoadError: loadError => {
          if (context.editable) {
            notifyViewReady(component.id, loadError);
          }
        },
        onFocusChange: isFocused => focusLayout.setActive(isFocused)
      });
      runtime.setPageVisible?.(isPageVisible);
      if (context.editable) {
        editorViewByComponentId.set(component.id, runtime);
      }
      hostElement.dataset.access = "allowed";
      hostElement.setAttribute("aria-busy", "false");
      isMounted = true;
    } catch {
      if (!isDisposed && currentLoadToken === loadToken) {
        stylesheetElement?.remove();
        stylesheetElement = null;
        const loadFailureElement = document.createElement("div");
        loadFailureElement.className = "i3d-access-pending";
        loadFailureElement.textContent = "户型暂时无法载入，请稍候重试。";
        loadFailureElement.setAttribute("role", "status");
        hostElement.replaceChildren(loadFailureElement);
        hostElement.dataset.access = "pending";
        if (context.editable) {
          notifyViewReady(component.id, new Error(loadFailureElement.textContent));
        }
      }
    } finally {
      if (currentLoadToken === loadToken) {
        isLoading = false;
      }
    }
  });
  context.cleanup?.(() => {
    isDisposed = true;
    unsubscribeAccess();
    handleAccessLost("3D 交互已停止。");
    focusLayout.dispose();
  });
  return hostElement;
}
