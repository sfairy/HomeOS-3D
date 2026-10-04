/**
 * 链路追踪工具模块。
 *
 * 职责：
 * - 生成页面级 Trace ID，随 API 请求透传至后端 X-Trace-Id header；
 * - 从响应 headers 或错误对象中提取 traceId，便于问题排查关联。
 *
 * 依赖：randomUUID（core/random-uuid.util）。
 */
import { randomUUID } from '@/utils/core/random-uuid.util'

/** 页面级 Trace ID（模块级单例，首次获取时生成） */
let pageTraceId = ''

/**
 * 获取页面级 Trace ID。
 *
 * 首次调用生成 UUID 并缓存，后续调用返回同一值。
 * 该 ID 随 API 请求透传至后端 X-Trace-Id header，用于全链路追踪。
 *
 * @returns 页面级 Trace ID
 */
export function getPageTraceId(): string {
  if (!pageTraceId) {
    pageTraceId = randomUUID()
  }
  return pageTraceId
}

/**
 * 从响应 headers 中提取 trace ID。
 *
 * 兼容 x-trace-id 与 X-Trace-Id 两种大小写形式。
 *
 * @param headers 响应 headers 对象
 * @returns trace ID 字符串；不存在返回 undefined
 */
function extractTraceIdFromResponse(
  headers: Record<string, unknown> | undefined,
): string | undefined {
  const raw = headers?.['x-trace-id'] ?? headers?.['X-Trace-Id']
  return typeof raw === 'string' ? raw : undefined
}

/**
 * 从错误对象中提取 trace ID。
 *
 * 优先从 error.response.data.traceId 提取，其次从响应 headers 提取。
 *
 * @param error 错误对象（axios 风格）
 * @returns trace ID；不存在返回 undefined
 */
export function extractTraceIdFromError(
  error:
    | { response?: { data?: { traceId?: string }; headers?: Record<string, unknown> } }
    | null
    | undefined,
): string | undefined {
  return error?.response?.data?.traceId || extractTraceIdFromResponse(error?.response?.headers)
}