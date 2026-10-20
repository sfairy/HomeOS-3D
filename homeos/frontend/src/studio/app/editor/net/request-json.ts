/**
 * studio 编辑器请求面：`requestJson`（超时 / 中止 / CSRF / 401-403 跳转）+ 认证跳转闩。
 * P4 从 `app/editor/home.ts` 切出（6e）。
 */

import { navigateInShell } from "@/studio/platform/shell-navigation";
import { withCsrf } from "@/services/api/csrf";

const DEFAULT_REQUEST_TIMEOUT_MS = 20000;

interface RequestJsonDeps {
  /**
   * 「认证跳转只做一次」闩。由宿主 `bootEditor` 每实例创建一份（teardown → boot 会重置），
   * 所以**不能**提到模块作用域 —— 那会变成跨实例共享，与原地闭包语义不等价。
   */
  authRedirectState: { started: boolean };
}

function startAuthRedirect(deps: RequestJsonDeps, targetPath: any, _replaceCurrent = false) {
  if (deps.authRedirectState.started) return;
  // 同文档内路由：编辑器已具备 boot/teardown，不必整页跳转清文档。
  ((deps.authRedirectState.started = true), navigateInShell(String(targetPath || "/login")));
}

export async function requestJson(
  deps: RequestJsonDeps,
  requestPath: any,
  requestOptions: Record<string, any> = {},
) {

  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: callerSignal, ...fetchOptions } = requestOptions,
    requestAbort = new AbortController();
  let requestTimer: any = null,
    requestTimedOut = false;
  const abortOnCallerSignal = () => requestAbort.abort(callerSignal?.reason);
  if (timeoutMs > 0)
    requestTimer = setTimeout(() => {
      ((requestTimedOut = true), requestAbort.abort());
    }, timeoutMs);
  if (callerSignal)
    callerSignal.aborted
      ? abortOnCallerSignal()
      : callerSignal.addEventListener("abort", abortOnCallerSignal, { once: true });
  let responseText;
  try {
    // homeos CsrfMiddleware 对变更类请求校验 X-CSRF-Token；这里统一补齐（豁免端点也可安全携带）。
    const requestHeaders = withCsrf(
      fetchOptions.headers,
      fetchOptions.method || (fetchOptions.body ? "POST" : "GET"),
    );
    responseText = await fetch("/api/v1" + requestPath, {
      cache: "no-store",
      ...fetchOptions,
      signal: requestAbort.signal,
      headers: fetchOptions.body
        ? {
            "Content-Type": "application/json",
            ...requestHeaders,
          }
        : requestHeaders,
    });
  } catch (requestError: any) {


    if (requestTimedOut) {
      const timeoutError = new Error(
        "请求超时：" + requestPath.split("?")[0] + "（超过 " + Math.round(timeoutMs / 1000) + " 秒无响应）",
      );
      window.HomeOSLog?.error!(timeoutError, { path: requestPath, phase: "request-timeout" })!;
      throw timeoutError;
    }
    throw requestError;
  } finally {
    (requestTimer !== null && clearTimeout(requestTimer),
      callerSignal && callerSignal.removeEventListener("abort", abortOnCallerSignal));
  }
  const text = responseText.status === 204 ? "" : await responseText.text();
  let responseBody: any = null;
  if (text)
    try {
      responseBody = JSON.parse(text);
    } catch {
      if (responseText.ok)
        throw new Error(
          "接口返回格式异常：" + requestPath.split("?")[0] + "（HTTP " + responseText.status + "）",
        );
    }
  if (responseText.status === 401) {
    startAuthRedirect(deps, "/login");
    const error = new Error("登录状态已失效。");
    throw window.HomeOSLog?.linkError!(error, responseText)! || error;
  }
  if (responseText.status === 403 && responseBody?.detail?.code === "LICENSE_RESTRICTED") {
    startAuthRedirect(deps, "/activate", true);
    const errorPhaseState = new Error("授权已失效，请重新激活。");
    throw window.HomeOSLog?.linkError!(errorPhaseState, responseText)! || errorPhaseState;
  }
  if (!responseText.ok) {
    const homeParts = responseBody?.detail,
      slice = text.trim().slice(0, 240),
      valueState: Error & { code?: string } = new Error(
        typeof homeParts == "string"
          ? homeParts
          : homeParts?.message ||
              "请求失败：" +
                requestPath.split("?")[0] +
                "（HTTP " +
                responseText.status +
                "）" +
                (slice ? " · " + slice : ""),
      );
    throw (
      homeParts &&
        typeof homeParts == "object" &&
        homeParts.code &&
        (valueState.code = homeParts.code),
      window.HomeOSLog?.linkError!(valueState, responseText)! || valueState
    );
  }
  return responseBody;
}
