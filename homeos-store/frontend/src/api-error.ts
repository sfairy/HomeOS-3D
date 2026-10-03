

type DetailEntry = {
  loc?: unknown;
  msg?: unknown;
  message?: unknown;
};


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
