import { mountInteraction3d } from "../core/runtime";
import { interaction3dPreviewSize } from "@app/bridge/preview-layout";
import { domElement } from "@app/utils/dom-factory";
export function openPresenceFocusEditor({
  component: component,
  properties: properties,
  item: item,
  panelDocument: panelDocument,
  onSave: onSave,
  previewOnly: previewOnly = false,
}: any) {
  const editorDocument = window.document,
    createElement = (tagName: any, initialText = "") =>
      domElement(editorDocument, tagName, "", initialText),
    dialogElement = createElement("dialog");
  ((dialogElement.className = "i3d-editor"),
    dialogElement.setAttribute("aria-label", "人在传感器聚焦视角"),
    (dialogElement.dataset.i3dPreviewScope = "presence-focus"));
  const headerElement = createElement("header"),
    bodyElement = createElement("div");
  bodyElement.className = "i3d-editor-body";
  const viewElement = createElement("div"),
    panelElement = createElement("aside"),
    statusElement = createElement("p", "正在加载户型…");
  viewElement.className = "i3d-editor-view";
  const aspectBoxElement = createElement("div"),
    stageHostElement = createElement("div");
  ((aspectBoxElement.className = "i3d-editor-aspect"),
    (stageHostElement.className = "i3d-editor-stage"),
    aspectBoxElement.append(stageHostElement),
    viewElement.append(aspectBoxElement));
  const updatePreviewSize = () => {
      const previewSize = interaction3dPreviewSize(
        component,
        panelDocument,
        viewElement.clientWidth,
        viewElement.clientHeight,
      );
      Object.assign(aspectBoxElement.style, {
        width: previewSize.width + "px",
        height: previewSize.height + "px",
      });
    },
    previewResizeObserver = new ResizeObserver(updatePreviewSize);
  previewResizeObserver.observe(viewElement);
  let editorRuntime: any,
    isReady = false,
    isClosed = false,
    isBusy = false,
    cameraState: any = null,
    commandQueue = Promise.resolve(),
    isEditing = !previewOnly;
  const actionButtons: any[] = [],
    createButton = (buttonLabel: any, onButtonClick: any) => {
      const buttonElement = createElement("button", buttonLabel);
      return (
        (buttonElement.type = "button"),
        buttonElement.addEventListener("click", onButtonClick),
        actionButtons.push(buttonElement),
        buttonElement
      );
    },
    closeEditor = () => {
      isClosed ||
        ((isClosed = true),
        previewResizeObserver.disconnect(),
        editorRuntime?.(),
        dialogElement.close(),
        dialogElement.remove(),
        editorDocument.dispatchEvent(new Event("hb-i3d-preview-scope")));
    },
    syncControls = () => {
      (actionButtons.forEach((actionButton) => {
        actionButton.disabled = !isReady || isBusy;
      }),
        (saveButtonElement.hidden = !isEditing),
        (adjustButtonElement.hidden = isEditing),
        (closeButtonElement.textContent = isEditing ? "取消调整" : "关闭预览"),
        (closeButtonElement.disabled = false),
        (projectionGroupElement.hidden = !isEditing),
        (focalLengthFieldElement.hidden = !isEditing),
        (focalLengthInputElement.disabled =
          !isEditing || !isReady || isBusy || cameraState?.mode !== "perspective"),
        editorDocument.activeElement !== focalLengthInputElement &&
          (focalLengthInputElement.value = String(Math.round(cameraState?.focalLength || 50))));
      for (const [projectionMode, projectionButtonElement] of projectionButtonsByMode)
        projectionButtonElement.setAttribute(
          "aria-pressed",
          String((cameraState?.mode || "orthographic") === projectionMode),
        );
    },
    runFocusCommand = async (commandName: any, commandPayload: any = null) => {
      if (!isReady || isBusy || isClosed) return;
      const isFocalLengthCommand = commandName === "focus-focal-length",
        previousQueuePromise = commandQueue;
      let releaseQueueGate;
      ((commandQueue = new Promise((resolveQueueGate) => {
        releaseQueueGate = resolveQueueGate;
      })),
        isFocalLengthCommand || ((isBusy = true), syncControls()));
      try {
        if ((await previousQueuePromise, isClosed)) return;
        const commandResult = await editorRuntime.focusCommand(
          commandName,
          "presence:" + item.id,
          commandPayload,
        );
        if (isClosed) return;
        (commandResult?.camera && (cameraState = commandResult.camera),
          commandName === "save-light-camera"
            ? (onSave(commandResult.camera), closeEditor())
            : (commandName === "edit-light-camera" && (isEditing = true),
              (statusElement.textContent = isEditing
                ? "拖动旋转 · 右键平移 · 滚轮缩放。调整完成后保存视角。"
                : "正在预览聚焦视角。")));
      } catch (commandError: any) {
        isClosed || (statusElement.textContent = commandError.message);
      } finally {
        (releaseQueueGate!(), isFocalLengthCommand || (isBusy = false), isClosed || syncControls());
      }
    },
    saveButtonElement = createButton("保存视角", () => runFocusCommand("save-light-camera"));
  saveButtonElement.className = "primary";
  const adjustButtonElement = createButton("调整视角", () => runFocusCommand("edit-light-camera")),
    closeButtonElement = createButton("取消调整", closeEditor);
  headerElement.append(
    createElement("strong", (item.label || "人在传感器") + " · 聚焦视角"),
    saveButtonElement,
    adjustButtonElement,
    closeButtonElement,
  );
  const projectionGroupElement = createElement("div");
  ((projectionGroupElement.className = "i3d-focus-actions"),
    projectionGroupElement.setAttribute("role", "group"),
    projectionGroupElement.setAttribute("aria-label", "聚焦投影"));
  const projectionButtonsByMode = new Map();
  for (const [modeId, modeLabel] of [
    ["orthographic", "正交"],
    ["perspective", "透视"],
  ]) {
    const modeButtonElement = createButton(modeLabel, () =>
      runFocusCommand("focus-projection", modeId),
    );
    (projectionButtonsByMode.set(modeId, modeButtonElement),
      projectionGroupElement.append(modeButtonElement));
  }
  const focalLengthInputElement = createElement("input");
  (Object.assign(focalLengthInputElement, {
    type: "number",
    min: "18",
    max: "120",
    step: "1",
    value: "50",
  }),
    focalLengthInputElement.setAttribute("aria-label", "焦段（mm）"),
    focalLengthInputElement.addEventListener("change", () => {
      const typedFocalLength = Number(focalLengthInputElement.value);
      if (!focalLengthInputElement.value.trim() || !Number.isFinite(typedFocalLength)) {
        focalLengthInputElement.value = String(cameraState?.focalLength || 50);
        return;
      }
      ((focalLengthInputElement.value = String(Math.max(18, Math.min(120, typedFocalLength)))),
        runFocusCommand("focus-focal-length", Number(focalLengthInputElement.value)));
    }));
  const focalLengthFieldElement = createElement("label");
  (focalLengthFieldElement.append(createElement("span", "焦段（mm）"), focalLengthInputElement),
    syncControls(),
    panelElement.append(
      statusElement,
      projectionGroupElement,
      focalLengthFieldElement,
      createElement("p", "此视角用于点击小人后的聚焦展示，不弹出控制面板。"),
    ),
    bodyElement.append(viewElement, panelElement),
    dialogElement.append(headerElement, bodyElement),
    editorDocument.body.append(dialogElement),
    dialogElement.addEventListener("cancel", (cancelEvent: any) => {
      (cancelEvent.preventDefault(), closeEditor());
    }),
    dialogElement.showModal(),
    updatePreviewSize());
  const draftProperties = structuredClone(properties);
  ((draftProperties.security = {
    presenceSensors: [structuredClone(item)],
  }),
    (draftProperties.floorSelection = item.floorId),
    (draftProperties.camera =
      draftProperties.floorCameras?.[item.floorId] ||
      (properties.floorSelection === item.floorId ? properties.camera : null)),
    (editorRuntime = mountInteraction3d(stageHostElement, {
      component: {
        ...component,
        properties: draftProperties,
      },
      context: {
        document: panelDocument,
        editable: true,
      },
      editing: true,
      editingModule: "security",
      onPresented: () => {
        isReady ||
          isClosed ||
          ((isReady = true),
          runFocusCommand(previewOnly ? "preview-light-camera" : "edit-light-camera"));
      },
      onLoadError: (loadError: any) => {
        statusElement.textContent = loadError.message || String(loadError);
      },
    })),
    editorDocument.dispatchEvent(new Event("hb-i3d-preview-scope")));
}
