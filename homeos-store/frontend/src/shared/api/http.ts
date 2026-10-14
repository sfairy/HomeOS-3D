/** 统一 HTTP 出口：前台 `/store/v1` 与后台 `/store-admin/v1`。 */

import { fromResponse } from "@store/shared/api/error";

export type HttpOptions = RequestInit & { raw?: boolean };

/** 后台 401/403 时触发，由 AdminLayout 监听并回到登录屏。 */
type AuthListener = () => void;
const authListeners = new Set<AuthListener>();

export function onAdminUnauthorized(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function emitUnauthorized() {
  for (const listener of authListeners) listener();
}

async function request(
  base: string,
  path: string,
  options: HttpOptions,
  { notifyAuth = false } = {},
): Promise<unknown> {
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`${base}${path}`, {
    credentials: "same-origin",
    headers: options.body && !isForm ? { "Content-Type": "application/json" } : {},
    ...options,
  });
  if (notifyAuth && (response.status === 401 || response.status === 403)) {
    emitUnauthorized();
    const error = fromResponse(response, { detail: "未登录后台或无权限。" });
    throw error;
  }
  if (options.raw) return response;
  // 204 没有 body；错误响应也可能是空体或 HTML（网关）。解析不出来就当空对象，
  // 真正的错误信息由 `fromResponse` 从状态码与（可能的）`detail` 里给出。
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    // `Retry-After` 由 `fromResponse` 统一解析（这里是唯一的 response → 异常转换点，
    // 解析放在那边就不会有哪条路径漏掉等待时间）。
    throw fromResponse(response, data, "请求失败，请稍后重试。");
  }
  return data;
}

/** 商店前台接口：`/store/v1`。 */
export function api<T = unknown>(path: string, options: HttpOptions = {}): Promise<T> {
  return request("/store/v1", path, options) as Promise<T>;
}

/** 后台接口：`/store-admin/v1`，401/403 会通知外壳回登录屏。 */
export function adminApi<T = unknown>(path: string, options: HttpOptions = {}): Promise<T> {
  return request("/store-admin/v1", path, options, { notifyAuth: true }) as Promise<T>;
}
