/**
 * JWT 认证策略（Passport）：从 Cookie + Bearer 双重提取 Token，校验会话吊销与 tokenVersion。
 *
 * 行为说明：
 *  - 提取顺序：extractJwtFromCookie（HttpOnly auth_token）→ Authorization Bearer；
 *  - ignoreExpiration=false，JWT exp 字段过期直接被 passport-jwt 拒绝；
 *  - validate 阶段：校验 jti（会话登出吊销）、tokenVersion（全设备踢出）、访客 sub 黑名单；
 *  - 返回对象：userId / username / role / restrictions / mfa / allowedSceneIds 等，供 JwtAuthGuard 注入到 req.user。
 * 关键依赖：PrismaService、TokenVersionCacheService、SessionRevocationService、resolveAuthenticatedUser。
 */

import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { unauthorized } from '../../common/utils/business-exception';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/prisma/service';
import { TokenVersionCacheService } from '../../common/http-security/token-version-cache.service';
import { SessionRevocationService } from '../../common/http-security/session-revocation.service';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { resolveAuthenticatedUser } from './user-auth-resolve.util';
import { extractJwtFromCookie } from './jwt-extract.util';

/**
 * JWT 认证策略
 *
 * 双重提取机制：
 * 1. 优先从 Cookie (auth_token) 读取 — HttpOnly，防 XSS
 * 2. 回退到 Authorization: Bearer 头部 — API / Swagger / MCP 等非浏览器调用
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokenVersionCache: TokenVersionCacheService,
    private readonly sessionRevocation: SessionRevocationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractJwtFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('JWT_SECRET'),
    });
  }

  async validate(payload: {
    sub: string;
    username?: string;
    role?: string;
    restrictions?: string[];
    tv?: number;
    jti?: string;
    mfa?: boolean;
    allowedSceneIds?: string[];
  }) {
    // 单设备登出：该会话 jti 已被吊销则拒绝
    if (await this.sessionRevocation.isRevoked(payload.jti)) {
      unauthorized(API_ERROR.AUTH_SESSION_EXPIRED);
    }
    const role = payload.role || 'user';
    if (role === 'guest') {
      // 访客 token 无 jti，登出/吊销以 sub（guest:tokenId）作为黑名单 key，
      // 此处需同步校验，否则已登出的访客 token 在有效期内仍可访问。
      // 访客不落 User 表（无 tokenVersion 可校验），剩余有效期由 JWT exp 保证。
      if (await this.sessionRevocation.isRevoked(payload.sub)) {
        unauthorized(API_ERROR.AUTH_SESSION_EXPIRED);
      }
      return {
        userId: payload.sub,
        username: payload.username || 'guest',
        role,
        restrictions: Array.isArray(payload.restrictions) ? payload.restrictions : undefined,
        allowedSceneIds: Array.isArray(payload.allowedSceneIds)
          ? payload.allowedSceneIds
          : undefined,
      };
    }

    const resolved = await resolveAuthenticatedUser(payload, this.prisma, this.tokenVersionCache);
    return {
      userId: resolved.userId,
      username: resolved.username,
      role: resolved.role,
      restrictions: resolved.restrictions,
      mfa: resolved.mfa,
      notificationPrefs: resolved.notificationPrefs,
    };
  }
}
