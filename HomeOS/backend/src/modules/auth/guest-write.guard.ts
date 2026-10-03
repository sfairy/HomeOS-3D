/**
 * 所属模块：backend/modules/auth
 * 职责：
 *  - 游客写操作守卫（细粒度实体ACL）；
 * 关键依赖：
 *  - guest-write.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { forbidden } from '../../common/utils/business-exception';
import { isHttpContext } from '../../common/http-security/http-guard.util';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { extractJwtFromRequest } from './jwt-extract.util';
import { evaluateGuestWriteAccess } from './guest-write.util';

type AuthRequest = Request & { user?: { role?: string; allowedSceneIds?: string[] } };

/**
 * 访客角色禁止写操作。
 * 在 JwtAuthGuard 之后运行：优先用 req.user；未填充时与 JwtStrategy 共用 Cookie+Bearer 提取。
 */
@Injectable()
export class GuestWriteGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    // 非 HTTP（WebSocket 等）上下文无 req.method / req.path，跳过；
    // 访客写保护的语义只作用于 HTTP API，WS 链路有独立鉴权。
    if (!isHttpContext(context)) return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const payload = this.resolvePayload(req);
    const decision = evaluateGuestWriteAccess({
      method: req.method,
      path: req.path || req.originalUrl?.split('?')[0] || '',
      role: payload?.role ?? req.user?.role,
      allowedSceneIds: payload?.allowedSceneIds ?? req.user?.allowedSceneIds,
    });
    if (decision === 'allow') return true;
    forbidden(API_ERROR.ACCESS_GUEST_READ_ONLY);
  }

  private resolvePayload(req: AuthRequest):
    | {
        role?: string;
        allowedSceneIds?: string[];
      }
    | undefined {
    if (req.user?.role) {
      return {
        role: req.user.role,
        allowedSceneIds: req.user.allowedSceneIds,
      };
    }
    const token = extractJwtFromRequest(req);
    if (!token) return undefined;
    try {
      return this.jwtService.verify(token) as { role?: string; allowedSceneIds?: string[] };
    } catch {
      return undefined;
    }
  }
}
