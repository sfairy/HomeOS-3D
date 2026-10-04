/**
 * 职责：
 *  - 游客身份解析+权限断言+share_code反查助手；
 * 关键依赖：
 *  - jwt-extract.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { unauthorized, rethrowIfHttpException } from '../../common/utils/business-exception';
import type { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import type { GuestShareCodeService, GuestSharePayload } from './guest-share-code.service';
import { API_ERROR } from '../../common/errors/api-error-messages';

interface AuthGuestDeps {
  jwtService: JwtService;
  guestShareCodes: GuestShareCodeService;
}

/**
 * 生成访客 JWT 与短码：同时签发 JWT 与一次性分享短码。
 * sub 为 `guest:<tokenId>`，role 固定为 guest，过期由 JWT exp 控制。
 */
export async function generateGuestToken(
  deps: AuthGuestDeps,
  issuerId: string,
  validHours = 8,
  restrictions?: string[],
  allowedSceneIds?: string[],
) {
  const now = Date.now();
  const expiresAt = now + validHours * 3600_000;
  const tokenId = randomBytes(8).toString('hex');

  const payload: GuestSharePayload = {
    sub: `guest:${tokenId}`,
    role: 'guest',
    iss: issuerId,
    restrictions: restrictions || [],
    allowedSceneIds: (allowedSceneIds || []).filter(Boolean),
  };

  const token = deps.jwtService.sign(payload, { expiresIn: `${validHours}h` });
  const code = await deps.guestShareCodes.register(payload, validHours);

  return {
    token,
    code,
    tokenId,
    expiresAt: new Date(expiresAt).toISOString(),
    validHours,
    shareUrl: `/guest?code=${code}`,
  };
}

/** 校验访客 JWT：role 必须为 guest，否则视为非访客令牌并拒绝。 */
export function verifyGuestToken(deps: AuthGuestDeps, token: string) {
  try {
    const payload = deps.jwtService.verify(token);
    if (payload.role !== 'guest') {
      unauthorized(API_ERROR.AUTH_NOT_GUEST_TOKEN);
    }
    return {
      valid: true,
      issuerId: payload.iss,
      restrictions: payload.restrictions || [],
      allowedSceneIds: Array.isArray(payload.allowedSceneIds) ? payload.allowedSceneIds : [],
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  } catch (e) {
    rethrowIfHttpException(e);
    unauthorized(API_ERROR.AUTH_GUEST_TOKEN_INVALID);
  }
}

/** 访客 JWT 登录：复用已有令牌直接返回登录响应（不重新签发）。 */
export function guestLogin(deps: AuthGuestDeps, token: string) {
  const info = verifyGuestToken(deps, token);
  return {
    role: 'guest',
    restrictions: info.restrictions,
    allowedSceneIds: info.allowedSceneIds || [],
    expiresAt: info.expiresAt,
    access_token: token,
  };
}

/**
 * 用一次性分享短码换取访客 JWT：在事务中查询并删除短码，
 * 按剩余 TTL 重新签发 JWT（兑换即作废，无法重复使用）。
 */
export async function exchangeGuestCode(
  deps: AuthGuestDeps,
  code: string,
): Promise<{
  role: string;
  restrictions: string[];
  allowedSceneIds: string[];
  expiresAt: string;
  access_token: string;
}> {
  try {
    const token = await deps.guestShareCodes.exchange(code);
    return guestLogin(deps, token);
  } catch (e) {
    rethrowIfHttpException(e);
    unauthorized(e instanceof Error ? e.message : API_ERROR.AUTH_GUEST_SHARE_CODE_INVALID);
  }
}
