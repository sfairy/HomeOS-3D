/**
 * 3D 弹窗的布局预览：编辑弹窗（通用 / 摄像头）时，不打开真实弹窗也让用户看到弹窗会出现在哪里、
 * 多大、缩放多少。两级预览：createPopupLayoutPreview 是编辑面板里的示意方块，
 * createFocusDevicePopup 用真实 PanelRenderer 渲染一份不可交互的缩微副本。
 *
 * 与渲染器的约定：布局计算统一委托给 popup-placement.js（面板在视口内的落位）与
 * camera-popup-layout.js（摄像头弹窗的固定版式），这里只补默认值，避免 2D 弹窗与 3D 预览出现两套算法。
 */

// 复用渲染器的弹窗落位与摄像头版式算法；开发环境走相对路径，生产环境走静态路径。
const { popupPlacement: popupPlacement } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/popup-placement.js", import.meta.url))
  : import("/static/bridge/popup-placement.js?v=20260920131301"));
const { cameraPopupLayout: cameraPopupLayout } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/camera-popup-layout.js", import.meta.url))
  : import("/static/bridge/camera-popup-layout.js?v=20260920131301"));
/**
 * 计算弹窗预览的落位与缩放。
 */
export function popupPreviewPlacement(kind, width, height, settings) {
  const cameraLayout = kind === "camera" ? cameraPopupLayout(width, height) : null;
  // 360×232 是通用弹窗的设计基准尺寸：摄像头版式自带尺寸，通用弹窗则用它当兜底。
  const panelWidth = cameraLayout?.panelWidth || 360;
  const panelHeight = cameraLayout?.panelHeight || 232;
  // 默认上边距：摄像头弹窗由版式给定；通用弹窗按视口高度的 56% 再上移 400（弹窗视觉重心偏上），
  // 同时保证不超出视口底部（height - 812 对应弹窗展开后的最大高度），最小留 12px。
  const defaultTop = cameraLayout?.top ?? Math.max(12, Math.min(height * 0.56 - 400, height - 812));
  // 缩放：摄像头弹窗固定 2 倍（版式按 2 倍设计），通用弹窗按「不超出左右各 16px 边距、
  // 不超出下方预留 100px」适配，并夹在 0.5–2 之间，避免极端窗口下缩到看不清或放到溢出。
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
export function createPopupLayoutPreview(hostElement, getLayout, onClose) {
  // 一律用宿主元素所属的 document，保证嵌在 iframe 里也创建到正确的文档中。
  const ownerDocument = hostElement.ownerDocument || document;
  /** 创建元素的小工具：类名与文本是固定套路，抽出来避免重复五行样板。 */
  const createElement = (tagName, className, textContent = "") => {
    const element = ownerDocument.createElement(tagName);
    element.className = className;
    element.textContent = textContent;
    return element;
  };
  const layerElement = createElement("div", "i3d-popup-preview-layer");
  const previewElement = createElement("section", "i3d-popup-preview");
  // aria-label 通过属性设置而不是 innerHTML，避免把无障碍文案与结构耦合。
  previewElement.setAttribute("aria-label", "弹窗布局预览");
  const headingElement = createElement("header", "i3d-popup-preview-heading");
  const headingTextElement = createElement("strong", "", "");
  const closeButton = createElement("button", "", "×");
  // 显式声明 type，防止按钮出现在表单里时触发表单提交。
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
    // 预览块必须乘同一个比例才能与真实弹窗对齐；宽高比例分开算，避免非等比缩放下错位。
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
    update(nextKind, nextSettings) {
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
          // 操作按钮里的空白是全角空格（\u3000），用来模拟按钮之间的间距。
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
 * 与示意预览不同，这里直接实例化渲染器的 PanelRenderer，渲染与线上完全一致的弹窗，
 * 只是整块设为 inert（不可交互）并隐藏，仅作为编辑时的视觉参照。
 */
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
  // inert 让整棵子树的点击 / 焦点全部失效：预览只是背景参照，不能抢走编辑器的交互。
  previewRootElement.inert = true;
  const stylesheetLink = popupOwnerDocument.createElement("link");
  stylesheetLink.rel = "stylesheet";
  // 复用渲染器样式表；缓存戳必须与 static 资源版本保持一致。
  stylesheetLink.href = "/static/renderer/core/renderer.css?v=20260920131301";
  const rendererHostElement = popupOwnerDocument.createElement("div");
  rendererHostElement.className = "i3d-focus-popup-host";
  previewRootElement.append(stylesheetLink, rendererHostElement);
  popupHostElement.append(previewRootElement);
  let isDisposed = false;
  let renderer;
  let panelHandle;
  // 设置里摄像头与通用弹窗各存一份，按弹窗类型取。
  const getPopupLayout = () => getSettings()?.[popupKind === "camera" ? "camera" : "general"];
  /** 触发一次预览重排（PanelRenderer 内部的尺寸刷新）。 */
  const resizePreview = () => panelHandle?.updateLayout?.();
  return {
    // ready 是异步的：PanelRenderer 需要先动态加载渲染器模块。
    // 加载完成后若已被销毁（用户在加载期间就退出了编辑），直接放弃初始化。
    ready: (import.meta.url.startsWith("file:")
      ? import(new URL("../../../static/renderer/core/renderer.js", import.meta.url))
      : import("/static/renderer/core/renderer.js?v=20260920131301")
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
        // 74 是弹窗默认不透明度（百分比），与线上的默认值保持一致。
        popupOpacity: getSettings()?.opacity ?? 74
      };
      // 预览用不着真实实体；没有绑定实体时造一个虚拟实体 ID，
      // 让渲染器走完正常的分支而不必为「预览」加特例。
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
        // 通用弹窗与扫地机详情走同一个渲染器入口（接口名沿用历史命名，实际是通用详情弹窗）。
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
