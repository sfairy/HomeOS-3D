/*
 * 区块四：运行期弹窗外壳。
 */

import {
  playStableRuntimeDialogEntrance,
  runtimeDialogUsesStableMotion
} from "../runtime-dialog-motion.js?v=2609271226";
import {
  COMPACT_DIALOG_TARGET_OCCUPANCY,
  DEFAULT_DIALOG_TARGET_OCCUPANCY,
  RUNTIME_DIALOG_FOCUSABLE_SELECTOR,
  runtimeDialogLayout,
  runtimeDialogViewport
} from "./primitives.js?v=2609271226";

// 弹窗标题 id 的自增序号 —— aria-labelledby 要的是一个稳定且唯一的 id，
let runtimeDialogTitleSerial = 0;
export const runtimeDialogMethods = {
  /**
   * 登记当前弹窗并接管它的缩放：按设计尺寸固定宽度，再整体缩放到可用区域。
   */
  registerRuntimeDialogScale(dialogLayerElement, dialogElement, designWidthPx, designHeightPx) {
    const usesStableMotion = runtimeDialogUsesStableMotion();
    dialogLayerElement.classList.toggle("hb-runtime-stable-motion", usesStableMotion);
    dialogLayerElement.classList.toggle(
      "hb-runtime-simplified-motion",
      usesStableMotion && dialogElement.classList.contains("hb-custom-popup-dialog")
    );
    const dialogScaleContext = {
      dialogLayer: dialogLayerElement,
      dialog: dialogElement,
      designWidth: Math.max(1, Number(designWidthPx) || 1),
      designHeight: Math.max(1, Number(designHeightPx) || 1),
      fillAvailable:
        dialogElement.dataset.runtimeDialogLayout === "fill" ||
        dialogElement.classList.contains("media-player-details"),
      tightFill: dialogElement.classList.contains("media-player-details"),
      targetOccupancy:
        dialogElement.dataset.runtimeDialogLayout === "compact"
          ? COMPACT_DIALOG_TARGET_OCCUPANCY
          : DEFAULT_DIALOG_TARGET_OCCUPANCY,
      measureFrame: 0,
      layoutObserver: null,
      entranceAnimations: []
    };
    this.runtimeDialogScaleContext = dialogScaleContext;
    dialogElement.classList.add("hb-runtime-scaled-dialog");
    dialogElement.style.width = dialogScaleContext.designWidth + "px";
    dialogElement.style.minWidth = dialogScaleContext.designWidth + "px";
    dialogElement.style.maxWidth = "none";
    dialogElement.style.height = "auto";
    dialogElement.style.minHeight = "0";
    dialogElement.style.maxHeight = "none";
    dialogElement.style.boxSizing = "border-box";
    dialogElement.style.setProperty(
      "--hb-runtime-dialog-design-height",
      dialogScaleContext.designHeight + "px"
    );
    const dialogCardElement = dialogElement.querySelector(":scope > .hb-custom-popup-card");
    if (dialogCardElement) {
      dialogCardElement.style.width = dialogScaleContext.designWidth + "px";
      dialogCardElement.style.minWidth = dialogScaleContext.designWidth + "px";
      dialogCardElement.style.maxWidth = "none";
    }
    this.updateRuntimeDialogScale();
    dialogScaleContext.measureFrame = window.requestAnimationFrame(() => {
      dialogScaleContext.measureFrame = 0;
      if (this.runtimeDialogScaleContext === dialogScaleContext) {
        this.updateRuntimeDialogScale();
        if (dialogElement.open) {
          dialogScaleContext.entranceAnimations = playStableRuntimeDialogEntrance(
            dialogLayerElement,
            dialogElement
          );
        }
      }
    });
    dialogScaleContext.layoutObserver = new ResizeObserver(() => {
      if (
        this.runtimeDialogScaleContext === dialogScaleContext &&
        !dialogScaleContext.measureFrame
      ) {
        dialogScaleContext.measureFrame = window.requestAnimationFrame(() => {
          dialogScaleContext.measureFrame = 0;
          if (this.runtimeDialogScaleContext === dialogScaleContext) {
            this.updateRuntimeDialogScale();
          }
        });
      }
    });
    dialogScaleContext.layoutObserver.observe(dialogElement);
    if (dialogCardElement) {
      dialogScaleContext.layoutObserver.observe(dialogCardElement);
    }
  },
  /**
   * 按当前层与仪表盘的实际矩形重算弹窗缩放并写回样式。
   */
  updateRuntimeDialogScale() {
    const activeDialogScaleContext = this.runtimeDialogScaleContext;
    if (
      !activeDialogScaleContext?.dialog?.isConnected ||
      !activeDialogScaleContext.dialogLayer?.isConnected
    ) {
      return;
    }
    const dialogLayerRect = activeDialogScaleContext.dialogLayer.getBoundingClientRect();
    const dashboardViewportRect = this.viewport?.getBoundingClientRect();
    const viewportMetrics = runtimeDialogViewport({
      layerLeft: dialogLayerRect.left,
      layerTop: dialogLayerRect.top,
      layerWidth:
        dialogLayerRect.width ||
        activeDialogScaleContext.dialogLayer.clientWidth ||
        this.container.clientWidth,
      layerHeight:
        dialogLayerRect.height ||
        activeDialogScaleContext.dialogLayer.clientHeight ||
        this.container.clientHeight,
      dashboardLeft: dashboardViewportRect?.left,
      dashboardTop: dashboardViewportRect?.top,
      dashboardWidth: dashboardViewportRect?.width,
      dashboardHeight: dashboardViewportRect?.height
    });
    const dialogLayerWidthPx = viewportMetrics.width;
    const dialogLayerHeightPx = viewportMetrics.height;
    const measuredDialogWidthPx = Math.max(
      Number(activeDialogScaleContext.dialog.offsetWidth || 0),
      Number(activeDialogScaleContext.dialog.scrollWidth || 0)
    );
    const measuredDialogHeightPx = Math.max(
      Number(activeDialogScaleContext.dialog.offsetHeight || 0),
      Number(activeDialogScaleContext.dialog.scrollHeight || 0)
    );
    const dialogLayoutWidthPx =
      measuredDialogWidthPx > 1 ? measuredDialogWidthPx : activeDialogScaleContext.designWidth;
    const dialogLayoutHeightPx =
      measuredDialogHeightPx > 1 ? measuredDialogHeightPx : activeDialogScaleContext.designHeight;
    const dialogLayoutMetrics = runtimeDialogLayout({
      layerWidth: dialogLayerWidthPx,
      layerHeight: dialogLayerHeightPx,
      layoutWidth: dialogLayoutWidthPx,
      layoutHeight: dialogLayoutHeightPx,
      fillAvailable: activeDialogScaleContext.fillAvailable,
      tightFill: activeDialogScaleContext.tightFill,
      targetOccupancy: activeDialogScaleContext.targetOccupancy
    });
    const dialogScale = dialogLayoutMetrics.scale;
    activeDialogScaleContext.dialog.style.position = "absolute";
    activeDialogScaleContext.dialog.style.inset = "auto";
    activeDialogScaleContext.dialog.style.top = viewportMetrics.centerY + "px";
    activeDialogScaleContext.dialog.style.left = viewportMetrics.centerX + "px";
    activeDialogScaleContext.dialog.style.margin = "0";
    activeDialogScaleContext.dialog.style.transform =
      "translate(-50%, -50%) scale(" + dialogScale + ")";
    activeDialogScaleContext.dialog.style.transformOrigin = "center";
    activeDialogScaleContext.dialog.style.setProperty(
      "--hb-runtime-dialog-scale",
      String(dialogScale)
    );
    activeDialogScaleContext.dialogLayer.dataset.dialogScale = dialogScale.toFixed(4);
    activeDialogScaleContext.dialogLayer.dataset.dialogLayoutWidth = String(
      Math.round(dialogLayoutWidthPx)
    );
    activeDialogScaleContext.dialogLayer.dataset.dialogLayoutHeight = String(
      Math.round(dialogLayoutHeightPx)
    );
    activeDialogScaleContext.dialogLayer.dataset.dialogSafeInset =
      dialogLayoutMetrics.safeInset.toFixed(2);
    activeDialogScaleContext.dialogLayer.dataset.dialogViewportWidth = String(
      Math.round(viewportMetrics.width)
    );
    activeDialogScaleContext.dialogLayer.dataset.dialogViewportHeight = String(
      Math.round(viewportMetrics.height)
    );
  },
  /**
   * 注销缩放上下文：断开观察者、取消待执行帧与入场动画。
   */
  clearRuntimeDialogScale(clearedDialogElement) {
    if (this.runtimeDialogScaleContext?.dialog === clearedDialogElement) {
      window.cancelAnimationFrame(this.runtimeDialogScaleContext.measureFrame || 0);
      this.runtimeDialogScaleContext.layoutObserver?.disconnect();
      for (const entranceAnimation of this.runtimeDialogScaleContext.entranceAnimations || []) {
        entranceAnimation.cancel();
      }
      clearedDialogElement.classList.remove("hb-runtime-scaled-dialog");
      this.runtimeDialogScaleContext = null;
    }
  },
  /**
   * 关闭运行期弹窗。
   */
  closeRuntimeDialog(closedDialogElement = this.detailsDialog) {
    if (closedDialogElement) {
      if (closedDialogElement.open) {
        closedDialogElement.close();
      } else {
        closedDialogElement.dispatchEvent(new Event("close"));
      }
      if (closedDialogElement.isConnected) {
        closedDialogElement.remove();
      }
      if (this.detailsDialog === closedDialogElement) {
        this.detailsDialog = null;
      }
      if (this.detailsStateSync?.dialog === closedDialogElement) {
        this.detailsStateSync = null;
      }
    }
  },
  /**
   * 绑定「点击弹窗外区域关闭弹窗」。
   */
  bindRuntimeDialogOutsideDismiss(dismissLayerElement, dismissDialogElement, dismissPanelElement) {
    // 320ms 冷却：打开弹窗的那次点击会继续冒泡到遮罩层，不留冷却期就会立即被关掉。
    const dismissAllowedAtMs = performance.now() + 320;
    dismissLayerElement.addEventListener("click", dismissClickEvent => {
      if (!dismissPanelElement.contains(dismissClickEvent.target)) {
        dismissClickEvent.preventDefault();
        dismissClickEvent.stopPropagation();
        if (!(performance.now() < dismissAllowedAtMs)) {
          dismissDialogElement.close();
        }
      }
    });
  },
  /**
   * 呈现一层运行时弹窗，并让它成为「真正的模态」。
   */
  presentRuntimeDialog(dialogLayerElement, dialogElement) {
    if (!dialogElement || dialogElement.open) {
      return;
    }
    const previouslyFocusedElement = document.activeElement;
    dialogElement.setAttribute("aria-modal", "true");
    const dialogTitleElement = dialogElement.querySelector("strong");
    if (dialogTitleElement) {
      if (!dialogTitleElement.id) {
        runtimeDialogTitleSerial += 1;
        dialogTitleElement.id = "hb-runtime-dialog-title-" + runtimeDialogTitleSerial;
      }
      dialogElement.setAttribute("aria-labelledby", dialogTitleElement.id);
    }
    /**
     * Tab 焦点循环：只在弹窗内首尾相接，别的一概不管。
     */
    const focusTrapHandler = trapKeyEvent => {
      if (trapKeyEvent.key !== "Tab") {
        return;
      }
      const focusableElements = Array.from(
        dialogElement.querySelectorAll(RUNTIME_DIALOG_FOCUSABLE_SELECTOR)
      ).filter(focusableElement => focusableElement.getClientRects().length > 0);
      if (!focusableElements.length) {
        trapKeyEvent.preventDefault();
        dialogElement.focus({
          preventScroll: true
        });
        return;
      }
      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];
      const activeElementInside = dialogElement.contains(document.activeElement);
      if (trapKeyEvent.shiftKey) {
        if (!activeElementInside || document.activeElement === firstFocusableElement) {
          trapKeyEvent.preventDefault();
          lastFocusableElement.focus({
            preventScroll: true
          });
        }
        return;
      }
      if (!activeElementInside || document.activeElement === lastFocusableElement) {
        trapKeyEvent.preventDefault();
        firstFocusableElement.focus({
          preventScroll: true
        });
      }
    };
    dialogLayerElement.addEventListener("keydown", focusTrapHandler);
    dialogElement.addEventListener(
      "close",
      () => {
        dialogLayerElement.removeEventListener("keydown", focusTrapHandler);
        if (
          previouslyFocusedElement?.isConnected &&
          typeof previouslyFocusedElement.focus === "function"
        ) {
          previouslyFocusedElement.focus({
            preventScroll: true
          });
        }
      },
      {
        once: true
      }
    );
    dialogElement.tabIndex = -1;
    dialogElement.show();
    dialogElement.focus({
      preventScroll: true
    });
  },
  /**
   * 给一层运行时弹窗挂「按 ESC 关闭」。
   */
  bindRuntimeDialogEscapeClose(escapeLayerElement, escapeDialogElement) {
    escapeLayerElement.addEventListener("keydown", escapeKeyEvent => {
      if (escapeKeyEvent.key === "Escape" && !escapeKeyEvent.defaultPrevented) {
        escapeDialogElement.close();
      }
    });
  }
};
