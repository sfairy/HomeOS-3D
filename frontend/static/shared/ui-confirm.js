/**
 * 站内统一确认框。
 *
 * 编辑器、展示页、3D 配置编辑器共用，替代 window.confirm（暗色页面不再跳出浅色系统框，
 * 按钮文案可定制）。导出 confirmAction({kicker, title, message, detail, confirmLabel,
 * cancelLabel, tone}) → Promise<boolean>。遮罩 / Esc / 关闭按钮一律按「取消」（false），
 * 只有点确认才 true；同一时刻只开一个，重复调用先关掉上一个并以 false 结束它。
 */

const STYLE_HREF = "/static/shared/ui-confirm.css?v=2609262312";
const DIALOG_ID = "homeos-ui-confirm-dialog";

let stylePromise = null;
let activeFinish = null;

/**
 * 确保确认框样式表只注入一次。
 */
function ensureConfirmStyles() {
  if (stylePromise) {
    return stylePromise;
  }
  const existingLink = document.querySelector(`link[data-ui-confirm-style="true"]`);
  if (existingLink) {
    stylePromise = Promise.resolve();
    return stylePromise;
  }
  stylePromise = new Promise(resolve => {
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = STYLE_HREF;
    styleLink.dataset.uiConfirmStyle = "true";
    // load / error 都放行：样式偶发失败时仍要弹出确认框，不能卡死业务。
    styleLink.addEventListener("load", () => resolve(), { once: true });
    styleLink.addEventListener("error", () => resolve(), { once: true });
    document.head.append(styleLink);
  });
  return stylePromise;
}

/**
 * 取（或创建）全局唯一的确认 <dialog>。
 */
function ensureConfirmDialog() {
  let dialogElement = document.getElementById(DIALOG_ID);
  if (dialogElement instanceof HTMLDialogElement) {
    return dialogElement;
  }
  dialogElement = document.createElement("dialog");
  dialogElement.id = DIALOG_ID;
  dialogElement.className = "ui-confirm-dialog";
  dialogElement.setAttribute("aria-modal", "true");
  dialogElement.innerHTML =
    '<div class="ui-confirm-dialog__heading">' +
    '<div><span data-ui-confirm="kicker"></span>' +
    '<h2 data-ui-confirm="title"></h2></div>' +
    '<button data-ui-confirm="close" class="ui-confirm-dialog__close" type="button" aria-label="关闭">×</button>' +
    "</div>" +
    '<div class="ui-confirm-dialog__body">' +
    '<div data-ui-confirm="panel" class="ui-confirm-dialog__panel">' +
    '<strong data-ui-confirm="message"></strong>' +
    '<p data-ui-confirm="detail" hidden></p>' +
    "</div>" +
    '<div class="ui-confirm-dialog__actions">' +
    '<button data-ui-confirm="cancel" type="button">取消</button>' +
    '<button data-ui-confirm="accept" type="button">确定</button>' +
    "</div></div>";
  document.body.append(dialogElement);
  return dialogElement;
}

/**
 * 弹出站内确认框，行为对齐原生 confirm：取消 / Esc / 遮罩 → false。
 */
export async function confirmAction({
  kicker = "CONFIRM",
  title,
  message,
  detail = "",
  confirmLabel = "确定",
  cancelLabel = "取消",
  tone = "default"
} = {}) {
  await ensureConfirmStyles();
  // 上一个还开着时先按「取消」收掉，避免两个确认框叠在一起抢焦点。
  if (typeof activeFinish === "function") {
    activeFinish(false);
  }
  const dialogElement = ensureConfirmDialog();
  const pick = role => dialogElement.querySelector(`[data-ui-confirm="${role}"]`);
  const kickerElement = pick("kicker");
  const titleElement = pick("title");
  const messageElement = pick("message");
  const detailElement = pick("detail");
  const panelElement = pick("panel");
  const acceptButton = pick("accept");
  const cancelButton = pick("cancel");
  const closeButton = pick("close");

  kickerElement.textContent = kicker;
  titleElement.textContent = title || "";
  messageElement.textContent = message || "";
  detailElement.textContent = detail || "";
  detailElement.hidden = !detail;
  cancelButton.textContent = cancelLabel;
  acceptButton.textContent = confirmLabel;

  const normalizedTone = tone === "danger" || tone === "warning" ? tone : "default";
  dialogElement.dataset.tone = normalizedTone;
  panelElement.dataset.tone = normalizedTone;
  acceptButton.className =
    "ui-confirm-dialog__accept" +
    (normalizedTone === "danger"
      ? " is-danger"
      : normalizedTone === "warning"
        ? " is-warning"
        : " is-primary");

  return new Promise(resolve => {
    let isSettled = false;
    const finish = ok => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      activeFinish = null;
      acceptButton.onclick = null;
      cancelButton.onclick = null;
      closeButton.onclick = null;
      dialogElement.oncancel = null;
      dialogElement.onclose = null;
      if (dialogElement.open) {
        dialogElement.close();
      }
      resolve(!!ok);
    };
    activeFinish = finish;
    acceptButton.onclick = () => finish(true);
    cancelButton.onclick = () => finish(false);
    closeButton.onclick = () => finish(false);
    // Esc 会先触发 cancel；preventDefault 后仍走 finish(false)，与点取消一致。
    dialogElement.oncancel = cancelEvent => {
      cancelEvent.preventDefault();
      finish(false);
    };
    dialogElement.onclose = () => finish(false);
    if (typeof dialogElement.showModal === "function") {
      dialogElement.showModal();
    } else {
      dialogElement.setAttribute("open", "");
    }
    // 危险操作默认焦点放在取消上，避免回车误确认。
    (normalizedTone === "danger" ? cancelButton : acceptButton).focus();
  });
}
