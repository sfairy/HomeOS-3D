
const DEFAULT_API_ERROR_TEXT = "请求失败。";

/**
 * 单个 422 条目 → 一行人话。认不出来时给「取值不合法」，绝不把对象本身泄露出去
 */
function describeEntry(entry) {
  if (typeof entry === "string") return entry;
  const field = Array.isArray(entry?.loc)
    ? entry.loc.filter(part => part !== "body" && part !== "query").join(".")
    : "";
  const reason = entry?.msg || entry?.message || "取值不合法";
  return field ? `参数 ${field}：${reason}` : reason;
}

/** 把 `detail` 归一化成人话（不懂顶层 `message`，那是 `apiErrorMessage` 的事）。 */
function describeApiErrorDetail(detail, text) {
  if (!detail) return text;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const lines = detail.map(describeEntry).filter(Boolean);
    return lines.length ? lines.join("；") : text;
  }
  if (typeof detail === "object" && (detail.msg || detail.message)) {
    return String(detail.msg || detail.message);
  }
  return text;
}

/**
 * 从整个响应体里挑出最能说明问题的一句话：`detail` 字符串（后端写好的中文业务错误）→
 */
export function apiErrorMessage(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string" && detail) return detail;
  const summary = payload?.message;
  if (typeof summary === "string" && summary) return summary;
  return describeApiErrorDetail(detail, fallback || DEFAULT_API_ERROR_TEXT);
}
