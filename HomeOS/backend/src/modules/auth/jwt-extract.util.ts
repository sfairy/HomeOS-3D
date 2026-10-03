/**
 * 所属模块：backend/modules/auth
 * 职责：
 *  - JWT 双源抽取工具（homeos_token / Bearer）；
 * 关键依赖：
 *  - -；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { Request } from 'express';

/** 从 HttpOnly `auth_token` Cookie 提取 JWT（缺失或非字符串时返回 null） */
export function extractJwtFromCookie(req: Request | undefined): string | null {
  const token = req?.cookies?.['auth_token'];
  return typeof token === 'string' && token ? token : null;
}

/** 从 Authorization: Bearer 头部提取 JWT（缺失或格式不符时返回 null）。
 *  由测试（test/guest-write.util.test.ts）直接引用，故保持导出。 */
export function extractJwtFromBearer(req: Request | undefined): string | null {
  const header = req?.headers?.authorization;
  if (typeof header !== 'string') return null;
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * 与 JwtStrategy 相同的提取顺序：Cookie 优先，其次 Bearer。
 * GuestWriteGuard 必须走同一路径，避免只读 Cookie 时 Bearer 访客漏检。
 */
export function extractJwtFromRequest(req: Request | undefined): string | null {
  return extractJwtFromCookie(req) || extractJwtFromBearer(req);
}
