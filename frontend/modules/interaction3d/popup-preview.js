const { popupPlacement: popupPlacement } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../static/modules/interaction3d/popup-placement.js", import.meta.url))
  : import("/static/modules/interaction3d/popup-placement.js"));
const { cameraPopupLayout: cameraPopupLayout } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../static/modules/interaction3d/camera-popup-layout.js", import.meta.url))
  : import("/static/modules/interaction3d/camera-popup-layout.js"));
export function popupPreviewPlacement(kind, width, height, settings) {
  const cameraLayout = kind === "camera" ? cameraPopupLayout(width, height) : null;
  const panelWidth = cameraLayout?.panelWidth || 360;
  const panelHeight = cameraLayout?.panelHeight || 232;
  const defaultTop = cameraLayout?.top ?? Math.max(12, Math.min(height * 0.56 - 400, height - 812));
  const defaultScale = cameraLayout
    ? 2
    : Math.min(
        2,
        (width - 32) / panelWidth,
        Math.max(0.5, (height - defaultTop - 100) / panelHeight)
      );
  return {
    ...popupPlacement({
      width: width,
      height: height,
      panelWidth: panelWidth,
      panelHeight: panelHeight,
      defaultTop: defaultTop,
      defaultScale: defaultScale,
      settings: settings
    }),
    panelWidth: panelWidth,
    panelHeight: panelHeight
  };
}
export function createPopupLayoutPreview(hostElement, getLayout, onClose) {
  const ownerDocument = hostElement.ownerDocument || document;
  const createElement = (tagName, className, textContent = "") => {
    const element = ownerDocument.createElement(tagName);
    element.className = className;
    element.textContent = textContent;
    return element;
  };
  const layerElement = createElement("div", "i3d-popup-preview-layer");
  const previewElement = createElement("section", "i3d-popup-preview");
  previewElement.setAttribute("aria-label", "弹窗布局预览");
  const headingElement = createElement("header", "i3d-popup-preview-heading");
  const headingTextElement = createElement("strong", "", "");
  const closeButton = createElement("button", "", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "关闭弹窗布局预览");
  closeButton.addEventListener("click", onClose);
  headingElement.append(headingTextElement, closeButton);
  const bodyElement = createElement("div", "i3d-popup-preview-body");
  previewElement.append(headingElement, bodyElement);
  layerElement.append(previewElement);
  hostElement.append(layerElement);
  let currentKind;
  let currentSettings;
  const resize = () => {
    if (!currentKind) {
      return;
    }
    const layout = getLayout() || {};
    const logicalWidth = layout.width || hostElement.clientWidth;
    const logicalHeight = layout.height || hostElement.clientHeight;
    if (!(logicalWidth > 0) || !(logicalHeight > 0)) {
      return;
    }
    const placement = popupPreviewPlacement(
      currentKind,
      logicalWidth,
      logicalHeight,
      currentSettings
    );
    const scaleX = hostElement.clientWidth / logicalWidth;
    const scaleY = hostElement.clientHeight / logicalHeight;
    Object.assign(previewElement.style, {
      width: placement.panelWidth + "px",
      height: placement.panelHeight + "px",
      left: placement.left * scaleX + "px",
      top: placement.top * scaleY + "px",
      transform: "scale(" + placement.scale * scaleX + "," + placement.scale * scaleY + ")"
    });
  };
  return {
    update(nextKind, nextSettings) {
      if (nextKind !== currentKind) {
        headingTextElement.textContent =
          nextKind === "camera" ? "摄像头 · 布局预览" : "通用弹窗 · 布局预览";
        previewElement.dataset.kind = nextKind;
        bodyElement.replaceChildren();
        if (nextKind === "camera") {
          bodyElement.append(createElement("div", "i3d-popup-preview-video", "16:9 画面示例"));
        } else {
          bodyElement.append(
            createElement("p", "i3d-popup-preview-name", "窗帘控制示例"),
            createElement("div", "i3d-popup-preview-track"),
            createElement(
              "div",
              "i3d-popup-preview-actions",
              "打开\u3000\u3000\u3000\u3000 暂停\u3000\u3000\u3000\u3000 关闭"
            )
          );
        }
      }
      currentKind = nextKind;
      currentSettings = {
        ...nextSettings
      };
      resize();
    },
    resize: resize,
    dispose() {
      layerElement.remove();
    }
  };
}
export function createFocusDevicePopup(
  popupHostElement,
  {
    kind: popupKind,
    item: item,
    getLayout: getPresentationLayout,
    getSettings: getSettings,
    getStates: getStates,
    panelDocument: panelDocument
  }
) {
  const popupOwnerDocument = popupHostElement.ownerDocument || document;
  const previewRootElement = popupOwnerDocument.createElement("div");
  previewRootElement.className = "i3d-focus-popup-preview";
  previewRootElement.inert = true;
  const stylesheetLink = popupOwnerDocument.createElement("link");
  stylesheetLink.rel = "stylesheet";
  stylesheetLink.href = "/static/renderer/renderer.css?v=20260916013557";
  const rendererHostElement = popupOwnerDocument.createElement("div");
  rendererHostElement.className = "i3d-focus-popup-host";
  previewRootElement.append(stylesheetLink, rendererHostElement);
  popupHostElement.append(previewRootElement);
  let isDisposed = false;
  let renderer;
  let panelHandle;
  const getPopupLayout = () => getSettings()?.[popupKind === "camera" ? "camera" : "general"];
  const resizePreview = () => panelHandle?.updateLayout?.();
  return {
    ready: (import.meta.url.startsWith("file:")
      ? import(new URL("../../static/renderer/renderer.js", import.meta.url))
      : import("/static/renderer/renderer.js")
    ).then(({ PanelRenderer: PanelRenderer }) => {
      if (isDisposed) {
        return;
      }
      renderer = new PanelRenderer(rendererHostElement, {
        editable: true
      });
      renderer.document = panelDocument;
      const interaction3dOptions = {
        root: rendererHostElement,
        getPresentationLayout: getPresentationLayout,
        getPopupLayout: getPopupLayout,
        popupOpacity: getSettings()?.opacity ?? 74
      };
      const previewItem = {
        ...item,
        entityId: item.entityId || popupKind + ".layout_preview"
      };
      if (popupKind === "camera") {
        renderer.showCameraPreview(
          {
            id: previewItem.id,
            properties: {
              label: previewItem.label
            },
            bindings: {
              entity: {
                entityId: previewItem.entityId
              }
            }
          },
          {
            preview: true,
            interaction3d: interaction3dOptions
          }
        );
        panelHandle = {
          updateLayout: () => renderer.detailsDialog?.resizeInteraction3d?.(),
          close: () => renderer.detailsDialog?.close()
        };
      } else {
        panelHandle = renderer.openInteraction3dVacuumDetails(previewItem, () => {}, {
          ...interaction3dOptions,
          states: getStates()
        });
      }
      resizePreview();
    }),
    resize: resizePreview,
    updateStates: () => panelHandle?.updateStates?.(getStates()),
    dispose() {
      isDisposed = true;
      panelHandle?.close();
      renderer?.destroy();
      previewRootElement.remove();
    }
  };
}
