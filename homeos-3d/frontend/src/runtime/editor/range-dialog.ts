import { mountInteraction3d } from "../core/runtime";
import {
  requestInteraction3dAccess,
  subscribeInteraction3dAccess,
} from "@app/bridge/bridge";
import { domElement } from "@app/utils/dom-factory";
export async function openInteraction3dRangeEditor({
  component: component,
  document: panelDocument,
  states: states,
  onSave: onSave,
  onClose: onClose = () => {},
}) {
  if ((await requestInteraction3dAccess(), !component.properties?.sceneId))
    throw new Error("请先载入 3D 户型。");
  if (component.properties.lightingMode !== "region") throw new Error("请先选择轻量柔光模式。");
  const componentSnapshot = structuredClone(component),
    previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null,
    createElement = (tag, className = "", text = "") =>
      domElement(document, tag, className, text),
    stylesheetLink = createElement("link");
  ((stylesheetLink.rel = "stylesheet"),
    (stylesheetLink.href =
      "/api/v1/modules/interaction3d/core/runtime.css"),
    document.head.append(stylesheetLink));
  const dialogElement = createElement("dialog", "i3d-editor i3d-range-dialog");
  (dialogElement.setAttribute("aria-label", "照射范围"),
    dialogElement.setAttribute("data-i3d-preview-scope", ""));
  const headerElement = createElement("header"),
    saveButton = createElement("button", "primary", "保存"),
    closeButton = createElement("button", "i3d-range-close", "×");
  (closeButton.setAttribute("aria-label", "关闭照射范围"),
    (closeButton.title = "关闭"),
    (saveButton.type = closeButton.type = "button"),
    (saveButton.disabled = true));
  const statusElement = createElement("p", "i3d-range-status", "正在准备灯光预览…");
  statusElement.setAttribute("role", "status");
  const reloadButton = createElement("button", "", "重新载入");
  ((reloadButton.type = "button"), (reloadButton.hidden = true));
  const bodyElement = createElement("div", "i3d-range-dialog-body"),
    mountElement = createElement("div");
  (headerElement.append(
    createElement("strong", "", "照射范围"),
    reloadButton,
    saveButton,
    closeButton,
  ),
    bodyElement.append(mountElement),
    dialogElement.append(headerElement, statusElement, bodyElement),
    document.body.append(dialogElement));
  let isClosed = false,
    isSaving = false,
    isRangeReady = false,
    editorHandle = null,
    unsubscribeAccess = () => {},
    generation = 0,
    overridesRevision = 0,
    resolveReady,
    rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    ((resolveReady = resolve), (rejectReady = reject));
  });
  readyPromise.catch(() => {});
  function close() {
    isClosed ||
      ((isClosed = true),
      generation++,
      unsubscribeAccess(),
      editorHandle?.(),
      rejectReady(new Error("照射范围编辑已关闭。")),
      window.removeEventListener("pagehide", close),
      dialogElement.close(),
      dialogElement.remove(),
      stylesheetLink.remove(),
      document.dispatchEvent(new Event("hb-i3d-preview-scope")),
      previouslyFocusedElement?.isConnected && previouslyFocusedElement.focus(),
      onClose());
  }
  function handleLoadError(error) {
    isClosed ||
      ((saveButton.disabled = true),
      (reloadButton.hidden = false),
      (statusElement.textContent = error.message || "照射范围载入失败，请重试。"),
      statusElement.classList.add("is-error"),
      rejectReady(error));
  }
  function mountEditor() {
    const requestGeneration = ++generation;
    ((isRangeReady = false),
      editorHandle?.(),
      (saveButton.disabled = true),
      (reloadButton.hidden = true),
      statusElement.classList.remove("is-error"),
      (statusElement.textContent = "正在准备灯光预览…"),
      (editorHandle = mountInteraction3d(mountElement, {
        component: componentSnapshot,
        context: {
          document: panelDocument,
          states: states,
        },
        editing: true,
        rangeEditorOnly: true,
        async onPresented() {
          try {
            if (
              (await editorHandle.openRangeEditor(), isClosed || requestGeneration !== generation)
            )
              return;
            ((isRangeReady = true),
              (saveButton.disabled = false),
              (statusElement.textContent =
                "平面编辑调整照射范围，3D 预览实时查看高度效果；两个视图共用参数。"),
              resolveReady());
          } catch (loadError) {
            requestGeneration === generation && handleLoadError(loadError);
          }
        },
        onLoadError: handleLoadError,
        onEdit(editMessage) {
          if (!(isClosed || requestGeneration !== generation)) {
            if (editMessage.action === "light-region-overrides") {
              const incomingOverrides = structuredClone(editMessage.overrides || {});
              (JSON.stringify(incomingOverrides) !==
                JSON.stringify(componentSnapshot.properties.lightRegionOverrides || {}) &&
                (overridesRevision++,
                isSaving ||
                  ((statusElement.textContent = "范围已修改，点击保存应用。"),
                  statusElement.classList.remove("is-error"))),
                (componentSnapshot.properties.lightRegionOverrides = incomingOverrides));
            }
            editMessage.action === "range-editor-state" && editMessage.error
              ? handleLoadError(new Error(editMessage.error))
              : editMessage.action === "range-editor-state" &&
                !editMessage.active &&
                isRangeReady &&
                !isSaving &&
                close();
          }
        },
      })));
  }
  return (
    saveButton.addEventListener("click", async () => {
      if (!(isClosed || isSaving || !isRangeReady || saveButton.disabled)) {
        ((isSaving = true),
          (saveButton.disabled = true),
          (closeButton.disabled = true),
          (reloadButton.hidden = true),
          (statusElement.textContent = "正在保存范围…"));
        try {
          await editorHandle.flushRangeEditor();
          const savedOverrides = structuredClone(
              componentSnapshot.properties.lightRegionOverrides || {},
            ),
            revisionAtSave = overridesRevision;
          if ((await requestInteraction3dAccess(), isClosed)) return;
          (await onSave(savedOverrides),
            isClosed ||
              ((statusElement.textContent =
                revisionAtSave === overridesRevision
                  ? "已保存到灯光配置，可继续调整。关闭后点击“保存配置”完成保存。"
                  : "已保存，另有新修改待保存。"),
              statusElement.classList.remove("is-error")));
        } catch (saveError) {
          if (isClosed) return;
          ((statusElement.textContent = saveError.message || "保存失败，请重试。"),
            statusElement.classList.add("is-error"));
        } finally {
          ((isSaving = false),
            isClosed ||
              ((closeButton.disabled = false),
              (saveButton.disabled = !editorHandle.ready || !editorHandle.rangeEditing)));
        }
      }
    }),
    closeButton.addEventListener("click", () => {
      isSaving || close();
    }),
    dialogElement.addEventListener("cancel", (cancelEvent) => {
      (cancelEvent.preventDefault(), isSaving || close());
    }),
    reloadButton.addEventListener("click", mountEditor),
    window.addEventListener("pagehide", close),
    dialogElement.showModal(),
    document.dispatchEvent(new Event("hb-i3d-preview-scope")),
    mountEditor(),
    (unsubscribeAccess = subscribeInteraction3dAccess((access) => {
      !access.allowed && ["denied", "unavailable"].includes(access.status) && close();
    })),
    isClosed && unsubscribeAccess(),
    {
      close: close,
      ready: readyPromise,
    }
  );
}
