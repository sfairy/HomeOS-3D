/**
 * 授权页（/license）逻辑：未授权 / 授权失效时由后端跳转至此。
 *
 * 轮询 /api/v1/license/status 判断是否可进入编辑器，处理激活码提交与退出本机登录。
 * 约定：5 秒轮询一次，但激活请求进行中（activationPending）、即将跳转（navigating）或上次
 * 状态请求还在飞（isLoadingStatus）时跳过这一拍。进入编辑器用 location.replace 防止返回键回到授权页。
 * 请求都走 utils/api-fetch.js（20 秒超时）：「在飞闩 + 超时」缺一不可 —— 无超时则弱网下轮询永久冻住，
 * 无闩则每 5 秒叠一个同源请求把网络压得更差。
 */
import { apiFetch } from "../utils/api-fetch.js?v=2609220052";
import { apiErrorMessage } from "../utils/api-error.js?v=2609220052";
import { apiAuthChallenge } from "../utils/api-request.js?v=2609220052";
// 状态文案表由 license-recovery.js 统一持有：授权页与恢复页必须说同一句话，
// 各存一份必然漂移 —— 用户在两处看到对同一状态的不同解释，就不知道该信哪个。
import { licenseMessage } from "./license-recovery.js?v=2609220052";

const form = document.querySelector("#license-form"),
  message = document.querySelector("#message"),
  statusText = document.querySelector("#license-status-text"),
  recoveryHint = document.querySelector("#license-recovery-hint"),
  retryButton = document.querySelector("#license-retry"),
  submit = form.querySelector('button[type="submit"]'),
  logout = document.querySelector("#logout");

// activationPending 防止重复提交激活码；retrying 防止重复点击「重试」；
// navigating 防止跳转前重复发轮询请求；isLoadingStatus 防止「上一次还没回来就再发一次」。
let activationPending = !1,
  retrying = !1,
  navigating = !1,
  isLoadingStatus = !1,
  statusTimer = null;

/**
 * 状态色调：把「现在处于什么状态」先交给颜色说一遍。
 * 只切表现层类名，不参与任何门禁判断 —— 颜色读错最多是误解，逻辑读错才是事故。
 */
const TONE_CLASSES = ["hos-tone--eco", "hos-tone--lumen", "hos-tone--alert"];

function paintTone(tone) {
  for (const element of [statusText, recoveryHint]) {
    if (!element) continue;
    element.classList.remove(...TONE_CLASSES);
    if (tone) element.classList.add(`hos-tone--${tone}`);
  }
}

// 已确定可以进入编辑器：停掉轮询再跳转，避免跳转瞬间又发一次状态请求。
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
    // 展示告警与「重新激活」，不能自动跳进首页。
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
  // 本地按状态码兜底，并叠加「限流 / 正在重试 / 第 N 次倒计时」三段实时提示。
  const statusCode = statusPayload.status || "";
  statusText.textContent = licenseMessage(
    statusPayload,
    typeof statusPayload.lastError === "string" ? statusPayload.lastError.trim() : ""
  );
  // 硬件指纹不匹配是唯一「必须先去商店解绑」的终态，与「等着就好」的等待态区分开。
  paintTone(statusCode === "INSTANCE_MISMATCH" ? "alert" : "lumen");
  setRecoveryHint(statusCode);
  // 后端说不可重试（已进终态）时藏起按钮：留一个必然失败的按钮，用户只会反复点，
  // 而真正该做的是输入激活码。
  retryButton.hidden = !statusPayload.canRetry;
}

/**
 * 带「在飞去重闩」地查一次授权状态。
 * 闩必须放在这里而非定时器回调：初始加载与 5 秒轮询是同一入口的两种触发方式，只加在定时器上
 * 会让初始那次与第一拍叠加。超时由 apiFetch 抛出，闩保证不叠加，超时保证闩一定会被放掉。
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
 *
 * 重试后再读一次状态而不是直接用 /retry 的响应体：这样「重试」与「轮询」共用同一条
 * 判定路径（含 enterEditor 跳转），不必再维护第二份「拿到状态后该怎么办」的逻辑。
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
    // 只改文案、不清空状态：失败原因由随后的 refreshStatus 用最新状态覆盖，
    // 避免把「刚才那一下失败」当成当前授权状态展示出来。
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
      // 复位无副作用）。激活请求是「防重复提交」的闩，漏放一次按钮就永久灰掉。
      ((submit.disabled = !1), (activationPending = !1));
    }
  }
}),
  retryButton.addEventListener("click", () => requestRetry()),
  logout.addEventListener("click", async () => {
    // 退出失败（网络异常）也照样跳登录页，避免用户卡在授权页。
    (await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {}),
      window.location.replace("/login"));
  }),
  refreshStatus().catch(loadError => {
    statusText.textContent = loadError.message;
    paintTone("alert");
  }),
  // 5e3 = 5 秒；轮询间隔固定，不用退避，因为授权页通常很快被离开。
  (statusTimer = window.setInterval(() => {
    // 激活或重试请求进行中不再轮询，避免状态互相覆盖；上一次状态请求还没回来则整拍跳过
    // （重发由 refreshStatus 自己的闩拦下，这里省掉一次无谓的调用）。
    activationPending ||
      retrying ||
      refreshStatus().catch(refreshError => {
        statusText.textContent = refreshError.message;
        paintTone("alert");
      });
  }, 5e3)));
