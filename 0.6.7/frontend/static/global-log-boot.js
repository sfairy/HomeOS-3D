import { setupGlobalLog } from "./global-log.js?v=20260905-global-log-v2";
async function apiFetch(path, options = {}) {
  const response = await fetch("/api/v1" + path, {
      cache: "no-store",
      ...options,
      headers: options.body
        ? {
            "Content-Type": "application/json",
            ...(options.headers || {}),
          }
        : options.headers,
    }),
    responseText = response.status === 204 ? "" : await response.text();
  let payload = null;
  if (responseText)
    try {
      payload = JSON.parse(responseText);
    } catch {
      if (response.ok) throw new Error("接口返回格式异常：" + path.split("?")[0]);
    }
  if (response.status === 401)
    throw (window.location.assign("/login"), new Error("登录状态已失效。"));
  if (!response.ok) {
    const detail = payload?.detail;
    throw new Error(
      typeof detail == "string"
        ? detail
        : detail?.message || "请求失败（HTTP " + response.status + "）",
    );
  }
  return payload;
}
setupGlobalLog({
  api: apiFetch,
});
