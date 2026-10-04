/**
 * @file trace-context.ts
 * @module common/observability
 *
 * 基于 AsyncLocalStorage 的请求 traceId 上下文存取。
 *
 * 职责：
 * - 提供进程级的“当前请求 traceId”存储，使任意异步调用链都能读取到当前请求的 traceId，
 *   无需显式参数传递。
 * - 供结构化日志器（StructuredLogger）注入 traceId，实现日志与请求关联。
 *
 * 关键依赖：
 * - node:async_hooks AsyncLocalStorage：Node 内置 API，跨异步边界保持上下文。
 *
 * 使用方式：
 * - TraceMiddleware 在请求入口调用 traceStorage.run({ traceId }, next) 建立上下文。
 * - 任意模块调用 getTraceId() 读取当前请求的 traceId。
 */

/** 基于 AsyncLocalStorage 的请求 traceId 上下文存取。 */
import { AsyncLocalStorage } from 'async_hooks';

/**
 * 请求追踪上下文，目前仅承载 traceId。
 * 设计为可扩展结构，未来可追加 userId / tenantId 等字段。
 */
type TraceContext = { traceId: string };

/**
 * 全局 AsyncLocalStorage 实例，用于在异步调用链中传递 TraceContext。
 * 每个进入的请求通过 traceStorage.run() 建立独立的上下文作用域。
 */
export const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * 获取当前异步上下文中的 traceId。
 *
 * @returns 当前请求的 traceId；若未处于 traceStorage.run 作用域内则返回 undefined。
 *
 * 副作用：无（纯读取 AsyncLocalStorage store）。
 *
 * 调用场景：
 * - StructuredLogger.emit 输出日志时注入 traceId。
 * - 任意业务代码需要记录当前请求 traceId 的位置。
 */
export function getTraceId(): string | undefined {
  // getStore() 在 run() 作用域外返回 undefined，使用可选链安全访问 traceId。
  return traceStorage.getStore()?.traceId;
}