/**
 * 职责：
 *  - JWT 认证守卫（Cookie+Bearer 双源）；
 * 关键依赖：
 *  - @nestjs/jwt、jwt-extract.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { isHttpContext } from '../../common/http-security/http-guard.util';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * JWT 认证守卫
 * 作为 APP_GUARD 全局生效；使用 @Public() 标记无需认证的端点。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // 非 HTTP（WebSocket 等）上下文没有 HTTP 请求对象，passport 提取器会直接抛错；
    // WS 链路有独立鉴权，这里放行，避免打断全局守卫链。
    if (!isHttpContext(context)) return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
