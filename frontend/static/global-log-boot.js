import { setupGlobalLog } from "./global-log.js?v=20260915211726";
async function requestJson(path, init = {}) {
  const response = await fetch("/api/v1" + path, {
    cache: "no-store",
    ...init,
    headers: init.body
      ? {
          "Content-Type": "application/json",
          ...(init.headers || {})
        }
      : init.headers
  });
  const bodyText = response.status === 204 ? "" : await response.text();
  let payload = null;
  if (bodyText) {
    try {
      payload = JSON.parse(bodyText);
    } catch {
      if (response.ok) {
        throw new Error("接口返回格式异常：" + path.split("?")[0]);
      }
    }
  }
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("登录状态已失效。");
  }
  if (!response.ok) {
    const detail = payload?.detail;
    throw new Error(
      typeof detail == "string"
        ? detail
        : detail?.message || "请求失败（HTTP " + response.status + "）"
    );
  }
  return payload;
}
setupGlobalLog({
  api: requestJson
});
