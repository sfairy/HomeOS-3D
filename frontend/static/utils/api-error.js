/**
 * 主应用侧唯一的「接口失败 → 人话」实现。契约对齐商店侧 `store/static/api-error.js`：两棵树
 * 独立部署、加载方式不同，故刻意镜像而非共用（那份用全局名 `ApiError`）。
 *
 * 对外只有 `apiErrorMessage`：`detail` 或顶层 `message` 是非空字符串就原样用；`detail` 是
 * FastAPI 422 数组时拼成「参数 days：…」（多条用「；」连，`loc` 去掉 `body`/`query` 前缀）；
 * 其余形态一律 `fallback`（只在「说不出具体原因」时用）。只认这两个位置 —— 别处塞的错误
 * 结构不在这份契约里，要改的是接口。
 */

/** 说不出具体原因时使用的兜底文案。 */
const DEFAULT_API_ERROR_TEXT = "请求失败。";

/**
 * 单个 422 条目 → 一行人话。认不出来时给「取值不合法」，绝不把对象本身泄露出去
 * （`String(entry)` 会产出 `[object Object]`，那正是这份知识要终结的形态）。
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
 * 顶层 `message`（后端按同一份错误算出的中文摘要）→ 其余交给 `describeApiErrorDetail`。
 * `message` 排在数组的 pydantic 英文 `msg` 前面：信息量相同，可读性差一个量级。
 */
export function apiErrorMessage(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string" && detail) return detail;
  const summary = payload?.message;
  if (typeof summary === "string" && summary) return summary;
  return describeApiErrorDetail(detail, fallback || DEFAULT_API_ERROR_TEXT);
}
