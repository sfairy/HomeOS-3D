/**
 * 编辑器设置对话框的懒挂载与点击穿透防护。
 *
 * 位置：编辑器页面上 body 直属的 dialog.settings-dialog 元素集合。
 * 职责：把未打开的对话框从 DOM 上摘掉，需要时再挂回并打开，减少首屏
 *   节点数量；同时拦截「按下拖拽松手落在遮罩上」误触成的关闭行为。
 * 约定：摘除后由补丁过的 show / showModal 自动重新挂载，调用方无感知；
 *   close 后延迟一帧再摘除，等关闭动画结束。
 */

/**
 * 让隐藏的设置对话框延迟挂载。
 */
export function deferHiddenEditorDialogs(
  dialogElements = document.querySelectorAll("body > dialog.settings-dialog")
) {
  for (const dialogElement of dialogElements) {
    // data-lazyEditorDialog 做幂等标记，重复执行不会二次包装 show / showModal。
    if (
      !(dialogElement instanceof HTMLDialogElement) ||
      dialogElement.dataset.lazyEditorDialog === "true"
    )
      continue;
    dialogElement.dataset.lazyEditorDialog = "true";
    const originalShow = dialogElement.show.bind(dialogElement),
      originalShowModal = dialogElement.showModal.bind(dialogElement),
      // 原生 show/showModal 要求节点在文档中，摘除后必须先补挂。
      ensureAttached = () => {
        dialogElement.isConnected || document.body.append(dialogElement);
      };
    ((dialogElement.show = (...showArguments) => (
      ensureAttached(),
      originalShow(...showArguments)
    )),
      (dialogElement.showModal = (...showModalArguments) => (
        ensureAttached(),
        originalShowModal(...showModalArguments)
      )),
      dialogElement.addEventListener("close", () => {
        // 等一帧再摘除：让关闭过渡动画能在仍挂载的状态下播完。
        window.requestAnimationFrame(() => {
          !dialogElement.open && dialogElement.isConnected && dialogElement.remove();
        });
      }),
      dialogElement.remove());
  }
}

/**
 * 安装对话框遮罩误触防护。
 *
 * 背景：用户在对话框内按下指针、拖到遮罩上松手时，浏览器会判定为点击遮罩
 * 从而关闭对话框，容易丢编辑内容。
 */
export function installSettingsDialogBackdropGuard() {
  // 记录本次指针序列是否起始于遮罩本身，用 WeakMap 避免给 DOM 加自定义属性。
  const backdropPointerState = new WeakMap();
  (document.addEventListener(
    "pointerdown",
    pointerDownEvent => {
      const targetDialog = pointerDownEvent.target?.closest?.("dialog.settings-dialog");
      targetDialog &&
        backdropPointerState.set(targetDialog, pointerDownEvent.target === targetDialog);
    },
    // 用捕获阶段记录，早于任何可能的重渲染逻辑。
    !0
  ),
    document.addEventListener(
      "click",
      clickEvent => {
        const clickedDialog = clickEvent.target;
        if (
          !(clickedDialog instanceof HTMLDialogElement) ||
          !clickedDialog.matches(".settings-dialog")
        )
          return;
        const pointerStartedOnBackdrop = backdropPointerState.get(clickedDialog);
        // 只有「按下时就落在遮罩上」才允许关闭；否则拦下这次 click。
        (backdropPointerState.delete(clickedDialog),
          pointerStartedOnBackdrop === !1 &&
            (clickEvent.preventDefault(), clickEvent.stopImmediatePropagation()));
      },
      !0
    ));
}
