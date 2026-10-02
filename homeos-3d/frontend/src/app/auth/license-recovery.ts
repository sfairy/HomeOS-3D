import type { DomControl } from "@app/utils/dom-control";
// 授权恢复：文案表 + 轻量请求封装 + 恢复页（/license-recovery）自举。
//
// 本模块同时被授权页（/license）复用，所以顶层只做导出，恢复页的定时器与监听
// 全部包在「#license-recovery 存在」的判断里 —— 否则授权页会莫名多挂一套轮询。
const REQUEST_TIMEOUT_MS = 15000;
// 自动复查间隔：与授权页轮询同一节奏。恢复页通常很快被离开，不需要退避。
const RECHECK_INTERVAL_MS = 5000;
// 后端在恢复流程中给出的「稍后再点」节流窗口（秒），仅用于把等待说清楚。
const RATE_LIMITED_HINT = "LICENSE_RATE_LIMITED";

const STATUS_MESSAGES = {
  UNACTIVATED: "当前服务尚未激活，请管理员激活 HomeOS。",
  DEACTIVATED: "当前授权已停用，请管理员检查。",
  RECOVERY_RETRY: "授权后台拒绝了当前会话，正在再次验证；验证成功前暂不可使用。",
  RECOVERY_REQUIRED: "授权会话恢复失败，请管理员重新激活。已有项目和配对信息已保留。",
  REMOTE_REJECTED: "授权后台明确拒绝了当前请求，请管理员检查授权。",
  REVOKED: "授权已被停用或撤销，请联系管理员；重试网络不能解除此限制。",
  INSTANCE_CHANGED: "本机安装标识已变化，请重新激活授权。",
  INSTANCE_MISMATCH: "该授权已绑定其他设备，请先到商店账号中心解除绑定后重新激活。",
  CLOCK_ROLLBACK: "系统时间异常，请先校准服务器时间，再点击重新验证。",
  INVALID: "授权签名、密钥或本地凭证校验失败，请管理员检查；不会自动清除数据。",
  LEASE_EXPIRED: "本地授权租约已到期，暂不可使用；联网恢复成功后会自动打开。",
  STARTUP_VALIDATION_REQUIRED: "服务已启动，正在后台验证授权。本地有效授权可继续使用。",
  CONNECTION_WARNING:
    "暂时无法完成授权联网验证，后台会自动重试；仅在本地租约有效期内继续使用。",
  ACTIVE: "授权有效，正在打开页面…",
};

/** 授权恢复流程里读取到的服务端状态（字段按后端返回增量填充）。 */
type LicenseRecoveryState = {
  /** 授权状态码，如 ACTIVE / LEASE_EXPIRED。 */
  status?: string;
  /** 细分错误码，用来叠加限流等提示。 */
  errorCode?: string;
  /** 是否正在重试中。 */
  retrying?: boolean;
  /** 是否值得重试（后端 detail.retryable 透传）。 */
  retryable?: boolean;
  /** 下次重试时间（ISO 字符串）。 */
  nextRetryAt?: string;
  /** 已重试次数。 */
  retryAttempt?: number;
};

/** 授权请求失败时抛出的错误：在 Error 上挂了 status / retryable。 */
type LicenseRequestError = Error & {
  /** HTTP 状态码。 */
  status?: number;
  /** 后端标注的重试是否有意义。 */
  retryable?: boolean;
};

export function licenseMessage(state: LicenseRecoveryState = {}, detail = "") {
  // 文案优先级：调用方给的细节（多为服务端 lastError）→ 状态码文案 → 兜底。
  let message = detail || (state.status && STATUS_MESSAGES[state.status]) || "正在读取授权状态…";
  state.errorCode === RATE_LIMITED_HINT && (message += " 授权后台请求较多，请稍候。");
  if (state.retrying) message += " 正在验证，请稍候。";
  else if (state.retryable && state.nextRetryAt) {
    const seconds = Math.max(0, Math.ceil((Date.parse(state.nextRetryAt) - Date.now()) / 1000));
    // 时间戳可能已过期或不可解析，算出 NaN 就整段省略，不要显示「约 NaN 秒」。
    Number.isFinite(seconds) &&
      (message += ` 第 ${Number(state.retryAttempt || 0) + 1} 次重试将在约 ${seconds} 秒后进行。`);
  }
  return message;
}

export async function licenseRequest(url, options = {}) {
  // 带超时的 JSON 请求；失败一律抛 Error（带可选 status / retryable）。
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
        ...options,
        cache: "no-store",
        signal: controller.signal,
      }),
      // 非 JSON / 空体的响应按空对象处理，走下方统一的通用错误文案。
      payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.detail,
        detailMessage = detail && typeof detail === "object" ? detail.message : undefined,
        httpError = new Error(
          response.status === 401
            ? "请登录管理端或使用仍有效的配对设备重试。"
            : (typeof detailMessage == "string" && detailMessage) ||
                (typeof detail == "string" ? detail : "请求失败，请稍后重试。"),
        );
      (httpError as LicenseRequestError).status = response.status;
      // 后端在 detail.retryable 里明确回答「再点有没有用」，透传给调用方才能决定按钮去留。
      detail && typeof detail === "object" && typeof detail.retryable == "boolean" && ((httpError as LicenseRequestError).retryable = detail.retryable);
      throw httpError;
    }
    return payload;
  } catch (caughtError) {
    // 已经有 status 的是上面构造的业务错误，原样上抛；其余（断网 / 超时 / 非 JSON）统一文案。
    if (typeof caughtError?.status == "number") throw caughtError;
    throw new Error("暂时连接不到 HomeOS 服务，请检查网络；网络恢复后会自动检查。");
  } finally {
    clearTimeout(timer);
  }
}

// 只在恢复页存在时自举：本模块同时被 /license 引用，不能在那边也挂一套定时器。
const recoveryRoot = typeof document > "u" ? null : document.querySelector<DomControl>("#license-recovery");
if (recoveryRoot) {
  const messageElement = document.querySelector<DomControl>("#recovery-message"),
    errorElement = document.querySelector<DomControl>("#recovery-error"),
    retryButton = document.querySelector<DomControl>("#recovery-retry");
  if (!messageElement || !retryButton) throw new Error("授权恢复页缺少必要节点。");
  // inFlight 防重入（点击、online、定时器三个触发源会叠加）。
  let inFlight = false,
    done = false,
    recheckTimer;
  // 状态色调：绿 = 通了、暖光 = 等着、珊瑚 = 挡住了。只切类名，不参与任何判定。
  const TONE_CLASSES = ["hos-tone--eco", "hos-tone--lumen", "hos-tone--alert"];
  function paintTone(tone) {
    (messageElement.classList.remove(...TONE_CLASSES),
      tone && messageElement.classList.add(`hos-tone--${tone}`));
  }
  function clearError() {
    errorElement && ((errorElement.textContent = ""), (errorElement.hidden = true));
  }
  async function check(manual = false) {
    if (inFlight || done) return;
    (clearTimeout(recheckTimer), (inFlight = true));
    // 只有用户自己按下的那一次才置灰：自动自检每 5 秒一轮，跟着置灰会让按钮一直闪。
    manual && ((retryButton.disabled = true), (messageElement.textContent = "正在重新连接授权后台…"));
    try {
      // 手动重试走 POST /retry（后端会忽略端点冷却），随后统一读 availability 取最新状态；
      const firstState = await licenseRequest(
          `/api/v1/license/${manual ? "retry" : "availability"}`,
          manual
            ? {
                method: "POST",
              }
            : {},
        ),
        latestState = manual ? await licenseRequest("/api/v1/license/availability") : firstState;
      clearError();
      if (latestState.displayAllowed) {
        // 「通了」是这一页唯一的高光时刻：先说一句再 reload，别让用户看到一次无声重载。
        ((done = true),
          (messageElement.textContent = "授权已恢复，正在进入…"),
          paintTone("eco"),
          (retryButton.hidden = true),
          window.setTimeout(() => window.location.reload(), 600));
        return;
      }
      ((messageElement.textContent = licenseMessage(latestState)),
        // 指纹不匹配是「必须先去商店解绑」的终态，与「等着就会好」的等待态分开。
        paintTone(latestState.status === "INSTANCE_MISMATCH" ? "alert" : "lumen"),
        // 后端说不可重试（终态）时把按钮藏起来：留着只会让用户反复点一个不会成功的按钮。
        (retryButton.hidden = !latestState.canRetry));
    } catch (checkError) {
      // 错误写进 #recovery-error 而不是状态行：状态句要继续说明「现在是什么情况」。
      errorElement
        ? ((errorElement.textContent = checkError.message), (errorElement.hidden = false))
        : (messageElement.textContent = checkError.message);
      paintTone("alert");
      // 后端明确说「再试也没用」（已进终态）时藏起按钮；其余错误（断网、超时）保持可点。
      retryButton.hidden = checkError?.retryable === false;
    } finally {
      ((inFlight = false),
        (retryButton.disabled = false),
        // done 时不再排下一拍：跳转或卸载已经发生，定时器只会空转。
        done || (recheckTimer = setTimeout(() => check(), RECHECK_INTERVAL_MS)));
    }
  }
  (retryButton.addEventListener("click", () => check(true)),
    // 网络恢复是最常见的自愈时机：立刻查一次，不必等下一拍。
    window.addEventListener("online", () => check()),
    // 页面进入后台就停掉自检（移动端会冻结定时器，留着只会在恢复时叠一堆请求）。
    window.addEventListener("pagehide", () => {
      ((done = true), clearTimeout(recheckTimer));
    }),
    window.addEventListener("pageshow", () => {
      ((done = false), check());
    }),
    check());
}
