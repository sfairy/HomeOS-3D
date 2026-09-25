/**
 * 渲染器 ↔ 3D 交互舞台的桥接层：渲染器只认识组件控制器（renderInteraction3d 返回宿主元素），
 * 真正的 3D 实现跑在舞台页 iframe 内，本模块负责两者间的授权、加载、生命周期与「编辑器视图」登记。
 *
 * 约定：授权接口为 /api/v1/modules/interaction3d/access，响应必须同时给出 allowed 与正的
 * validForSeconds（access-monitor 依赖后者决定续期节奏）；运行时代码走
 * /api/v1/modules/interaction3d/core/runtime.js，URL 上的 ?v= 是构建脚本生成的缓存戳，改代码后必须同步
 * 更新；错误对象上挂 status 以区分「明确拒绝（403）」「登录失效（401）」与「暂时不可用」。
 * 副作用：模块级持有单个授权监视器与两张按组件 ID 索引的 Map，挂载时插入 link / div / iframe，卸载时移除。
 */
import { createAccessMonitor } from "./access-monitor.js?v=2609252210";
import { createInteraction3dCover } from "./cover.js?v=2609252210";
import { createInteraction3dFocusLayout } from "./focus-layout.js?v=2609252210";
/**
 * 向后端确认当前浏览器是否可以运行 3D 交互。
 *
 * @throws {Error} 请求失败或响应不合法；错误对象带 `status`（403 明确拒绝 / 401 未登录 / 502 其它）。
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
    // allowed === false 说明后端明确拒绝（补 403，走保留封面的分支），其余归为 502 可重试。
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
    // 成功、失败、超时三条路径都要清定时器，避免页面长期持有无用的 abort。
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
/**
 * 把挂载失败的原因压成一句能进占位文案的短句。
 * 只认「Error 的非空 message」与「非空字符串」两种形状：抛出来的东西可能是任何值（throw {}、Promise.reject(undefined)、
 * 事件对象…），String(值) 会得到 [object Object] 写进用户可见文案 —— 那比没有原因更糟。
 */
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
/**
 * 3D 运行时挂载失败时的兜底：说明原因、切回待授权态、通知等待者。
 * 三件事缺一不可：原因要出现在占位文案里（几种失败在页面上长得一样，排查只能靠猜）、原始错误要进全局日志
 * （唯一能事后取证的通道）、编辑态等待者要当场被拒（否则编辑器干等 25 秒超时）。
 */
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
 *
 * @throws {Error} 25 秒内未就绪（"户型准备较慢，请稍候重试。"），或视图加载/授权失败。
 */
export function waitInteraction3dEditorView(pendingComponentId) {
  return new Promise((resolve, reject) => {
    // 清理必须幂等：正常就绪、报错、超时三条路径都会调用它，
    // 并把空集合从 Map 里删掉，避免 Map 随「用过的组件」无限增长。
    const cleanup = () => {
      clearTimeout(timeoutId);
      waitersByComponentId.get(pendingComponentId)?.delete(handleViewReady);
      if (!waitersByComponentId.get(pendingComponentId)?.size) {
        waitersByComponentId.delete(pendingComponentId);
      }
    };
    // 就绪回调：既登记进等待集合，也在一开始立刻试跑一次。错误优先于就绪（存在旧视图
    // 也不能算可用）；就绪则要求 ready 与 metadata 同时到位 —— 只有 metadata 有了，
    // 调用方才能读到户型尺寸等信息。两条分支都先 cleanup 再结束 Promise。
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
    // 立即试一次：视图可能在我们注册之前就已就绪，否则这次等待会一直卡到超时。
    handleViewReady();
  });
}
/**
 * 让除当前组件外的其它 3D 组件退出模态编辑状态。
 * 编辑器同一时刻只允许一个组件处于视图编辑 / 弹窗预览 / 范围编辑 / 导航位置调整，
 * 否则多个组件同时接管画布指针事件会互相干扰。
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
// 切到后台或离开页面时停掉轮询，回来时立刻重新验证（授权可能已在这期间被撤销）。
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
  // 在途的异步结果回来后发现号不对就自行作废，避免旧结果覆盖新状态。
  let loadToken = 0;
  let runtime;
  let isPageVisible = true;
  // 渲染器切换页面时调用：离屏页不继续渲染，避免为看不见的组件白耗 GPU。
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
  // refresh 聚焦布局是必要的，因为组件尺寸 / 内容可能改变，聚焦时的让位距离要重算。
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
  // 最后换成封面；顺序反了会出现「封面已出现但旧 iframe 还在渲染」的叠影。
  function handleAccessLost() {
    focusLayout.setActive(false);
    loadToken += 1;
    isLoading = false;
    isMounted = false;
    if (editorViewByComponentId.get(component.id) === runtime) {
      editorViewByComponentId.delete(component.id);
    }
    if (!isDisposed) {
      // 通知等待中的编辑器：本次失败要显式报错，否则调用方只能干等到 25 秒超时。
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
        // 占位期间作废在途加载，防止上一轮的加载结果稍后把占位替换掉。
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
      // 恢复授权：只切状态，不重新加载运行时，否则会丢掉相机与交互状态、并闪一次屏。
      runtime?.setAuthorized(true);
      hostElement.dataset.access = "allowed";
      hostElement.setAttribute("aria-busy", "false");
      // 授权恢复后才通知编辑器视图就绪，避免编辑器拿到一个禁止操作的视图。
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
      // 动态 import 带 ?v= 缓存戳，必须与后端静态资源戳同步，否则会加载到旧运行时。
      const runtimeModule =
        await import("/api/v1/modules/interaction3d/core/runtime.js?v=2609252210");
      // 三个丢弃条件：组件已销毁、已有更新的一轮加载、页面已切走（回来时会重新走一遍）。
      if (isDisposed || currentLoadToken !== loadToken || document.hidden) {
        return;
      }
      // 运行时样式单独成一个 link：只有真正挂载 3D 时才需要下载，不塞进主样式表。
      stylesheetElement = document.createElement("link");
      stylesheetElement.rel = "stylesheet";
      stylesheetElement.href =
        "/api/v1/modules/interaction3d/core/runtime.css?v=2609252210";
      // 先单独 append 让浏览器尽早开始下载，等运行时容器建好后再一次性替换成最终结构。
      hostElement.append(stylesheetElement);
      const runtimeContainerElement = document.createElement("div");
      hostElement.replaceChildren(stylesheetElement, runtimeContainerElement);
      // onPresented 是舞台页首帧已呈现的信号：编辑器视图必须等它再通知就绪，
      // 否则调用方会立刻读到尚未填充的 metadata。onFocusChange 用于驱动聚焦让位布局。
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
      // 场景已挂载才切状态：先呈现后放行，避免出现「已放行但画面还空着」的空窗。
      hostElement.dataset.access = "allowed";
      hostElement.setAttribute("aria-busy", "false");
      isMounted = true;
    } catch (loadError) {
      // 加载失败也要给出可读提示并显式通知等待者，否则编辑器只能干等到 25 秒超时。
      if (!isDisposed && currentLoadToken === loadToken) {
        stylesheetElement?.remove();
        stylesheetElement = null;
        showInteraction3dLoadFailure(hostElement, component, context, loadError);
      }
    } finally {
      // 只有在本次 token 仍然有效时才复位：否则会误清掉新一轮加载的「进行中」标记。
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
