import { domElement } from "@app/utils/dom-factory";
const { popupPlacement: popupPlacement } = await (import("@app/bridge/popup-placement")),
  { cameraPopupLayout: cameraPopupLayout } = await (import("@app/bridge/camera-popup-layout"));
function popupPreviewPlacement(kind: any, width: any, height: any, settings: any) {
  const cameraLayout = kind === "camera" ? cameraPopupLayout(width, height) : null,
    panelWidth = cameraLayout?.panelWidth || 360,
    panelHeight = cameraLayout?.panelHeight || 232,
    defaultTop = cameraLayout?.top ?? Math.max(12, Math.min(height * 0.56 - 400, height - 812));
  return {
    ...popupPlacement({
      width: width,
      height: height,
      panelWidth: panelWidth,
      panelHeight: panelHeight,
      defaultTop: defaultTop,
      defaultScale: 2,
      settings: settings,
    }),
    panelWidth: panelWidth,
    panelHeight: panelHeight,
  };
}
export function createPopupLayoutPreview(hostElement: any, getLayout: any, onClose: any) {
  const ownerDocument = hostElement.ownerDocument || document,
    createElement = (tag: any, className: any, text = "") =>
      domElement(ownerDocument, tag, className, text),
    layerElement = createElement("div", "i3d-popup-preview-layer"),
    previewElement = createElement("section", "i3d-popup-preview");
  previewElement.setAttribute("aria-label", "弹窗布局预览");
  const headingElement = createElement("header", "i3d-popup-preview-heading"),
    headingTextElement = createElement("strong", "", ""),
    closeButton = createElement("button", "", "×");
  ((closeButton.type = "button"),
    closeButton.setAttribute("aria-label", "关闭弹窗布局预览"),
    closeButton.addEventListener("pointerdown", (pointerEvent: any) => pointerEvent.stopPropagation()),
    closeButton.addEventListener("click", onClose),
    headingElement.append(headingTextElement, closeButton));
  const bodyElement = createElement("div", "i3d-popup-preview-body");
  (previewElement.append(headingElement, bodyElement),
    layerElement.append(previewElement),
    hostElement.append(layerElement));
  let currentKind: any, currentSettings: any;
  const resize = () => {
    if (!currentKind) return;
    const layout = getLayout() || {},
      logicalWidth = layout.width || hostElement.clientWidth,
      logicalHeight = layout.height || hostElement.clientHeight;
    if (!(logicalWidth > 0 && logicalHeight > 0)) return;
    const placement = popupPreviewPlacement(
        currentKind,
        logicalWidth,
        logicalHeight,
        currentSettings,
      ),
      scaleX = hostElement.clientWidth / logicalWidth,
      scaleY = hostElement.clientHeight / logicalHeight;
    Object.assign(previewElement.style, {
      width: placement.panelWidth + "px",
      height: placement.panelHeight + "px",
      left: placement.left * scaleX + "px",
      top: placement.top * scaleY + "px",
      transform: "scale(" + placement.scale * scaleX + "," + placement.scale * scaleY + ")",
    });
  };
  return {
    update(nextKind: any, nextSettings: any) {
      if (nextKind !== currentKind) {
        if (
          ((headingTextElement.textContent =
            nextKind === "camera" ? "摄像头 · 布局预览" : "通用弹窗 · 布局预览"),
          (previewElement.dataset.kind = nextKind),
          bodyElement.replaceChildren(),
          nextKind === "camera")
        )
          bodyElement.append(createElement("div", "i3d-popup-preview-video", "16:9 画面示例"));
        else {
          const actionsElement = createElement("div", "i3d-popup-preview-actions");
          (actionsElement.append(
            ...["关闭", "暂停", "打开"].map((actionLabel) =>
              createElement("span", "", actionLabel),
            ),
          ),
            bodyElement.append(
              createElement("p", "i3d-popup-preview-name", "窗帘控制示例 · 50%"),
              createElement("div", "i3d-popup-preview-track"),
              actionsElement,
            ));
        }
      }
      ((currentKind = nextKind),
        (currentSettings = {
          ...nextSettings,
        }),
        resize());
    },
    resize: resize,
    dispose() {
      layerElement.remove();
    },
  };
}
export function createFocusDevicePopup(
  popupHostElement: any,
  {
    kind: popupKind,
    item: item,
    getLayout: getPresentationLayout,
    getSettings: getSettings,
    getStates: getStates,
    panelDocument: panelDocument,
  }: any,
) {
  const popupOwnerDocument = popupHostElement.ownerDocument || document,
    previewRootElement = popupOwnerDocument.createElement("div");
  ((previewRootElement.className = "i3d-focus-popup-preview"), (previewRootElement.inert = true));
  const stylesheetLink = popupOwnerDocument.createElement("link");
  ((stylesheetLink.rel = "stylesheet"),
    (stylesheetLink.href =
      "/static/renderer/renderer.css"));
  const rendererHostElement = popupOwnerDocument.createElement("div");
  ((rendererHostElement.className = "i3d-focus-popup-host"),
    previewRootElement.append(stylesheetLink, rendererHostElement),
    popupHostElement.append(previewRootElement));
  let isDisposed = false,
    renderer: any,
    panelHandle: any;
  const getPopupLayout = () => getSettings()?.[popupKind === "camera" ? "camera" : "general"],
    resizePreview = () => panelHandle?.updateLayout?.();
  return {
    ready: (import("@app/renderer/core/renderer")
    ).then(({ PanelRenderer: PanelRenderer }) => {
      if (isDisposed) return;
      ((renderer = new PanelRenderer(rendererHostElement, {
        editable: true,
      })),
        (renderer.document = panelDocument));
      const interaction3dOptions = {
          root: rendererHostElement,
          getPresentationLayout: getPresentationLayout,
          getPopupLayout: getPopupLayout,
          popupOpacity: getSettings()?.opacity ?? 74,
        },
        previewItem = {
          ...item,
          entityId: item.entityId || popupKind + ".layout_preview",
        };
      (popupKind === "camera"
        ? (renderer.showCameraPreview(
            {
              id: previewItem.id,
              properties: {
                label: previewItem.label,
              },
              bindings: {
                entity: {
                  entityId: previewItem.entityId,
                },
              },
            },
            {
              preview: true,
              interaction3d: interaction3dOptions,
            },
          ),
          (panelHandle = {
            updateLayout: () => renderer.detailsDialog?.resizeInteraction3d?.(),
            close: () => renderer.detailsDialog?.close(),
          }))
        : (panelHandle = renderer.openInteraction3dVacuumDetails(previewItem, () => {}, {
            ...interaction3dOptions,
            states: getStates(),
          })),
        resizePreview());
    }),
    resize: resizePreview,
    updateStates: () => panelHandle?.updateStates?.(getStates()),
    dispose() {
      ((isDisposed = true), panelHandle?.close(), renderer?.destroy(), previewRootElement.remove());
    },
  };
}
