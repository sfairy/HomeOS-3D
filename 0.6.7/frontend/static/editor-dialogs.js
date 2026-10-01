export function deferHiddenEditorDialogs(
  dialogElements = document.querySelectorAll("body > dialog.settings-dialog"),
) {
  for (const dialogElement of dialogElements) {
    if (
      !(dialogElement instanceof HTMLDialogElement) ||
      dialogElement.dataset.lazyEditorDialog === "true"
    )
      continue;
    dialogElement.dataset.lazyEditorDialog = "true";
    const originalShow = dialogElement.show.bind(dialogElement),
      originalShowModal = dialogElement.showModal.bind(dialogElement),
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
        window.requestAnimationFrame(() => {
          !dialogElement.open && dialogElement.isConnected && dialogElement.remove();
        });
      }),
      dialogElement.remove());
  }
}
export function installSettingsDialogBackdropGuard() {
  const backdropPointerState = new WeakMap();
  (document.addEventListener(
    "pointerdown",
    (pointerDownEvent) => {
      const targetDialog = pointerDownEvent.target?.closest?.("dialog.settings-dialog");
      targetDialog &&
        backdropPointerState.set(targetDialog, pointerDownEvent.target === targetDialog);
    },
    true,
  ),
    document.addEventListener(
      "click",
      (clickEvent) => {
        const clickedDialog = clickEvent.target;
        if (
          !(clickedDialog instanceof HTMLDialogElement) ||
          !clickedDialog.matches(".settings-dialog")
        )
          return;
        const pointerStartedOnBackdrop = backdropPointerState.get(clickedDialog);
        (backdropPointerState.delete(clickedDialog),
          pointerStartedOnBackdrop === false &&
            (clickEvent.preventDefault(), clickEvent.stopImmediatePropagation()));
      },
      true,
    ));
}
