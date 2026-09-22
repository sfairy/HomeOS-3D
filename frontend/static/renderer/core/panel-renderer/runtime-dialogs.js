/*
 * 区块四：运行期弹窗外壳。
 *
 * 详情弹窗的公共骨架：居中定位与缩放（按画布短边占比）、焦点循环、Esc 与点外关闭、
 * 入场动效、以及关闭时的收尾。各设备详情只负责往里填内容，不再各自写一套弹窗行为，
 * 于是「所有弹窗的关闭方式一致」这件事才守得住。
 *
 * runtimeDialogTitleSerial 是 aria-labelledby 用的自增序号：模块级可变状态，因此留在本文件
 * 而不是 primitives.js —— 导入的绑定不可赋值，放那边会让 += 直接抛错。
 */

import {
  playStableRuntimeDialogEntrance,
  runtimeDialogUsesStableMotion
} from "../runtime-dialog-motion.js?v=2609221415";
import {
  COMPACT_DIALOG_TARGET_OCCUPANCY,
  DEFAULT_DIALOG_TARGET_OCCUPANCY,
  RUNTIME_DIALOG_FOCUSABLE_SELECTOR,
  runtimeDialogLayout,
  runtimeDialogViewport
} from "./primitives.js?v=2609221415";

// 弹窗标题 id 的自增序号 —— aria-labelledby 要的是一个稳定且唯一的 id，
// 十个弹窗共用同一段代码，用序号区分比让每个调用点自己起名可靠。
let runtimeDialogTitleSerial = 0;
export const runtimeDialogMethods = {
  /**
   * 登记当前弹窗并接管它的缩放：按设计尺寸固定宽度，再整体缩放到可用区域。
   * 弹窗内容按设计稿绝对尺寸排版，因此先把宽度钉死在设计宽度（禁止 max-width 收缩）再 transform 缩放， 才能保证内部布局与设计稿一致。尺寸变化用 ResizeObserver + requestAnimationFrame 合并：内容异步加载
   * 会连续触发布局变化，逐次重算会抖动，这里一帧只算一次。
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
   * 每帧调用，不做与布局无关的重活；弹窗已从 DOM 摘掉时直接返回（关闭动画期间会先
   * disconnect 再触发尺寸回调）。
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
   * 只有当前登记的弹窗与传入元素一致时才清：旧弹窗的关闭回调可能晚于新弹窗打开，
   * 不加判断会把新弹窗的上下文一起清掉。
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
   * 未 open 的 dialog 调 close() 不触发 close 事件，因此用 dispatchEvent 手动补一次，
   * 让依赖关闭事件的清理逻辑（缩放注销、清理回调）两种情况都能跑到。
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
   * 开场 320ms 内不响应：打开弹窗那次点击会穿透到遮罩层，不设冷却会让弹窗刚出现就被关掉。
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
   * 不用 `showModal()`：弹窗坐标是画布坐标，showModal 会把它提到 top layer 而脱离画布坐标空间（整体缩放的展示页 上尺寸与位置都走样），还会额外生成 `::backdrop` 与层自带遮罩叠加（82% → 约 97%）。故保留 show() 的坐标空间，
   * 自己补模态语义：`aria-modal` + `aria-labelledby` 指向标题 `<strong>`、打开时焦点交给弹窗、Tab 在弹窗内循环、关闭后把焦点还给打开它的元素（用 `isConnected` 判断，文档可能已被整份替换）。
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
     * 可见性判定用 `getClientRects().length`：`offsetParent` 对 `position: fixed` 及其子元素
     * 恒为 null，拿它过滤会把弹窗里所有控件都当成不可见。
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
   * 必须看 `defaultPrevented`：层里嵌的下拉 / 展开面板按 ESC 只该收起自己，但事件会继续冒泡上来， 否则「想关下拉」就变成「把整个设备弹窗也关掉」。里层处理 ESC 时都调过 `preventDefault()`，所以
   * 「冒泡到这里仍带 preventDefault」即等于「已有人处理过」。新增弹窗都要走这条，别各写一份 close()。
   */
  bindRuntimeDialogEscapeClose(escapeLayerElement, escapeDialogElement) {
    escapeLayerElement.addEventListener("keydown", escapeKeyEvent => {
      if (escapeKeyEvent.key === "Escape" && !escapeKeyEvent.defaultPrevented) {
        escapeDialogElement.close();
      }
    });
  }
};
