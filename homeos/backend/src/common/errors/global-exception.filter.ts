/**
 * @file global-exception.filter.ts
 * @module backend/src/common
 *
 * 全局异常过滤器（NestJS ExceptionFilter）。
 *
 * 职责：
 * - 统一捕获应用中未处理的所有异常（@Catch() 无参装饰器表示全量捕获），
 *   将其转换为面向客户端的统一 JSON 响应结构。
 * - 区分 BusinessException（带稳定错误码）、HttpException（Nest/框架异常）与
 *   原生 Error，分别提取状态码、消息与错误码。
 * - 将英文 / 框架内置异常文案规范为中文（localizeHttpExceptionMessage）。
 * - 注入当前请求的 traceId，便于客户端/日志按请求关联排查。
 * - 按状态码分级输出日志：5xx 走 error（含堆栈前 3 行），4xx 走 warn，
 *   健康检查 / 登录状态探活的 401 视为常规不打 warn，避免噪声。
 *
 * 关键依赖：
 * - ../utils#BusinessException / ErrorCode / getErrorMessage：业务异常与错误码
 * - ../observability/trace-context#getTraceId：请求级追踪 ID
 * - ./api-error-resolver.util#resolveApiErrorCode：从 message 反查稳定 apiErrorCode
 * - ./http-exception-message.util：展平 message 数组与中文本地化
 *
 * 安全相关：生产环境 5xx 响应统一对外的 message 替换为「服务器内部错误」，
 * 避免向客户端泄露堆栈/内部细节；开发环境保留原始 message 便于排查。
 */
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BusinessException, ErrorCode, getErrorMessage } from '../utils';
import { getTraceId } from '../observability/trace-context';
import { resolveApiErrorCode } from './api-error-resolver.util';
import {
  flattenHttpExceptionMessage,
  localizeHttpExceptionMessage,
} from './http-exception-message.util';

/**
 * 全局异常过滤器：捕获所有未处理异常并统一转换为 JSON 响应。
 *
 * 在 main.ts 中通过 `app.useGlobalFilters(new GlobalExceptionFilter())` 注册，
 * 作为整个应用异常响应的最后一道统一出口。响应体结构包含 statusCode /
 * errorCode / error / message / timestamp / path / traceId（可选）/ apiErrorCode（可选）。
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  /**
   * 处理异常：提取状态码/消息/错误码，分级记录日志，并返回统一 JSON 响应。
   *
   * 处理顺序：
   * 1. 按异常类型（BusinessException / HttpException / 原生 Error）解析 status、message、errorCode；
   * 2. 经 localizeHttpExceptionMessage 将英文/框架文案规范为中文；
   * 3. 按状态码分级记录日志（5xx error + 堆栈前 3 行；4xx warn；探活 401 跳过）；
   * 4. 生产环境 5xx 对外 message 统一为「服务器内部错误」，避免泄露细节；
   * 5. 解析稳定 apiErrorCode 供前端 i18n，写入响应体返回。
   *
   * @param exception 抛出的异常对象（类型未知）。
   * @param host      ArgumentsHost，用于切换到 HTTP 上下文获取 Request/Response。
   */
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let error = '服务器内部错误';
    let errorCode = ErrorCode.UNKNOWN;

    if (exception instanceof BusinessException) {
      status = exception.getStatus();
      message = exception.message;
      errorCode = exception.errorCode;
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        message = flattenHttpExceptionMessage(r.message, message);
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        error = exception.name;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        message = flattenHttpExceptionMessage(r.message, message);
        error = (r.error as string) || exception.name;
        errorCode = (r.errorCode as ErrorCode) || ErrorCode.UNKNOWN;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    message = localizeHttpExceptionMessage(message, status, String(error || ''));

    if (status >= 500) {
      const errMsg = getErrorMessage(exception);
      if (status === HttpStatus.SERVICE_UNAVAILABLE) {
        this.logger.warn(`[503 服务不可用] ${request.method} ${request.url} | 错误码=${errorCode} | ${errMsg}`);
      } else {
        this.logger.error(
          `[${status} 服务器错误] ${request.method} ${request.url} | 错误码=${errorCode} | ${errMsg}`,
          exception instanceof Error && exception.stack
            ? exception.stack.split('\n').slice(0, 3).join('\n')
            : '',
        );
      }
    } else if (status >= 400) {
      const path = request.url?.split('?')[0] || '';
      const routineUnauthorized =
        status === HttpStatus.UNAUTHORIZED &&
        (path.endsWith('/health') || path.endsWith('/auth/status'));
      if (!routineUnauthorized) {
        this.logger.warn(
          `[${status} 客户端错误] ${request.method} ${request.url}: ${message}(错误码=${errorCode})`,
        );
      }
    }

    const traceId = getTraceId() || (request.headers['x-trace-id'] as string | undefined);
    const displayMessage =
      status >= 500 && process.env.NODE_ENV === 'production' ? '服务器内部错误' : message;
    const apiErrorCode = resolveApiErrorCode(displayMessage);
    response.status(status).json({
      statusCode: status,
      errorCode,
      ...(apiErrorCode ? { apiErrorCode } : {}),
      error,
      message: displayMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(traceId ? { traceId } : {}),
    });
  }
}
