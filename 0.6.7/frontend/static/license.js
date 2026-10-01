import { licenseMessage, licenseRequest } from "./license-recovery.js?v=20260920-retry-v1";
const formElement = document.querySelector("#license-form"),
  messageElement = document.querySelector("#message"),
  statusElement = document.querySelector("#license-status-text"),
  retryButton = document.querySelector("#license-retry"),
  reactivateButton = document.querySelector("#license-reactivate"),
  submitButton = formElement.querySelector('button[type="submit"]'),
  logoutButton = document.querySelector("#logout");
let isLoadingStatus = false,
  navigating = false,
  pageHidden = false,
  statusTimer,
  reactivateRequested = false;
function applyStatus(statusPayload) {
  if (statusPayload.editorAllowed) {
    ((navigating = true), clearTimeout(statusTimer), window.location.replace("/"));
    return;
  }
  ((statusElement.textContent = statusPayload.allowed
    ? "当前授权有效，但未包含编辑器权益，请联系授权管理员。"
    : licenseMessage(statusPayload)),
    (retryButton.hidden = !statusPayload.canRetry));
  const isTerminalStatus = [
    "UNACTIVATED",
    "DEACTIVATED",
    "RECOVERY_REQUIRED",
    "REVOKED",
    "REMOTE_REJECTED",
    "INVALID",
    "INSTANCE_MISMATCH",
  ].includes(statusPayload.status);
  ((formElement.hidden = !reactivateRequested && !isTerminalStatus),
    (reactivateButton.hidden = !formElement.hidden));
}
function scheduleStatusPoll() {
  (clearTimeout(statusTimer),
    !pageHidden && !navigating && (statusTimer = setTimeout(() => refreshStatus(), 5000)));
}
async function refreshStatus(manual = false) {
  if (!(isLoadingStatus || pageHidden || navigating)) {
    ((isLoadingStatus = true),
      (retryButton.disabled = true),
      (submitButton.disabled = true),
      clearTimeout(statusTimer),
      manual && (statusElement.textContent = "正在重新连接授权后台…"));
    try {
      const fetchedStatus = await licenseRequest(
        "/api/v1/license/" + (manual ? "retry" : "status"),
        manual
          ? {
              method: "POST",
            }
          : {},
      );
      applyStatus(fetchedStatus);
    } catch (statusError) {
      statusError.status === 401
        ? ((navigating = true), window.location.replace("/login"))
        : ((statusElement.textContent = statusError.message), (retryButton.hidden = false));
    } finally {
      ((isLoadingStatus = false),
        (retryButton.disabled = false),
        (submitButton.disabled = false),
        scheduleStatusPoll());
    }
  }
}
(formElement.addEventListener("submit", async (submitEvent) => {
  if ((submitEvent.preventDefault(), !(isLoadingStatus || navigating))) {
    ((isLoadingStatus = true),
      clearTimeout(statusTimer),
      (messageElement.hidden = true),
      (submitButton.disabled = true),
      (retryButton.disabled = true));
    try {
      const activatePayload = await licenseRequest("/api/v1/license/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: String(new FormData(formElement).get("email") || "").trim(),
          activationCode: String(new FormData(formElement).get("activationCode") || "").trim(),
        }),
      });
      applyStatus(activatePayload);
    } catch (activateError) {
      ((messageElement.textContent = activateError.message), (messageElement.hidden = false));
    } finally {
      ((isLoadingStatus = false),
        (submitButton.disabled = false),
        (retryButton.disabled = false),
        scheduleStatusPoll());
    }
  }
}),
  retryButton.addEventListener("click", () => refreshStatus(true)),
  reactivateButton.addEventListener("click", () => {
    ((reactivateRequested = true),
      (formElement.hidden = false),
      (reactivateButton.hidden = true),
      formElement.elements.email.focus());
  }),
  logoutButton.addEventListener("click", async () => {
    (await fetch("/api/v1/auth/logout", {
      method: "POST",
    }).catch(() => {}),
      window.location.replace("/login"));
  }),
  window.addEventListener("online", () => refreshStatus()),
  window.addEventListener("pagehide", () => {
    ((pageHidden = true), clearTimeout(statusTimer));
  }),
  window.addEventListener("pageshow", () => {
    ((pageHidden = false), refreshStatus());
  }),
  refreshStatus());
