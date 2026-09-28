/*
 * 前端唯一的「接口失败 → 人话」实现：把 FastAPI 422 的 detail 数组、`{msg}` /
 */

type DetailEntry = {
  loc?: unknown;
  msg?: unknown;
  message?: unknown;
};

// 单个 422 条目 → 一行人话。认不出来时给「取值不合法」，不把对象本身泄露出去。
function describeEntry(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return '取值不合法';
  const record = entry as DetailEntry;
  const field = Array.isArray(record.loc)
    ? record.loc.filter((part) => part !== 'body' && part !== 'query').join('.')
    : '';
  const reason = (record.msg || record.message) || '取值不合法';
  return field ? `参数 ${field}：${reason}` : String(reason);
}

export function describe(detail: unknown, fallback?: string): string {
  const text = fallback || '请求失败。';
  if (!detail) return text;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const lines = detail.map(describeEntry).filter(Boolean);
    return lines.length ? lines.join('；') : text;
  }
  if (typeof detail === 'object') {
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

// 非 2xx 响应 → 带状态码的 Error。调用方据此区分「没登录」（401/403，正常状态）
export function fromResponse(
  response: Response,
  data: unknown,
  fallback?: string,
): ApiError {
  const detail =
    data && typeof data === 'object' && 'detail' in data
      ? (data as { detail?: unknown }).detail
      : undefined;
  const error = new Error(describe(detail, fallback)) as ApiError;
  error.status = response.status;
  error.payload = data;
  return error;
}
