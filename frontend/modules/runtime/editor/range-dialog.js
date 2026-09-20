/**
 * 「照射范围」编辑弹窗。
 *
 * 在 3D 子系统里的位置：灯光只有一个「区域覆盖」（region）模式的轻量柔光
 * 才支持逐区域调整照射范围，本模块把 3D 编辑器以「只编辑范围」的模式挂进一个
 * 模态弹窗里，让用户在 3D 预览中拖拽平面来控制照射范围。
 *
 * 对外提供：openInteraction3dRangeEditor —— 打开弹窗并返回 { close, ready }。
 *
 * 约定：需要先有 3D 户型（component.properties.sceneId）且灯光为 region 模式，
 *       否则直接抛中文错误；打开期间会派发 hb-i3d-preview-scope 事件，
 *       通知页面其它部分暂时收起自己的 3D 预览，避免两处同时渲染。
 */
import { mountInteraction3d } from "../core/runtime.js?v=20260920102755";
import {
  requestInteraction3dAccess,
  subscribeInteraction3dAccess
} from "/static/bridge/bridge.js?v=20260920102755";
/**
 * 打开照射范围编辑弹窗。
 *
 * @throws {Error} 缺少 3D 户型，或灯光不是轻量柔光（region）模式。
 */
export async function openInteraction3dRangeEditor({
  component: component,
  document: panelDocument,
  states: states,
  onSave: onSave,
  onClose: onClose = () => {}
}) {
  await requestInteraction3dAccess();
  // 这两条前置校验必须在建 DOM 之前抛，调用方才能用统一的错误提示而不是弹出一个空弹窗。
  if (!component.properties?.sceneId) {
    throw new Error("请先载入 3D 户型。");
  }
  if (component.properties.lightingMode !== "region") {
    throw new Error("请先选择轻量柔光模式。");
  }
  // 深拷贝一份快照：编辑期间改的都是快照，只有点保存才通过 onSave 回写到真实控件，
  // 取消 / 关闭时原始配置不会被污染。
  const componentSnapshot = structuredClone(component);
  // 记住打开前的焦点元素，关闭时还回去，保证键盘用户不会丢失位置。
  const previouslyFocusedElement = document.activeElement;
  /** 建元素的小工具，统一处理类名与文本。 */
  const createElement = (tagName, className = "", textContent = "") => {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = textContent;
    return element;
  };
  const stylesheetLink = createElement("link");
  stylesheetLink.rel = "stylesheet";
  stylesheetLink.href = "/api/v1/modules/interaction3d/core/runtime.css?v=20260920102755";
  document.head.append(stylesheetLink);
  // 复用编辑器与运行时样式，因此类名沿用 i3d-editor。
  const dialogElement = createElement("dialog", "i3d-editor i3d-range-dialog");
  dialogElement.setAttribute("aria-label", "照射范围");
  // 这个自定义属性是给外部选择器用的钩子（例如隐藏页面上的其它预览）。
  dialogElement.setAttribute("data-i3d-preview-scope", "");
  const headerElement = createElement("header");
  const saveButton = createElement("button", "primary", "保存");
  const closeButton = createElement("button", "i3d-range-close", "×");
  closeButton.setAttribute("aria-label", "关闭照射范围");
  closeButton.title = "关闭";
  // 链式赋值声明两个按钮都是普通按钮，避免在表单中触发隐式提交。
  saveButton.type = closeButton.type = "button";
  // 编辑器就绪前不允许保存，避免把空配置写回去。
  saveButton.disabled = true;
  const statusElement = createElement("p", "i3d-range-status", "正在准备灯光预览…");
  // role=status 让读屏软件在新状态出现时自动播报，而不打断用户当前操作。
  statusElement.setAttribute("role", "status");
  const reloadButton = createElement("button", "", "重新载入");
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
  let editorHandle = null;
  // 先占位成空函数：订阅要等 mountEditor() 跑完才建立，而 close() 在那之前就可能被
  // pagehide / 3D 侧事件触发，所以任何时刻都必须能安全调用。
  let unsubscribeAccess = () => {};
  // 每次重新挂载编辑器都自增；异步回调靠它判断自己是否已经过期（防止旧实例改新实例的状态）。
  let generation = 0;
  // 范围覆盖配置被改动的次数，用来在保存后判断「是否又有新修改」。
  let overridesRevision = 0;
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // 立刻挂一个空 catch：调用方可能根本不 await ready，避免产生未处理的 Promise 拒绝。
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
  function handleLoadError(error) {
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
    // 先卸载上一次的编辑器，避免两个实例同时挂着渲染循环。
    editorHandle?.();
    saveButton.disabled = true;
    reloadButton.hidden = true;
    statusElement.classList.remove("is-error");
    statusElement.textContent = "正在准备灯光预览…";
    editorHandle = mountInteraction3d(mountElement, {
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
          await editorHandle.openRangeEditor();
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
          // 只有仍是最新一轮时才报错，否则会把过期的失败覆盖到新的加载流程上。
          if (requestGeneration === generation) {
            handleLoadError(loadError);
          }
        }
      },
      onLoadError: handleLoadError,
      onEdit(editMessage) {
        if (!isClosed && requestGeneration === generation) {
          if (editMessage.action === "light-region-overrides") {
            const incomingOverrides = structuredClone(editMessage.overrides || {});
            // 只有内容真的变了才计一次改动：3D 侧会高频推送，靠深比较去抖。
            if (
              JSON.stringify(incomingOverrides) !==
              JSON.stringify(componentSnapshot.properties.lightRegionOverrides || {})
            ) {
              overridesRevision++;
              if (!isSaving) {
                statusElement.textContent = "范围已修改，点击保存应用。";
                statusElement.classList.remove("is-error");
              }
            }
            componentSnapshot.properties.lightRegionOverrides = incomingOverrides;
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
            // 保存过程中不关，否则会把正在进行的保存流程打断。
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
        // 先把 3D 侧尚未上报的拖拽结果冲出来，避免保存的是旧值。
        await editorHandle.flushRangeEditor();
        const savedOverrides = structuredClone(
          componentSnapshot.properties.lightRegionOverrides || {}
        );
        const revisionAtSave = overridesRevision;
        await requestInteraction3dAccess();
        if (isClosed) {
          return;
        }
        await onSave(savedOverrides);
        if (!isClosed) {
          // 保存期间又改过（revision 变了）就提示还有待保存内容，避免用户以为已经全部落盘。
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
        statusElement.textContent = saveError.message || "保存失败，请重试。";
        statusElement.classList.add("is-error");
      } finally {
        isSaving = false;
        if (!isClosed) {
          closeButton.disabled = false;
          // 保存后编辑器可能已被卸载或退出范围编辑，只有两种状态都为真才重新允许保存。
          saveButton.disabled = !editorHandle.ready || !editorHandle.rangeEditing;
        }
      }
    }
  });
  closeButton.addEventListener("click", () => {
    if (!isSaving) {
      close();
    }
  });
  dialogElement.addEventListener("cancel", cancelEvent => {
    // 拦截 dialog 的默认 Esc 行为，改走自己的 close，保证清理逻辑一定执行；
    // 保存过程中则忽略 Esc。
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
  unsubscribeAccess = subscribeInteraction3dAccess(access => {
    // 权限被收回或授权服务不可用时立即关闭，避免用户继续在无权限的编辑器里操作。
    if (!access.allowed && ["denied", "unavailable"].includes(access.status)) {
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
