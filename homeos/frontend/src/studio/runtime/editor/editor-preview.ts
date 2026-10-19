/**
 * 编辑器 3D 预览池：同一时刻只保留一个「<dialog> + 视口 + 运行时」实例，跨次打开复用。
 *
 * 为什么值得单独抽一层：配置入口在「选灯光 → 退出 → 选窗帘 → 再进来」这种高频来回里，真正的成本不是
 * 建 DOM，而是**重新加载整个 3D 场景**（拉模型、建贴图）。池化后：
 *
 * - **结构性复用**：`key` 由 `[projectId, componentId, sceneId]` 组成，三者一致就直接复用
 *   已有的运行时与视口，只把新的属性/上下文灌进去（`mount` 的复用分支）。
 * - **先问后端再决定**：复用前先打一次
 *   `GET /api/v1/modules/interaction3d/scenes/<id>/current?projectId&since=<sourceSyncKey>`，
 *   `204` 表示场景自上次以来没变 → 继续用旧的；变过就销毁重建。这样"复用"不会把改动前的
 *   户型继续画给用户看。
 * - **空闲保留 2 分钟**：`release({ keep: true })` 只是把 dialog 关掉、`setPageVisible(false)`，
 *   运行时留在后台等下一次打开；超时或访问被收回（`watchAccess` 回报 `denied`）才真正销毁。
 * - **世代号防串台**：每次 acquire / 换运行时都自增 `runtimeGeneration`，落在旧世代里的
 *   异步回调（含 `fetch` 的竞态）一律丢弃，避免"配置入口已切换"之后旧回调又把面板改回去。
 *
 * 运行时句柄沿用 `mountInteraction3d` 的约定：**本身是可调用的销毁函数**，附带
 * `update` / `setPageVisible` / `resetPreviewSession` 等方法。
 */

/** 池里保留空闲预览的默认时长（毫秒）：2 分钟。 */
const DEFAULT_IDLE_RETAIN_MS = 0x1d4c0;
/** 复用时确认场景是否变化的请求超时（毫秒）。 */
const REUSE_PROBE_TIMEOUT_MS = 5000;
/** 后端「场景未变化」的响应码：304 不合适（带 since 的强校验），用 204 表示无需重载。 */
const SCENE_UNCHANGED_STATUS = 204;

/** 需要从运行时转发给调用方的回调名；换运行时时逐个包一层世代保护。 */
const FORWARDED_EVENT_NAMES = [
  "onReady",
  "onStates",
  "onPresented",
  "onLoadError",
  "onEdit",
  "onFocusChange",
];

/** 组件被删除时宿主派发的自定义事件（与 3D 舞台侧约定一致）。 */
const COMPONENT_REMOVED_EVENT = "hb-i3d-component-removed";

/**
 * 创建一个预览池。
 *
 * @param globalObject 注入的全局对象（便于测试），默认 `globalThis`。
 * @param idleRetainMs 空闲保留时长，默认 2 分钟。
 */
export function createEditorPreviewPool(globalObject: any = globalThis, idleRetainMs = DEFAULT_IDLE_RETAIN_MS) {
  /** 当前占位/保留的预览（同一时刻至多一个）。 */
  let current: any = null;
  /** 世代号：异步流程的"过期作废"凭据。 */
  let generation = 0;
  /** 正在进行的"场景是否变化"探测，切换入口时要 abort 掉。 */
  let inFlight: any = null;

  /** 彻底销毁一个预览：DOM、运行时、事件监听与保留计时器全部回收。 */
  function destroy(target: any) {
    if (!target || target.destroyed) return;
    target.destroyed = true;
    globalObject.clearTimeout(target.timer);
    target.options = null;
    target.stopAccess?.();
    // 运行时句柄本身是可调用的销毁函数（见 mountInteraction3d）。
    target.runtime?.();
    // 借用宿主时 DOM 属于编辑器页面，只能还原，不能 remove()。
    if (target.borrowed) target.restoreHost?.();
    else target.dialog.remove();
    if (current === target) current = null;
    globalObject.removeEventListener?.("pagehide", target.onPageHide);
    globalObject.document?.removeEventListener?.(COMPONENT_REMOVED_EVENT, target.onRemoved);
  }

  /**
   * 借用编辑器页已有的 3D 宿主（0.7.8 borrowed editor）。
   *
   * 与独立 `<dialog>` 的区别：宿主元素已经在页面上、3D 场景也已经加载好，
   * 这里只把 header/body/view/aspect/stage 骨架塞进去并加上 `is-borrowed-editor`，
   * 真正的画面由 `editorView.beginEditorPreview()` 把现有运行时切到编辑态。
   * 关闭时恢复宿主的 class / aria-label / role 与父子节点，页面回到借用前的样子。
   */
  function createBorrowedHost({
    editorView,
    documentApi,
    component,
    panelDocument,
    onClosed,
  }: any) {
    const host = editorView.editorPreviewHost,
      savedHost = {
        className: host.className,
        label: host.getAttribute("aria-label"),
        role: host.getAttribute("role"),
      },
      createElement = (tagName: string, className = "") => {
        const element = documentApi.createElement(tagName);
        element.className = className;
        return element;
      },
      header = createElement("header"),
      body = createElement("div", "i3d-editor-body"),
      view = createElement("div", "i3d-editor-view"),
      aspect = createElement("div", "i3d-editor-aspect"),
      viewport = createElement("div", "i3d-editor-stage");
    (aspect.append(viewport),
      view.append(aspect),
      body.append(view),
      host.classList.add("is-borrowed-editor"),
      host.setAttribute("role", "dialog"),
      host.setAttribute("data-i3d-preview-scope", ""),
      host.append(header, body));
    // 借用期间宿主在编辑器页面内部：不让面板里的点击/键盘冒泡去触发编辑器自己的手势。
    const stopPropagation = (event: any) => event.stopPropagation();
    for (const eventName of ["pointerdown", "click", "keydown"])
      host.addEventListener(eventName, stopPropagation);
    let runtimeHandle: any = null,
      isClosed = false,
      target: any = null;

    const restoreHost = () => {
      if (isClosed) return;
      isClosed = true;
      runtimeHandle?.();
      runtimeHandle = null;
      header.remove();
      body.remove();
      host.className = savedHost.className;
      host.removeAttribute("data-i3d-preview-scope");
      for (const [attributeName, attributeValue] of [
        ["aria-label", savedHost.label],
        ["role", savedHost.role],
      ] as const)
        attributeValue == null
          ? host.removeAttribute(attributeName)
          : host.setAttribute(attributeName, attributeValue);
      for (const eventName of ["pointerdown", "click", "keydown"])
        host.removeEventListener(eventName, stopPropagation);
      documentApi.removeEventListener?.(COMPONENT_REMOVED_EVENT, onRemoved);
      globalObject.removeEventListener?.("pagehide", onPageHide);
      editorView.resize?.();
      onClosed?.(target);
    };
    const requestCancel = () => {
      if (isClosed) return;
      // 宿主自己处理 ESC（oncancel）时交给它，否则直接收尾。
      if (host.oncancel) host.dispatchEvent(new Event("cancel", { cancelable: true }));
      else restoreHost();
    };
    const onPageHide = () => requestCancel();
    const onRemoved = (event: any) => {
      event.detail?.componentId === component.id &&
        event.detail?.projectId === panelDocument?.projectId &&
        requestCancel();
    };
    documentApi.addEventListener?.(COMPONENT_REMOVED_EVENT, onRemoved);
    globalObject.addEventListener?.("pagehide", onPageHide);

    return (target = {
      dialog: host,
      header,
      body,
      view,
      aspect,
      viewport,
      borrowed: true,
      destroyed: false,
      restoreHost,
      /** 借用宿主本身是编辑器里的 `<dialog>`：需要显式打开时调用。 */
      show() {
        if (isClosed) return;
        (host.close?.(), host.showModal?.());
      },
      /** 首次挂载才真正把运行时切到编辑态；后续复用直接返回同一个会话。 */
      mount(styles: any) {
        if (isClosed) throw new Error("配置窗口已关闭。");
        return (runtimeHandle ||= editorView.beginEditorPreview(styles, viewport, requestCancel));
      },
      discardRuntime: requestCancel,
      release: restoreHost,
      dispose: restoreHost,
    });
  }

  async function acquire({
    component,
    panelDocument,
    document: documentApi = globalObject.document,
    editorView = null,
  }: any) {
    const myGeneration = ++generation;
    inFlight?.abort();
    inFlight = null;

    const previewKey = JSON.stringify([
      panelDocument?.projectId,
      component.id,
      component.properties?.sceneId,
    ]);
    let target: any = current;
    // 同一时刻只有一个配置入口；上一个还没 release 就再开，属于状态机错误。
    if (target?.active) throw new Error("请先退出当前配置窗口。");
    if (
      target &&
      (target.key !== previewKey ||
        !target.runtime?.ready ||
        !target.metadata?.sourceSyncKey)
    ) {
      destroy(target);
      target = null;
    }
    // 借用编辑器（0.7.8 borrowed editor）：编辑器页面正停在同一场景时，
    // 不另开 dialog，而是接管它已经加载好的 3D 宿主；否则继续走独立 dialog。
    if (
      editorView?.canBorrowEditorPreview?.(component, panelDocument) &&
      editorView.metadata?.sourceSyncKey &&
      editorView.editorPreviewHost &&
      typeof editorView.beginEditorPreview === "function"
    ) {
      const borrowController = new AbortController();
      inFlight = borrowController;
      const borrowTimeoutId = globalObject.setTimeout(
        () => borrowController.abort(),
        REUSE_PROBE_TIMEOUT_MS,
      );
      let sceneUnchanged = false;
      try {
        const query = new URLSearchParams({
          projectId: panelDocument?.projectId || "",
          since: editorView.metadata.sourceSyncKey,
        });
        const response = await globalObject.fetch(
          "/api/v1/modules/interaction3d/scenes/" +
            encodeURIComponent(component.properties.sceneId) +
            "/current?" +
            query,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: borrowController.signal,
          },
        );
        sceneUnchanged = response.status === SCENE_UNCHANGED_STATUS;
      } catch {
        // 借用的前提是"编辑器画面就是当前场景"；确认不了就不借。
        sceneUnchanged = false;
      } finally {
        globalObject.clearTimeout(borrowTimeoutId);
        if (inFlight === borrowController) inFlight = null;
      }
      if (myGeneration !== generation) throw new Error("配置入口已切换。");
      if (sceneUnchanged && editorView.canBorrowEditorPreview(component, panelDocument)) {
        destroy(target);
        const borrowedTarget: any = createBorrowedHost({
          editorView,
          documentApi,
          component,
          panelDocument,
          onClosed: (closedTarget: any) => {
            if (current === closedTarget) current = null;
          },
        });
        current = borrowedTarget;
        borrowedTarget.active = true;
        return borrowedTarget;
      }
    }
    if (target) {
      // 结构一致还不够 —— 场景可能已经在别处改过，先向后端确认再决定复用。
      const controller = new AbortController();
      inFlight = controller;
      const timeoutId = globalObject.setTimeout(() => controller.abort(), REUSE_PROBE_TIMEOUT_MS);
      try {
        const query = new URLSearchParams({
          projectId: panelDocument?.projectId || "",
          since: target.metadata.sourceSyncKey,
        });
        const response = await globalObject.fetch(
          "/api/v1/modules/interaction3d/scenes/" +
            encodeURIComponent(component.properties.sceneId) +
            "/current?" +
            query,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (myGeneration !== generation) throw new Error("配置入口已切换。");
        if (response.status !== SCENE_UNCHANGED_STATUS) {
          destroy(target);
          target = null;
        }
      } catch {
        // 探测失败（超时 / 网络 / 被 abort）按"场景已变"处理：宁可重建，不可画旧图。
        if (myGeneration === generation) destroy(target);
        target = null;
      } finally {
        globalObject.clearTimeout(timeoutId);
        if (inFlight === controller) inFlight = null;
      }
    }
    if (myGeneration !== generation) throw new Error("配置入口已切换。");

    if (!target || target.destroyed) {
      const createElement = (tagName: string, className = "") => {
        const element = documentApi.createElement(tagName);
        element.className = className;
        return element;
      };
      const dialog = createElement("dialog", "i3d-editor");
      const header = createElement("header");
      const body = createElement("div", "i3d-editor-body");
      const view = createElement("div", "i3d-editor-view");
      const aspect = createElement("div", "i3d-editor-aspect");
      const viewport = createElement("div", "i3d-editor-stage");
      aspect.append(viewport);
      view.append(aspect);
      body.append(view);
      dialog.append(header, body);
      documentApi.body.append(dialog);
      target = {
        key: previewKey,
        dialog,
        header,
        body,
        view,
        aspect,
        viewport,
        runtime: null,
        metadata: null,
        options: null,
        destroyed: false,
      };
      // 整页卸载时不能留下保留中的运行时。
      target.onPageHide = () => {
        generation++;
        inFlight?.abort();
        inFlight = null;
        destroy(target);
      };
      globalObject.addEventListener?.("pagehide", target.onPageHide);
      // 组件在别处被删掉：保留中的直接销毁；正在用的只标记，等 release 时再收。
      target.onRemoved = (event: any) => {
        if (
          event.detail?.componentId !== component.id ||
          event.detail?.projectId !== panelDocument?.projectId
        ) {
          return;
        }
        target.invalidated = true;
        if (!target.active) {
          generation++;
          inFlight?.abort();
          inFlight = null;
          destroy(target);
        }
      };
      documentApi.addEventListener?.(COMPONENT_REMOVED_EVENT, target.onRemoved);
    }

    current = target;
    target.active = true;
    globalObject.clearTimeout(target.timer);
    target.stopAccess?.();
    target.stopAccess = null;
    // 每次挂载都把 header / body / view 清回"只有骨架"的状态，
    // 否则上一次编辑留下的标题与临时面板会漏到这一次。
    target.header.replaceChildren();
    for (const child of [...target.body.children]) {
      if (child !== target.view) child.remove();
    }
    for (const child of [...target.view.children]) {
      if (child !== target.aspect) child.remove();
    }
    target.dialog.inert = false;

    let released = false;
    return {
      ...target,
      /**
       * 把运行时挂到池里的视口上。
       *
       * @param styles 运行时配置（`component` / `context` / 各回调）。
       * @param createRuntime 首次挂载时的运行时工厂（复用分支不会调用它）。
       */
      mount(styles: any, createRuntime: any) {
        target.options = styles;
        if (target.runtime) {
          // 复用分支：换上下文 + 热更新属性，不重建运行时（省掉整场景重载）。
          for (const contextKey of Object.keys(target.context || {})) delete target.context[contextKey];
          Object.assign(target.context, styles.context);
          target.runtime.update(
            styles.component.properties,
            "",
            {
              module: styles.editingModule,
              securityKind: styles.editingSecurityKind,
              vacuumId: styles.editingVacuumId,
              showAllLabels: styles.editingShowAllLabels === true,
            },
            styles.component,
          );
          target.runtime.setAuthorized(true);
          target.runtime.setPageVisible(true);
          const mountedStyles = styles;
          globalObject.queueMicrotask(() => {
            // 期间可能又被 release / 换入口，那就别再报 ready。
            if (!released && target.options === mountedStyles) {
              mountedStyles.onReady?.(target.metadata);
            }
          });
        } else {
          target.context = styles.context;
          const runtimeGeneration = (target.runtimeGeneration || 0) + 1;
          target.runtimeGeneration = runtimeGeneration;
          // 回调统一包一层世代保护：旧运行时的迟到回调不许再动新面板。
          const guardedHandlers = Object.fromEntries(
            FORWARDED_EVENT_NAMES.map((eventName) => [
              eventName,
              (...args: any[]) => {
                if (target.destroyed || target.runtimeGeneration !== runtimeGeneration) return;
                if (eventName === "onReady") target.metadata = args[0];
                if (eventName === "onLoadError") target.failed = true;
                target.options?.[eventName]?.(...args);
              },
            ]),
          );
          target.runtime = createRuntime(target.viewport, { ...styles, ...guardedHandlers });
        }
        return target.runtime;
      },
      /** 只丢运行时（保留 DOM 与视口），用于"同一个入口但运行时必须重建"的场景。 */
      discardRuntime() {
        target.runtimeGeneration = (target.runtimeGeneration || 0) + 1;
        target.runtime?.();
        target.runtime = null;
        target.metadata = null;
        target.failed = false;
      },
      /**
       * 关闭本次编辑。默认 `keep: true` —— 运行时留在池里等下次复用。
       *
       * 只要有一条"不值得留"的理由（场景被改过 / 加载失败 / 运行时没就绪 / 缺
       * `sourceSyncKey` / 项目或组件 ID 缺失）就直接销毁，避免留下不可信的预览。
       *
       * @param watchAccess 开始监听访问状态；回调收到 `{status:'denied'}` 时立即销毁。
       */
      release({ keep = true, watchAccess }: any = {}) {
        if (released) return;
        released = true;
        target.options = null;
        if (
          !keep ||
          target.invalidated ||
          target.failed ||
          !target.runtime?.ready ||
          !target.metadata?.sourceSyncKey ||
          !component.id ||
          !panelDocument?.projectId
        ) {
          destroy(target);
          return;
        }
        target.runtime.resetPreviewSession?.();
        target.runtime.setPageVisible(false);
        target.dialog.close();
        target.dialog.oncancel = null;
        target.dialog.inert = true;
        target.active = false;
        target.header.replaceChildren();
        for (const child of [...target.body.children]) {
          if (child !== target.view) child.remove();
        }
        for (const child of [...target.view.children]) {
          if (child !== target.aspect) child.remove();
        }
        target.timer = globalObject.setTimeout(() => destroy(target), idleRetainMs);
        const stopWatchingAccess = watchAccess?.((accessState: any) => {
          if (accessState.status === "denied") destroy(target);
        });
        // watchAccess 可能同步回调（已经处于 denied），此时销毁已完成，别再登记停止函数。
        if (target.destroyed) stopWatchingAccess?.();
        else target.stopAccess = stopWatchingAccess;
      },
      /** 立即销毁这一份（不再保留）。 */
      dispose() {
        released = true;
        destroy(target);
      },
    };
  }

  return {
    acquire,
    /** 销毁池中保留的预览并让所有在途流程作废。 */
    dispose() {
      generation++;
      inFlight?.abort();
      inFlight = null;
      destroy(current);
    },
  };
}

/** 进程级共享池：同一页面只需要一个"当前配置入口"。 */
const editorPreviewPool = createEditorPreviewPool();

/** 取得（必要时新建 / 复用）配置入口的 3D 预览。 */
export const acquireEditorPreview = (options: any) => editorPreviewPool.acquire(options);
