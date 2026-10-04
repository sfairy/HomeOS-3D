/**
 * 业务异常与错误码统一定义
 *
 * 职责：
 *   - ErrorCode：业务错误码枚举，供前端按码识别错误类别；
 *   - BusinessException：基于 Nest HttpException 的统一业务异常，构造时携带
 *     errorCode / message / statusCode 三元组，全局异常过滤器据此输出统一响应体；
 *   - notFound / badRequest / forbidden / unauthorized：常用语义化快捷工厂；
 *   - rethrowIfHttpException：catch 包装层防误改工具，遇到 HttpException 直接抛回。
 * 关键依赖：
 *   - @nestjs/common#HttpException / HttpStatus：异常基类与状态码常量
 */
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 业务异常码枚举
 * 统一错误码规范，便于前端识别和处理
 */
export enum ErrorCode {
  /** 通用错误 */
  UNKNOWN = 'UNKNOWN',
  /** 未找到资源 */
  NOT_FOUND = 'NOT_FOUND',
  /** 参数校验失败 */
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  /** 无权限 */
  FORBIDDEN = 'FORBIDDEN',
  /** 未授权 */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** 服务不可用（HA 未连接 / Redis 未就绪） */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  /** 外部服务调用失败 */
  EXTERNAL_ERROR = 'EXTERNAL_ERROR',
  /** 操作冲突（如重复创建） */
  CONFLICT = 'CONFLICT',
  /** 配置错误 */
  CONFIG_ERROR = 'CONFIG_ERROR',
  /** 数据库操作失败 */
  DB_ERROR = 'DB_ERROR',
}

/** 错误码 → 默认 HTTP 状态码映射；构造异常时未显式传 httpStatus 即用此映射 */
const ERROR_HTTP_MAP: Record<string, HttpStatus> = {
  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.VALIDATION_FAILED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.SERVICE_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.EXTERNAL_ERROR]: HttpStatus.BAD_GATEWAY,
  [ErrorCode.CONFLICT]: HttpStatus.CONFLICT,
  [ErrorCode.CONFIG_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.DB_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * 统一业务异常类
 *
 * 用法：
 *   throw new BusinessException(ErrorCode.NOT_FOUND, '设备不存在')
 *   throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, 'Home Assistant 未连接')
 */
export class BusinessException extends HttpException {
  public readonly errorCode: ErrorCode;

  constructor(errorCode: ErrorCode, message: string, httpStatus?: HttpStatus) {
    const status = httpStatus || ERROR_HTTP_MAP[errorCode] || HttpStatus.INTERNAL_SERVER_ERROR;
    super({ errorCode, message, statusCode: status }, status);
    this.errorCode = errorCode;
  }
}

/** 抛出 404 业务异常 */
export function notFound(message: string): never {
  throw new BusinessException(ErrorCode.NOT_FOUND, message);
}

/** 抛出 400 参数校验业务异常 */
export function badRequest(message: string): never {
  throw new BusinessException(ErrorCode.VALIDATION_FAILED, message);
}

/** 抛出 403 权限业务异常 */
export function forbidden(message: string): never {
  throw new BusinessException(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);
}

/** 抛出 401 未授权业务异常 */
export function unauthorized(message: string): never {
  throw new BusinessException(ErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
}

/**
 * 若为 Nest HttpException（含 BusinessException），原样抛出。
 * 用于 catch 包装层：避免把 404/409/400 等误改成 400/500/502。
 */
export function rethrowIfHttpException(err: unknown): void {
  if (err instanceof HttpException) throw err;
}
