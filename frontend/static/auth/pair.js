/**
 * 设备配对落地页（/pair）逻辑：可手输 6 位配对码，也可由二维码链接带入。
 */
import {
  parsePairingLink as parseScanLink,
  needsAppleInstallGuide as shouldShowInstallGuide
} from "./pairing-link.js?v=2609271508";
import { apiFetch } from "../utils/api-fetch.js?v=2609271508";

const formElement = document.querySelector("#pair-form"),
  messageElement = document.querySelector("#message"),
  codeInput = formElement.elements.code,
  submitButton = formElement.querySelector('button[type="submit"]'),
  titleElement = document.querySelector("#pair-title"),
  descriptionElement = document.querySelector("#pair-description"),
  // scan=1 表示这次进入是扫码引导流程，才需要自动解析哈希里的配对码。
  isScanMode = new URLSearchParams(location.search).get("scan") === "1";

shouldShowInstallGuide() && (document.querySelector("#apple-pair-note").hidden = !1);

// 解析并应用地址栏 / 桥接缓存里的配对哈希。
function applyPairingHash() {
  const rawHash = window.__HA_BRIDGE_PAIRING_HASH__ || location.hash;
  // 先清掉缓存与地址栏哈希，防止刷新或重复派发事件时重复处理。
  if (
    (delete window.__HA_BRIDGE_PAIRING_HASH__,
    location.hash && history.replaceState(null, "", location.pathname + location.search),
    !(!isScanMode || !rawHash))
  ) {
    ((codeInput.value = ""), (messageElement.hidden = !0));
    try {
      // 二维码里的链接是完整 URL，这里用当前页地址补全后交给统一解析器校验。
      const pairingLink = parseScanLink(
        location.origin + location.pathname + location.search + rawHash
      );
      // 解析成功：把配对码填进输入框，再把焦点交给主操作按钮。
      ((codeInput.value = pairingLink.code),
        (titleElement.textContent = "连接 HomeOS"),
        (descriptionElement.textContent =
          "已识别配对二维码，点击连接即可打开你的面板。"),
        (formElement.querySelector('button[type="submit"] span').textContent = "连接"),
        submitButton.focus({ preventScroll: !0 }));
    } catch (caughtError) {
      ((messageElement.textContent = caughtError.message),
        (messageElement.hidden = !1));
    }
  }
}

// 一次性挂上四个监听：桥接事件、初始哈希处理、配对码输入过滤、表单提交。
(window.addEventListener("homeos-pairing-link", applyPairingHash),
  applyPairingHash(),
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
  }),
  formElement.addEventListener("submit", async submitEvent => {
    (submitEvent.preventDefault(), (messageElement.hidden = !0));
    // 请求期间禁用按钮，防止重复配对同一台设备。
    submitButton.disabled = !0;
    try {
      // 非 JSON 响应按空对象处理，走统一错误文案。
      const response = await apiFetch("/api/v1/displays/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeInput.value })
        }),
        payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload.detail ||
            "配对失败，请检查配对码。"
        );
      // 只允许跳到自己站点的 /display/xxx，防止服务端被污染后把用户带去外站。
      const panelUrl = new URL(payload.targetUrl || "", location.origin);
      if (
        panelUrl.origin !== location.origin ||
        !panelUrl.pathname.startsWith("/display/") ||
        panelUrl.pathname.length <= "/display/".length
      )
        throw new Error("服务返回的面板地址无效。");
      codeInput.value = "";
      const needsInstallGuide = shouldShowInstallGuide(
        navigator,
        window.matchMedia("(display-mode: standalone)").matches
      );
      // 需要引导添加到主屏时带上 addToHome=1，由展示页决定是否弹引导。
      window.location.replace(
        panelUrl.pathname + panelUrl.search + (needsInstallGuide ? "?addToHome=1" : "")
      );
    } catch (submitError) {
      ((messageElement.textContent = submitError.message),
        (messageElement.hidden = !1));
    } finally {
      submitButton.disabled = !1;
    }
  }));
