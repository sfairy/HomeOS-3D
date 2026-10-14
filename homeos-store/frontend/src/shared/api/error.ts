
/**
 * 商店前台的 API 错误口径（HTTP 层与视图共用）：把失败响应翻成人话，并把 `retryAfter` 提示统一。
 *
 * 归位说明：原 `shared/api-error.ts`（域根散件）→ `shared/api/error.ts`，与 `api/http.ts` 同域。
 */

type DetailEntry = {
  loc?: unknown;
  msg?: unknown;
  message?: unknown;
};


function describeEntry(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return "取值不合法";
  const record = entry as DetailEntry;
  const field = Array.isArray(record.loc)
    ? record.loc.filter((part) => part !== "body" && part !== "query").join(".")
    : "";
  const reason = (record.msg || record.message) || "取值不合法";
  return field ? `参数 ${field}：${reason}` : String(reason);
}

export function describe(detail: unknown, fallback?: string): string {
  const text = fallback || "请求失败。";
  if (!detail) return text;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const lines = detail.map(describeEntry).filter(Boolean);
    return lines.length ? lines.join("；") : text;
  }
  if (typeof detail === "object") {
    const record = detail as DetailEntry;
    if (record.msg || record.message) {
      return String(record.msg || record.message);
    }
  }
  return text;
}

export type ApiError = Error & {
  status?: number;
  payload?: unknown;
  retryAfter?: number;
};

/**
 * `Retry-After` → 秒数，解析不出来就是 `0`。
 *
 * RFC 9110 允许两种写法：非负整数秒（限流场景下的实际做法）或 HTTP 日期。两种都要认 ——
 * 只认整数的话，某天换成日期形式，前端就会静默退化成「不显示等待时间」。
 *
 * 返回 `0` 而不是 `NaN`：调用方一律写 `if (seconds > 0)`，`NaN` 的比较结果恒为 false，
 * 看起来能跑，实际是把「格式没读懂」伪装成「服务端没给」。
 */
function parseRetryAfter(raw: string | null | undefined): number {
  const text = (raw || "").trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const at = Date.parse(text);
  if (Number.isNaN(at)) return 0;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/** 从任意异常里取 `Retry-After` 秒数；不是限流错误时返回 `0`。 */
export function retryAfterSeconds(error: unknown): number {
  if (!error || typeof error !== "object") return 0;
  const value = (error as ApiError).retryAfter;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * 把等待时间补进提示语。
 *
 * 这是「`retryAfter` 全局消费」的落点：原先只有登录页自己读这个字段，其它页面收到 429
 * 时用户只看到「请求过于频繁」却不知道要等多久；现在所有走 `errorMessage()` 的地方都带上。
 */
export function withRetryHint(message: string, retryAfter?: number): string {
  const seconds = Math.max(0, Math.floor(retryAfter || 0));
  if (!seconds) return message;
  const wait = seconds >= 60 ? `${Math.ceil(seconds / 60)} 分钟` : `${seconds} 秒`;
  return `${message}（请 ${wait}后重试）`;
}


export function fromResponse(
  response: Response,
  data: unknown,
  fallback?: string,
): ApiError {
  const detail =
    data && typeof data === "object" && "detail" in data
      ? (data as { detail?: unknown }).detail
      : undefined;
  const error = new Error(describe(detail, fallback)) as ApiError;
  error.status = response.status;
  error.payload = data;
  // 解析放在这里而不是各个调用点：这是唯一一处能同时看到 response 与异常的地方，
  // 漏掉一个调用点就等于那条路径永远拿不到等待时间。
  error.retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
  return error;
}
