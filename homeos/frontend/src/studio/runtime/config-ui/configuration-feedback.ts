/**
 * 配置弹窗的保存反馈（0.8.1）：把「脏了 / 正在应用 / 已保存 / 保存失败 / 有未保存修改就要退出」
 * 收敛成一份状态机，供 3D 配置、安防、扫地机三个配置入口共用。
 *
 * 为什么单独一层：
 * - 保存状态以前是各处自己写 `status.textContent`，弹窗关闭时没人拦，「改了一半直接退出」
 *   会静默丢掉配置；
 * - 退出前要先判「正在应用」（此时不能再发一次保存）、再判脏、再给三出口
 *   （继续编辑 / 放弃并退出 / 保存并退出），每个入口复制一遍必然走样。
 *
 * 设计约束：不持有业务数据，读取快照与真正保存都由调用方注入。
 */

/** 状态文本的 `data-save-state`：样式与自动化走查都按它区分。 */
export type ConfigurationFeedbackState = "dirty" | "saving" | "saved" | "error";

interface ConfigurationFeedbackOptions {
  /** 当前待保存数据的快照读取器（要能被 `JSON.stringify` 序列化）。 */
  read: () => unknown;
  /** 状态文本节点（调用方负责放进弹窗头部）。 */
  status: HTMLElement;
  /** 创建 dialog / button 用的文档。 */
  document: Document;
  /** 已保存且无新修改时的提示语。 */
  savedMessage?: string;
}

export interface ConfigurationFeedback {
  readonly dirty: boolean;
  readonly saving: boolean;
  /** 数据被改过：之后按「已改动」口径判断脏。 */
  changed(): void;
  /** 外部数据换了基线（未改动过时才重取基线）。 */
  refresh(): void;
  /** 进入保存：先把快照拷出来，保存成功后把它当作新基线。 */
  capture<T = unknown>(): T;
  /** 保存成功：`savedSnapshot` 成为新基线。 */
  saved(savedSnapshot: unknown): void;
  /** 保存/应用失败：只提示，不改变脏状态。 */
  failed(error: unknown): void;
  /** 直接写状态文本（不使用保存状态机语义时）。 */
  message(text: string, state?: ConfigurationFeedbackState): void;
  /** 请求退出：脏时弹三出口，保存按钮走 `save`。 */
  requestClose(proceed: () => void, save: () => Promise<unknown>): void;
  dispose(): void;
}

function errorMessageOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error)
    return String((error as { message?: unknown }).message ?? "");
  return String(error ?? "");
}

export function createConfigurationFeedback({
  read,
  status,
  document: ownerDocument,
  savedMessage = "配置已应用，请保存仪表盘。",
}: ConfigurationFeedbackOptions): ConfigurationFeedback {
  let baselineSnapshot = JSON.stringify(read()),
    isTouched = false,
    hasSavedOnce = false,
    isSaving = false,
    isDisposed = false,
    unsavedDialogElement: HTMLDialogElement | null = null;

  const snapshotOf = () => JSON.stringify(read());

  const isDirty = () => isTouched && snapshotOf() !== baselineSnapshot;

  const setMessage = (text: string, state: ConfigurationFeedbackState = "dirty") => {
    if (isDisposed) return;
    status.textContent = text;
    status.hidden = !text;
    status.setAttribute("data-save-state", state);
  };

  const refreshStatus = () => {
    if (isSaving) setMessage("正在应用配置…", "saving");
    else if (isDirty())
      setMessage(
        hasSavedOnce ? "配置已应用，另有新修改未保存。" : "有未保存的修改，请保存配置。",
        "dirty",
      );
    else setMessage(hasSavedOnce ? savedMessage : "", "saved");
  };

  const closeUnsavedDialog = () => {
    unsavedDialogElement?.close();
    unsavedDialogElement?.remove();
    unsavedDialogElement = null;
  };

  const create = (tagName: string, textContent = "", className = ""): HTMLElement => {
    const node = ownerDocument.createElement(tagName);
    node.textContent = textContent;
    node.className = className;
    return node;
  };

  return {
    get dirty() {
      return isDirty();
    },
    get saving() {
      return isSaving;
    },
    changed() {
      isTouched = true;
      refreshStatus();
    },
    refresh() {
      if (!isTouched && !hasSavedOnce) baselineSnapshot = snapshotOf();
      refreshStatus();
    },
    capture<T = unknown>(): T {
      const snapshot = structuredClone(read()) as T;
      isSaving = true;
      refreshStatus();
      return snapshot;
    },
    saved(savedSnapshot: unknown) {
      if (isDisposed) return;
      baselineSnapshot = JSON.stringify(savedSnapshot);
      isTouched = true;
      hasSavedOnce = true;
      isSaving = false;
      refreshStatus();
    },
    failed(error: unknown) {
      isSaving = false;
      setMessage(errorMessageOf(error), "error");
    },
    message: setMessage,
    requestClose(proceed: () => void, save: () => Promise<unknown>) {
      if (isDisposed || unsavedDialogElement) return;
      if (isSaving) {
        setMessage("配置正在应用，请完成后再退出。", "saving");
        return;
      }
      if (!isDirty()) {
        proceed();
        return;
      }
      const dialogElement = create(
        "dialog",
        "",
        "settings-dialog i3d-unsaved-dialog",
      ) as HTMLDialogElement;
      unsavedDialogElement = dialogElement;
      dialogElement.setAttribute("aria-label", "尚有未保存的修改");
      const headingElement = create("h3", "尚有未保存的修改"),
        noteElement = create("p", "退出会放弃本窗口尚未保存的修改。已应用的配置不会撤销。"),
        actionsElement = create("div", "", "dialog-actions"),
        actionButtons: HTMLButtonElement[] = [];
      const addAction = (label: string, handleClick: () => void) => {
        const actionButton = create("button", label) as HTMLButtonElement;
        actionButton.type = "button";
        actionButton.addEventListener("click", handleClick);
        actionsElement.append(actionButton);
        actionButtons.push(actionButton);
        return actionButton;
      };
      addAction("继续编辑", closeUnsavedDialog);
      addAction("放弃修改并退出", () => {
        closeUnsavedDialog();
        proceed();
      });
      const saveAndExitButton = addAction("保存配置并退出", async () => {
        if (saveAndExitButton.disabled) return;
        for (const actionButton of actionButtons) actionButton.disabled = true;
        try {
          await save();
          if (isDisposed || unsavedDialogElement !== dialogElement) return;
          closeUnsavedDialog();
          if (!isSaving && !isDirty()) proceed();
        } catch (saveError) {
          if (isDisposed || unsavedDialogElement !== dialogElement) return;
          isSaving = false;
          closeUnsavedDialog();
          setMessage(errorMessageOf(saveError), "error");
        }
      });
      saveAndExitButton.className = "primary";
      dialogElement.append(headingElement, noteElement, actionsElement);
      dialogElement.addEventListener("cancel", (cancelEvent: Event) => {
        cancelEvent.preventDefault();
        if (!isSaving) closeUnsavedDialog();
      });
      ownerDocument.body.append(dialogElement);
      dialogElement.showModal();
    },
    dispose() {
      if (isDisposed) return;
      isDisposed = true;
      closeUnsavedDialog();
    },
  };
}
