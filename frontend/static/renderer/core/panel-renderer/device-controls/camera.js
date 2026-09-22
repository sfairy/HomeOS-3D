/*
 * 设备控件区块：摄像头预览（取流、清晰度切换、全屏与交互式 3D 入口）。
 */

import { popupPlacement } from "../../../../bridge/popup-placement.js?v=2609221226";
import {
  cameraPopupLayout,
  cameraPreviewRatio
} from "../../../../bridge/camera-popup-layout.js?v=2609221226";
import { mountCameraMedia } from "../../registry.js?v=2609221226";
import { componentDialogTitle } from "../primitives.js?v=2609221226";

export const cameraDetailsMethods = {
  /**
   * 打开摄像头预览弹窗（实时流 / 快照）。
   *
   * @throws {Error} 组件没有绑定实体。
   */
  showCameraPreview(
    cameraPreviewComponent,
    { preview: cameraPreviewMode = false, interaction3d: interaction3dContext = null } = {}
  ) {
    const cameraPreviewEntityId = cameraPreviewComponent.bindings?.entity?.entityId;
    if (!cameraPreviewEntityId) {
      throw new Error("该摄像头控件没有关联实体。");
    }
    this.closeRuntimeDialog();
    const cameraDialogElement = document.createElement("dialog");
    cameraDialogElement.className = "hb-camera-preview-dialog fit-media-ratio";
    cameraDialogElement.dataset.componentId = cameraPreviewComponent.id || "";
    const cameraCardElement = document.createElement("div");
    cameraCardElement.className = "hb-camera-preview-card";
    const cameraHeadingElement = document.createElement("div");
    cameraHeadingElement.className = "hb-camera-preview-heading";
    const cameraTitleRowElement = document.createElement("div");
    const cameraTitleElement = document.createElement("strong");
    cameraTitleElement.textContent = componentDialogTitle(cameraPreviewComponent, "摄像头实时预览");
    const cameraStatusElement = document.createElement("span");
    cameraStatusElement.className = "hb-camera-preview-status";
    cameraStatusElement.textContent = interaction3dContext ? "正在加载画面" : "正在连接";
    cameraStatusElement.classList.add("is-connecting");
    cameraTitleRowElement.append(cameraTitleElement, cameraStatusElement);
    const cameraCloseButton = document.createElement("button");
    cameraCloseButton.type = "button";
    cameraCloseButton.setAttribute("aria-label", "关闭摄像头预览");
    cameraCloseButton.textContent = "×";
    cameraHeadingElement.append(cameraTitleRowElement, cameraCloseButton);
    const cameraDeviceVisualElement = document.createElement("section");
    cameraDeviceVisualElement.className = "hb-camera-device-visual";
    cameraDeviceVisualElement.setAttribute("aria-hidden", "true");
    const cameraDeviceMountElement = document.createElement("i");
    cameraDeviceMountElement.className = "hb-camera-device-mount";
    const cameraDeviceArmElement = document.createElement("i");
    cameraDeviceArmElement.className = "hb-camera-device-arm";
    const cameraDeviceBodyElement = document.createElement("div");
    cameraDeviceBodyElement.className = "hb-camera-device-body";
    const cameraDeviceLensElement = document.createElement("i");
    cameraDeviceLensElement.className = "hb-camera-device-lens";
    const cameraDeviceLedElement = document.createElement("i");
    cameraDeviceLedElement.className = "hb-camera-device-led";
    cameraDeviceBodyElement.append(cameraDeviceLensElement, cameraDeviceLedElement);
    cameraDeviceVisualElement.append(
      cameraDeviceMountElement,
      cameraDeviceArmElement,
      cameraDeviceBodyElement
    );
    let cameraLensTimer = 0;
    let cameraLensAnimation = null;
    let cameraLensOffset = 0;
    /**
     * 生成摄像头镜头组的变换字符串。
     * 水平旋转时带 0.035 倍的极小 rotateZ，制造手持云台的不规则感；透视距离 260px 是
     * 视觉调参值，改小会让镜头显得更广角。
     */
    const cameraLensTransform = (cameraLensRotationDeg, cameraLensOffsetYPx = 0) =>
      "translateX(-50%) perspective(260px) rotateY(" +
      cameraLensRotationDeg +
      "deg) rotateZ(" +
      cameraLensRotationDeg * 0.035 +
      "deg) translateY(" +
      cameraLensOffsetYPx +
      "px)";
    /**
     * 启动一次镜头摆动动画，结束后随机延时再摆下一次。
     * 候选角度先滤掉与当前位置差小于 7 度的，否则几乎是看不见的原地抖动；动画走 Web
     * Animations API，finish 后把终值写回内联样式再取消，否则合成层终值会与内联样式打架。
     */
    const startCameraLensAnimation = () => {
      if (!cameraDeviceBodyElement.isConnected) {
        return;
      }
      const cameraLensCandidateOffsets = [-22, -16, -9, -4, 0, 6, 12, 18, 23].filter(
        cameraLensOffsetCandidate => Math.abs(cameraLensOffsetCandidate - cameraLensOffset) >= 7
      );
      const nextCameraLensOffset =
        cameraLensCandidateOffsets[Math.floor(Math.random() * cameraLensCandidateOffsets.length)] ??
        0;
      const cameraLensDirection = Math.sign(nextCameraLensOffset - cameraLensOffset) || 1;
      const cameraLensDistance = Math.abs(nextCameraLensOffset - cameraLensOffset);
      const cameraLensDurationMs = Math.round(430 + cameraLensDistance * 18 + Math.random() * 320);
      const cameraLensOvershootOffset =
        nextCameraLensOffset + cameraLensDirection * (1.4 + Math.random() * 2.2);
      const cameraLensOffsetY = Math.random() * 1.4 - 0.7;
      cameraDeviceLensElement.style.setProperty(
        "--hb-camera-lens-shift",
        (nextCameraLensOffset / 23) * 2.5 + "px"
      );
      cameraLensAnimation?.cancel();
      cameraLensAnimation = cameraDeviceBodyElement.animate(
        [
          {
            transform: cameraLensTransform(cameraLensOffset, 0),
            offset: 0
          },
          {
            transform: cameraLensTransform(cameraLensOvershootOffset, cameraLensOffsetY),
            offset: 0.78
          },
          {
            transform: cameraLensTransform(nextCameraLensOffset, cameraLensOffsetY * 0.35),
            offset: 1
          }
        ],
        {
          duration: cameraLensDurationMs,
          easing: "cubic-bezier(.2,.72,.22,1)",
          fill: "forwards"
        }
      );
      cameraLensAnimation.addEventListener(
        "finish",
        () => {
          cameraLensOffset = nextCameraLensOffset;
          cameraDeviceBodyElement.style.transform = cameraLensTransform(
            cameraLensOffset,
            cameraLensOffsetY * 0.35
          );
          cameraLensAnimation?.cancel();
          cameraLensAnimation = null;
          const cameraLensDelayMs =
            Math.random() < 0.22 ? 180 + Math.random() * 260 : 680 + Math.random() * 1500;
          cameraLensTimer = window.setTimeout(startCameraLensAnimation, cameraLensDelayMs);
        },
        {
          once: true
        }
      );
    };
    if (!interaction3dContext && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      cameraLensTimer = window.setTimeout(startCameraLensAnimation, 620);
    }
    const cameraStageElement = document.createElement("div");
    cameraStageElement.className = "hb-camera-preview-stage";
    cameraStageElement.classList.add("is-connecting");
    const cameraRevealVeilElement = document.createElement("i");
    cameraRevealVeilElement.className = "hb-camera-preview-reveal-veil";
    cameraRevealVeilElement.setAttribute("aria-hidden", "true");
    const cameraScanLineElement = document.createElement("i");
    cameraScanLineElement.className = "hb-camera-preview-scan-line";
    cameraScanLineElement.setAttribute("aria-hidden", "true");
    cameraStageElement.append(cameraRevealVeilElement, cameraScanLineElement);
    const isInteraction3dCamera = !!interaction3dContext;
    const isCameraMediaVisible = cameraPreviewComponent.properties?.mediaVisible !== false;
    cameraStageElement.classList.toggle("is-16-9", !isInteraction3dCamera);
    cameraStageElement.classList.toggle("media-hidden", !isCameraMediaVisible);
    const cameraMediaCleanups = [];
    let isCameraReady = false;
    /**
     * 摄像头媒体就绪回调：把状态文案与样式从 connecting 切到 live。
     * 用 isCameraReady 一次性守卫：媒体流重连会重复触发 onReady，反复切 class 会打断揭示动画。
     */
    const handleCameraReady = () => {
      if (!isCameraReady) {
        isCameraReady = true;
        cameraStatusElement.textContent = "实时画面";
        cameraStatusElement.classList.remove("is-connecting", "is-unavailable");
        cameraStatusElement.classList.add("is-live");
        cameraDeviceVisualElement.classList.remove("is-unavailable");
        cameraDeviceVisualElement.classList.add("is-live");
        cameraStageElement.classList.remove("is-connecting", "is-unavailable", "is-revealing");
        cameraStageElement.classList.add("is-ready");
      }
    };
    /**
     * 摄像头画面不可用：切到 unavailable 文案与样式，并清掉 live / revealing 态。
     */
    const handleCameraUnavailable = () => {
      cameraStatusElement.textContent = "画面不可用";
      cameraStatusElement.classList.remove("is-connecting", "is-live");
      cameraStatusElement.classList.add("is-unavailable");
      cameraDeviceVisualElement.classList.remove("is-live");
      cameraDeviceVisualElement.classList.add("is-unavailable");
      cameraStageElement.classList.remove("is-connecting", "is-revealing");
      cameraStageElement.classList.add("is-unavailable");
    };
    let cameraAspectRatio = interaction3dContext
      ? cameraPreviewRatio(cameraPreviewEntityId)
      : 16 / 9;
    /**
     * 按弹窗可用空间重算摄像头预览的宽高。
     * 3D 舞台上交给 cameraDialogElement.resizeInteraction3d（舞台侧按自己的布局算）；
     * 普通弹窗把宽度限制在 760px、按比例反推高度，并给标题与边距留出 88px。
     */
    const applyCameraPreviewLayout = () => {
      if (interaction3dContext) {
        cameraStageElement.style.aspectRatio = String(cameraAspectRatio);
        cameraDialogElement.resizeInteraction3d?.();
        return;
      }
      const cameraAvailableWidthPx = Math.max(280, this.container.clientWidth - 32);
      const cameraAvailableHeightPx = Math.max(
        180,
        Math.min(625, this.container.clientHeight - 88)
      );
      const cameraResolvedWidthPx = Math.min(
        760,
        cameraAvailableWidthPx,
        cameraAvailableHeightPx * cameraAspectRatio
      );
      cameraDialogElement.style.width = Math.max(280, cameraResolvedWidthPx) + "px";
      cameraStageElement.style.aspectRatio = String(cameraAspectRatio);
      cameraStageElement.style.borderRadius = "16px";
    };
    if (isCameraMediaVisible && !cameraPreviewMode) {
      const cameraLoadingPlaceholder = document.createElement("span");
      cameraLoadingPlaceholder.textContent = "正在载入摄像头实时预览";
      cameraStageElement.append(cameraLoadingPlaceholder);
      const cameraMediaHandle = mountCameraMedia({
        container: cameraStageElement,
        entityId: cameraPreviewEntityId,
        label: cameraTitleElement.textContent,
        objectFit: interaction3dContext ? "contain" : "fill",
        placeholder: cameraLoadingPlaceholder,
        onReady: handleCameraReady,
        onUnavailable: handleCameraUnavailable,
        cleanup: cameraMediaCleanup => cameraMediaCleanups.push(cameraMediaCleanup)
      });
      /**
       * 用媒体流的真实像素尺寸更新预览宽高比。
       * 只在 3D 舞台内生效：HA 的 aspectRatio 常缺失或不准，拿到真实尺寸后写回
       * cameraPreviewRatio 缓存，供后续弹窗复用。
       */
      const applyCameraMediaDimensions = (cameraMediaWidth, cameraMediaHeight) => {
        if (
          !!isInteraction3dCamera &&
          !!Number.isFinite(cameraMediaWidth) &&
          !!Number.isFinite(cameraMediaHeight) &&
          !(cameraMediaWidth <= 0) &&
          !(cameraMediaHeight <= 0)
        ) {
          cameraAspectRatio = cameraMediaWidth / cameraMediaHeight;
          cameraPreviewRatio(cameraPreviewEntityId, cameraAspectRatio);
          applyCameraPreviewLayout();
        }
      };
      /**
       * 视频元数据就绪或尺寸变化时，用真实视频尺寸刷新预览宽高比。
       */
      const handleCameraVideoMetadata = () =>
        applyCameraMediaDimensions(
          cameraMediaHandle.video.videoWidth,
          cameraMediaHandle.video.videoHeight
        );
      /**
       * 静态图片加载完成时，用图片自然尺寸刷新预览宽高比。
       */
      const handleCameraImageLoad = () =>
        applyCameraMediaDimensions(
          cameraMediaHandle.image.naturalWidth,
          cameraMediaHandle.image.naturalHeight
        );
      cameraMediaHandle.video.addEventListener("loadedmetadata", handleCameraVideoMetadata);
      cameraMediaHandle.video.addEventListener("resize", handleCameraVideoMetadata);
      cameraMediaHandle.image.addEventListener("load", handleCameraImageLoad);
      cameraMediaCleanups.push(() =>
        cameraMediaHandle.video.removeEventListener("loadedmetadata", handleCameraVideoMetadata)
      );
      cameraMediaCleanups.push(() =>
        cameraMediaHandle.video.removeEventListener("resize", handleCameraVideoMetadata)
      );
      cameraMediaCleanups.push(() =>
        cameraMediaHandle.image.removeEventListener("load", handleCameraImageLoad)
      );
    } else if (cameraPreviewMode) {
      cameraStatusElement.textContent = "预览模式";
      cameraStatusElement.classList.remove("is-connecting");
      cameraStageElement.classList.remove("is-connecting");
      cameraStageElement.classList.add("is-ready");
      const cameraPreviewPlaceholder = document.createElement("span");
      cameraPreviewPlaceholder.textContent = "预览模式不获取摄像头实时画面";
      cameraStageElement.append(cameraPreviewPlaceholder);
    } else {
      cameraStatusElement.textContent = "画面已隐藏";
      cameraStatusElement.classList.remove("is-connecting");
      cameraStageElement.classList.remove("is-connecting");
      cameraStageElement.classList.add("is-ready");
      const cameraHiddenPlaceholder = document.createElement("span");
      cameraHiddenPlaceholder.textContent = "摄像头画面已隐藏";
      cameraStageElement.append(cameraHiddenPlaceholder);
    }
    window.addEventListener("resize", applyCameraPreviewLayout);
    cameraMediaCleanups.push(() => window.removeEventListener("resize", applyCameraPreviewLayout));
    applyCameraPreviewLayout();
    cameraCardElement.append(
      cameraHeadingElement,
      ...(interaction3dContext ? [] : [cameraDeviceVisualElement]),
      cameraStageElement
    );
    cameraDialogElement.append(cameraCardElement);
    const cameraLayerElement = document.createElement("div");
    cameraLayerElement.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    cameraLayerElement.tabIndex = -1;
    cameraLayerElement.append(cameraDialogElement);
    this.container.append(cameraLayerElement);
    this.detailsDialog = cameraDialogElement;
    if (interaction3dContext) {
      cameraLayerElement.classList.add("i3d-vacuum-dialog-layer");
      cameraDialogElement.classList.add("i3d-vacuum-details", "i3d-camera-details");
      const presentationRootElement = interaction3dContext.root || this.container;
      presentationRootElement.append(cameraLayerElement);
      cameraDialogElement.style.setProperty(
        "--i3d-panel-opacity",
        String(
          Math.max(
            0,
            Math.min(
              100,
              Number.isFinite(interaction3dContext.popupOpacity)
                ? interaction3dContext.popupOpacity
                : 74
            )
          ) / 100
        )
      );
      /**
       * 把摄像头弹窗摆到 3D 舞台的呈现区域内。
       * 舞台可能被 CSS 整体缩放，故先取未缩放的「呈现尺寸」算布局，再按根元素与呈现尺寸
       * 的比值乘回去；调两次 cameraPopupLayout 是刻意的，第一次让面板宽度参与后续计算。
       */
      const applyInteraction3dLayout = () => {
        const presentationLayout = interaction3dContext.getPresentationLayout?.();
        const presentationWidthPx =
          presentationLayout?.width > 0
            ? presentationLayout.width
            : presentationRootElement.clientWidth;
        const presentationHeightPx =
          presentationLayout?.height > 0
            ? presentationLayout.height
            : presentationRootElement.clientHeight;
        const presentationHorizontalScale =
          presentationRootElement.clientWidth / Math.max(1, presentationWidthPx);
        const presentationVerticalScale =
          presentationRootElement.clientHeight / Math.max(1, presentationHeightPx);
        /**
         * 读标题行的实际像素高度，读不到时退回 58px（默认样式高度）。
         */
        const cameraHeadingHeightPx = () =>
          Math.ceil(
            parseFloat(window.getComputedStyle?.(cameraHeadingElement)?.height) ||
              cameraHeadingElement.offsetHeight ||
              58
          );
        let interaction3dPopupLayout = cameraPopupLayout(
          presentationWidthPx,
          presentationHeightPx,
          cameraAspectRatio,
          cameraHeadingHeightPx()
        );
        cameraDialogElement.style.width = interaction3dPopupLayout.panelWidth + "px";
        interaction3dPopupLayout = cameraPopupLayout(
          presentationWidthPx,
          presentationHeightPx,
          cameraAspectRatio,
          cameraHeadingHeightPx()
        );
        const {
          panelWidth: cameraPanelWidthPx,
          mediaHeight: cameraMediaHeightPx,
          top: cameraPopupTopPx
        } = interaction3dPopupLayout;
        const cameraPopupPlacement = popupPlacement({
          width: presentationWidthPx,
          height: presentationHeightPx,
          panelWidth: cameraPanelWidthPx,
          panelHeight: cameraMediaHeightPx + cameraHeadingHeightPx() + 26,
          defaultScale: 2,
          defaultTop: cameraPopupTopPx,
          settings: interaction3dContext.getPopupLayout?.()
        });
        const cameraPlacedTopPx = cameraPopupPlacement.top * presentationVerticalScale;
        cameraDialogElement.style.width = cameraPanelWidthPx + "px";
        cameraStageElement.style.height = cameraMediaHeightPx + "px";
        cameraDialogElement.style.top = cameraPlacedTopPx + "px";
        cameraDialogElement.style.right =
          cameraPopupPlacement.right * presentationHorizontalScale + "px";
        cameraDialogElement.style.transform =
          "scale(" +
          cameraPopupPlacement.scale * presentationHorizontalScale +
          "," +
          cameraPopupPlacement.scale * presentationVerticalScale +
          ")";
        cameraDialogElement.style.maxHeight =
          Math.max(
            cameraPopupPlacement.custom ? 1 : 100,
            (presentationRootElement.clientHeight -
              cameraPlacedTopPx -
              presentationVerticalScale * 12) /
              Math.max(0.001, cameraPopupPlacement.scale * presentationVerticalScale)
          ) + "px";
      };
      cameraDialogElement.resizeInteraction3d = applyInteraction3dLayout;
      // 观察器回调只排程：布局函数会写被观察元素的宽度，通知投递中再触发会报
      // 「ResizeObserver loop completed with undelivered notifications」，推迟一帧即可避开。
      // resizeInteraction3d 仍指向同步实现，供 show() 等即时布局路径直接用。
      let cameraLayoutFrameId = 0;
      const scheduleCameraLayout = () => {
        if (cameraLayoutFrameId) {
          return;
        }
        cameraLayoutFrameId = requestAnimationFrame(() => {
          cameraLayoutFrameId = 0;
          applyInteraction3dLayout();
        });
      };
      const cameraLayoutObserver = new ResizeObserver(scheduleCameraLayout);
      cameraLayoutObserver.observe(presentationRootElement);
      cameraLayoutObserver.observe(cameraHeadingElement);
      cameraMediaCleanups.push(() => {
        cameraLayoutObserver.disconnect();
        if (cameraLayoutFrameId) {
          cancelAnimationFrame(cameraLayoutFrameId);
          cameraLayoutFrameId = 0;
        }
      });
      applyInteraction3dLayout();
    } else {
      this.registerRuntimeDialogScale(cameraLayerElement, cameraDialogElement, 760, 680);
    }
    cameraCloseButton.addEventListener("click", () => cameraDialogElement.close());
    this.bindRuntimeDialogOutsideDismiss(
      cameraLayerElement,
      cameraDialogElement,
      cameraCardElement
    );
    this.bindRuntimeDialogEscapeClose(cameraLayerElement, cameraDialogElement);
    cameraDialogElement.addEventListener(
      "close",
      () => {
        window.clearTimeout(cameraLensTimer);
        cameraLensAnimation?.cancel();
        for (const cameraTeardownCallback of cameraMediaCleanups.splice(0)) {
          cameraTeardownCallback();
        }
        this.clearRuntimeDialogScale(cameraDialogElement);
        if (this.detailsDialog === cameraDialogElement) {
          this.detailsDialog = null;
        }
        cameraLayerElement.remove();
      },
      {
        once: true
      }
    );
    this.presentRuntimeDialog(cameraLayerElement, cameraDialogElement);
    cameraDialogElement.resizeInteraction3d?.();
  },
  /**
   * 从 3D 舞台打开摄像头预览弹窗（带上舞台侧的关闭回调与预览参数）。
   */
  openInteraction3dCameraPreview(
    previewCameraComponent,
    previewCloseHandler,
    interaction3dPreviewOptions = {}
  ) {
    this.showCameraPreview(
      {
        id: "camera:" + previewCameraComponent.id,
        type: "camera",
        properties: {
          label: previewCameraComponent.label
        },
        bindings: {
          entity: {
            entityId: previewCameraComponent.entityId
          }
        }
      },
      {
        interaction3d: interaction3dPreviewOptions
      }
    );
    const previewDialogElement = this.detailsDialog;
    previewDialogElement?.addEventListener("close", previewCloseHandler, {
      once: true
    });
    return {
      updateLayout: () => previewDialogElement?.resizeInteraction3d?.(),
      close: () => {
        previewDialogElement?.removeEventListener("close", previewCloseHandler);
        previewDialogElement?.close();
      },
      contains: containedNode => previewDialogElement?.contains(containedNode)
    };
  }
};
