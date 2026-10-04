
import { licenseMessage, licenseRequest } from "./license-recovery";
import type { DomControl } from "@app/utils/dom-control";

/** 授权激活页引导。由 `LicenseView.vue` 在挂载时调用，返回清理函数。 */
export function initLicense(): () => void {
  const formElement = document.querySelector<DomControl>("#license-form"),
    messageElement = document.querySelector<DomControl>("#message"),
    statusElement = document.querySelector<DomControl>("#license-status-text"),
    recoveryHintElement = document.querySelector<DomControl>("#license-recovery-hint"),
    retryButton = document.querySelector<DomControl>("#license-retry"),
    reactivateButton = document.querySelector<DomControl>("#license-reactivate"),
    submitButton = formElement?.querySelector<DomControl>('button[type="submit"]'),
    logoutButton = document.querySelector<DomControl>("#logout");
  if (
    !formElement ||
    !messageElement ||
    !statusElement ||
    !recoveryHintElement ||
    !retryButton ||
    !submitButton ||
    !logoutButton
  )
    throw new Error("授权页缺少必要表单节点。");

  let isLoadingStatus = false,
    navigating = false,
    pageHidden = false,
    statusTimer,
    reactivateRequested = false;

  const TONE_CLASSES = ["hos-tone--lumen", "hos-tone--alert"];
  function paintTone(tone) {
    for (const toneElement of [statusElement, recoveryHintElement])
      (toneElement.classList.remove(...TONE_CLASSES),
        tone && toneElement.classList.add(`hos-tone--${tone}`));
  }

  function enterEditor() {
    navigating ||
      ((navigating = true), clearTimeout(statusTimer), window.location.replace("/"));
  }

  function setRecoveryHint(statusCode) {
    recoveryHintElement.hidden = statusCode !== "INSTANCE_MISMATCH";
    recoveryHintElement.textContent =
      statusCode === "INSTANCE_MISMATCH"
        ? "处理步骤：打开商店账号中心 → 解除设备绑定 → 回到本页，用商店购买邮箱与激活码重新激活。解绑后即可立即激活，无需等待；解绑冷却只约束「下一次解绑」，不影响重新激活。本页邮箱是商店账号；顶栏「退出本机登录」只退出本机管理员会话。"
        : "";
  }

  const TERMINAL_STATUSES = [
    "UNACTIVATED",
    "DEACTIVATED",
    "RECOVERY_REQUIRED",
    "REVOKED",
    "REMOTE_REJECTED",
    "INVALID",
    "INSTANCE_CHANGED",
    "INSTANCE_MISMATCH",
  ];

  function applyStatus(statusPayload) {
    if (statusPayload.status === "ACTIVE" && statusPayload.editorAllowed) {
      enterEditor();
      return;
    }
    if (statusPayload.editorAllowed) {
      statusElement.textContent =
        (typeof statusPayload.lastError === "string" && statusPayload.lastError.trim()) ||
        "授权连接异常，请重新连接授权后台后再进入编辑器。";
      paintTone("lumen");
      setRecoveryHint(statusPayload.status || "");
    } else if (statusPayload.allowed) {
      statusElement.textContent = "当前授权有效，但未包含编辑器权益，请联系授权管理员。";
      paintTone("lumen");
      setRecoveryHint("");
    } else {
      const statusCode = statusPayload.status || "";

      statusElement.textContent = licenseMessage(
        statusPayload,
        typeof statusPayload.lastError === "string" ? statusPayload.lastError.trim() : "",
      );

      paintTone(statusCode === "INSTANCE_MISMATCH" ? "alert" : "lumen");
      setRecoveryHint(statusCode);
    }
    const isTerminalStatus = TERMINAL_STATUSES.includes(statusPayload.status);

    formElement.hidden = !reactivateRequested && !isTerminalStatus;
    reactivateButton && (reactivateButton.hidden = !formElement.hidden);

    retryButton.hidden = !statusPayload.canRetry;
  }

  function scheduleStatusPoll() {
    (clearTimeout(statusTimer),
      !pageHidden && !navigating && (statusTimer = setTimeout(() => refreshStatus(), 5000)));
  }

  async function refreshStatus(manual = false) {
    if (isLoadingStatus || pageHidden || navigating) return;
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
      if (statusError.status === 401) {
        ((navigating = true), window.location.replace("/login"));
      } else {
        ((statusElement.textContent = statusError.message),
          paintTone("alert"),
          (retryButton.hidden = false),
          (formElement.hidden = false),
          reactivateButton && (reactivateButton.hidden = true),
          (submitButton.disabled = false));
      }
    } finally {
      ((isLoadingStatus = false),
        (retryButton.disabled = false),
        (submitButton.disabled = false),
        scheduleStatusPoll());
    }
  }

  const onSubmit = async (submitEvent) => {
    if ((submitEvent.preventDefault(), isLoadingStatus || navigating)) return;
    ((isLoadingStatus = true),
      clearTimeout(statusTimer),
      (messageElement.hidden = true),
      (submitButton.disabled = true),
      (retryButton.disabled = true));
    try {
      const formData = new FormData(formElement as HTMLFormElement),
        activatePayload = await licenseRequest("/api/v1/license/activate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: String(formData.get("email") || "").trim(),
            activationCode: String(formData.get("activationCode") || "").trim(),
          }),
        });

      if (activatePayload.status !== "ACTIVE" || !activatePayload.editorAllowed) {
        throw new Error(
          activatePayload.allowed || activatePayload.editorAllowed
            ? activatePayload.status === "ACTIVE"
              ? "激活成功，但当前商品未包含编辑器权益。"
              : "激活后授权仍未就绪，请点击重新激活或稍后再试。"
            : "激活后授权状态尚未生效，请稍后再试。",
        );
      }
      enterEditor();
    } catch (activateError) {
      ((messageElement.textContent = activateError.message), (messageElement.hidden = false));
    } finally {
      ((isLoadingStatus = false),
        (submitButton.disabled = false),
        (retryButton.disabled = false),
        scheduleStatusPoll());
    }
  };

  const onRetryClick = () => refreshStatus(true);
  const onReactivateClick = () => {
    ((reactivateRequested = true),
      (formElement.hidden = false),
      (reactivateButton.hidden = true),
      formElement.elements.email.focus());
  };
  const onLogoutClick = async () => {
    (await fetch("/api/v1/auth/logout", {
      method: "POST",
    }).catch(() => {}),
      window.location.replace("/login"));
  };
  const onOnline = () => refreshStatus();
  const onPageHide = () => {
    ((pageHidden = true), clearTimeout(statusTimer));
  };
  const onPageShow = () => {
    ((pageHidden = false), refreshStatus());
  };

  (formElement.addEventListener("submit", onSubmit),
    retryButton.addEventListener("click", onRetryClick),
    reactivateButton?.addEventListener("click", onReactivateClick),
    logoutButton.addEventListener("click", onLogoutClick),

    window.addEventListener("online", onOnline),
    window.addEventListener("pagehide", onPageHide),
    window.addEventListener("pageshow", onPageShow),
    refreshStatus());

  return () => {
    navigating = true;
    clearTimeout(statusTimer);
    formElement.removeEventListener("submit", onSubmit);
    retryButton.removeEventListener("click", onRetryClick);
    reactivateButton?.removeEventListener("click", onReactivateClick);
    logoutButton.removeEventListener("click", onLogoutClick);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
  };
}
