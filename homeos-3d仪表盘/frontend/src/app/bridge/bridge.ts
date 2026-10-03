import { createAccessMonitor } from "./access-monitor";
import { createInteraction3dCover } from "./cover";
import { createInteraction3dFocusLayout } from "./focus-layout";
/** 在 Error 上挂 HTTP 状态码：授权校验失败时调用方按它分支。 */
type AccessError = Error & { status?: number };

/** 宿主元素上的 bridge 扩展方法：3D 预览块挂在画布 DOM 里，编辑器通过这两个方法控制页面可见性与内容刷新。 */
type Interaction3dHostElement = HTMLElement & {
  /** 页面可见性（编辑器切页时调用，避免后台空转）。 */
  setInteraction3dPageVisible?: (shouldShowPage: boolean) => void;
  /** 内容更新：组件定义或宿主文档变化时调用。 */
  updateInteraction3d?: (nextComponent: any, contentDocument: any) => void;
};

/** 3D 交互实例（runtime.mountInteraction3d 的返回值）。 */
export type Interaction3dEditorView = {
  /** 视图是否已经就绪（不是「已挂载」）。 */
  ready?: boolean;
  /** 是否处于视图编辑态。 */
  viewEditing?: boolean;
  /** 是否处于导航位置调整态。 */
  navigationEditing?: boolean;
  /** 是否处于范围编辑态。 */
  rangeEditing?: boolean;
  setViewEditing?: (editing: boolean) => void;
  setNavigationEditing?: (editing: boolean) => void;
  subscribeEdit?: (listener: (editEvent: any) => void) => () => void;
  setAuthorized?: (authorized: boolean) => void;
  setPageVisible?: (visible: boolean) => void;
  closePopupLayoutPreview?: (...args: any[]) => any;
  closeRangeEditor?: (...args: any[]) => any;
  /** 实例自身可调用：锁定时用它收尾。 */
  (...args: any[]): any;
  [memberName: string]: any;
};

/** renderInteraction3d 的渲染上下文（由编辑器传入）。 */
type Interaction3dRenderOptions = {
  /** 预热：先不加载，等页面真正可见再挂载。 */
  prewarmStage?: boolean;
  /** 可编辑：挂进 editorViewsById 并对外派发视图事件。 */
  editable?: boolean;
  /** 内容文档（编辑器注入，更新时回填）。 */
  document?: any;
  /** 清理钩子：bridge 把「停止交互」的收尾回调交给调用方保存。 */
  cleanup?: (stopInteraction: () => void) => void;
  [optionName: string]: any;
};

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
      throw (((accessError as AccessError).status = accessResponse.status), accessError);
    }
    const responseBody = await accessResponse.json();
    if (
      responseBody?.allowed !== true ||
      !Number.isFinite(Number(responseBody.validForSeconds)) ||
      Number(responseBody.validForSeconds) <= 0
    ) {
      const accessGrantError = new Error("暂时无法验证 3D 交互授权，请稍候重试。");
      throw (
        ((accessGrantError as AccessError).status = responseBody?.allowed === false ? 403 : 502),
        accessGrantError
      );
    }
    return responseBody;
  } finally {
    clearTimeout(accessTimeoutId);
  }
}
let accessMonitor;
const editorViewsById = new Map<string, Interaction3dEditorView>(),
  viewListenersById = new Map<string, Set<(viewError?: any) => void>>();
function emitEditorViewEvent(editorViewId: string, listenerError = null) {
  for (const viewListener of viewListenersById.get(editorViewId) || []) viewListener(listenerError);
}
export function getInteraction3dEditorView(editorId: string) {
  return editorViewsById.get(editorId);
}
export function waitInteraction3dEditorView(
  targetEditorId: string,
): Promise<Interaction3dEditorView> {
  return new Promise((resolveView, rejectView) => {
    const removeViewWaiter = () => {
        (clearTimeout(waitTimeoutId),
          viewListenersById.get(targetEditorId)?.delete(handleViewUpdate),
          viewListenersById.get(targetEditorId)?.size || viewListenersById.delete(targetEditorId));
      },
      handleViewUpdate = (viewError = null) => {
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
    (viewListenersById.has(targetEditorId) ||
      viewListenersById.set(targetEditorId, new Set<(viewError?: any) => void>()),
      viewListenersById.get(targetEditorId).add(handleViewUpdate),
      handleViewUpdate());
  });
}
export function cancelOtherInteraction3dViews(currentEditorId: string) {
  for (const [otherEditorId, otherEditorView] of editorViewsById)
    (otherEditorId !== currentEditorId &&
      otherEditorView.viewEditing &&
      otherEditorView.setViewEditing(false),
      otherEditorId !== currentEditorId &&
        otherEditorView.navigationEditing &&
        otherEditorView.setNavigationEditing?.(false),
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


export function syncInteraction3dUiScale(hostElement) {
  const layoutWidth = Number(hostElement?.offsetWidth) || 0,
    visualWidth = Number(hostElement?.getBoundingClientRect?.().width) || 0;
  if (!layoutWidth || !visualWidth) return;

  hostElement.style.setProperty(
    "--i3d-visual-scale",
    String(Math.min(6, Math.max(1, layoutWidth / visualWidth))),
  );
}
export function renderInteraction3d(
  component: any,
  options: Interaction3dRenderOptions = {},
) {
  const hostElement: Interaction3dHostElement = document.createElement("section");
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
  function lockInteraction3d(_lockReason = "") {
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
          syncInteraction3dUiScale(hostElement),
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
        await import("/api/v1/modules/interaction3d/core/runtime.js");
      if (isDisposed || operationToken !== operationCount || document.hidden) return;
      ((styleLinkElement = document.createElement("link")),
        (styleLinkElement.rel = "stylesheet"),
        (styleLinkElement.href =
          "/api/v1/modules/interaction3d/core/runtime.css"),
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
          syncInteraction3dUiScale(hostElement),
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
