/**
 * 配置预览池（0.8.4 `modules/interaction3d/editor-preview.js`）。
 *
 * 两个作用：
 *
 * 1. **复用**：同一个配置弹窗关掉后 2 分钟内再打开，沿用上次挂载的运行时（不重新载户型、
 *    不重新建贴图），只是把属性与编辑上下文 `update` 进去。
 * 2. **借用**：如果编辑器页已经把当前组件渲染出来了（`editorView` 可用、且户型自上次
 *    同步后没变 —— 服务端 `/scenes/:id/current?since=` 回 `204`），就不新挂运行时，
 *    直接把编辑器里的那份临时切成「配置预览」会话（`beginEditorPreview`）。
 *
 * 借用失败/不可用一律退回自建弹窗，行为与 0.7.8 完全一致。
 */

/** 池里空闲多久后销毁（上游 0x1d4c0 = 120000ms）。 */
const DEFAULT_IDLE_DESTROY_MS = 120000;
/** 探测「户型是否没变」的超时（上游 0x1388 = 5000ms）。 */
const BORROW_PROBE_TIMEOUT_MS = 5000;
/** 借用会话需要转发给调用方的回调；在池里包一层记录运行时状态。 */
const FORWARDED_CALLBACKS = [
  "onReady",
  "onStates",
  "onLoadError",
  "onEdit",
  "onFocusChange",
] as const;

export interface EditorPreviewHandle {
  dialog: HTMLDialogElement;
  header: HTMLElement;
  body: HTMLElement;
  view: HTMLElement;
  aspect: HTMLElement;
  /** 真正拿来挂运行时的容器（`div.i3d-editor-stage`）。 */
  viewport: HTMLElement;
  /** 借用编辑器会话（没有自建弹窗）。 */
  borrowed: boolean;
  /** 显示：自建弹窗走 `showModal()`；借用的宿主弹窗本来就开着。 */
  show(): void;
  /** 挂载/更新运行时；`createRuntime` 只在首次挂载时调用。 */
  mount(options: Record<string, any>, createRuntime?: (...args: any[]) => any): any;
  /** 只丢弃运行时（保留弹窗壳）：下一次 `mount` 会重新创建。 */
  discardRuntime(): void;
  /** 关窗收尾：默认保留运行时（`keep`），2 分钟后无人使用再销毁。 */
  release(options?: { keep?: boolean; watchAccess?: (listener: (state: any) => void) => (() => void) | void }): void;
  /** 彻底销毁（不可再用）。 */
  dispose(): void;
}

export interface EditorPreviewAcquireOptions {
  component: Record<string, any>;
  /** 面板文档（含 `projectId`）；缺省视为不可借用。 */
  panelDocument?: Record<string, any> | null;
  /** 挂弹窗用的 document，默认 `globalThis.document`。 */
  document?: Document;
  /**
   * 编辑器视图：需要 `canBorrowEditorPreview(component, panelDocument)`、`editorPreviewHost`、
   * `beginEditorPreview(options, viewport, onCancel)`，可选 `metadata.sourceSyncKey` / `sourceSyncKey`、`resize()`。
   */
  editorView?: Record<string, any> | null;
}

export interface EditorPreviewPool {
  acquire(options: EditorPreviewAcquireOptions): Promise<EditorPreviewHandle>;
  dispose(): void;
}

function createElementIn(ownerDocument: Document, tagName: string, className = ""): any {
  const node = ownerDocument.createElement(tagName);
  node.className = className;
  return node;
}

/** 销毁池里的一条预览（自建弹窗或借用会话）。 */
function destroyPreview(hostWindow: any, handle: any | null): void {
  if (!handle || handle.destroyed) return;
  ((handle.destroyed = true),
    hostWindow.clearTimeout(handle.timer),
    (handle.options = null),
    handle.stopAccess?.(),
    handle.stopAccess = null,
    handle.runtime?.(),
    handle.runtime = null,
    handle.dialog.remove(),
    handle.releaseTeardown?.(),
    hostWindow.document?.removeEventListener?.("hb-i3d-component-removed", handle.onRemoved));
}

/**
 * 借用编辑器预览：把编辑器页已经挂好的运行时临时当配置预览用。
 *
 * 只在 `editorPreviewHost` 上补一层 `is-borrowed-editor` 骨架（header + body > view > aspect >
 * viewport），运行时自己仍留在宿主里，所以画面/模型/相机都不重建。
 */
function createBorrowedPreview(
  hostWindow: any,
  ownerDocument: Document,
  editorView: Record<string, any>,
  component: Record<string, any>,
  panelDocument: Record<string, any> | null | undefined,
): EditorPreviewHandle {
  const dialog = editorView.editorPreviewHost as HTMLDialogElement,
    savedAppearance = {
      className: dialog.className,
      label: dialog.getAttribute("aria-label"),
      role: dialog.getAttribute("role"),
    },
    header = createElementIn(ownerDocument, "header"),
    body = createElementIn(ownerDocument, "div", "i3d-editor-body"),
    view = createElementIn(ownerDocument, "div", "i3d-editor-view"),
    aspect = createElementIn(ownerDocument, "div", "i3d-editor-aspect"),
    viewport = createElementIn(ownerDocument, "div", "i3d-editor-stage");
  (aspect.append(viewport),
    view.append(aspect),
    body.append(view),
    dialog.classList.add("is-borrowed-editor"),
    dialog.setAttribute("role", "dialog"),
    dialog.append(header, body));
  const stopEventPropagation = (event: Event) => event.stopPropagation();
  for (const eventName of ["pointerdown", "click", "keydown"])
    dialog.addEventListener(eventName, stopEventPropagation);
  let releaseSession: (() => void) | null = null,
    wasPageVisible = true,
    isReleased = false;
  const requestCancel = () => {
      if (isReleased) return;
      if (dialog.open) dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
      else finish();
    },
    onComponentRemoved = (event: any) => {
      event.detail?.componentId === component.id &&
        event.detail?.projectId === panelDocument?.projectId &&
        requestCancel();
    },
    finish = () => {
      if (isReleased) return;
      ((isReleased = true),
        releaseSession?.(),
        (releaseSession = null),
        editorView.setPageVisible?.(wasPageVisible),
        (dialog.inert = false),
        dialog.close(),
        header.remove(),
        body.remove(),
        (dialog.className = savedAppearance.className));
      for (const eventName of ["pointerdown", "click", "keydown"])
        dialog.removeEventListener(eventName, stopEventPropagation);
      (dialog.removeAttribute("data-i3d-preview-scope"),
        savedAppearance.label == null
          ? dialog.removeAttribute("aria-label")
          : dialog.setAttribute("aria-label", savedAppearance.label),
        savedAppearance.role == null
          ? dialog.removeAttribute("role")
          : dialog.setAttribute("role", savedAppearance.role),
        dialog.setAttribute("open", ""),
        editorView.resize?.(),
        ownerDocument.removeEventListener("hb-i3d-component-removed", onComponentRemoved),
        hostWindow.removeEventListener?.("pagehide", requestCancel));
    },
    handle: EditorPreviewHandle = {
      dialog: dialog as HTMLDialogElement,
      header,
      body,
      view,
      aspect,
      viewport,
      borrowed: true,
      show() {
        isReleased || (dialog.close(), dialog.showModal());
      },
      mount(options) {
        if (isReleased) throw new Error("配置窗口已关闭。");
        return (
          (releaseSession ||= (
            (wasPageVisible = editorView.pageVisible !== false),
            editorView.beginEditorPreview(options, viewport, requestCancel)
          )),
          releaseSession
        );
      },
      discardRuntime: requestCancel,
      release: finish,
      dispose: finish,
    };
  (ownerDocument.addEventListener("hb-i3d-component-removed", onComponentRemoved),
    hostWindow.addEventListener?.("pagehide", requestCancel));
  return handle;
}

/**
 * 创建预览池。
 *
 * `hostWindow` 只为单测注入（`setTimeout` / `fetch` / `addEventListener`）；
 * `idleDestroyMs` 是关窗后保留运行时的时长。
 */
export function createEditorPreviewPool(
  hostWindow: any = globalThis,
  idleDestroyMs = DEFAULT_IDLE_DESTROY_MS,
): EditorPreviewPool {
  let active: any = null,
    borrowed: EditorPreviewHandle | null = null,
    generation = 0,
    inflightProbe: AbortController | null = null;

  /** 服务端确认「户型自 `since` 之后没变」→ 可以借用编辑器里的那份运行时。 */
  async function canReuseEditorScene(
    editorView: Record<string, any> | null | undefined,
    component: Record<string, any>,
    panelDocument: Record<string, any> | null | undefined,
    since: string,
  ): Promise<boolean> {
    const probeController = new AbortController(),
      probeTimeout = hostWindow.setTimeout(() => probeController.abort(), BORROW_PROBE_TIMEOUT_MS);
    inflightProbe = probeController;
    try {
      const params = new URLSearchParams({
          projectId: panelDocument?.projectId || "",
          since,
        }),
        response = await hostWindow.fetch(
          "/api/v1/modules/interaction3d/scenes/" +
            encodeURIComponent(component.properties?.sceneId) +
            "/current?" +
            params,
          { credentials: "same-origin", cache: "no-store", signal: probeController.signal },
        );
      return response.status === 204 && editorView?.canBorrowEditorPreview?.(component, panelDocument) === true;
    } catch {
      return false;
    } finally {
      (hostWindow.clearTimeout(probeTimeout),
        inflightProbe === probeController && (inflightProbe = null));
    }
  }

  function createOwnPreview(ownerDocument: Document, component: Record<string, any>, panelDocument: any) {
    const dialog = createElementIn(ownerDocument, "dialog", "i3d-editor"),
      header = createElementIn(ownerDocument, "header"),
      body = createElementIn(ownerDocument, "div", "i3d-editor-body"),
      view = createElementIn(ownerDocument, "div", "i3d-editor-view"),
      aspect = createElementIn(ownerDocument, "div", "i3d-editor-aspect"),
      viewport = createElementIn(ownerDocument, "div", "i3d-editor-stage");
    (aspect.append(viewport),
      view.append(aspect),
      body.append(view),
      dialog.append(header, body),
      ownerDocument.body.append(dialog));
    const handle: any = {
      key: JSON.stringify([
        panelDocument?.projectId,
        component.id,
        component.properties?.sceneId,
      ]),
      dialog,
      header,
      body,
      view,
      aspect,
      viewport,
      runtime: null,
      metadata: null,
      options: null,
      context: null,
      runtimeGeneration: 0,
      borrowed: false,
      destroyed: false,
      active: false,
    };
    handle.onPageHide = () => {
      (generation++, inflightProbe?.abort(), (inflightProbe = null), destroyPreview(hostWindow, handle));
    };
    hostWindow.addEventListener?.("pagehide", handle.onPageHide);
    handle.onRemoved = (event: any) => {
      if (
        event.detail?.componentId !== component.id ||
        event.detail?.projectId !== panelDocument?.projectId
      )
        return;
      ((handle.invalidated = true),
        handle.active || (generation++, inflightProbe?.abort(), (inflightProbe = null), destroyPreview(hostWindow, handle)));
    };
    ownerDocument.addEventListener?.("hb-i3d-component-removed", handle.onRemoved);
    handle.releaseTeardown = () => {
      hostWindow.removeEventListener?.("pagehide", handle.onPageHide);
    };
    return handle;
  }

  return {
    async acquire({ component, panelDocument, document: ownerDocument = globalThis.document, editorView }) {
      const requestGeneration = ++generation;
      (inflightProbe?.abort(), (inflightProbe = null));
      const previewKey = JSON.stringify([
        panelDocument?.projectId,
        component.id,
        component.properties?.sceneId,
      ]);
      let currentPreview = active;
      if (currentPreview?.active || borrowed) throw new Error("请先退出当前配置窗口。");

      // ① 优先借用编辑器页的运行时：省掉一整次户型加载。
      const borrowSyncKey =
        editorView?.sourceSyncKey || editorView?.metadata?.sourceSyncKey || "";
      if (
        borrowSyncKey &&
        editorView?.canBorrowEditorPreview?.(component, panelDocument) &&
        editorView?.editorPreviewHost
      ) {
        const canBorrow = await canReuseEditorScene(editorView, component, panelDocument, borrowSyncKey);
        if (requestGeneration !== generation) throw new Error("配置入口已切换。");
        if (canBorrow && editorView.canBorrowEditorPreview(component, panelDocument)) {
          (destroyPreview(hostWindow, currentPreview), (active = null));
          const borrowedPreview = createBorrowedPreview(
            hostWindow,
            ownerDocument,
            editorView,
            component,
            panelDocument,
          );
          const releaseBorrowed = borrowedPreview.release,
            disposeBorrowed = borrowedPreview.dispose;
          borrowedPreview.release = (releaseOptions) => {
            (releaseBorrowed(releaseOptions), borrowed === borrowedPreview && (borrowed = null));
          };
          borrowedPreview.dispose = () => {
            (disposeBorrowed(), borrowed === borrowedPreview && (borrowed = null));
          };
          borrowed = borrowedPreview;
          return borrowedPreview;
        }
      }

      // ② 池里那份还行就复用：换了组件/户型、未就绪、没有同步游标都要重建。
      if (
        currentPreview &&
        (currentPreview.key !== previewKey ||
          !currentPreview.runtime?.ready ||
          !currentPreview.metadata?.sourceSyncKey) &&
        currentPreview.runtime
      ) {
        (destroyPreview(hostWindow, currentPreview), (currentPreview = null), (active = null));
      }
      if (currentPreview) {
        const since = currentPreview.metadata?.sourceSyncKey || "";
        if (since) {
          const probeController = new AbortController(),
            probeTimeout = hostWindow.setTimeout(() => probeController.abort(), BORROW_PROBE_TIMEOUT_MS);
          inflightProbe = probeController;
          try {
            const params = new URLSearchParams({
                projectId: panelDocument?.projectId || "",
                since,
              }),
              response = await hostWindow.fetch(
                "/api/v1/modules/interaction3d/scenes/" +
                  encodeURIComponent(component.properties?.sceneId) +
                  "/current?" +
                  params,
                { credentials: "same-origin", cache: "no-store", signal: probeController.signal },
              );
            if (requestGeneration !== generation) throw new Error("配置入口已切换。");
            response.status !== 204 &&
              (destroyPreview(hostWindow, currentPreview), (currentPreview = null), (active = null));
          } catch {
            requestGeneration === generation && (destroyPreview(hostWindow, currentPreview), (currentPreview = null), (active = null));
          } finally {
            (hostWindow.clearTimeout(probeTimeout),
              inflightProbe === probeController && (inflightProbe = null));
          }
        } else {
          (destroyPreview(hostWindow, currentPreview), (currentPreview = null), (active = null));
        }
      }
      if (requestGeneration !== generation) throw new Error("配置入口已切换。");

      if (!currentPreview || currentPreview.destroyed) {
        currentPreview = createOwnPreview(ownerDocument, component, panelDocument);
      }
      active = currentPreview;
      currentPreview.active = true;
      (hostWindow.clearTimeout(currentPreview.timer),
        currentPreview.stopAccess?.(),
        (currentPreview.stopAccess = null),
        currentPreview.header.replaceChildren());
      for (const bodyChild of [...currentPreview.body.children])
        bodyChild !== currentPreview.view && bodyChild.remove();
      for (const viewChild of [...currentPreview.view.children])
        viewChild !== currentPreview.aspect && viewChild.remove();
      currentPreview.dialog.inert = false;
      const handle: any = currentPreview,
        previewHandle: EditorPreviewHandle = {
          dialog: handle.dialog,
          header: handle.header,
          body: handle.body,
          view: handle.view,
          aspect: handle.aspect,
          viewport: handle.viewport,
          borrowed: false,
          show() {
            handle.destroyed || (handle.dialog.close(), handle.dialog.showModal());
          },
          mount(options, createRuntime) {
            if ((handle.options = options), handle.runtime) {
              for (const contextKey of Object.keys(handle.context || {})) delete handle.context[contextKey];
              Object.assign(handle.context, options.context);
              handle.runtime.update(
                options.component.properties,
                "",
                {
                  module: options.editingModule,
                  securityKind: options.editingSecurityKind,
                  vacuumId: options.editingVacuumId,
                  showAllLabels: options.editingShowAllLabels === true,
                },
                options.component,
              );
              handle.runtime.setAuthorized?.(true);
              handle.runtime.setPageVisible?.(true);
              // 复用时不重新走 `onReady` 的异步链路，但面板需要那份元数据渲染。
              const mountedOptions = options;
              hostWindow.queueMicrotask(() => {
                !handle.destroyed &&
                  handle.options === mountedOptions &&
                  mountedOptions.onReady?.(handle.metadata);
              });
              return handle.runtime;
            }
            handle.context = options.context;
            const runtimeGeneration = (handle.runtimeGeneration || 0) + 1;
            handle.runtimeGeneration = runtimeGeneration;
            const forwardedCallbacks = Object.fromEntries(
              FORWARDED_CALLBACKS.map((callbackName) => [
                callbackName,
                (...callbackArguments: any[]) => {
                  if (handle.destroyed || handle.runtimeGeneration !== runtimeGeneration) return;
                  (callbackName === "onReady" && (handle.metadata = callbackArguments[0]),
                    callbackName === "onLoadError" && (handle.failed = true),
                    handle.options?.[callbackName]?.(...callbackArguments));
                },
              ]),
            );
            if (typeof createRuntime !== "function") throw new Error("配置预览缺少运行时工厂。");
            handle.runtime = createRuntime(handle.viewport, { ...options, ...forwardedCallbacks });
            return handle.runtime;
          },
          discardRuntime() {
            ((handle.runtimeGeneration = (handle.runtimeGeneration || 0) + 1),
              handle.runtime?.(),
              (handle.runtime = null),
              (handle.metadata = null),
              (handle.failed = false));
          },
          release({ keep = true, watchAccess } = {}) {
            if (handle.released) return;
            if (((handle.released = true), (handle.options = null), (handle.active = false), !keep)) {
              destroyPreview(hostWindow, handle);
              return;
            }
            // 关窗但不销毁：把这次编辑留下的临时状态全部撤销，等下一次打开继续用。
            (handle.runtime?.resetPreviewSession?.(),
              handle.runtime?.setPageVisible?.(false),
              handle.dialog.close(),
              (handle.context = null),
              (handle.dialog.inert = true),
              handle.viewport.replaceChildren());
            for (const bodyChild of [...handle.body.children])
              bodyChild !== handle.view && bodyChild.remove();
            for (const viewChild of [...handle.view.children])
              viewChild !== handle.aspect && viewChild.remove();
            handle.timer = hostWindow.setTimeout(() => destroyPreview(hostWindow, handle), idleDestroyMs);
            const stopWatching = watchAccess?.((accessState: any) => {
              accessState?.status === "denied" && destroyPreview(hostWindow, handle);
            });
            handle.destroyed ? stopWatching?.() : (handle.stopAccess = stopWatching);
          },
          dispose() {
            handle.released = true;
            destroyPreview(hostWindow, handle);
          },
        };
      handle.released = false;
      return previewHandle;    },
    dispose() {
      (generation++, inflightProbe?.abort(), (inflightProbe = null), borrowed?.dispose(), (borrowed = null), destroyPreview(hostWindow, active), (active = null));
    },
  };
}

const sharedPreviewPool = createEditorPreviewPool();

/** 全局单例入口（对应上游 `acquireEditorPreview`）。 */
export const acquireEditorPreview = (options: EditorPreviewAcquireOptions) =>
  sharedPreviewPool.acquire(options);
