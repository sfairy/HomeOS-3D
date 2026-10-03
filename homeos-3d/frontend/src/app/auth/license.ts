// 授权页（/license）逻辑：未授权 / 授权失效 / 未含编辑器权益时由后端跳转至此。
//
// 文案口径统一在 license-recovery.js：授权页与恢复页必须说同一句话，
// 否则同一个状态在两页上会有两种说法，用户只会以为是两个问题。
// ?v= 必须与 license-recovery.html 的 <script> 标签逐字一致：不一致会让浏览器把同一个文件
// 按两个 URL 各取一份，恢复页的定时器模块与这里的文案模块就成了两份互不相干的实例。
import { licenseMessage, licenseRequest } from "./license-recovery";
import type { DomControl } from "@app/utils/dom-control";

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

// isLoadingStatus 防重入（点击、轮询、online 三个触发源会叠加）；
// navigating 置真后所有定时器与请求都停：跳转已经在飞，再发请求只会写坏状态。
let isLoadingStatus = false,
  navigating = false,
  pageHidden = false,
  statusTimer,
  // reactivateRequested：用户点过「重新激活」后表单要一直留着，不能被状态刷新再藏起来。
  reactivateRequested = false;

// 状态色调：把「现在处于什么状态」先交给颜色说一遍。只切类名，不参与任何判定。
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
  // INSTANCE_MISMATCH 是唯一「必须先去商店解绑」的终态（服务端 409 确认的绑定冲突），
  // 步骤多且容易搞错，必须逐条写出来。本机指纹变化的 INSTANCE_CHANGED 只需重新激活，
  // 不能套这套步骤 —— 本地并不知道商店那边有没有绑定。
  recoveryHintElement.hidden = statusCode !== "INSTANCE_MISMATCH";
  recoveryHintElement.textContent =
    statusCode === "INSTANCE_MISMATCH"
      ? "处理步骤：打开商店账号中心 → 解除设备绑定 → 回到本页，用商店购买邮箱与激活码重新激活。解绑后即可立即激活，无需等待；解绑冷却只约束「下一次解绑」，不影响重新激活。本页邮箱是商店账号；顶栏「退出本机登录」只退出本机管理员会话。"
      : "";
}

// 是否属于「只能靠重新输入激活码解决」的终态：它决定激活表单默认是否展开。
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
    // CONNECTION_WARNING 等宽限态：编辑器门禁仍可能放行，但本页要留下服务端给的最近原因。
    statusElement.textContent =
      (typeof statusPayload.lastError === "string" && statusPayload.lastError.trim()) ||
      "授权连接异常，请重新连接授权后台后再进入编辑器。";
    paintTone("lumen");
    setRecoveryHint(statusPayload.status || "");
  } else if (statusPayload.allowed) {
    // 「授权有效但不含编辑器权益」与「授权没生效」是两件事：前者要找授权管理员换码，
    // 后者只要再试一次，所以文案与色调都不共用下面那条分支。
    statusElement.textContent = "当前授权有效，但未包含编辑器权益，请联系授权管理员。";
    paintTone("lumen");
    setRecoveryHint("");
  } else {
    const statusCode = statusPayload.status || "";
    // 服务端 lastError（含硬件指纹升级迁移说明）优先于状态码的通用文案。
    statusElement.textContent = licenseMessage(
      statusPayload,
      typeof statusPayload.lastError === "string" ? statusPayload.lastError.trim() : "",
    );
    // 指纹不匹配要引导人工介入，用告警色；其余等待态用暖光，暗示「等着就会好」。
    paintTone(statusCode === "INSTANCE_MISMATCH" ? "alert" : "lumen");
    setRecoveryHint(statusCode);
  }
  const isTerminalStatus = TERMINAL_STATUSES.includes(statusPayload.status);
  // 终态才默认展开激活表单；用户主动点过「重新激活」就保持展开，不被后续刷新收回。
  formElement.hidden = !reactivateRequested && !isTerminalStatus;
  reactivateButton && (reactivateButton.hidden = !formElement.hidden);
  // 后端说不可重试（已进终态）时藏起按钮：留一个必然失败的按钮，用户只会反复点。
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
    // 401 说明本机管理员会话也失效了：先去登录，留在这一页什么也做不了。
    if (statusError.status === 401) {
      ((navigating = true), window.location.replace("/login"));
    } else {
      // 「读不到状态」不等于「现在不该激活」：把表单交还给用户。否则这一页只剩一颗重试按钮，
      // 网络一直不通时，用户连输激活码自救的入口都没有。
      ((statusElement.textContent = statusError.message),
        paintTone("alert"),
        (retryButton.hidden = false),
        (formElement.hidden = false),
        // 与 applyStatus 同一条不变量：重新激活按钮只在表单藏起来时出场。
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

(formElement.addEventListener("submit", async (submitEvent) => {
  // 激活中或正在跳转时忽略重复提交：两条路径都会写授权状态，后到的可能覆盖先到的结果。
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
    // 「激活成功」必须同时满足 ACTIVE + editorAllowed：只判 HTTP 200 会让「码对了但商品
    // 不含编辑器」的安装直接跳进编辑器，然后在门禁那里被弹回来，用户看不懂发生了什么。
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
    // 失败要复位让用户改激活码重试；成功 / 异常穿透也都复位（跳转已发生）。
    ((isLoadingStatus = false),
      (submitButton.disabled = false),
      (retryButton.disabled = false),
      scheduleStatusPoll());
  }
}),
  retryButton.addEventListener("click", () => refreshStatus(true)),
  reactivateButton?.addEventListener("click", () => {
    // 这一下只是「展开本地激活表单」：真正的自动重激活走编辑器首页的按钮，
    // 那里有完整上下文（已登录、能展示进度），授权页只负责把入口露出来。
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
  // 网络恢复是最常见的自愈时机：立刻查一次，不必等下一拍。
  window.addEventListener("online", () => refreshStatus()),
  window.addEventListener("pagehide", () => {
    ((pageHidden = true), clearTimeout(statusTimer));
  }),
  window.addEventListener("pageshow", () => {
    ((pageHidden = false), refreshStatus());
  }),
  refreshStatus());
