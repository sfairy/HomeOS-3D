import {
  parsePairingLink as parsePairingLink,
  needsAppleInstallGuide as needsAppleInstallGuide,
} from "./pairing-link";
import {
  validEmbedUrl as validEmbedUrl,
  rememberEmbedSession as rememberEmbedSession,
  resumeEmbedSession as resumeEmbedSession,
  embeddedCookieAvailable as embeddedCookieAvailable,
} from "../embed/embed-session";
import type { DomControl } from "@app/utils/dom-control";

/**
 * 配对页引导。由 `PairView.vue` 在挂载时调用，返回清理函数以摘掉全局监听。
 *
 * `pairing-entry`（经典脚本）负责在任何模块之前把 `#code=` 摘进
 * `window.__HOMEOS_PAIRING_HASH__`，这里只消费它。
 */
export function initPair(): () => void {
  const pairFormElement = document.querySelector<DomControl>("#pair-form"),
    messageElement = document.querySelector<DomControl>("#message"),
    codeFieldElement = pairFormElement.elements.code,
    isScanMode = new URLSearchParams(location.search).get("scan") === "1",
    isEmbedded =
      new URLSearchParams(location.search).get("embed") === "1" || window.self !== window.top,
    nextUrl = new URLSearchParams(location.search).get("next") || "",
    projectId =
      new URLSearchParams(location.search).get("projectId") ||
      /^\/display\/([A-Za-z0-9_-]+)(?:\?|$)/.exec(nextUrl)?.[1];
  !isEmbedded &&
    needsAppleInstallGuide() &&
    (document.querySelector<DomControl>("#apple-pair-note").hidden = false);
  isEmbedded &&
    ((document.querySelector<DomControl>("#pair-title").textContent = "连接 HA 仪表盘"),
    (document.querySelector<DomControl>("#pair-description").textContent =
      "输入这个仪表盘的配对码。建议为 HA 单独创建配对码，复用其他设备的码会替换其配对。"));

  function applyPairingLink() {
    const pairingHash = window.__HOMEOS_PAIRING_HASH__ || location.hash;
    if (
      (delete window.__HOMEOS_PAIRING_HASH__,
      location.hash && history.replaceState(null, "", location.pathname + location.search),
      !(!isScanMode || !pairingHash))
    ) {
      ((codeFieldElement.value = ""), (messageElement.hidden = true));
      try {
        const pairing = parsePairingLink(
          location.origin + location.pathname + location.search + pairingHash,
        );
        ((codeFieldElement.value = pairing.code),
          (codeFieldElement.closest(".hos-field").hidden = true),
          (document.querySelector<DomControl>("#pair-title").textContent = "连接 HomeOS"),
          (document.querySelector<DomControl>("#pair-description").textContent =
            "已识别配对二维码，点击连接即可打开你的面板。"),
          (pairFormElement.querySelector<DomControl>('button[type="submit"]').textContent = "连接"));
      } catch (linkError) {
        ((codeFieldElement.closest(".hos-field").hidden = false),
          (messageElement.textContent = linkError.message),
          (messageElement.hidden = false));
      }
    }
  }

  window.addEventListener("homeos-pairing-link", applyPairingLink);
  applyPairingLink();

  if (isEmbedded && nextUrl) {
    const submitButtonElement = pairFormElement.querySelector<DomControl>('button[type="submit"]');
    ((submitButtonElement.disabled = true),
      resumeEmbedSession(nextUrl, fetch, projectId)
        .then((redirectUrl) => {
          redirectUrl && window.location.replace(redirectUrl);
        })
        .finally(() => {
          submitButtonElement.disabled = false;
        }));
  }

  codeFieldElement.addEventListener("input", () => {
    codeFieldElement.value = codeFieldElement.value.replace(/\D/g, "").slice(0, 6);
  });

  pairFormElement.addEventListener("submit", async (submitEvent) => {
    (submitEvent.preventDefault(), (messageElement.hidden = true));
    const activeSubmitButtonElement = pairFormElement.querySelector<DomControl>('button[type="submit"]');
    activeSubmitButtonElement.disabled = true;
    try {
      const response = await fetch("/api/v1/displays/pair", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: codeFieldElement.value,
            ...(isEmbedded
              ? {
                  embedded: true,
                  ...(projectId
                    ? {
                        projectId: projectId,
                      }
                    : {}),
                }
              : {}),
          }),
        }),
        payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "配对失败，请检查配对码。");
      if (!/^\/display\/[A-Za-z0-9_-]+$/.test(payload.targetUrl || ""))
        throw new Error("服务返回的面板地址无效。");
      if (isEmbedded) {
        if (!validEmbedUrl(payload.embedUrl, payload.device.projectId))
          throw new Error("服务返回的嵌入地址无效。");
        rememberEmbedSession(payload.embedUrl, [nextUrl, payload.targetUrl]);
        const canUseCookie = await embeddedCookieAvailable(payload.device.projectId);
        window.location.replace(canUseCookie ? payload.targetUrl + "?embed=1" : payload.embedUrl);
        return;
      }
      codeFieldElement.value = "";
      const shouldAddToHome = needsAppleInstallGuide(
        navigator,
        window.matchMedia("(display-mode: standalone)").matches,
      );
      window.location.replace(payload.targetUrl + (shouldAddToHome ? "?addToHome=1" : ""));
    } catch (submitError) {
      ((messageElement.textContent = submitError.message),
        (messageElement.hidden = false),
        (activeSubmitButtonElement.disabled = false));
    }
  });

  return () => window.removeEventListener("homeos-pairing-link", applyPairingLink);
}
