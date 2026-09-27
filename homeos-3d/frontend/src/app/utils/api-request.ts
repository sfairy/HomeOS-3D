/**
 * 接口响应的「鉴权判定」与「可上抛错误」：编辑器、舞台页、展示端、授权页与日志引导共用一套口径。
 */
import { apiErrorMessage } from "./api-error.js";

/**
 * 后端在 403 `detail.code` 里回的授权受限码。
 */
const LICENSE_RESTRICTED_CODE = "LICENSE_RESTRICTED";

type ApiAuthPayload = {
  detail?: {
    code?: unknown;
  };
};

type ApiRequestErrorOptions = {
  status?: number;
  message?: string;
  fallback?: string;
  response?: Response | null;
  link?: boolean;
};

type ApiRequestError = Error & {
  status?: number;
  code?: string;
  payload?: unknown;
};

/**
 * 判定一次响应属于哪一种「鉴权类失败」。
 * @param {number} status HTTP 状态码。
 * @param {unknown} responsePayload 已解析的响应体，可能是 null（204 / 非 JSON 错误页）。
 * @returns {"session-expired" | "license-restricted" | null} 需要调用方处理的类别；null 表示不是鉴权问题。
 */
export function apiAuthChallenge(
  status: number,
  responsePayload: unknown,
): "session-expired" | "license-restricted" | null {
  if (status === 401) return "session-expired";
  const payload =
    responsePayload && typeof responsePayload === "object"
      ? (responsePayload as ApiAuthPayload)
      : null;
  if (status === 403 && payload?.detail?.code === LICENSE_RESTRICTED_CODE) {
    return "license-restricted";
  }
  return null;
}

/**
 * 构造可上抛的接口错误：一次把「人话文案 + code + status + 原始响应体」挂齐，并交给日志桥关联响应。
 * @param {unknown} responsePayload 已解析的响应体。
 * @param {{ status?: number, message?: string, fallback?: string,
 * @returns {Error} 已挂好字段的错误对象。**不抛出**：由调用方决定是 throw 还是只记一笔（展示端 401）。
 */
export function apiRequestError(
  responsePayload: unknown,
  options: ApiRequestErrorOptions = {},
): ApiRequestError {
  const {
    status = 0,
    message = "",
    fallback = "",
    response = null,
    link = true
  } = options;
  const requestError = new Error(message || apiErrorMessage(responsePayload, fallback)) as ApiRequestError;
  if (status) requestError.status = status;
  const payload =
    responsePayload && typeof responsePayload === "object"
      ? (responsePayload as ApiAuthPayload)
      : null;
  const businessCode = payload?.detail?.code;
  if (typeof businessCode === "string" && businessCode) requestError.code = businessCode;
  // 原始响应体一起带上：上层可能需要它里面的业务字段（例如导出一致性冲突时的既有 id）。
  requestError.payload = responsePayload ?? null;
  if (!link) return requestError;
  return window.HABridgeLog?.linkError?.(requestError, response) || requestError;
}
