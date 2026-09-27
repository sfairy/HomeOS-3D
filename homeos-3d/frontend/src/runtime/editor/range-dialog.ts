/**
 * 「照射范围」编辑弹窗：只有「区域覆盖」（region）模式的轻量柔光支持逐区域调整，本模块把 3D 编辑器
 */
import { mountInteraction3d } from "../core/runtime.js";
import {
  createDomFactory,
  requestInteraction3dAccess,
  subscribeInteraction3dAccess
} from "../core/static-helpers-editor.js";

type ComponentLike = {
  properties?: {
    sceneId?: unknown;
    lightingMode?: string;
    lightRegionOverrides?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type EditMessage = {
  action?: string;
  overrides?: Record<string, unknown>;
  error?: string;
  active?: boolean;
  [key: string]: unknown;
};

type EditorHandle = ((() => void) & {
  openRangeEditor: () => Promise<void>;
  flushRangeEditor: () => Promise<void>;
  ready?: boolean;
  rangeEditing?: boolean;
}) | null;

type MountOptions = {
  component: ComponentLike;
  context?: { document?: unknown; states?: unknown };
  editing?: boolean;
  rangeEditorOnly?: boolean;
  onPresented?: () => void | Promise<void>;
  onLoadError?: (error: Error) => void;
  onEdit?: (editMessage: EditMessage) => void;
};

type AccessState = {
  allowed?: boolean;
  status?: string;
};

type RangeEditorOptions = {
  component: ComponentLike;
  document?: unknown;
  states?: unknown;
  onSave: (overrides: Record<string, unknown>) => Promise<void> | void;
  onClose?: () => void;
};

const mountEditorRuntime = mountInteraction3d as (
  host: HTMLElement,
  options: MountOptions
) => NonNullable<EditorHandle>;

const requestAccess = requestInteraction3dAccess as () => Promise<void>;
const subscribeAccess = subscribeInteraction3dAccess as (
  listener: (access: AccessState) => void
) => () => void;

/**
 * 打开照射范围编辑弹窗。
 */
export async function openInteraction3dRangeEditor({
  component: component,
  document: panelDocument,
  states: states,
  onSave: onSave,
  onClose: onClose = () => {}
}: RangeEditorOptions) {
  await requestAccess();
  // 这两条前置校验必须在建 DOM 之前抛，调用方才能用统一的错误提示而不是弹出一个空弹窗。
  if (!component.properties?.sceneId) {
    throw new Error("请先载入 3D 户型。");
  }
  if (component.properties.lightingMode !== "region") {
    throw new Error("请先选择轻量柔光模式。");
  }
  // 深拷贝一份快照：编辑期间改的都是快照，只有点保存才通过 onSave 回写到真实控件，
  const componentSnapshot = structuredClone(component) as ComponentLike;
  // 记住打开前的焦点元素，关闭时还回去，保证键盘用户不会丢失位置。
  const previouslyFocusedElement = document.activeElement as HTMLElement | null;
  const { el: createElement } = createDomFactory(document) as {
    el: (tag: string, className?: string, text?: string) => HTMLElement;
  };
  const stylesheetLink = createElement("link") as HTMLLinkElement;
  stylesheetLink.rel = "stylesheet";
  stylesheetLink.href = "/api/v1/modules/interaction3d/core/runtime.css";
  document.head.append(stylesheetLink);
  // 复用编辑器与运行时样式，因此类名沿用 i3d-editor。
  const dialogElement = createElement("dialog", "i3d-editor i3d-range-dialog") as HTMLDialogElement;
  dialogElement.setAttribute("aria-label", "照射范围");
  // 这个自定义属性是给外部选择器用的钩子（例如隐藏页面上的其它预览）。
  dialogElement.setAttribute("data-i3d-preview-scope", "");
  const headerElement = createElement("header");
  const saveButton = createElement("button", "primary", "保存") as HTMLButtonElement;
  const closeButton = createElement("button", "i3d-range-close", "×") as HTMLButtonElement;
  closeButton.setAttribute("aria-label", "关闭照射范围");
  closeButton.title = "关闭";
  saveButton.type = closeButton.type = "button";
  saveButton.disabled = true;
  const statusElement = createElement("p", "i3d-range-status", "正在准备灯光预览…");
  // role=status 让读屏软件在新状态出现时自动播报，而不打断用户当前操作。
  statusElement.setAttribute("role", "status");
  const reloadButton = createElement("button", "", "重新载入") as HTMLButtonElement;
  reloadButton.type = "button";
  // 默认隐藏，只有载入失败时才亮出来作为兜底入口。
  reloadButton.hidden = true;
  const bodyElement = createElement("div", "i3d-range-dialog-body");
  const mountElement = createElement("div");
  headerElement.append(
    createElement("strong", "", "照射范围"),
    reloadButton,
    saveButton,
    closeButton
  );
  bodyElement.append(mountElement);
  dialogElement.append(headerElement, statusElement, bodyElement);
  document.body.append(dialogElement);
  let isClosed = false;
  let isSaving = false;
  let isRangeReady = false;
  let editorHandle: EditorHandle = null;
  // 先占位成空函数：订阅要等 mountEditor() 跑完才建立，而 close() 在那之前就可能被
  let unsubscribeAccess = () => {};
  // 每次重新挂载编辑器都自增；异步回调靠它判断自己是否已经过期（防止旧实例改新实例的状态）。
  let generation = 0;
  // 范围覆盖配置被改动的次数，用来在保存后判断「是否又有新修改」。
  let overridesRevision = 0;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  readyPromise.catch(() => {});
  /** 关闭弹窗并清理所有副作用；幂等，重复调用无效果。 */
  function close() {
    if (!isClosed) {
      isClosed = true;
      // 自增 generation 让所有在途回调失效。
      generation++;
      unsubscribeAccess();
      editorHandle?.();
      // 让还在等 ready 的调用方拿到明确的「已关闭」而不是永远挂起。
      rejectReady(new Error("照射范围编辑已关闭。"));
      window.removeEventListener("pagehide", close);
      dialogElement.close();
      dialogElement.remove();
      stylesheetLink.remove();
      // 通知外部预览已收起（与打开时的派发同名事件，外部队列据此恢复）。
      document.dispatchEvent(new Event("hb-i3d-preview-scope"));
      if (previouslyFocusedElement?.isConnected) {
        previouslyFocusedElement.focus();
      }
      onClose();
    }
  }
  /** 统一处理载入失败：解锁重载入口、显示错误文案，并让 ready 以失败结算。 */
  function handleLoadError(error: Error) {
    if (!isClosed) {
      saveButton.disabled = true;
      reloadButton.hidden = false;
      statusElement.textContent = error.message || "照射范围载入失败，请重试。";
      statusElement.classList.add("is-error");
      rejectReady(error);
    }
  }
  /** 重新挂载 3D 编辑器（首次打开与「重新载入」共用）。 */
  function mountEditor() {
    const requestGeneration = ++generation;
    isRangeReady = false;
    editorHandle?.();
    saveButton.disabled = true;
    reloadButton.hidden = true;
    statusElement.classList.remove("is-error");
    statusElement.textContent = "正在准备灯光预览…";
    editorHandle = mountEditorRuntime(mountElement, {
      component: componentSnapshot,
      context: {
        document: panelDocument,
        states: states
      },
      editing: true,
      // rangeEditorOnly 让 3D 侧只加载范围编辑所需的资源，跳过完整编辑器。
      rangeEditorOnly: true,
      async onPresented() {
        try {
          await editorHandle!.openRangeEditor();
          // 等待期间可能已被关闭或又触发了一次重载，此时这次结果作废。
          if (isClosed || requestGeneration !== generation) {
            return;
          }
          isRangeReady = true;
          saveButton.disabled = false;
          statusElement.textContent =
            "平面编辑调整照射范围，3D 预览实时查看高度效果；两个视图共用参数。";
          resolveReady();
        } catch (loadError) {
          if (requestGeneration === generation) {
            handleLoadError(
              loadError instanceof Error ? loadError : new Error(String(loadError))
            );
          }
        }
      },
      onLoadError: handleLoadError,
      onEdit(editMessage: EditMessage) {
        if (!isClosed && requestGeneration === generation) {
          if (editMessage.action === "light-region-overrides") {
            const incomingOverrides = structuredClone(editMessage.overrides || {});
            // 只有内容真的变了才计一次改动：3D 侧会高频推送，靠深比较去抖。
            if (
              JSON.stringify(incomingOverrides) !==
              JSON.stringify(componentSnapshot.properties?.lightRegionOverrides || {})
            ) {
              overridesRevision++;
              if (!isSaving) {
                statusElement.textContent = "范围已修改，点击保存应用。";
                statusElement.classList.remove("is-error");
              }
            }
            if (componentSnapshot.properties) {
              componentSnapshot.properties.lightRegionOverrides = incomingOverrides;
            }
          }
          if (editMessage.action === "range-editor-state" && editMessage.error) {
            handleLoadError(new Error(editMessage.error));
          } else if (
            editMessage.action === "range-editor-state" &&
            !editMessage.active &&
            isRangeReady &&
            !isSaving
          ) {
            // 3D 侧报告范围编辑已退出（例如用户按了 Esc）：同步关闭弹窗。
            close();
          }
        }
      }
    });
  }
  saveButton.addEventListener("click", async () => {
    if (!isClosed && !isSaving && !!isRangeReady && !saveButton.disabled) {
      isSaving = true;
      saveButton.disabled = true;
      closeButton.disabled = true;
      reloadButton.hidden = true;
      statusElement.textContent = "正在保存范围…";
      try {
        await editorHandle!.flushRangeEditor();
        const savedOverrides = structuredClone(
          componentSnapshot.properties?.lightRegionOverrides || {}
        );
        const revisionAtSave = overridesRevision;
        await requestAccess();
        if (isClosed) {
          return;
        }
        await onSave(savedOverrides);
        if (!isClosed) {
          statusElement.textContent =
            revisionAtSave === overridesRevision
              ? "已保存到灯光配置，可继续调整。关闭后点击“保存配置”完成保存。"
              : "已保存，另有新修改待保存。";
          statusElement.classList.remove("is-error");
        }
      } catch (saveError) {
        if (isClosed) {
          return;
        }
        statusElement.textContent =
          saveError instanceof Error ? saveError.message || "保存失败，请重试。" : "保存失败，请重试。";
        statusElement.classList.add("is-error");
      } finally {
        isSaving = false;
        if (!isClosed) {
          closeButton.disabled = false;
          // 保存后编辑器可能已被卸载或退出范围编辑，只有两种状态都为真才重新允许保存。
          saveButton.disabled = !editorHandle?.ready || !editorHandle?.rangeEditing;
        }
      }
    }
  });
  closeButton.addEventListener("click", () => {
    if (!isSaving) {
      close();
    }
  });
  dialogElement.addEventListener("cancel", (cancelEvent: Event) => {
    // 拦截 dialog 的默认 Esc 行为，改走自己的 close，保证清理逻辑一定执行；
    cancelEvent.preventDefault();
    if (!isSaving) {
      close();
    }
  });
  reloadButton.addEventListener("click", mountEditor);
  // pagehide 兜底：页面被卸载（切后台 / 关闭）时不留下未清理的监听与渲染循环。
  window.addEventListener("pagehide", close);
  dialogElement.showModal();
  document.dispatchEvent(new Event("hb-i3d-preview-scope"));
  mountEditor();
  unsubscribeAccess = subscribeAccess((access: AccessState) => {
    if (!access.allowed && ["denied", "unavailable"].includes(access.status || "")) {
      close();
    }
  });
  if (isClosed) {
    // 极端竞态：订阅回调在同步阶段就触发了关闭，这里补一次退订。
    unsubscribeAccess();
  }
  return {
    close: close,
    ready: readyPromise
  };
}
