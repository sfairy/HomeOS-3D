import { mountInteraction3d } from "./runtime.js";
import { interaction3dPreviewSize } from "/static/modules/interaction3d/preview-layout.js?v=20260915211726";
export function openPresenceFocusEditor({
  component: component,
  properties: properties,
  item: item,
  panelDocument: panelDocument,
  onSave: onSave
}) {
  const editorDocument = window.document;
  const createElement = (tagName, initialText) => {
    const createdElement = editorDocument.createElement(tagName);
    if (initialText) {
      createdElement.textContent = initialText;
    }
    return createdElement;
  };
  const dialogElement = createElement("dialog");
  dialogElement.className = "i3d-editor";
  dialogElement.setAttribute("aria-label", "人在传感器聚焦视角");
  dialogElement.dataset.i3dPreviewScope = "presence-focus";
  const headerElement = createElement("header");
  const bodyElement = createElement("div");
  bodyElement.className = "i3d-editor-body";
  const viewElement = createElement("div");
  const panelElement = createElement("aside");
  const statusElement = createElement("p", "正在加载户型…");
  viewElement.className = "i3d-editor-view";
  const aspectBoxElement = createElement("div");
  const stageHostElement = createElement("div");
  aspectBoxElement.className = "i3d-editor-aspect";
  stageHostElement.className = "i3d-editor-stage";
  aspectBoxElement.append(stageHostElement);
  viewElement.append(aspectBoxElement);
  const updatePreviewSize = () => {
    const previewSize = interaction3dPreviewSize(
      component,
      panelDocument,
      viewElement.clientWidth,
      viewElement.clientHeight
    );
    Object.assign(aspectBoxElement.style, {
      width: previewSize.width + "px",
      height: previewSize.height + "px"
    });
  };
  const previewResizeObserver = new ResizeObserver(updatePreviewSize);
  previewResizeObserver.observe(viewElement);
  let editorRuntime;
  let isReady = false;
  let isClosed = false;
  let isBusy = false;
  let cameraState = null;
  let commandQueue = Promise.resolve();
  const actionButtons = [];
  const createButton = (buttonLabel, onButtonClick) => {
    const buttonElement = createElement("button", buttonLabel);
    buttonElement.type = "button";
    buttonElement.addEventListener("click", onButtonClick);
    actionButtons.push(buttonElement);
    return buttonElement;
  };
  const closeEditor = () => {
    if (!isClosed) {
      isClosed = true;
      previewResizeObserver.disconnect();
      editorRuntime?.();
      dialogElement.close();
      dialogElement.remove();
      editorDocument.dispatchEvent(new Event("hb-i3d-preview-scope"));
    }
  };
  const syncControls = () => {
    actionButtons.forEach(actionButton => {
      actionButton.disabled = !isReady || isBusy;
    });
    focalLengthInputElement.disabled = !isReady || isBusy || cameraState?.mode !== "perspective";
    if (editorDocument.activeElement !== focalLengthInputElement) {
      focalLengthInputElement.value = String(Math.round(cameraState?.focalLength || 50));
    }
    for (const [projectionMode, projectionButtonElement] of projectionButtonsByMode) {
      projectionButtonElement.setAttribute(
        "aria-pressed",
        String((cameraState?.mode || "orthographic") === projectionMode)
      );
    }
  };
  const runFocusCommand = async (commandName, commandPayload) => {
    if (!isReady || isBusy || isClosed) {
      return;
    }
    const isFocalLengthCommand = commandName === "focus-focal-length";
    const previousQueuePromise = commandQueue;
    let releaseQueueGate;
    commandQueue = new Promise(resolveQueueGate => {
      releaseQueueGate = resolveQueueGate;
    });
    if (!isFocalLengthCommand) {
      isBusy = true;
      syncControls();
    }
    try {
      await previousQueuePromise;
      if (isClosed) {
        return;
      }
      const commandResult = await editorRuntime.focusCommand(
        commandName,
        "presence:" + item.id,
        commandPayload
      );
      if (isClosed) {
        return;
      }
      if (commandResult?.camera) {
        cameraState = commandResult.camera;
      }
      if (commandName === "save-light-camera") {
        onSave(commandResult.camera);
        closeEditor();
      } else {
        statusElement.textContent = "拖动旋转，滚轮缩放；调整完成后保存此视角。";
      }
    } catch (commandError) {
      if (!isClosed) {
        statusElement.textContent = commandError.message;
      }
    } finally {
      releaseQueueGate();
      if (!isFocalLengthCommand) {
        isBusy = false;
      }
      if (!isClosed) {
        syncControls();
      }
    }
  };
  const saveButtonElement = createButton("保存此视角", () => runFocusCommand("save-light-camera"));
  saveButtonElement.className = "primary";
  headerElement.append(
    createElement("strong", "人在传感器 · 聚焦视角"),
    saveButtonElement,
    createButton("取消", closeEditor)
  );
  const projectionGroupElement = createElement("div");
  projectionGroupElement.className = "i3d-focus-actions";
  projectionGroupElement.setAttribute("role", "group");
  projectionGroupElement.setAttribute("aria-label", "聚焦投影");
  const projectionButtonsByMode = new Map();
  for (const [modeId, modeLabel] of [
    ["orthographic", "正交"],
    ["perspective", "透视"]
  ]) {
    const modeButtonElement = createButton(modeLabel, () =>
      runFocusCommand("focus-projection", modeId)
    );
    projectionButtonsByMode.set(modeId, modeButtonElement);
    projectionGroupElement.append(modeButtonElement);
  }
  const focalLengthInputElement = createElement("input");
  Object.assign(focalLengthInputElement, {
    type: "number",
    min: "18",
    max: "120",
    step: "1",
    value: "50"
  });
  focalLengthInputElement.setAttribute("aria-label", "焦段（mm）");
  focalLengthInputElement.addEventListener("change", () => {
    const typedFocalLength = Number(focalLengthInputElement.value);
    if (!focalLengthInputElement.value.trim() || !Number.isFinite(typedFocalLength)) {
      focalLengthInputElement.value = String(cameraState?.focalLength || 50);
      return;
    }
    focalLengthInputElement.value = String(Math.max(18, Math.min(120, typedFocalLength)));
    runFocusCommand("focus-focal-length", Number(focalLengthInputElement.value));
  });
  const focalLengthFieldElement = createElement("label");
  focalLengthFieldElement.append(createElement("span", "焦段（mm）"), focalLengthInputElement);
  syncControls();
  panelElement.append(
    statusElement,
    projectionGroupElement,
    focalLengthFieldElement,
    createElement("p", "此视角用于点击小人后的聚焦展示，不弹出控制面板。")
  );
  bodyElement.append(viewElement, panelElement);
  dialogElement.append(headerElement, bodyElement);
  editorDocument.body.append(dialogElement);
  dialogElement.addEventListener("cancel", cancelEvent => {
    cancelEvent.preventDefault();
    closeEditor();
  });
  dialogElement.showModal();
  updatePreviewSize();
  const draftProperties = structuredClone(properties);
  draftProperties.security = {
    presenceSensors: [structuredClone(item)]
  };
  draftProperties.floorSelection = item.floorId;
  draftProperties.camera =
    draftProperties.floorCameras?.[item.floorId] ||
    (properties.floorSelection === item.floorId ? properties.camera : null);
  editorRuntime = mountInteraction3d(stageHostElement, {
    component: {
      ...component,
      properties: draftProperties
    },
    context: {
      document: panelDocument,
      editable: true
    },
    editing: true,
    editingModule: "security",
    onPresented: () => {
      if (!isReady && !isClosed) {
        isReady = true;
        runFocusCommand("edit-light-camera");
      }
    },
    onLoadError: loadError => {
      statusElement.textContent = loadError.message || String(loadError);
    }
  });
  editorDocument.dispatchEvent(new Event("hb-i3d-preview-scope"));
}
