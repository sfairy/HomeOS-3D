/**
 * WebSocket 连接鉴权工具：Cookie Token 解析 + JWT 校验与用户解析。
 *
 * 职责：
 * - 从 Socket.IO 握手 Cookie 头提取 auth_token。
 * - 校验 JWT 后调用 resolveAuthenticatedUser 完成用户与 tokenVersion 校验，支持 guest 角色。
 * - 与 HTTP JwtStrategy 对齐的会话吊销检查（jti），保证 WS 与 HTTP 鉴权口径一致。
 *
 * 关键依赖：JwtService、SessionRevocationService、TokenVersionCacheService、user-auth-resolve.util。
 */
import { API_ERROR } from '../../common/errors/api-error-messages';
import { unauthorized } from '../../common/utils/business-exception';
import type { SessionRevocationService } from '../../common/http-security/session-revocation.service';
import type { TokenVersionCacheService } from '../../common/http-security/token-version-cache.service';
import type { AuthUserDb } from '../auth/user-auth-resolve.util';
import { resolveAuthenticatedUser } from '../auth/user-auth-resolve.util';
import type { JwtUserLike } from '@homeos/shared';
import type { JwtService } from '@nestjs/jwt';

type TokenPayload = {
  sub?: string;
  role?: string;
  restrictions?: string[];
  tv?: number;
  jti?: string;
};

type WsAuthPrisma = AuthUserDb;

/** 从 Socket.IO 握手 Cookie 头解析 auth_token */
export function extractAuthTokenFromCookie(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** 校验 JWT 并解析 WS 连接用户（含 tokenVersion 缓存） */
export async function resolveWsUserFromToken(
  token: string,
  jwtService: Pick<JwtService, 'verify'>,
  prisma: WsAuthPrisma,
  tokenVersionCache: Pick<TokenVersionCacheService, 'getSnapshot' | 'setSnapshot'>,
  sessionRevocation: Pick<SessionRevocationService, 'isRevoked'>,
): Promise<JwtUserLike> {
  const payload = jwtService.verify(token) as TokenPayload;
  const role = payload.role || 'user';
  // 单设备登出：该会话 jti 已被吊销则拒绝握手（与 HTTP JwtStrategy 对齐）
  if (await sessionRevocation.isRevoked(payload.jti)) {
    unauthorized(API_ERROR.AUTH_SESSION_EXPIRED);
  }
  if (role === 'guest') {
    return {
      role: 'guest',
      restrictions: Array.isArray(payload.restrictions) ? payload.restrictions : undefined,
    };
  }
  if (payload.sub) {
    const resolved = await resolveAuthenticatedUser(
      { sub: payload.sub, role: payload.role, tv: payload.tv },
      prisma,
      tokenVersionCache,
    );
    return { role: resolved.role, restrictions: resolved.restrictions };
  }
  return {
    role: payload.role || 'user',
    restrictions: Array.isArray(payload.restrictions) ? payload.restrictions : undefined,
  };
}
