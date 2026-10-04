/**
 * @file trace.middleware.ts
 * @module common/observability
 *
 * HTTP 请求追踪中间件。
 *
 * 职责：
 * - 为每个进入的 HTTP 请求注入或透传 X-Trace-Id 请求头，实现端到端追踪。
 * - 将 traceId 写入 AsyncLocalStorage（traceStorage），使后续异步调用链可通过 getTraceId() 读取。
 * - 监听响应完成事件，对超过阈值的慢请求输出 warn 级别日志。
 *
 * 关键依赖：
 * - @nestjs/common NestMiddleware / Logger：NestJS 中间件基类与日志器。
 * - express Request / Response / NextFunction：Express 类型定义。
 * - node:crypto randomUUID：在请求未携带 traceId 时生成新的 UUID。
 * - ./trace-context traceStorage：AsyncLocalStorage 实例，承载请求级 traceId。
 *
 * 注意：
 * - TRACE_HEADER 使用小写 'x-trace-id' 读取（Node http 头部自动小写化），
 *   但回写时使用规范大小写 'X-Trace-Id'，便于客户端与日志可视化识别。
 */

import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { traceStorage } from './trace-context';

/** 追踪 ID 的 HTTP 请求头名（小写，匹配 Node 自动小写化后的读取形式）。 */
const TRACE_HEADER = 'x-trace-id';
/** 慢请求阈值（毫秒），超过即输出 warn 日志。 */
const SLOW_REQUEST_MS = 1000;

/** 为每个 HTTP 请求注入/透传 X-Trace-Id，并记录慢请求日志 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TraceMiddleware.name);

  /**
   * 处理单个 HTTP 请求：解析/生成 traceId，写入响应头，建立异步上下文，并监听慢请求。
   *
   * @param req Express 请求对象。
   * @param res Express 响应对象。
   * @param next 下一个中间件函数，在 traceStorage.run 作用域内调用。
   *
   * 副作用：
   * - 写入响应头 X-Trace-Id。
   * - 注册 res 'finish' 事件监听器，可能输出 warn 日志。
   * - 通过 traceStorage.run 建立请求级 AsyncLocalStorage 上下文。
   */
  use(req: Request, res: Response, next: NextFunction) {
    // 读取入站请求头中的 traceId（Node 会把头部名小写化）。
    const incoming = req.headers[TRACE_HEADER];
    // 优先使用上游传入的 traceId（trimmed 非空字符串），否则生成新的 UUID。
    const traceId = (typeof incoming === 'string' && incoming.trim()) || randomUUID();
    // 记录请求开始时间，用于 finish 时计算耗时。
    const started = Date.now();
    // 回写规范大小写的 X-Trace-Id 响应头，便于客户端关联与日志检索。
    res.setHeader('X-Trace-Id', traceId);
    res.on('finish', () => {
      const durationMs = Date.now() - started;
      // 优先使用 originalUrl（含查询串），回退到 url，最后兜底 '/'。
      const route = req.originalUrl || req.url || '/';
      // 仅对慢请求输出 warn，避免常规请求日志噪声。
      if (durationMs >= SLOW_REQUEST_MS) {
        this.logger.warn(
          `慢请求 ${req.method} ${route} ${res.statusCode} ${durationMs}ms traceId=${traceId}`,
        );
      }
    });
    // 在 AsyncLocalStorage 作用域内调用 next，使后续中间件/处理器可读取 traceId。
    traceStorage.run({ traceId }, () => next());
  }
}