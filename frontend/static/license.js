/**
 * 授权页（/license）逻辑。
 *
 * 位置：未授权 / 授权失效时后端把请求跳转到此页。
 * 职责：轮询 /api/v1/license/status 判断是否已可进入编辑器，处理激活码提交，
 *   并提供退出本机登录入口。
 * 约定：5 秒轮询一次状态，但满足任一条件就跳过这一拍 —— 激活请求进行中
 *   （activationPending）、即将跳转（navigating）、或上一次状态请求还在飞
 *   （isLoadingStatus）。进入编辑器用 location.replace，防止用户按返回键回到授权页。
 * 约定：状态与激活请求都走 utils/api-fetch.js（20 秒超时）。这把「在飞闩」与超时是
 *   一对：只有闩没有超时，一次弱网就把轮询永久冻住；只有超时没有闩，弱网下每 5 秒
 *   就再叠一个同源请求上去，把本来就差的网络压得更差。
 */
import { apiFetch } from "./utils/api-fetch.js?v=20260919135340";

const form = document.querySelector("#license-form"),
  message = document.querySelector("#message"),
  statusText = document.querySelector("#license-status-text"),
  recoveryHint = document.querySelector("#license-recovery-hint"),
  submit = form.querySelector('button[type="submit"]'),
  logout = document.querySelector("#logout");

// activationPending 防止重复提交激活码；navigating 防止跳转前重复发轮询请求；
// isLoadingStatus 防止「上一次还没回来就再发一次」（弱网下会越堆越多）。
let activationPending = !1,
  navigating = !1,
  isLoadingStatus = !1,
  statusTimer = null;

// 已确定可以进入编辑器：停掉轮询再跳转，避免跳转瞬间又发一次状态请求。
function enterEditor() {
  navigating ||
    ((navigating = !0),
    statusTimer !== null && window.clearInterval(statusTimer),
    window.location.replace("/"));
}

/**
 * 从错误响应里提取可读文案。
 *
 * @param {object} errorResponse 后端响应体。
 * @param {string} fallbackMessage 兜底文案。
 * @returns {string} detail 为字符串时直接用；为对象时取 message；否则用兜底文案。
 */
function errorMessage(errorResponse, fallbackMessage) {
  return typeof errorResponse?.detail == "string"
    ? errorResponse.detail
    : typeof errorResponse?.detail?.message == "string"
      ? errorResponse.detail.message
      : fallbackMessage;
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
  if (statusResponse.status === 401) {
    window.location.replace("/login");
    return;
  }
  // 非 JSON 响应按空对象处理，走下方统一错误分支。
  const statusPayload = await statusResponse.json().catch(() => ({}));
  if (!statusResponse.ok)
    throw new Error(errorMessage(statusPayload, "无法读取授权状态。"));
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
    setRecoveryHint(statusPayload.status || "");
    return;
  }
  if (statusPayload.allowed) {
    statusText.textContent =
      "当前授权有效，但未包含编辑器权益，请联系授权管理员。";
    setRecoveryHint("");
    return;
  }
  // 各状态码对应一句面向用户的中文说明，与后端 license/service.py 的状态枚举保持一致。
  // 优先展示服务端 lastError（含硬件指纹升级迁移说明），本地文案仅作兜底。
  const STATUS_MESSAGES = {
    UNACTIVATED: "当前设备尚未激活，激活后才能进入编辑器。",
    LEASE_EXPIRED: "授权租约已经到期，请恢复网络后点击重新激活，或重新填写激活码。",
    INSTANCE_MISMATCH:
      "本机硬件指纹与授权绑定不一致（升级、换机或硬件变更后常见）。请先在商店账号中心解除设备绑定，冷却结束后用同一激活码在本页重新激活。",
    CLOCK_ROLLBACK: "检测到系统时间回拨，请校准时间后重新验证。",
    STARTUP_VALIDATION_REQUIRED:
      "服务重启后正在等待授权后台确认，请恢复网络；成功后会自动进入系统。",
    CONNECTION_WARNING: "授权服务器连接异常，请检查网络后点击重新激活。",
    DEACTIVATED: "授权已在后台停用或释放，请使用有效激活码重新激活。",
    INVALID: "本地授权凭证无效，请重新激活。",
    REVOKED: "授权已停用或已在商店解绑，请输入有效激活码重新激活。"
  };
  const statusCode = statusPayload.status || "";
  statusText.textContent =
    (typeof statusPayload.lastError === "string" && statusPayload.lastError.trim()) ||
    STATUS_MESSAGES[statusCode] ||
    "当前授权不可用，请输入激活码。";
  setRecoveryHint(statusCode);
}

/**
 * 带「在飞去重闩」地查一次授权状态。
 *
 * 为什么闩必须在这里而不是在定时器回调里：初始加载与 5 秒轮询是同一个入口的两种
 * 触发方式，闩只加在定时器那一支，初始那次就会和第一拍叠在一起（也正是本页最早的
 * 形态）。超时会由 apiFetch 抛出，所以「闩 + 超时」一起才成立：闩保证不叠加，
 * 超时保证闩一定会被放掉（否则一次弱网就把轮询永久冻住）。
 *
 * @returns {Promise<void>} 请求结束即返回；失败时抛出可读错误，由调用方写进状态栏。
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

// 一次性挂上三类监听：表单激活、退出本机登录、以及 5 秒轮询状态。
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
        throw new Error(errorMessage(activatePayload, "激活失败。"));
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
  logout.addEventListener("click", async () => {
    // 退出失败（网络异常）也照样跳登录页，避免用户卡在授权页。
    (await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {}),
      window.location.replace("/login"));
  }),
  refreshStatus().catch(loadError => {
    statusText.textContent = loadError.message;
  }),
  // 5e3 = 5 秒；轮询间隔固定，不用退避，因为授权页通常很快被离开。
  (statusTimer = window.setInterval(() => {
    // 激活请求进行中不再轮询，避免状态互相覆盖；上一次状态请求还没回来则整拍跳过
    // （重发由 refreshStatus 自己的闩拦下，这里省掉一次无谓的调用）。
    activationPending ||
      refreshStatus().catch(refreshError => {
        statusText.textContent = refreshError.message;
      });
  }, 5e3)));
