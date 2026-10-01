export function licenseMessage(state = {}) {
  let message =
    {
      UNACTIVATED: "当前服务尚未激活，请管理员激活 HA Bridge。",
      DEACTIVATED: "当前授权已停用，请管理员检查。",
      RECOVERY_RETRY: "授权后台拒绝了当前会话，正在再次验证；验证成功前暂不可使用。",
      RECOVERY_REQUIRED: "授权会话恢复失败，请管理员重新激活。已有项目和配对信息已保留。",
      REMOTE_REJECTED: "授权后台明确拒绝了当前请求，请管理员检查授权。",
      REVOKED: "授权已被停用或撤销，请联系管理员；重试网络不能解除此限制。",
      INSTANCE_MISMATCH: "授权与当前安装标识不匹配，请管理员检查安装数据。",
      CLOCK_ROLLBACK: "系统时间异常，请先校准服务器时间，再点击重新验证。",
      INVALID: "授权签名、密钥或本地凭证校验失败，请管理员检查；不会自动清除数据。",
      LEASE_EXPIRED: "本地授权租约已到期，暂不可使用；联网恢复成功后会自动打开。",
      STARTUP_VALIDATION_REQUIRED: "服务已启动，正在后台验证授权。本地有效授权可继续使用。",
      CONNECTION_WARNING:
        "暂时无法完成授权联网验证，后台会自动重试；仅在本地租约有效期内继续使用。",
      ACTIVE: "授权有效，正在打开页面…",
    }[state.status] || "正在读取授权状态…";
  if (
    (state.errorCode === "LICENSE_RATE_LIMITED" && (message += " 授权后台请求较多，请稍候。"),
    state.retrying)
  )
    message += " 正在验证，请稍候。";
  else if (state.retryable && state.nextRetryAt) {
    const seconds = Math.max(0, Math.ceil((Date.parse(state.nextRetryAt) - Date.now()) / 1000));
    Number.isFinite(seconds) &&
      (message += ` \u7B2C ${Number(state.retryAttempt || 0) + 1} \u6B21\u91CD\u8BD5\u5C06\u5728\u7EA6 ${seconds} \u79D2\u540E\u8FDB\u884C\u3002`);
  }
  return message;
}
export async function licenseRequest(url, options = {}) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
        ...options,
        cache: "no-store",
        signal: controller.signal,
      }),
      payload = await response.json();
    if (!response.ok) {
      const httpError = new Error(
        response.status === 401
          ? "请登录管理端或使用仍有效的配对设备重试。"
          : payload?.detail?.message ||
              (typeof payload?.detail == "string" ? payload.detail : "请求失败，请稍后重试。"),
      );
      throw ((httpError.status = response.status), httpError);
    }
    return payload;
  } catch (caughtError) {
    throw caughtError.status
      ? caughtError
      : new Error("暂时连接不到 HA Bridge 服务，请检查网络；网络恢复后会自动检查。");
  } finally {
    clearTimeout(timer);
  }
}
const recoveryRoot = typeof document > "u" ? null : document.querySelector("#license-recovery");
if (recoveryRoot) {
  const messageElement = document.querySelector("#recovery-message"),
    retryButton = document.querySelector("#recovery-retry");
  let inFlight = false,
    recheckTimer,
    done = false;
  async function check(manual = false) {
    if (!(inFlight || done)) {
      (clearTimeout(recheckTimer),
        (inFlight = true),
        (retryButton.disabled = true),
        manual && (messageElement.textContent = "正在重新连接授权后台…"));
      try {
        const firstState = await licenseRequest(
            `/api/v1/license/${manual ? "retry" : "availability"}`,
            manual
              ? {
                  method: "POST",
                }
              : {},
          ),
          latestState = manual ? await licenseRequest("/api/v1/license/availability") : firstState;
        if (latestState.displayAllowed) {
          ((done = true), window.location.reload());
          return;
        }
        ((messageElement.textContent = licenseMessage(latestState)),
          (retryButton.hidden = !latestState.canRetry));
      } catch (checkError) {
        ((messageElement.textContent = checkError.message), (retryButton.hidden = false));
      } finally {
        ((inFlight = false),
          (retryButton.disabled = false),
          done || (recheckTimer = setTimeout(() => check(), 5000)));
      }
    }
  }
  (retryButton.addEventListener("click", () => check(true)),
    window.addEventListener("online", () => check()),
    window.addEventListener("pagehide", () => {
      ((done = true), clearTimeout(recheckTimer));
    }),
    window.addEventListener("pageshow", () => {
      ((done = false), check());
    }),
    check());
}
