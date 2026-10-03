/** 统一 HTTP 出口：前台 `/store/v1` 与后台 `/store-admin/v1`。 */

import { fromResponse, type ApiError } from "../api-error.js";

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
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = fromResponse(response, data, "请求失败，请稍后重试。") as ApiError;
    error.retryAfter = Number(response.headers.get("Retry-After") || 0);
    throw error;
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

export { fromResponse };
export type { ApiError };
