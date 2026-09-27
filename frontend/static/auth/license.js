/**
 * 授权页（/license）逻辑：未授权 / 授权失效时由后端跳转至此。
 */
import { apiFetch } from "../utils/api-fetch.js?v=2609271508";
import { apiErrorMessage } from "../utils/api-error.js?v=2609271508";
import { apiAuthChallenge } from "../utils/api-request.js?v=2609271508";
// 状态文案表由 license-recovery.js 统一持有：授权页与恢复页必须说同一句话，
import { licenseMessage } from "./license-recovery.js?v=2609271508";

const form = document.querySelector("#license-form"),
  message = document.querySelector("#message"),
  statusText = document.querySelector("#license-status-text"),
  recoveryHint = document.querySelector("#license-recovery-hint"),
  retryButton = document.querySelector("#license-retry"),
  submit = form.querySelector('button[type="submit"]'),
  logout = document.querySelector("#logout");

// activationPending 防止重复提交激活码；retrying 防止重复点击「重试」；
let activationPending = !1,
  retrying = !1,
  navigating = !1,
  isLoadingStatus = !1,
  statusTimer = null;

/**
 * 状态色调：把「现在处于什么状态」先交给颜色说一遍。
 */
const TONE_CLASSES = ["hos-tone--lumen", "hos-tone--alert"];

function paintTone(tone) {
  for (const element of [statusText, recoveryHint]) {
    if (!element) continue;
    element.classList.remove(...TONE_CLASSES);
    if (tone) element.classList.add(`hos-tone--${tone}`);
  }
}

function enterEditor() {
  navigating ||
    ((navigating = !0),
    statusTimer !== null && window.clearInterval(statusTimer),
    window.location.replace("/"));
}

function setRecoveryHint(statusCode) {
  if (!recoveryHint) return;
  if (statusCode === "INSTANCE_MISMATCH") {
    recoveryHint.hidden = !1;
    recoveryHint.textContent =
      "处理步骤：打开商店账号中心 → 解除设备绑定 → 冷却结束后回到本页，用商店购买邮箱与激活码重新激活。本页邮箱是商店账号；顶栏「退出本机登录」只退出本机管理员会话。";
    return;
  }
  recoveryHint.hidden = !0;
  recoveryHint.textContent = "";
}

// 读取一次授权状态并更新提示文案；可以进入编辑器时直接跳转。
async function loadStatus() {
  const statusResponse = await apiFetch("/api/v1/license/status", { cache: "no-store" });
  if (apiAuthChallenge(statusResponse.status, null) === "session-expired") {
    window.location.replace("/login");
    return;
  }
  // 非 JSON 响应按空对象处理，走下方统一错误分支。
  const statusPayload = await statusResponse.json().catch(() => ({}));
  if (!statusResponse.ok)
    throw new Error(apiErrorMessage(statusPayload, "无法读取授权状态。"));
  if (statusPayload.status === "ACTIVE" && statusPayload.editorAllowed) {
    enterEditor();
    return;
  }
  if (statusPayload.editorAllowed) {
    // CONNECTION_WARNING 等宽限态：编辑器门禁仍可能放行，但本页要留下
    statusText.textContent =
      statusPayload.lastError ||
      "授权连接异常，请重新激活后再进入编辑器。";
    paintTone("lumen");
    setRecoveryHint(statusPayload.status || "");
    return;
  }
  if (statusPayload.allowed) {
    statusText.textContent =
      "当前授权有效，但未包含编辑器权益，请联系授权管理员。";
    paintTone("lumen");
    setRecoveryHint("");
    return;
  }
  // 文案口径统一在 license-recovery.js：服务端 lastError（含硬件指纹升级迁移说明）优先，
  const statusCode = statusPayload.status || "";
  statusText.textContent = licenseMessage(
    statusPayload,
    typeof statusPayload.lastError === "string" ? statusPayload.lastError.trim() : ""
  );
  // 硬件指纹不匹配是唯一「必须先去商店解绑」的终态，与「等着就好」的等待态区分开。
  paintTone(statusCode === "INSTANCE_MISMATCH" ? "alert" : "lumen");
  setRecoveryHint(statusCode);
  // 后端说不可重试（已进终态）时藏起按钮：留一个必然失败的按钮，用户只会反复点，
  retryButton.hidden = !statusPayload.canRetry;
}

/**
 * 带「在飞去重闩」地查一次授权状态。
 */
async function refreshStatus() {
  if (isLoadingStatus || navigating) return;
  isLoadingStatus = !0;
  try {
    await loadStatus();
  } finally {
    isLoadingStatus = !1;
  }
}

/**
 * 「重新连接授权后台」：请求后端立刻重试一轮（会清掉端点冷却，不等下一拍轮询）。
 */
async function requestRetry() {
  // 激活请求进行中不插队：两条路径都会写授权状态，先到的那条可能被后到的那条覆盖。
  if (retrying || activationPending || navigating) return;
  retrying = !0;
  retryButton.disabled = !0;
  statusText.textContent = "正在重新连接授权后台…";
  try {
    const retryResponse = await apiFetch("/api/v1/license/retry", { method: "POST" });
    if (apiAuthChallenge(retryResponse.status, null) === "session-expired") {
      window.location.replace("/login");
      return;
    }
    const retryPayload = await retryResponse.json().catch(() => ({}));
    if (!retryResponse.ok)
      throw new Error(apiErrorMessage(retryPayload, "重新连接授权失败，请稍后再试。"));
  } catch (caughtError) {
    statusText.textContent = caughtError.message;
    paintTone("alert");
  } finally {
    // 与激活提交同理：重试闩漏放一次，按钮就永久灰掉，用户唯一自救入口被锁死。
    retrying = !1;
    retryButton.disabled = !1;
  }
  // 无论成败都把最新状态读回来：可能刚刚自己恢复了（跳转），也可能错误文案已过时。
  await refreshStatus().catch(() => {});
}

// 一次性挂上四类监听：表单激活、重新连接、退出本机登录、以及 5 秒轮询状态。
(form.addEventListener("submit", async submitEvent => {
  // 激活中或正在跳转时忽略重复提交。
  if ((submitEvent.preventDefault(), !(activationPending || navigating))) {
    ((activationPending = !0), (message.hidden = !0), (submit.disabled = !0));
    try {
      // 非 JSON 响应按空对象处理，走统一错误文案。
      const activateResponse = await apiFetch("/api/v1/license/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: String(new FormData(form).get("email") || "").trim(),
            activationCode: String(new FormData(form).get("activationCode") || "").trim()
          })
        }),
        activatePayload = await activateResponse.json().catch(() => ({}));
      if (!activateResponse.ok)
        throw new Error(apiErrorMessage(activatePayload, "激活失败。"));
      if (activatePayload.status !== "ACTIVE" || !activatePayload.editorAllowed)
        // 区分「授权有效但不含编辑器权益」与「激活尚未生效」，两种提示给用户的动作不同。
        throw new Error(
          activatePayload.allowed || activatePayload.editorAllowed
            ? activatePayload.status === "ACTIVE"
              ? "激活成功，但当前商品未包含编辑器权益。"
              : "激活后授权仍未就绪，请点击重新激活或稍后再试。"
            : "激活后授权状态尚未生效，请稍后再试。"
        );
      enterEditor();
    } catch (caughtError) {
      ((message.textContent = caughtError.message), (message.hidden = !1));
    } finally {
      // 失败要复位让用户改激活码重试；成功/超时/异常穿透也都复位（跳转已发生，
      ((submit.disabled = !1), (activationPending = !1));
    }
  }
}),
  retryButton.addEventListener("click", () => requestRetry()),
  logout.addEventListener("click", async () => {
    (await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {}),
      window.location.replace("/login"));
  }),
  refreshStatus().catch(loadError => {
    statusText.textContent = loadError.message;
    paintTone("alert");
  }),
  (statusTimer = window.setInterval(() => {
    activationPending ||
      retrying ||
      refreshStatus().catch(refreshError => {
        statusText.textContent = refreshError.message;
        paintTone("alert");
      });
  }, 5e3)));
