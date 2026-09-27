/**
 * 3D 弹窗的布局预览：编辑弹窗（通用 / 摄像头）时，不打开真实弹窗也让用户看到弹窗会出现在哪里、
 */

// DOM 工厂（元素 / 按钮 / replaceChildren 兜底）的唯一实现，与其它运行侧模块同一座桥。
import { createDomFactory } from "./static-helpers.js";
// 复用渲染器的弹窗落位与摄像头版式算法；开发环境走相对路径，生产环境走静态路径。
const { popupPlacement: popupPlacement } = await (import("@app/bridge/popup-placement.js"));
const { cameraPopupLayout: cameraPopupLayout } = await (import("@app/bridge/camera-popup-layout.js"));

type PopupSettings = {
  scale?: unknown;
  x?: unknown;
  y?: unknown;
  [key: string]: unknown;
};

type LayoutSize = {
  width?: number;
  height?: number;
};

type FocusPopupOptions = {
  kind: string;
  item: {
    id?: string;
    label?: string;
    entityId?: string;
    [key: string]: unknown;
  };
  getLayout: () => LayoutSize | null | undefined;
  getSettings: () => {
    camera?: PopupSettings;
    general?: PopupSettings;
    opacity?: number;
    [key: string]: unknown;
  } | null | undefined;
  getStates: () => unknown;
  panelDocument?: Document;
};

type PanelHandle = {
  updateLayout?: () => void;
  updateStates?: (states: unknown) => void;
  close?: () => void;
};

type PanelRendererLike = {
  document?: Document;
  detailsDialog?: {
    resizeInteraction3d?: () => void;
    close?: () => void;
  };
  showCameraPreview: (item: unknown, options: unknown) => void;
  openInteraction3dVacuumDetails: (
    item: unknown,
    onClose: () => void,
    options: unknown
  ) => PanelHandle | Promise<PanelHandle> | null | undefined;
  destroy: () => void;
};

type PanelRendererModule = {
  PanelRenderer: new (
    host: HTMLElement,
    options: { editable?: boolean }
  ) => PanelRendererLike;
};

/**
 * 计算弹窗预览的落位与缩放。
 */
function popupPreviewPlacement(
  kind: string,
  width: number,
  height: number,
  settings: PopupSettings | undefined
) {
  const cameraLayout = kind === "camera" ? cameraPopupLayout(width, height) : null;
  // 360×232 是通用弹窗的设计基准尺寸：摄像头版式自带尺寸，通用弹窗则用它当兜底。
  const panelWidth = cameraLayout?.panelWidth || 360;
  const panelHeight = cameraLayout?.panelHeight || 232;
  // 默认上边距：摄像头弹窗由版式给定；通用弹窗按视口高度的 56% 再上移 400（弹窗视觉重心偏上），
  const defaultTop = cameraLayout?.top ?? Math.max(12, Math.min(height * 0.56 - 400, height - 812));
  // 缩放：摄像头弹窗固定 2 倍（版式按 2 倍设计），通用弹窗按「不超出左右各 16px 边距、
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
/**
 * 创建编辑面板里的弹窗示意预览（缩微色块，不含真实控件）。
 */
export function createPopupLayoutPreview(
  hostElement: HTMLElement,
  getLayout: () => LayoutSize | null | undefined,
  onClose: () => void
) {
  // 工厂按宿主的 ownerDocument 创建节点：嵌在 iframe 里也落在正确的文档中。
  const { el: createElement } = createDomFactory(hostElement.ownerDocument || document) as {
    el: (tag: string, className?: string, text?: string) => HTMLElement;
  };
  const layerElement = createElement("div", "i3d-popup-preview-layer");
  const previewElement = createElement("section", "i3d-popup-preview");
  previewElement.setAttribute("aria-label", "弹窗布局预览");
  const headingElement = createElement("header", "i3d-popup-preview-heading");
  const headingTextElement = createElement("strong", "", "");
  const closeButton = createElement("button", "", "×") as HTMLButtonElement;
  // 显式声明 type，防止按钮出现在表单里时触发表单提交。
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "关闭弹窗布局预览");
  closeButton.addEventListener("click", onClose);
  headingElement.append(headingTextElement, closeButton);
  const bodyElement = createElement("div", "i3d-popup-preview-body");
  previewElement.append(headingElement, bodyElement);
  layerElement.append(previewElement);
  hostElement.append(layerElement);
  let currentKind: string | undefined;
  let currentSettings: PopupSettings | undefined;
  /** 按当前类型与配置重新计算预览块的位置与缩放。 */
  const resize = () => {
    if (!currentKind) {
      return;
    }
    const layout = getLayout() || {};
    // 宿主元素尺寸作为逻辑尺寸的兜底，保证首帧（布局尚未就绪）也能画出预览。
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
    // 逻辑坐标 → 实际像素：编辑器会把逻辑画布等比缩放到宿主元素里，
    const scaleX = hostElement.clientWidth / logicalWidth;
    const scaleY = hostElement.clientHeight / logicalHeight;
    Object.assign(previewElement.style, {
      width: placement.panelWidth + "px",
      height: placement.panelHeight + "px",
      left: placement.left * scaleX + "px",
      top: placement.top * scaleY + "px",
      // transform 用矩阵式两参数写法，X / Y 分别缩放，保持与实际弹窗一致的非等比表现。
      transform: "scale(" + placement.scale * scaleX + "," + placement.scale * scaleY + ")"
    });
  };
  return {
    /**
     * 切换预览类型或刷新配置。
     */
    update(nextKind: string, nextSettings?: PopupSettings) {
      // 只有类型变化时才重建内容（DOM 结构开销较大），同类型只更新配置再重新布局。
      if (nextKind !== currentKind) {
        headingTextElement.textContent =
          nextKind === "camera" ? "摄像头 · 布局预览" : "通用弹窗 · 布局预览";
        previewElement.dataset.kind = nextKind;
        bodyElement.replaceChildren();
        if (nextKind === "camera") {
          bodyElement.append(createElement("div", "i3d-popup-preview-video", "16:9 画面示例"));
        } else {
          // 通用弹窗用「窗帘控制」当示例：它是典型的名称 + 滑轨 + 操作按钮结构。
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
      // 复制一份配置：调用方后续可能改动手上的对象，缓存引用会导致预览被意外改动。
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
/**
 * 创建「聚焦编辑」用的真实弹窗预览。
 */
export function createFocusDevicePopup(
  popupHostElement: HTMLElement,
  {
    kind: popupKind,
    item: item,
    getLayout: getPresentationLayout,
    getSettings: getSettings,
    getStates: getStates,
    panelDocument: panelDocument
  }: FocusPopupOptions
) {
  const popupOwnerDocument = popupHostElement.ownerDocument || document;
  const previewRootElement = popupOwnerDocument.createElement("div");
  previewRootElement.className = "i3d-focus-popup-preview";
  // inert 让整棵子树的点击 / 焦点全部失效：预览只是背景参照，不能抢走编辑器的交互。
  previewRootElement.inert = true;
  const stylesheetLink = popupOwnerDocument.createElement("link");
  stylesheetLink.rel = "stylesheet";
  // 复用渲染器样式表；缓存戳必须与 static 资源版本保持一致。
  stylesheetLink.href = "/static/renderer/core/renderer.css";
  const rendererHostElement = popupOwnerDocument.createElement("div");
  rendererHostElement.className = "i3d-focus-popup-host";
  previewRootElement.append(stylesheetLink, rendererHostElement);
  popupHostElement.append(previewRootElement);
  let isDisposed = false;
  let renderer: PanelRendererLike | undefined;
  let panelHandle: PanelHandle | null | undefined;
  // 设置里摄像头与通用弹窗各存一份，按弹窗类型取。
  const getPopupLayout = () => getSettings()?.[popupKind === "camera" ? "camera" : "general"];
  /** 触发一次预览重排（PanelRenderer 内部的尺寸刷新）。 */
  const resizePreview = () => panelHandle?.updateLayout?.();
  return {
    // ready 是异步的：PanelRenderer 需要先动态加载渲染器模块。
    ready: (import("@app/renderer/core/renderer.js") as unknown as Promise<PanelRendererModule>).then(
      ({ PanelRenderer: PanelRenderer }) => {
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
        // 74 是弹窗默认不透明度（百分比），与线上的默认值保持一致。
        popupOpacity: getSettings()?.opacity ?? 74
      };
      // 预览用不着真实实体；没有绑定实体时造一个虚拟实体 ID，
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
          updateLayout: () => {
            renderer?.detailsDialog?.resizeInteraction3d?.();
          },
          close: () => {
            renderer?.detailsDialog?.close?.();
          }
        };
      } else {
        const vacuumPreviewResult = renderer.openInteraction3dVacuumDetails(
          previewItem,
          () => {},
          {
            ...interaction3dOptions,
            states: getStates()
          }
        );
        if (vacuumPreviewResult && typeof (vacuumPreviewResult as Promise<PanelHandle>).then === "function") {
          (vacuumPreviewResult as Promise<PanelHandle>).then(handle => {
            panelHandle = handle;
            resizePreview();
          });
          return;
        }
        panelHandle = vacuumPreviewResult as PanelHandle | null | undefined;
      }
      resizePreview();
    }
    ),
    resize: resizePreview,
    updateStates: () => panelHandle?.updateStates?.(getStates()),
    dispose() {
      isDisposed = true;
      panelHandle?.close?.();
      renderer?.destroy();
      previewRootElement.remove();
    }
  };
}
