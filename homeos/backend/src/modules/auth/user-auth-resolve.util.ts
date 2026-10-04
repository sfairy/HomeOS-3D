/**
 * @file user-auth-resolve.util.ts
 * @module backend/src/modules
 *
 * 已登录用户解析工具：把 JWT 载荷映射为请求上下文所需的用户快照。
 * 关键策略：
 * - 优先用进程内 tokenVersion 缓存命中（与 payload.tv 一致即放行，避免每次请求查 DB）。
 * - 未命中或版本不一致时回查 DB，校验 tokenVersion 一致后回填缓存。
 * - admin 不返回 restrictions；非 admin 返回 preferences.entityRestrictions。
 */
import { unauthorized } from '../../common/utils/business-exception';
import { API_ERROR } from '../../common/errors/api-error-messages';
import type {
  TokenVersionCacheService,
  UserAuthSnapshot,
} from '../../common/http-security/token-version-cache.service';

/** 解析后供守卫/请求处理使用的用户快照 */
interface ResolvedAuthUser {
  userId: string;
  username: string;
  role: string;
  restrictions?: string[];
  mfa?: boolean;
  notificationPrefs: Record<string, unknown>;
}

/** 仅暴露 user.findUnique 子集的最小 DB 接口，便于单测替换 */
export type AuthUserDb = {
  user: {
    findUnique: (args: {
      where: { id: string };
      select: { tokenVersion: true; username: true; role: true; preferences: true };
    }) => Promise<{
      tokenVersion: number;
      username: string;
      role: string;
      preferences: unknown;
    } | null>;
  };
};

/** 解析受限域：admin 返回 undefined（不受限）；非 admin 在 entityRestrictions 非空时返回 */
export function resolveRestrictions(role: string, preferences: unknown): string[] | undefined {
  if (role === 'admin') return undefined;
  const prefs = (preferences || {}) as Record<string, unknown>;
  if (Array.isArray(prefs.entityRestrictions) && prefs.entityRestrictions.length > 0) {
    return prefs.entityRestrictions as string[];
  }
  return undefined;
}

/** 从用户偏好中安全提取 notification 子对象（非对象时返回空对象） */
function extractNotificationPrefs(preferences: unknown): Record<string, unknown> {
  const prefs = (preferences || {}) as Record<string, unknown>;
  const n = prefs.notification;
  return n && typeof n === 'object' && !Array.isArray(n) ? (n as Record<string, unknown>) : {};
}

/** 由缓存/DB 快照 + JWT 载荷组装解析后的用户对象 */
function userFromSnapshot(
  userId: string,
  snapshot: Pick<UserAuthSnapshot, 'username' | 'role' | 'preferences'>,
  payload: { username?: string; mfa?: boolean },
): ResolvedAuthUser {
  const role = snapshot.role || 'user';
  return {
    userId,
    username: payload.username || snapshot.username,
    role,
    restrictions: resolveRestrictions(role, snapshot.preferences),
    mfa: payload.mfa === true,
    notificationPrefs: extractNotificationPrefs(snapshot.preferences),
  };
}

/** 解析已登录用户：优先 tokenVersion 进程内缓存，miss 时查 DB 并回填 */
export async function resolveAuthenticatedUser(
  payload: {
    sub: string;
    username?: string;
    role?: string;
    tv?: number;
    mfa?: boolean;
  },
  prisma: AuthUserDb,
  tokenVersionCache: Pick<TokenVersionCacheService, 'getSnapshot' | 'setSnapshot'>,
): Promise<ResolvedAuthUser> {
  const tokenVersion = typeof payload.tv === 'number' ? payload.tv : 0;
  const cached = tokenVersionCache.getSnapshot(payload.sub);
  if (cached && cached.tokenVersion === tokenVersion) {
    return userFromSnapshot(payload.sub, cached, payload);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { tokenVersion: true, username: true, role: true, preferences: true },
  });
  if (!user) {
    unauthorized(API_ERROR.AUTH_USER_OR_SESSION_INVALID);
  }
  if (tokenVersion !== user.tokenVersion) {
    unauthorized(API_ERROR.AUTH_SESSION_EXPIRED);
  }

  const role = user.role || payload.role || 'user';
  tokenVersionCache.setSnapshot(payload.sub, {
    tokenVersion: user.tokenVersion,
    username: user.username,
    role,
    preferences: user.preferences,
  });

  return userFromSnapshot(
    payload.sub,
    {
      username: user.username,
      role,
      preferences: user.preferences,
    },
    payload,
  );
}
