/** 「保存并退出」/ 删除前的交互收尾确认弹窗：等待进行中的保存、等用户确认后再落盘。
 *
 * 两个同宿主助手（撤销删除、toast）显式传参，便于独立复用。
 */

/**
 * @param interactionImpact 保存失败详情（`null` 表示只是普通交互收尾）
 * @param undoDeletion 撤销本次待保存的删除（同宿主助手，显式传入）
 * @param showToast 提示气泡（同宿主助手，显式传入）
 */
export function resolveInteractionCleanup(
  interactionImpact: any,
  undoDeletion: () => Promise<any> | any,
  showToast: (message: string, kind?: string) => void,
) {
  return new Promise((cleanupResolve) => {
    const cleanupDialogElement = document.createElement("dialog");
    cleanupDialogElement.className = "scale-dialog interaction-cleanup-dialog";
    const cleanupFormElement = document.createElement("form");
    cleanupFormElement.method = "dialog";
    const cleanupCloseButton = document.createElement("button");
    ((cleanupCloseButton.type = "button"),
      (cleanupCloseButton.className = "dialog-close"),
      cleanupCloseButton.setAttribute("aria-label", "关闭删除提示"),
      (cleanupCloseButton.textContent = "×"));
    const cleanupIndexLabel = document.createElement("span");
    ((cleanupIndexLabel.className = "dialog-index"),
      (cleanupIndexLabel.textContent = "SYNC INTERACTION"));
    const cleanupTitleHeading = document.createElement("h2");
    cleanupTitleHeading.textContent = "删除关联的 3D 交互配置？";
    const cleanupMessageElement = document.createElement("p");
    cleanupMessageElement.textContent =
      "本次删除影响 " +
      interactionImpact.projects.length +
      " 个仪表盘、" +
      interactionImpact.impacts.length +
      " 项交互绑定。确认后移除对应入口；组合另一成员保留。不删除 HA 实体或发送设备指令。";
    const cleanupProjectsElement = document.createElement("p");
    ((cleanupProjectsElement.className = "interaction-cleanup-projects"),
      (cleanupProjectsElement.textContent =
        "受影响仪表盘：" + interactionImpact.projects.join("、")));
    const cleanupActionsElement = document.createElement("div");
    cleanupActionsElement.className = "dialog-actions";
    const finishCleanup = (cleanupConfirmed: any) => {
        (cleanupDialogElement.close(),
          cleanupDialogElement.remove(),
          cleanupResolve(cleanupConfirmed));
      },
      cleanupCancelButton = document.createElement("button");
    ((cleanupCancelButton.type = "button"),
      (cleanupCancelButton.textContent = "撤销删除"),
      (cleanupCancelButton.onclick = async () => {
        (cleanupCancelButton.disabled =
          cleanupConfirmButton.disabled =
          cleanupCloseButton.disabled =
            true);
        try {
          (await undoDeletion(), finishCleanup(false));
        } catch (cleanupRestoreFailure: any) {
          showToast(cleanupRestoreFailure.message || "恢复删除失败，请重试。", "error");
        } finally {
          (cleanupCancelButton.disabled =
            cleanupConfirmButton.disabled =
            cleanupCloseButton.disabled =
              false);
        }
      }));
    const cleanupConfirmButton = document.createElement("button");
    ((cleanupConfirmButton.type = "button"),
      (cleanupConfirmButton.className = "primary"),
      (cleanupConfirmButton.textContent = "确认删除并保存"),
      (cleanupConfirmButton.onclick = () => finishCleanup(true)));
    const cleanupNoteElement = document.createElement("p");
    ((cleanupNoteElement.className = "interaction-cleanup-note"),
      (cleanupNoteElement.textContent =
        "撤销本次待保存删除会恢复移除的楼层、模型和灯组，并保留其他修改；确认后才会同步清理交互配置。"),
      cleanupActionsElement.append(cleanupCancelButton, cleanupConfirmButton),
      cleanupFormElement.append(
        cleanupCloseButton,
        cleanupIndexLabel,
        cleanupTitleHeading,
        cleanupMessageElement,
        cleanupProjectsElement,
        cleanupNoteElement,
        cleanupActionsElement,
      ),
      cleanupDialogElement.append(cleanupFormElement),
      (cleanupCloseButton.onclick = () => finishCleanup(false)),
      cleanupDialogElement.addEventListener("cancel", (cleanupCancelEvent) => {
        (cleanupCancelEvent.preventDefault(), finishCleanup(false));
      }),
      document.body.append(cleanupDialogElement),
      cleanupDialogElement.showModal());
  });
}
