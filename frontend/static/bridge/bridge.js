/**
 * 渲染器 ↔ 3D 交互舞台的桥接层：渲染器只认识组件控制器（renderInteraction3d 返回宿主元素），
 */
import { createAccessMonitor } from "./access-monitor.js?v=2609271411";
import { createInteraction3dCover } from "./cover.js?v=2609271411";
import { createInteraction3dFocusLayout } from "./focus-layout.js?v=2609271411";
/**
 * 向后端确认当前浏览器是否可以运行 3D 交互。
 */
export async function requestInteraction3dAccess() {
  const abortController = new AbortController();
  // 5 秒硬超时：授权请求若长时间挂起，页面会一直停在「正在验证」而没有反馈。
  const abortTimeoutId = setTimeout(() => abortController.abort(), 5000);
  try {
    // 必须 no-store：浏览器缓存会把已撤销的授权继续放行；凭据用同源 cookie，不额外带 token。
    const accessResponse = await fetch("/api/v1/modules/interaction3d/access", {
      cache: "no-store",
      credentials: "same-origin",
      signal: abortController.signal
    });
    if (!accessResponse.ok) {
      // 把 HTTP 状态翻译成面向用户的文案，同时保留 status 供上层分流。
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
    // 200 也要校验内容：allowed 必须严格为 true，且有效期为正数。
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
// 授权监视器是模块级单例：同一页面里所有 3D 组件共享一次轮询，不各自发请求。
let accessMonitor;
// 组件 ID → 已挂载的编辑器视图；同一页面可能有多个 3D 组件，因此必须按 ID 区分。
const editorViewByComponentId = new Map();
// 组件 ID → 等待视图就绪的回调集合；用 Set 是为了让多个等待者互不覆盖。
const waitersByComponentId = new Map();
// 逐个通知等待者；这里不移除等待者本身，清理由调用方在 resolve/reject 时通过 cleanup 完成。
function notifyViewReady(componentId, error) {
  for (const waiter of waitersByComponentId.get(componentId) || []) {
    waiter(error);
  }
}
function interaction3dLoadFailureReason(loadError) {
  const rawReason =
    typeof loadError?.message === "string" && loadError.message
      ? loadError.message
      : typeof loadError === "string"
        ? loadError
        : "";
  const normalizedReason = rawReason.replace(/\s+/g, " ").trim();
  if (!normalizedReason) {
    return "";
  }
  // 运行时抛出的栈可能很长（甚至带打包后的路径），占位文案只留一句能读的。
  return normalizedReason.length > 60 ? normalizedReason.slice(0, 60) + "…" : normalizedReason;
}
function showInteraction3dLoadFailure(hostElement, component, context, loadError) {
  const loadFailureReason = interaction3dLoadFailureReason(loadError);
  const loadFailureElement = document.createElement("div");
  loadFailureElement.className = "i3d-access-pending";
  loadFailureElement.textContent = loadFailureReason
    ? "户型暂时无法载入（原因：" + loadFailureReason + "），请稍候重试。"
    : "户型暂时无法载入，请稍候重试。";
  loadFailureElement.setAttribute("role", "status");
  hostElement.replaceChildren(loadFailureElement);
  hostElement.dataset.access = "pending";
  window.HABridgeLog?.error?.(loadError, {
    phase: "interaction3d-mount",
    componentId: component?.id || ""
  });
  if (context?.editable) {
    notifyViewReady(component.id, new Error(loadFailureElement.textContent));
  }
}
/**
 * 取出指定组件已挂载的编辑器视图。
 */
export function getInteraction3dEditorView(requestedComponentId) {
  return editorViewByComponentId.get(requestedComponentId);
}
/**
 * 等待指定组件的编辑器视图就绪。
 */
export function waitInteraction3dEditorView(pendingComponentId) {
  return new Promise((resolve, reject) => {
    // 清理必须幂等：正常就绪、报错、超时三条路径都会调用它，
    const cleanup = () => {
      clearTimeout(timeoutId);
      waitersByComponentId.get(pendingComponentId)?.delete(handleViewReady);
      if (!waitersByComponentId.get(pendingComponentId)?.size) {
        waitersByComponentId.delete(pendingComponentId);
      }
    };
    // 就绪回调：既登记进等待集合，也在一开始立刻试跑一次。错误优先于就绪（存在旧视图
    const handleViewReady = viewError => {
      const editorView = editorViewByComponentId.get(pendingComponentId);
      // 错误优先于就绪：加载失败时即便存在旧视图也不能当作可用。
      if (viewError) {
        cleanup();
        reject(viewError);
      } else if (editorView?.ready && editorView.metadata) {
        // ready 与 metadata 都要有：只有 metadata 到位，调用方才能读到户型尺寸等信息。
        cleanup();
        resolve(editorView);
      }
    };
    // 25 秒是「户型解析 + 首次出帧」的经验上限；超过就认为不会来，让调用方给出重试入口。
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
/**
 * 让除当前组件外的其它 3D 组件退出模态编辑状态。
 */
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
    if (viewComponentId !== activeComponentId && otherView.navigationEditing) {
      otherView.setNavigationEditing?.(false);
    }
  }
}
// 懒创建授权监视器，并把页面可见性接到它的 suspend / resume 上：
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
/**
 * 订阅 3D 交互授权状态。
 */
export function subscribeInteraction3dAccess(onAccessChange) {
  return getAccessMonitor().subscribe(onAccessChange);
}
/**
 * 挂载一个 3D 交互组件：创建宿主元素、按授权状态加载运行时，并管理其完整生命周期。
 */
export function renderInteraction3d(component, context = {}) {
  const hostElement = document.createElement("section");
  hostElement.className = "hb-interaction3d-host";
  hostElement.setAttribute("aria-label", "3D 交互");
  let isDisposed = false;
  let isLoading = false;
  let isMounted = false;
  // loadToken 是加载的版本号：每次加载 / 失效都自增，
  let loadToken = 0;
  let runtime;
  let isPageVisible = true;
  hostElement.setInteraction3dPageVisible = isVisible => {
    isPageVisible = isVisible !== false;
    runtime?.setPageVisible?.(isPageVisible);
  };
  let stylesheetElement;
  const focusLayout = createInteraction3dFocusLayout(hostElement, context);
  // 缺省即透明：只有显式 true 才画背景，缺字段的老实例也按透明处理。
  hostElement.classList.toggle(
    "is-background-hidden",
    component.properties?.backgroundVisible !== true
  );
  // 属性更新走「就地更新」而不是重建：重建会重载 iframe 导致闪屏与状态丢失。
  hostElement.updateInteraction3d = (nextComponent, nextContext) => {
    component = nextComponent;
    context.document = nextContext;
    hostElement.classList.toggle(
      "is-background-hidden",
      component.properties?.backgroundVisible !== true
    );
    runtime?.update(component.properties || {});
    focusLayout.refresh();
  };
  // 授权丢失（或运行时被彻底停用）时的统一收尾：先让在途加载作废，再拆掉运行时与样式，
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
    // runtime 本身就是销毁函数（运行时模块以「返回回收函数」为约定）。
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
      // denied 是后端的明确拒绝：直接拆掉运行时并保留封面，不再等待。
      if (accessState.status === "denied") {
        return handleAccessLost(accessState.message);
      }
      // 已挂载的运行时先切到未授权态（它会自行停止渲染），但不拆 DOM，以免恢复时闪一下。
      runtime?.setAuthorized(false);
      if (hostElement.dataset.access === "locked") {
        hostElement.setAttribute("aria-busy", accessState.status === "checking" ? "true" : "false");
        return;
      }
      hostElement.dataset.access = "pending";
      hostElement.setAttribute("aria-busy", "true");
      // 只在尚未挂载时显示占位：已经渲染好的场景不该被等待文案顶掉。
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
    // 同一时刻只允许一次加载：续期回调会反复到达，不设闸门会重复注入 iframe。
    if (isLoading) {
      return;
    }
    isLoading = true;
    const currentLoadToken = ++loadToken;
    try {
      const runtimeModule =
        await import("/api/v1/modules/interaction3d/core/runtime.js?v=2609271411");
      // 三个丢弃条件：组件已销毁、已有更新的一轮加载、页面已切走（回来时会重新走一遍）。
      if (isDisposed || currentLoadToken !== loadToken || document.hidden) {
        return;
      }
      // 运行时样式单独成一个 link：只有真正挂载 3D 时才需要下载，不塞进主样式表。
      stylesheetElement = document.createElement("link");
      stylesheetElement.rel = "stylesheet";
      stylesheetElement.href =
        "/api/v1/modules/interaction3d/core/runtime.css?v=2609271411";
      // 先单独 append 让浏览器尽早开始下载，等运行时容器建好后再一次性替换成最终结构。
      hostElement.append(stylesheetElement);
      const runtimeContainerElement = document.createElement("div");
      hostElement.replaceChildren(stylesheetElement, runtimeContainerElement);
      // onPresented 是舞台页首帧已呈现的信号：编辑器视图必须等它再通知就绪，
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
      // 挂载时补一次可见性：加载期间页面可能已经切走，不补会被默认当成可见而白跑渲染。
      runtime.setPageVisible?.(isPageVisible);
      // 只有编辑器环境才登记视图：展示环境不需要被外部查询或操控。
      if (context.editable) {
        editorViewByComponentId.set(component.id, runtime);
      }
      hostElement.dataset.access = "allowed";
      hostElement.setAttribute("aria-busy", "false");
      isMounted = true;
    } catch (loadError) {
      if (!isDisposed && currentLoadToken === loadToken) {
        stylesheetElement?.remove();
        stylesheetElement = null;
        showInteraction3dLoadFailure(hostElement, component, context, loadError);
      }
    } finally {
      if (currentLoadToken === loadToken) {
        isLoading = false;
      }
    }
  });
  // 组件卸载：退订授权、拆掉运行时与封面，并释放聚焦布局持有的监听与缓存。
  context.cleanup?.(() => {
    isDisposed = true;
    unsubscribeAccess();
    handleAccessLost("3D 交互已停止。");
    focusLayout.dispose();
  });
  return hostElement;
}
