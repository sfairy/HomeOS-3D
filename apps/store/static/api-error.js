/*
 * 前端唯一的「接口失败 → 人话」实现：把 FastAPI 422 的 detail 数组、`{msg}` /
 */
export const DEFAULT_FALLBACK = '请求失败。';

// 单个 422 条目 → 一行人话。认不出来时给「取值不合法」，不把对象本身泄露出去。
function describeEntry(entry) {
  if (typeof entry === 'string') return entry;
  const field = Array.isArray(entry && entry.loc)
    ? entry.loc.filter(part => part !== 'body' && part !== 'query').join('.')
    : '';
  const reason = (entry && (entry.msg || entry.message)) || '取值不合法';
  return field ? `参数 ${field}：${reason}` : reason;
}

export function describe(detail, fallback) {
  const text = fallback || DEFAULT_FALLBACK;
  if (!detail) return text;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const lines = detail.map(describeEntry).filter(Boolean);
    return lines.length ? lines.join('；') : text;
  }
  if (typeof detail === 'object' && (detail.msg || detail.message)) {
    return String(detail.msg || detail.message);
  }
  return text;
}

// 非 2xx 响应 → 带状态码的 Error。调用方据此区分「没登录」（401/403，正常状态）
export function fromResponse(response, data, fallback) {
  const error = new Error(describe(data && data.detail, fallback));
  error.status = response.status;
  error.payload = data;
  return error;
}


