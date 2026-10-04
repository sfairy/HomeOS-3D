/**
 * 职责：
 *  - Redis 会话序列化、踢人、版本号递增；
 * 关键依赖：
 *  - shared/redis/service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { JwtService } from '@nestjs/jwt';

/** 登录会话有效期（天），1–365，非有限数字回退默认 30 天 */
export function getSessionExpireDays(sessionExpireDaysRaw: unknown): number {
  const raw = Number(sessionExpireDaysRaw);
  if (!Number.isFinite(raw)) return 30;
  return Math.min(365, Math.max(1, Math.round(raw)));
}

/** 把会话天数转成 JWT expiresIn 字符串（`${n}d`） */
export function getSessionExpiresIn(sessionExpireDays: number): `${number}d` {
  return `${sessionExpireDays}d`;
}

/** 把会话天数转成 Cookie maxAge 毫秒值（天 × 24 × 3600 × 1000） */
export function getSessionCookieMaxAgeMs(sessionExpireDays: number): number {
  return sessionExpireDays * 24 * 60 * 60 * 1000;
}

/** 签发访问令牌：把载荷与 expiresIn 一起交给 JwtService.sign */
export function signAccessToken(
  jwtService: JwtService,
  payload: Record<string, unknown>,
  sessionExpiresIn: `${number}d`,
): string {
  return jwtService.sign(payload, { expiresIn: sessionExpiresIn });
}
