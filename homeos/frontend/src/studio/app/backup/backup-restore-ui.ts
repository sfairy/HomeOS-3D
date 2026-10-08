import {
  cancelBackupJob,
  exportEncryptedBackup,
  inspectEncryptedBackup,
  restoreEncryptedBackup,
} from "./backup-restore";

const MAX_BACKUP_BYTES = 512 * 1024 * 1024;

const DIALOG_HTML = `
<div class="dialog-heading">
  <div>
    <span>BACKUP &amp; RESTORE</span>
    <h2 id="backup-title">备份与恢复</h2>
  </div>
  <button id="backup-close" class="icon-button" type="button" aria-label="关闭备份与恢复">×</button>
</div>
<div class="backup-body">
  <div class="backup-guide">
    <p>备份已保存的 HA 连接（含 Token）、仪表盘、户型和素材，不含账号及激活密钥。</p>
    <p>请先登录并激活，恢复保留当前账号和授权。</p>
    <p>备份使用密码加密，密码遗失无法恢复。低版本程序不能恢复高版本备份。</p>
    <p>恢复会覆盖业务数据，自动保留本机回退副本，中控需重新配对。</p>
  </div>
  <div class="navigation-segmented-options backup-tabs" role="tablist" aria-label="备份或恢复">
    <button type="button" role="tab" class="active" aria-selected="true" aria-controls="backup-export-form" data-backup-tab="export">创建备份</button>
    <button type="button" role="tab" aria-selected="false" aria-controls="backup-inspect-form" data-backup-tab="restore">恢复备份</button>
  </div>
  <form id="backup-export-form" class="settings-form">
    <label>备份密码<input id="backup-password" type="password" required minlength="8" maxlength="128" autocomplete="new-password" placeholder="至少 8 个字符"></label>
    <label>确认备份密码<input id="backup-password-confirm" type="password" required minlength="8" maxlength="128" autocomplete="new-password" placeholder="再次输入备份密码"></label>
    <small>请先保存编辑器修改。备份文件上限 512 MB。</small>
    <div class="dialog-actions"><button type="submit" class="primary">下载加密备份</button></div>
  </form>
  <form id="backup-inspect-form" class="settings-form" hidden>
    <label>备份文件<input id="backup-file" type="file" accept=".habackup" required></label>
    <label>备份密码<input id="backup-restore-password" type="password" required minlength="8" maxlength="128" autocomplete="off" placeholder="输入创建此备份时设置的密码"></label>
    <div class="dialog-actions"><button type="submit">检查备份文件</button></div>
  </form>
  <form id="backup-restore-form" class="settings-form" hidden>
    <div id="backup-preview" class="settings-message backup-preview"></div>
    <label>当前管理员密码<input id="backup-admin-password" type="password" required maxlength="128" autocomplete="current-password" placeholder="输入当前安装的登录密码"></label>
    <label class="backup-confirm"><input id="backup-confirm" type="checkbox" required><span>已了解：恢复会覆盖业务数据及未保存修改，中控需重新配对。</span></label>
    <div class="dialog-actions"><button type="submit" class="primary">确认覆盖并恢复</button></div>
  </form>
  <p id="backup-message" class="settings-message" role="status" aria-live="polite" hidden></p>
</div>
`;

export function setupBackupRestoreUi(options?: {
  canExport?: () => boolean;
  onRestored?: () => void;
  /** 限定查找 #backup-open 的根（路由过渡时编辑器/户型页会短暂共存）。 */
  root?: ParentNode | null;
}) {
  const root = options?.root || document;
  const openButton = root.querySelector<HTMLButtonElement>("#backup-open");
  if (!openButton || openButton.dataset.backupUiReady === "true") return;
  openButton.dataset.backupUiReady = "true";

  let dialogElement = document.querySelector<HTMLDialogElement>("#backup-dialog");
  if (!dialogElement) {
    dialogElement = document.createElement("dialog");
    dialogElement.id = "backup-dialog";
    dialogElement.className = "settings-dialog backup-dialog";
    dialogElement.setAttribute("aria-labelledby", "backup-title");
    dialogElement.innerHTML = DIALOG_HTML;
    document.body.append(dialogElement);
  }

  const canExport = options?.canExport || (() => true);
  const onRestored = options?.onRestored || (() => undefined);
  const byId = <T extends HTMLElement>(id: string) =>
    dialogElement!.querySelector<T>("#" + id)!;
  const messageElement = byId<HTMLParagraphElement>("backup-message");
  const exportForm = byId<HTMLFormElement>("backup-export-form");
  const inspectForm = byId<HTMLFormElement>("backup-inspect-form");
  const restoreForm = byId<HTMLFormElement>("backup-restore-form");
  const previewElement = byId<HTMLDivElement>("backup-preview");

  let busy = false;
  let activeTicket: string | null = null;
  let generation = 0;

  const setMessage = (text: string, tone = "") => {
    messageElement.textContent = text;
    messageElement.className = "settings-message" + (tone ? " " + tone : "");
    messageElement.hidden = !text;
  };

  const setBusy = (next: boolean) => {
    busy = next;
    dialogElement!.setAttribute("aria-busy", String(next));
    for (const control of dialogElement!.querySelectorAll<
      HTMLButtonElement | HTMLInputElement
    >("button, input")) {
      control.disabled = next;
    }
  };

  const clearTicket = async () => {
    const ticket = activeTicket;
    activeTicket = null;
    restoreForm.hidden = true;
    previewElement.textContent = "";
    restoreForm.reset();
    if (ticket) {
      await cancelBackupJob(ticket).catch(() => undefined);
    }
  };

  const switchTab = (tab: "export" | "restore") => {
    exportForm.hidden = tab !== "export";
    inspectForm.hidden = tab !== "restore";
    for (const tabButton of dialogElement!.querySelectorAll<HTMLButtonElement>(
      "[data-backup-tab]",
    )) {
      const selected = tabButton.dataset.backupTab === tab;
      tabButton.classList.toggle("active", selected);
      tabButton.setAttribute("aria-selected", String(selected));
    }
    setMessage("");
  };

  for (const tabButton of dialogElement.querySelectorAll<HTMLButtonElement>(
    "[data-backup-tab]",
  )) {
    tabButton.addEventListener("click", async () => {
      if (busy) return;
      await clearTicket();
      switchTab((tabButton.dataset.backupTab as "export" | "restore") || "export");
    });
  }

  openButton.addEventListener("click", () => {
    generation += 1;
    switchTab("export");
    dialogElement!.showModal();
  });
  openButton.title = "备份与恢复";
  openButton.setAttribute("aria-label", "备份与恢复");

  byId<HTMLButtonElement>("backup-close").addEventListener("click", () => {
    if (!busy) dialogElement!.close();
  });

  dialogElement.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });

  dialogElement.addEventListener("close", () => {
    generation += 1;
    void clearTicket();
    exportForm.reset();
    inspectForm.reset();
    setMessage("");
  });

  exportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!canExport()) {
      return setMessage(
        "当前有未保存或正在保存的修改，请先关闭窗口并保存，再创建备份。",
        "error",
      );
    }
    const password = byId<HTMLInputElement>("backup-password").value;
    const confirmPassword = byId<HTMLInputElement>("backup-password-confirm").value;
    if (password !== confirmPassword) {
      return setMessage("两次输入的备份密码不一致。", "error");
    }
    setBusy(true);
    setMessage("正在加密备份，请稍候…");
    try {
      await exportEncryptedBackup(password);
      exportForm.reset();
      setMessage("备份已生成并开始下载，请妥善保存文件和备份密码。", "success");
    } catch (error: any) {
      setMessage(error?.message || String(error), "error");
    } finally {
      setBusy(false);
    }
  });

  inspectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const file = byId<HTMLInputElement>("backup-file").files?.[0];
    if (!file) return setMessage("请选择备份文件。", "error");
    if (file.size > MAX_BACKUP_BYTES) {
      return setMessage("备份文件不能超过 512 MB。", "error");
    }
    setBusy(true);
    const requestGeneration = generation;
    setMessage("正在解密并检查备份，当前数据不会修改…");
    try {
      await clearTicket();
      const summary = await inspectEncryptedBackup(
        file,
        byId<HTMLInputElement>("backup-restore-password").value,
      );
      activeTicket = String(summary.ticket || "") || null;
      if (requestGeneration !== generation || !dialogElement!.open) {
        await clearTicket();
        return;
      }
      const createdAt = new Date(summary.createdAt);
      previewElement.textContent =
        "HomeOS " +
        (summary.version || "") +
        " · " +
        (Number.isNaN(createdAt.getTime())
          ? summary.createdAt || ""
          : createdAt.toLocaleString()) +
        "\n" +
        (summary.projects || 0) +
        " 个仪表盘 · " +
        (summary.connections || 0) +
        " 个 HA 连接 · " +
        (summary.files || 0) +
        " 个文件 · " +
        (summary.pairings || 0) +
        " 个中控配置";
      restoreForm.hidden = false;
      byId<HTMLInputElement>("backup-restore-password").value = "";
      const expiresMinutes = Math.max(
        1,
        Math.round(Number(summary.expiresIn || 600) / 60),
      );
      setMessage(
        `检查通过。请在 ${expiresMinutes} 分钟内确认恢复；当前业务数据将被整体覆盖。`,
        "success",
      );
    } catch (error: any) {
      setMessage(error?.message || String(error), "error");
    } finally {
      setBusy(false);
    }
  });

  for (const fieldId of ["backup-file", "backup-restore-password"] as const) {
    byId<HTMLInputElement>(fieldId).addEventListener("input", () => {
      if (busy) return;
      void clearTicket();
      setMessage("");
    });
  }

  restoreForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !activeTicket) return;
    setBusy(true);
    setMessage("正在恢复业务数据，请保持窗口打开并等待完成…");
    try {
      await restoreEncryptedBackup({
        ticket: activeTicket,
        adminPassword: byId<HTMLInputElement>("backup-admin-password").value,
        confirm: byId<HTMLInputElement>("backup-confirm").checked,
      });
      activeTicket = null;
      onRestored();
      setMessage("恢复完成，正在重新加载。中控设备请重新配对。", "success");
      window.location.reload();
    } catch (error: any) {
      setMessage(error?.message || String(error), "error");
      setBusy(false);
    }
  });
}
