/**
 * 职责：
 *  - 游客场景激活守卫（share_code ACL 判断）；
 * 关键依赖：
 *  - guest-share-code.service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { forbidden } from '../../common/utils/business-exception';
import type { Request } from 'express';
import { API_ERROR } from '../../common/errors/api-error-messages';

type AuthRequest = Request & {
  user?: { role?: string; allowedSceneIds?: string[] };
};

/** 访客仅可执行 JWT 白名单内的场景 */
@Injectable()
export class GuestSceneGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const user = req.user;
    if (!user || user.role !== 'guest') return true;
    const rawId = req.params?.id;
    const sceneId = Array.isArray(rawId) ? rawId[0] : rawId;
    const allowed = user.allowedSceneIds || [];
    if (typeof sceneId === 'string' && allowed.includes(sceneId)) return true;
    forbidden(API_ERROR.ACCESS_GUEST_SCENE_DENIED);
  }
}
