/** 统一 HTTP 出口：前台 `/store/v1` 与后台 `/store-admin/v1`。 */

import { fromResponse } from "@store/shared/api/error";

type HttpOptions = RequestInit & { raw?: boolean };

/** 后台 401/403 时触发，由 AdminLayout 监听并回到登录屏。 */
type AuthListener = () => void;
const authListeners = new Set<AuthListener>();
/** 前台会话失效（已登录状态下 401/403）时触发，由会话 store 监听并清空本地态。 */
const storeAuthListeners = new Set<AuthListener>();

export function onAdminUnauthorized(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

/**
 * 订阅「前台会话已失效」。
 *
 * 登录 / 注册 / `/auth/me` / 退出这几条入口不参与触发：游客本来就会收到 401，
 * 密码输错也是 401，把它们当成「会话失效」会误清状态并弹错误提示。
 * 真正需要回调的是**只有已登录才能成功**的接口（账号中心、解绑、提现……）。
 */
export function onStoreUnauthorized(listener: AuthListener): () => void {
  storeAuthListeners.add(listener);
  return () => storeAuthListeners.delete(listener);
}

function emitUnauthorized() {
  for (const listener of authListeners) listener();
}

function emitStoreUnauthorized() {
  for (const listener of storeAuthListeners) listener();
}

/** 前台接口里「未登录也会 401」的入口：不算会话失效。 */
const STORE_AUTH_ENTRY_PATHS = ["/auth/login", "/auth/register", "/auth/me", "/auth/logout"];

function isStoreAuthEntry(path: string): boolean {
  return STORE_AUTH_ENTRY_PATHS.some((entry) => path.startsWith(entry));
}

/** 401/403：会话（或后台登录态）已失效。 */
function isAuthFailure(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

/** 认证失败时的统一处置：后台直接抛错（外壳回登录屏），前台广播给会话 store。 */
function notifyAuthFailure(
  response: Response,
  { notifyAuth, notifyStoreAuth }: { notifyAuth: boolean; notifyStoreAuth: boolean },
): void {
  if (!isAuthFailure(response)) return;
  if (notifyAuth) {
    emitUnauthorized();
    throw fromResponse(response, { detail: "未登录后台或无权限。" });
  }
  if (notifyStoreAuth) emitStoreUnauthorized();
}

async function request(
  base: string,
  path: string,
  options: HttpOptions,
  { notifyAuth = false, notifyStoreAuth = false } = {},
): Promise<unknown> {
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`${base}${path}`, {
    credentials: "same-origin",
    headers: options.body && !isForm ? { "Content-Type": "application/json" } : {},
    ...options,
  });
  notifyAuthFailure(response, { notifyAuth, notifyStoreAuth });
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

/** 商店前台接口：`/store/v1`。会话失效的 401/403 会广播给会话 store（见 `onStoreUnauthorized`）。 */
export function api<T = unknown>(path: string, options: HttpOptions = {}): Promise<T> {
  return request("/store/v1", path, options, {
    notifyStoreAuth: !isStoreAuthEntry(path),
  }) as Promise<T>;
}

/** 后台接口：`/store-admin/v1`，401/403 会通知外壳回登录屏。 */
export function adminApi<T = unknown>(path: string, options: HttpOptions = {}): Promise<T> {
  return request("/store-admin/v1", path, options, { notifyAuth: true }) as Promise<T>;
}
