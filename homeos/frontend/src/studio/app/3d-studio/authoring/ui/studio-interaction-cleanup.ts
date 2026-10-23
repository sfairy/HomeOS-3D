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
  return new Promise<boolean>((cleanupResolve) => {
    const affectedProjects: string[] = Array.isArray(interactionImpact?.projects)
      ? interactionImpact.projects.map((project: any) => String(project))
      : [];
    const affectedImpacts: number = Array.isArray(interactionImpact?.impacts)
      ? interactionImpact.impacts.length
      : 0;

    const cleanupDialogElement = document.createElement("dialog");
    cleanupDialogElement.className = "scale-dialog interaction-cleanup-dialog";
    cleanupDialogElement.setAttribute("role", "alertdialog");
    cleanupDialogElement.setAttribute("aria-modal", "true");
    cleanupDialogElement.setAttribute("aria-labelledby", "interaction-cleanup-title");
    cleanupDialogElement.setAttribute("aria-describedby", "interaction-cleanup-lead");

    const cleanupFormElement = document.createElement("form");
    cleanupFormElement.method = "dialog";

    /* 右上角关闭 = 放弃删除，与「撤销删除」同义。 */
    const cleanupCloseButton = document.createElement("button");
    cleanupCloseButton.type = "button";
    cleanupCloseButton.className = "dialog-close";
    cleanupCloseButton.setAttribute("aria-label", "关闭删除提示");
    cleanupCloseButton.textContent = "×";

    const cleanupIndexLabel = document.createElement("span");
    cleanupIndexLabel.className = "dialog-index";
    cleanupIndexLabel.textContent = "SYNC INTERACTION";

    const cleanupTitleHeading = document.createElement("h2");
    cleanupTitleHeading.id = "interaction-cleanup-title";
    cleanupTitleHeading.textContent = "删除关联的 3D 交互配置？";

    /* 先给结论：会移除入口、会清理绑定、组合成员保留。细节放进下面的指标与说明。 */
    const cleanupLeadElement = document.createElement("p");
    cleanupLeadElement.id = "interaction-cleanup-lead";
    cleanupLeadElement.className = "interaction-cleanup-lead";
    cleanupLeadElement.textContent =
      "确认后会移除仪表盘里对应的入口，并清理这些交互绑定；组合中的另一成员会保留。";

    const cleanupStatsElement = document.createElement("div");
    cleanupStatsElement.className = "interaction-cleanup-stats";
    for (const [statLabel, statValue, statUnit] of [
      ["受影响仪表盘", String(affectedProjects.length), "个"],
      ["交互绑定", String(affectedImpacts), "项"],
    ] as const) {
      const statElement = document.createElement("div");
      statElement.className = "interaction-cleanup-stat";
      const statLabelElement = document.createElement("span");
      statLabelElement.textContent = statLabel;
      const statValueElement = document.createElement("strong");
      statValueElement.textContent = statValue;
      const statUnitElement = document.createElement("small");
      statUnitElement.textContent = statUnit;
      statValueElement.append(statUnitElement);
      statElement.append(statLabelElement, statValueElement);
      cleanupStatsElement.append(statElement);
    }

    const cleanupProjectsElement = document.createElement("div");
    cleanupProjectsElement.className = "interaction-cleanup-projects";
    const cleanupProjectsLabel = document.createElement("span");
    cleanupProjectsLabel.className = "interaction-cleanup-projects-label";
    cleanupProjectsLabel.textContent = "受影响仪表盘";
    const cleanupProjectsList = document.createElement("div");
    cleanupProjectsList.className = "interaction-cleanup-projects-list";
    if (!affectedProjects.length) {
      const emptyProject = document.createElement("span");
      emptyProject.className = "interaction-cleanup-chip is-empty";
      emptyProject.textContent = "未记录";
      cleanupProjectsList.append(emptyProject);
    }
    for (const projectName of affectedProjects) {
      const cleanupProjectChip = document.createElement("span");
      cleanupProjectChip.className = "interaction-cleanup-chip";
      const cleanupProjectText = document.createElement("span");
      cleanupProjectText.textContent = projectName;
      cleanupProjectChip.title = projectName;
      cleanupProjectChip.append(cleanupProjectText);
      cleanupProjectsList.append(cleanupProjectChip);
    }
    cleanupProjectsElement.append(cleanupProjectsLabel, cleanupProjectsList);

    /* 两条边界说明拆开：一条讲影响范围，一条讲撤销能做到什么。 */
    const cleanupNoteElement = document.createElement("div");
    cleanupNoteElement.className = "interaction-cleanup-note";
    const cleanupScopeNote = document.createElement("p");
    cleanupScopeNote.textContent = "不删除 HA 实体，也不发送设备指令。";
    const cleanupUndoNote = document.createElement("p");
    cleanupUndoNote.textContent =
      "撤销删除会恢复本次移除的楼层、模型和灯组，并保留其他修改。";
    cleanupNoteElement.append(cleanupScopeNote, cleanupUndoNote);

    const cleanupActionsElement = document.createElement("div");
    cleanupActionsElement.className = "dialog-actions";

    const finishCleanup = (cleanupConfirmed: boolean) => {
      cleanupDialogElement.close();
      cleanupDialogElement.remove();
      cleanupResolve(cleanupConfirmed);
    };

    const setCleanupBusy = (cleanupBusy: boolean) => {
      cleanupConfirmButton.disabled = cleanupBusy;
      cleanupCloseButton.disabled = cleanupBusy;
      cleanupCancelButton.disabled = cleanupBusy;
      cleanupCancelButton.textContent = cleanupBusy ? "正在恢复…" : "撤销删除";
    };

    const cleanupCancelButton = document.createElement("button");
    cleanupCancelButton.type = "button";
    cleanupCancelButton.className = "interaction-cleanup-undo";
    cleanupCancelButton.textContent = "撤销删除";
    /* 默认焦点放在安全动作上：回车不会误确认删除。 */
    cleanupCancelButton.autofocus = true;
    cleanupCancelButton.onclick = async () => {
      setCleanupBusy(true);
      try {
        await undoDeletion();
        finishCleanup(false);
      } catch (cleanupRestoreFailure: any) {
        showToast(cleanupRestoreFailure.message || "恢复删除失败，请重试。", "error");
      } finally {
        setCleanupBusy(false);
      }
    };

    const cleanupConfirmButton = document.createElement("button");
    cleanupConfirmButton.type = "button";
    cleanupConfirmButton.className = "primary";
    cleanupConfirmButton.textContent = "确认删除并保存";
    cleanupConfirmButton.onclick = () => finishCleanup(true);

    cleanupCloseButton.onclick = () => finishCleanup(false);
    cleanupDialogElement.addEventListener("cancel", (cleanupCancelEvent) => {
      cleanupCancelEvent.preventDefault();
      finishCleanup(false);
    });

    cleanupActionsElement.append(cleanupCancelButton, cleanupConfirmButton);
    cleanupFormElement.append(
      cleanupCloseButton,
      cleanupIndexLabel,
      cleanupTitleHeading,
      cleanupLeadElement,
      cleanupStatsElement,
      cleanupProjectsElement,
      cleanupNoteElement,
      cleanupActionsElement,
    );
    cleanupDialogElement.append(cleanupFormElement);
    document.body.append(cleanupDialogElement);
    cleanupDialogElement.showModal();
  });
}
