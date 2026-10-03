/**
 * 所属模块：backend/modules/auth
 * 职责：
 *  - 角色守卫（@Roles admin/member/guest）；
 * 关键依赖：
 *  - @nestjs/common Reflector；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { getEntityDomain, isChildRestrictedDomain } from '@homeos/shared';
import { Injectable, CanActivate, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isHttpContext } from '../../common/http-security/http-guard.util';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Reflector 读取角色清单的 key */
const ROLES_KEY = 'roles';
/** 角色装饰器：声明该端点允许的角色集合 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** 写方法集合：未声明 @Roles 时 child 默认拒绝 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 角色权限守卫
 *
 * 与 JwtAuthGuard 配合使用：
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles('admin')
 *   @Post('dangerous')
 *
 * 权限矩阵：
 *  - admin:  全部操作
 *  - adult:  控制设备、查看
 *  - child:  查看 + 白名单设备控制
 *  - guest:  默认只读；端点显式 @Roles(...,'guest') 时允许（如白名单场景执行）
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 非 HTTP（WebSocket 等）上下文无 req.method / req.user，跳过；
    // 角色判定只作用于 HTTP API，WS 链路有独立鉴权。
    if (!isHttpContext(context)) return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!requiredRoles || requiredRoles.length === 0) {
      // 未标注 @Roles 的写端点：child 默认拒绝（guest 由 GuestWriteGuard 先行拦截）
      if (user?.role === 'child' && WRITE_METHODS.has(request.method)) {
        return false;
      }
      return true;
    }

    if (!user || !user.role) {
      return false;
    }

    // admin 万能通行
    if (user.role === 'admin') return true;

    // child 角色设备白名单检查（受限域清单以 @homeos/shared 为准，含 siren）
    if (user.role === 'child') {
      // 从 body/params/query 多来源解析 entity_id，避免通过 URL 参数绕过受限域检查
      const body = request.body || {};
      const params = request.params || {};
      const query = request.query || {};
      const entityId =
        body.entity_id || body.entityId ||
        params.entity_id || params.entityId ||
        query.entity_id || query.entityId || '';
      const domain = getEntityDomain(entityId);
      if (isChildRestrictedDomain(domain)) {
        return false;
      }
      // 非受限域：仅当端点显式允许 child 时放行
      return requiredRoles.includes('child');
    }

    // guest：仅当端点显式列入 @Roles 时放行（场景执行等）；默认只读
    if (user.role === 'guest') {
      return requiredRoles.includes('guest');
    }

    return requiredRoles.includes(user.role);
  }
}
