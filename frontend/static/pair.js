import {
  parsePairingLink as parseScanLink,
  needsAppleInstallGuide as shouldShowInstallGuide
} from "./pairing-link.js";
const formElement = document.querySelector("#pair-form"),
  messageElement = document.querySelector("#message"),
  codeInput = formElement.elements.code,
  isScanMode = new URLSearchParams(location.search).get("scan") === "1";
shouldShowInstallGuide() && (document.querySelector("#apple-pair-note").hidden = !1);
function applyPairingHash() {
  const rawHash = window.__HA_BRIDGE_PAIRING_HASH__ || location.hash;
  if (
    (delete window.__HA_BRIDGE_PAIRING_HASH__,
    location.hash && history.replaceState(null, "", location.pathname + location.search),
    !(!isScanMode || !rawHash))
  ) {
    ((codeInput.value = ""), (messageElement.hidden = !0));
    try {
      const pairingLink = parseScanLink(
        location.origin + location.pathname + location.search + rawHash
      );
      ((codeInput.value = pairingLink.code),
        (codeInput.closest("label").hidden = !0),
        (document.querySelector("#pair-title").textContent = "\u8FDE\u63A5 HomeOS"),
        (document.querySelector("#pair-description").textContent =
          "\u5DF2\u8BC6\u522B\u914D\u5BF9\u4E8C\u7EF4\u7801\uFF0C\u70B9\u51FB\u8FDE\u63A5\u5373\u53EF\u6253\u5F00\u4F60\u7684\u9762\u677F\u3002"),
        (formElement.querySelector('button[type="submit"] span').textContent = "\u8FDE\u63A5"));
    } catch (caughtError) {
      ((codeInput.closest("label").hidden = !1),
        (messageElement.textContent = caughtError.message),
        (messageElement.hidden = !1));
    }
  }
}
(window.addEventListener("homeos-pairing-link", applyPairingHash),
  applyPairingHash(),
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
  }),
  formElement.addEventListener("submit", async submitEvent => {
    (submitEvent.preventDefault(), (messageElement.hidden = !0));
    const submitButton = formElement.querySelector('button[type="submit"]');
    submitButton.disabled = !0;
    try {
      const response = await fetch("/api/v1/displays/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeInput.value })
        }),
        payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload.detail ||
            "\u914D\u5BF9\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u914D\u5BF9\u7801\u3002"
        );
      if (!/^\/display\/[A-Za-z0-9_-]+$/.test(payload.targetUrl || ""))
        throw new Error("\u670D\u52A1\u8FD4\u56DE\u7684\u9762\u677F\u5730\u5740\u65E0\u6548\u3002");
      codeInput.value = "";
      const needsInstallGuide = shouldShowInstallGuide(
        navigator,
        window.matchMedia("(display-mode: standalone)").matches
      );
      window.location.replace(payload.targetUrl + (needsInstallGuide ? "?addToHome=1" : ""));
    } catch (submitError) {
      ((messageElement.textContent = submitError.message),
        (messageElement.hidden = !1),
        (submitButton.disabled = !1));
    }
  }));
