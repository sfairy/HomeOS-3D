import { domElement } from "@app/shared/util/dom-factory";
import type {
  PopupPlacement,
  PopupPlacementSettings,
} from "@app/bridge/presets/popup-placement";
const { popupPlacement: popupPlacement } = await (import("@app/bridge/presets/popup-placement")),
  { cameraPopupLayout: cameraPopupLayout } = await (import("@app/bridge/presets/camera-popup-layout"));
export interface PopupPreviewOptions {
  /** 是否按「画布最大高度」收口并在标题上标出百分比；默认 `true`。 */
  showHeightLimit?: boolean;
}
/** 预览设置 = 摆放设置 + 面板底色不透明度（`--i3d-panel-opacity` 的百分比来源）。 */
export interface PopupPreviewSettings extends PopupPlacementSettings {
  opacity?: number;
}
/** 预览摆放 = 通用摆放结果 + 面板自身的逻辑尺寸（标题要给高度上限用）。 */
export interface PopupPreviewPlacement extends PopupPlacement {
  panelWidth: number;
  panelHeight: number;
}

/**
 * 预览用的弹窗摆放（0.8.1）：`showHeightLimit` 时面板高度压到画布最大高度以内，
 * 长内容在面板内部滚动；摄像头弹窗在不显示高度上限时按内容高度收口。
 */
export function popupPreviewPlacement(
  kind: string,
  width: number,
  height: number,
  settings: PopupPreviewSettings | null | undefined,
  { showHeightLimit = true }: PopupPreviewOptions = {},
): PopupPreviewPlacement {
  const cameraLayout = kind === "camera" ? cameraPopupLayout(width, height) : null,
    panelWidth = cameraLayout?.panelWidth || 360,
    cameraPanelHeight = cameraLayout?.panelHeight || 232,
    defaultTop = cameraLayout?.top ?? Math.max(12, Math.min(height * 0.56 - 400, height - 812)),
    placementOptions = {
      width: width,
      height: height,
      panelWidth: panelWidth,
      panelHeight: cameraPanelHeight,
      defaultTop: defaultTop,
      defaultScale: 2,
      settings: settings,
      fitContent: kind === "camera" && !showHeightLimit,
    },
    panelHeight = showHeightLimit
      ? popupPlacement({ ...placementOptions, panelHeight: 1 }).maxHeight
      : cameraPanelHeight;
  return {
    ...popupPlacement({ ...placementOptions, panelHeight: panelHeight }),
    panelWidth: panelWidth,
    panelHeight: panelHeight,
  };
}

/**
 * 拖动「最大高度」滑条时的高度草稿：高度变化后保持面板中心不动，
 * 换算成 `y` 百分比写回设置，避免滑条一拖面板就跳到别处。
 */
export function popupHeightDraft(
  kind: string,
  width: number,
  height: number,
  settings: PopupPreviewSettings | null | undefined,
  maxHeight: unknown,
): PopupPreviewSettings {
  const basePlacement = popupPreviewPlacement(kind, width, height, settings, {
      showHeightLimit: true,
    }),
    draftSettings: PopupPreviewSettings = {
      ...settings,
      maxHeight: typeof maxHeight === "number" ? maxHeight : (settings?.maxHeight ?? 75),
    },
    nextPlacement = popupPreviewPlacement(kind, width, height, draftSettings, {
      showHeightLimit: true,
    }),
    availableHeight = height - nextPlacement.margin * 2 - nextPlacement.height,
    centeredTop = basePlacement.top + basePlacement.height / 2 - nextPlacement.height / 2;
  return {
    ...draftSettings,
    y:
      availableHeight > 0
        ? Math.round(
            Math.max(0, Math.min(100, ((centeredTop - nextPlacement.margin) / availableHeight) * 100)) *
              100,
          ) / 100
        : 50,
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
  let currentKind = "general",
    currentSettings: PopupPreviewSettings = {},
    currentOptions: PopupPreviewOptions = { showHeightLimit: true };
  /**
   * 布局预览的面板底色按 `--i3d-panel-opacity` 画（runtime.css 的 `.i3d-popup-preview` 与
   * stage.css 的真面板同一枚变量）。但舞台那枚变量由 stage.ts 在**舞台帧里**注入，预览挂在
   * 编辑器页面，没有任何人替它写 —— 不写就永远停在 CSS 兜底的 0.74，「弹窗透明度」滑条
   * 于是调了也看不出变化。这里按 settings 自己写一次，与真面板同口径（百分比 → 0–1）。
   */
  const applyPopupOpacity = () => {
    const opacityPercent = Number.isFinite(currentSettings?.opacity)
      ? Math.max(0, Math.min(100, Number(currentSettings.opacity)))
      : 74;
    previewElement.style.setProperty("--i3d-panel-opacity", String(opacityPercent / 100));
  };
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
        currentOptions,
      ),
      scaleX = hostElement.clientWidth / logicalWidth,
      scaleY = hostElement.clientHeight / logicalHeight;
    Object.assign(previewElement.style, {
      width: placement.panelWidth + "px",
      height: Math.min(placement.panelHeight, placement.maxHeight) + "px",
      left: placement.left * scaleX + "px",
      top: placement.top * scaleY + "px",
      transform: "scale(" + placement.scale * scaleX + "," + placement.scale * scaleY + ")",
    });
    // 显示高度上限时，标题直接写出百分比，滑条调到哪一眼可见。
    headingTextElement.textContent =
      currentOptions.showHeightLimit !== false
        ? "最大高度 " +
          (currentSettings?.custom === false ? 75 : (currentSettings?.maxHeight ?? 75)) +
          "%"
        : currentKind === "camera"
          ? "摄像头弹窗"
          : "通用弹窗";
  };
  return {
    update(
      nextKind: string,
      nextSettings: PopupPreviewSettings,
      nextOptions: PopupPreviewOptions = currentOptions,
    ) {
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
        (currentOptions = {
          ...nextOptions,
        }),
        applyPopupOpacity(),
        resize());
    },
    /** 只刷新不透明度（滑条拖动时用）：不动布局，也不需要调用方知道当前预览的是哪个预设。 */
    setOpacity(nextOpacity: number) {
      ((currentSettings = {
        ...(currentSettings || {}),
        opacity: nextOpacity,
      }),
        applyPopupOpacity());
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
    ready: (import("@app/renderer/panel-renderer")
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
