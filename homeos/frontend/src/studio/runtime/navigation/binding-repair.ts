/**
 * 失效配置检查与修复（0.8.4）。
 *
 * 复制控件 / 删除模型后，文档里会残留指向已不存在模型的绑定。后端
 * `POST /projects/{id}/binding-check` 返回可移除的失效项；这里负责
 * 「先列清单 → 用户确认 → 再检查一次（防止期间户型已改）→ 返回清理后的文档」。
 */

export interface BindingRepairIssue {
  componentLabel?: string;
  label?: string;
  reason?: string;
  [key: string]: any;
}

export function hasInteractionBindings(bindingTree: any): boolean {
  if (!bindingTree || typeof bindingTree !== "object") return true;
  if (bindingTree.type === "interaction3d") return false;
  return Object.values(bindingTree).some(hasInteractionBindings);
}

export function confirmBindingRepair(
  issues: BindingRepairIssue[],
  { mode, signal, document: repairDocument = document }: any,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const repairDialog = repairDocument.createElement("dialog");
    ((repairDialog.className = "settings-dialog binding-repair-dialog"),
      repairDialog.setAttribute("aria-label", "检查失效配置"));
    const repairTitle = repairDocument.createElement("h2");
    repairTitle.textContent =
      mode === "copy" ? "待复制控件中有失效配置" : "检查失效配置";
    const repairDescription = repairDocument.createElement("p");
    repairDescription.textContent =
      mode === "copy"
        ? "发现 " +
          issues.length +
          " 项失效配置。确认后从待复制的副本中移除，源控件保持原样。也可以取消后重新关联模型。"
        : "发现 " +
          issues.length +
          " 项失效配置。确认后移除以下配置，保留其他设置和 HA 实体。完成后请点击顶部“保存”；也可以取消后重新关联模型。";
    const repairList = repairDocument.createElement("ul");
    repairList.className = "binding-repair-list";
    for (const repairIssue of issues) {
      const repairListItem = repairDocument.createElement("li");
      repairListItem.textContent =
        repairIssue.componentLabel + " · " + repairIssue.label + "：" + repairIssue.reason;
      repairList.append(repairListItem);
    }
    const repairActions = repairDocument.createElement("div");
    repairActions.className = "binding-repair-actions";
    const cancelButton = repairDocument.createElement("button");
    ((cancelButton.type = "button"), (cancelButton.textContent = "取消，保留配置"));
    const confirmButton = repairDocument.createElement("button");
    ((confirmButton.type = "button"),
      (confirmButton.className = "primary"),
      (confirmButton.textContent =
        mode === "copy" ? "移除失效项并继续复制" : "移除列出的失效配置"));
    let isSettled = false;
    const settleRepair = (isConfirmed: boolean) => {
      isSettled ||
        ((isSettled = true),
        signal.removeEventListener("abort", handleAbort),
        repairDialog.close(),
        repairDialog.remove(),
        resolve(isConfirmed));
    };
    const handleAbort = () => settleRepair(false);
    (cancelButton.addEventListener("click", handleAbort),
      confirmButton.addEventListener("click", () => settleRepair(true)),
      repairDialog.addEventListener("cancel", (cancelEvent: Event) => {
        (cancelEvent.preventDefault(), settleRepair(false));
      }),
      repairDialog.addEventListener("close", () => settleRepair(false)),
      repairDialog.addEventListener("keydown", (keydownEvent: KeyboardEvent) =>
        keydownEvent.stopPropagation(),
      ),
      signal.addEventListener("abort", handleAbort, { once: true }),
      repairActions.append(cancelButton, confirmButton),
      repairDialog.append(repairTitle, repairDescription, repairList, repairActions),
      repairDocument.body.append(repairDialog),
      repairDialog.showModal(),
      cancelButton.focus());
  });
}

export function createBindingRepair({
  api,
  confirm = confirmBindingRepair,
}: {
  api: (path: string, options?: Record<string, any>) => Promise<any>;
  confirm?: typeof confirmBindingRepair;
}) {
  let activeRequest: AbortController | null = null;
  const cancel = () => {
    (activeRequest?.abort(), (activeRequest = null));
  };

  async function prepare({
    panelDocument,
    componentIds = [],
    mode = "repair",
    isCurrent = () => true,
  }: any): Promise<any> {
    cancel();
    if (!hasInteractionBindings(panelDocument)) return { document: panelDocument, issues: [] };
    const requestController = new AbortController();
    activeRequest = requestController;
    const { signal } = requestController,
      isStillCurrent = () => !signal.aborted && isCurrent(),
      requestBody = JSON.stringify({ document: panelDocument, componentIds }),
      checkBindings = async () => {
        const timeoutId = setTimeout(() => requestController.abort(), 15000);
        try {
          return await api(
            "/projects/" + encodeURIComponent(panelDocument.projectId) + "/binding-check",
            { method: "POST", body: requestBody, signal },
          );
        } finally {
          clearTimeout(timeoutId);
        }
      };
    try {
      const firstCheck = await checkBindings();
      if (!isStillCurrent()) return null;
      if (!firstCheck.issues.length) return firstCheck;
      if (!(await confirm(firstCheck.issues, { mode, signal })) || !isStillCurrent()) return null;
      const repairedCheck = await checkBindings();
      if (!isStillCurrent()) return null;
      if (JSON.stringify(repairedCheck.issues) !== JSON.stringify(firstCheck.issues))
        throw new Error("户型已更新，失效项已变化，未清理任何配置。请重新检查。");
      return repairedCheck;
    } catch (repairError: any) {
      if (!isCurrent() || activeRequest !== requestController) return null;
      throw signal.aborted
        ? new Error("检查已取消或超时，配置保持不变，请重试。")
        : repairError;
    } finally {
      (activeRequest === requestController && (activeRequest = null),
        requestController.abort());
    }
  }

  return { prepare, cancel };
}
