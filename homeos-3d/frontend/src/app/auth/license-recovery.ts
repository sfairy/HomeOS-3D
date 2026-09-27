/**
 * 授权恢复：文案表 + 轻量请求封装 + 恢复页（/license-recovery）自举。
 */

const REQUEST_TIMEOUT_MS = 15000;
// 自动复查间隔。取 5 秒是为了与授权页轮询同一节奏；恢复页通常很快被离开，不需要退避。
const RECHECK_INTERVAL_MS = 5000;
// 后端在恢复流程中给出的「稍后再点」节流窗口（秒），仅用于把剩余时间说清楚。
const RATE_LIMITED_HINT = "LICENSE_RATE_LIMITED";

const STATUS_MESSAGES: Record<string, string> = {
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
  CONNECTION_WARNING: "暂时无法完成授权联网验证，后台会自动重试；仅在本地租约有效期内继续使用。",
  ACTIVE: "授权有效，正在打开页面…"
};

export type LicenseState = {
  status?: string;
  errorCode?: string;
  retrying?: boolean;
  retryable?: boolean;
  nextRetryAt?: string;
  retryAttempt?: number;
  displayAllowed?: boolean;
  canRetry?: boolean;
  editorAllowed?: boolean;
  allowed?: boolean;
  lastError?: unknown;
};

type LicenseRequestError = Error & {
  status?: number;
  retryable?: boolean;
};

type LicenseRequestPayload = {
  detail?:
    | string
    | {
        message?: unknown;
        retryable?: boolean;
      };
};

/**
 * 把后端授权状态翻译成一句给用户看的话。
 */
export function licenseMessage(state: LicenseState = {}, detail = ""): string {
  let message = detail || (state.status ? STATUS_MESSAGES[state.status] : undefined) || "正在读取授权状态…";
  if (state.errorCode === RATE_LIMITED_HINT) message += " 授权后台请求较多，请稍候。";
  if (state.retrying) {
    message += " 正在验证，请稍候。";
  } else if (state.retryable && state.nextRetryAt) {
    const seconds = Math.max(0, Math.ceil((Date.parse(state.nextRetryAt) - Date.now()) / 1000));
    // 时间戳可能已过期或不可解析，算出 NaN 就整段省略，不要显示「约 NaN 秒」。
    if (Number.isFinite(seconds)) {
      message += ` 第 ${Number(state.retryAttempt || 0) + 1} 次重试将在约 ${seconds} 秒后进行。`;
    }
  }
  return message;
}

/**
 * 带超时的 JSON 请求；失败一律抛 Error（带可选 status）。
 */
export async function licenseRequest(
  url: string,
  options: RequestInit = {},
): Promise<LicenseState> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, cache: "no-store", signal: controller.signal });
    const payload = (await response.json().catch(() => ({}))) as LicenseRequestPayload & LicenseState;
    if (!response.ok) {
      const detail = payload?.detail;
      const detailMessage =
        detail && typeof detail === "object" && detail !== null
          ? detail.message
          : undefined;
      const error: LicenseRequestError = new Error(
        response.status === 401
          ? "请登录管理端或使用仍有效的配对设备重试。"
          : (typeof detailMessage === "string" ? detailMessage : undefined) ||
            (typeof detail === "string" ? detail : "请求失败，请稍后重试。")
      );
      error.status = response.status;
      // 后端在 detail.retryable 里明确回答「再点有没有用」。透传出去，调用方才能
      if (detail && typeof detail === "object" && typeof detail.retryable === "boolean") {
        error.retryable = detail.retryable;
      }
      throw error;
    }
    return payload;
  } catch (caughtError: unknown) {
    // 已经有 status 的是上面构造的业务错误，原样上抛；其余（断网、超时、响应非 JSON）
    if (
      caughtError instanceof Error &&
      typeof (caughtError as LicenseRequestError).status === "number"
    ) {
      throw caughtError;
    }
    throw new Error("暂时连接不到 HA Bridge 服务，请检查网络；网络恢复后会自动检查。");
  } finally {
    clearTimeout(timer);
  }
}

// 只在恢复页存在时自举：本模块同时被 /license 引用，不能在那边也挂一套定时器。
const recoveryRoot = typeof document === "undefined" ? null : document.querySelector("#license-recovery");

if (recoveryRoot) {
  const messageCandidate = document.querySelector<HTMLElement>("#recovery-message");
  const errorElement = document.querySelector<HTMLElement>("#recovery-error");
  const retryCandidate = document.querySelector<HTMLButtonElement>("#recovery-retry");

  if (!messageCandidate || !retryCandidate) {
    throw new Error("授权恢复页缺少必要节点。");
  }

  const messageElement: HTMLElement = messageCandidate;
  const retryButton: HTMLButtonElement = retryCandidate;

  // inFlight 防重入（点击、online、定时器三个触发源会叠加）；
  let inFlight = false;
  let done = false;
  let recheckTimer: number | null = null;

  /** 状态色调：绿 = 通了、暖光 = 等着、珊瑚 = 挡住了。只切类名，不参与任何判定。 */
  const TONE_CLASSES = ["hos-tone--eco", "hos-tone--lumen", "hos-tone--alert"];

  function paintTone(tone: string | null | undefined): void {
    messageElement.classList.remove(...TONE_CLASSES);
    if (tone) messageElement.classList.add(`hos-tone--${tone}`);
  }

  function clearError(): void {
    if (!errorElement) return;
    errorElement.textContent = "";
    errorElement.hidden = true;
  }

  async function check(manual = false): Promise<void> {
    if (inFlight || done) return;
    if (recheckTimer !== null) window.clearTimeout(recheckTimer);
    inFlight = true;
    // 只有用户自己按下的那一次才置灰。自动自检每 5 秒一轮，也跟着置灰的话，
    if (manual) retryButton.disabled = true;
    if (manual) messageElement.textContent = "正在重新连接授权后台…";
    try {
      // 手动重试走 POST /retry（后端会忽略端点冷却），随后统一读 availability 取最新状态；
      const first = await licenseRequest(
        `/api/v1/license/${manual ? "retry" : "availability"}`,
        manual ? { method: "POST" } : {}
      );
      const state = manual ? await licenseRequest("/api/v1/license/availability") : first;
      clearError();
      if (state.displayAllowed) {
        done = true;
        // 「通了」是这一页唯一的高光时刻。原来它直接 reload，用户看到的是「一次无声的重载」
        messageElement.textContent = "授权已恢复，正在进入…";
        paintTone("eco");
        retryButton.hidden = true;
        window.setTimeout(() => window.location.reload(), 600);
        return;
      }
      messageElement.textContent = licenseMessage(state);
      // 指纹不匹配是「必须先去商店解绑」的终态，与「等着就会好」的等待态分开。
      paintTone(state.status === "INSTANCE_MISMATCH" ? "alert" : "lumen");
      // 后端说不可重试（终态）时把按钮藏起来：留着只会让用户反复点一个不会成功的按钮。
      retryButton.hidden = !state.canRetry;
    } catch (caughtError: unknown) {
      // 错误写进 #recovery-error 而不是状态行：状态句要继续说明「现在是什么情况」。
      const errorText =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      if (errorElement) {
        errorElement.textContent = errorText;
        errorElement.hidden = false;
      } else {
        messageElement.textContent = errorText;
      }
      paintTone("alert");
      // 后端明确说「再试也没用」（已进终态）时藏起按钮；其余错误（断网、超时）
      retryButton.hidden =
        caughtError instanceof Error &&
        (caughtError as LicenseRequestError).retryable === false;
    } finally {
      inFlight = false;
      retryButton.disabled = false;
      // done 时不再排下一拍：跳转或卸载已经发生，定时器只会空转。
      if (!done) recheckTimer = window.setTimeout(() => check(), RECHECK_INTERVAL_MS);
    }
  }

  retryButton.addEventListener("click", () => check(true));
  // 网络恢复是最常见的自愈时机：立刻查一次，不必等下一拍。
  window.addEventListener("online", () => check());
  // 页面进入后台就停掉自检（移动端会冻结定时器，留着只会在恢复时叠一堆请求）。
  window.addEventListener("pagehide", () => {
    done = true;
    if (recheckTimer !== null) window.clearTimeout(recheckTimer);
  });
  window.addEventListener("pageshow", () => {
    done = false;
    check();
  });
  check();
}
