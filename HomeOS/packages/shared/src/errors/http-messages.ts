/**
 * @file http-messages.ts
 * @module @homeos/shared/errors
 * @brief HTTP 错误「英文文案/状态码 → 中文用户提示」的共享映射表。
 *
 * backend（http-exception-message.util，Nest 异常过滤器）与 frontend
 * （utils/core/error-message，Axios 错误兜底）引用同一份映射，避免双侧重复维护。
 * 仅收录两侧语义与文案完全一致的条目；401（后端「未登录或登录已过期」、
 * 前端「登录已过期，请重新登录」）、动态限流等待时长、后端不可达提示等
 * 各端特有逻辑留在各自文件。
 * 正则均不带 g 标志，可安全跨模块复用（无 lastIndex 状态）。
 */

/** 共享文案常量（关键词命中与状态码兜底共用） */
export const HTTP_MESSAGE_TEXTS = {
  /** 请求无效（笼统 Bad Request） */
  badRequest: '请求无效',
  /** 没有权限 */
  forbidden: '没有权限执行此操作',
  /** 资源不存在 */
  notFound: '请求的资源不存在',
  /** 操作冲突 */
  conflict: '操作冲突，请刷新后重试',
  /** 请求超时 */
  timeout: '请求超时，请稍后重试',
  /** 触发限流（无 Retry-After 信息时的默认提示） */
  rateLimited: '操作过于频繁，请约 1 分钟后再试',
  /** 服务器内部错误 */
  internalServerError: '服务器内部错误',
  /** CSRF 安全校验失败 */
  csrf: '安全校验失败，请刷新页面后重试',
  /** 会话/令牌失效 */
  tokenExpired: '登录已过期，请重新登录',
} as const;

/**
 * HTTP 状态码 → 中文文案（仅两侧一致的条目）。
 * 401 故意缺席：两端口径不同，由各端自行处理。
 */
export const HTTP_STATUS_MESSAGES: Readonly<Record<number, string>> = {
  400: HTTP_MESSAGE_TEXTS.badRequest,
  403: HTTP_MESSAGE_TEXTS.forbidden,
  404: HTTP_MESSAGE_TEXTS.notFound,
  408: HTTP_MESSAGE_TEXTS.timeout,
  409: HTTP_MESSAGE_TEXTS.conflict,
  429: HTTP_MESSAGE_TEXTS.rateLimited,
  500: HTTP_MESSAGE_TEXTS.internalServerError,
};

/** 共享关键词匹配正则（两侧 source 完全一致的条目） */
export const HTTP_MESSAGE_PATTERNS = {
  /** 限流器 / 请求过频 */
  throttler: /throttler|too many requests/i,
  /** 笼统 Bad Request（锚定整条消息） */
  badRequest: /^bad request$/i,
  /** 无权限（锚定整条消息） */
  forbidden: /^forbidden$/i,
  /** Nest 风格的 Forbidden Resource */
  forbiddenResource: /forbidden resource/i,
  /** 资源不存在（锚定整条消息） */
  notFound: /^not found$/i,
  /** 操作冲突（锚定整条消息） */
  conflict: /^conflict$/i,
  /** 超时（含 timed out / time out 变体） */
  timeout: /timeout|timed?\s*out/i,
  /** 服务器内部错误 */
  internalServerError: /internal server error/i,
  /** CSRF 校验失败 */
  csrf: /csrf/i,
  /** JWT / Token 失效类 */
  tokenExpired: /jwt expired|token expired|invalid token|jwt malformed/i,
} as const;
