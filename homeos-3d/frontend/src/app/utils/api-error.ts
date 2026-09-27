
const DEFAULT_API_ERROR_TEXT = "请求失败。";

type ApiErrorEntry = {
  loc?: unknown;
  msg?: unknown;
  message?: unknown;
};

type ApiErrorPayload = {
  detail?: unknown;
  message?: unknown;
};

/**
 * 单个 422 条目 → 一行人话。认不出来时给「取值不合法」，绝不把对象本身泄露出去
 */
function describeEntry(entry: unknown): string {
  if (typeof entry === "string") return entry;
  const record = entry && typeof entry === "object" ? (entry as ApiErrorEntry) : null;
  const field = Array.isArray(record?.loc)
    ? record.loc.filter((part: unknown) => part !== "body" && part !== "query").join(".")
    : "";
  const reason = record?.msg || record?.message || "取值不合法";
  return field ? `参数 ${field}：${reason}` : String(reason);
}

/** 把 `detail` 归一化成人话（不懂顶层 `message`，那是 `apiErrorMessage` 的事）。 */
function describeApiErrorDetail(detail: unknown, text: string): string {
  if (!detail) return text;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const lines = detail.map(describeEntry).filter(Boolean);
    return lines.length ? lines.join("；") : text;
  }
  if (typeof detail === "object" && detail !== null) {
    const record = detail as ApiErrorEntry;
    if (record.msg || record.message) {
      return String(record.msg || record.message);
    }
  }
  return text;
}

/**
 * 从整个响应体里挑出最能说明问题的一句话：`detail` 字符串（后端写好的中文业务错误）→
 */
export function apiErrorMessage(payload: unknown, fallback?: unknown): string {
  const record =
    payload && typeof payload === "object" ? (payload as ApiErrorPayload) : null;
  const detail = record?.detail;
  if (typeof detail === "string" && detail) return detail;
  const summary = record?.message;
  if (typeof summary === "string" && summary) return summary;
  return describeApiErrorDetail(
    detail,
    typeof fallback === "string" && fallback ? fallback : DEFAULT_API_ERROR_TEXT,
  );
}
