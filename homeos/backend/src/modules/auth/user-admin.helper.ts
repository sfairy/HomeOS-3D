/**
 * @file auth-user-admin.helper.ts
 * @module backend/src/modules
 *
 * 用户管理辅助函数：列表/创建/更新/删除用户。
 * 关键安全约束：
 * - 仅 admin 可修改其它 admin；不允许降级最后一个管理员、不允许删除最后一个管理员、不允许删除自己。
 * - 修改密码/角色/受限域会自增 tokenVersion，使该用户其它设备的会话失效。
 * - 用户对外暴露前经 sanitizeUser 脱敏：剥离 password、把 preferences.entityRestrictions 提到顶层。
 */
import { badRequest, forbidden, notFound } from '../../common/utils/business-exception';
import * as bcrypt from 'bcryptjs';
import type { PrismaService } from '../../shared/prisma/service';
import { assertPasswordPolicy } from '../../common/http-security/cookie-cors.util';
import { API_ERROR } from '../../common/errors/api-error-messages';
import type { UserRole } from '../../generated/prisma/client';

/** 用户脱敏输出：剥离 password、把 entityRestrictions 提到顶层、序列化 createdAt */
function sanitizeUser(user: {
  id: string;
  username: string;
  role: string;
  preferences?: unknown;
  createdAt?: Date;
}) {
  const prefs = (user.preferences || {}) as Record<string, unknown>;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    entityRestrictions: Array.isArray(prefs.entityRestrictions) ? prefs.entityRestrictions : [],
    createdAt: user.createdAt?.toISOString?.() || undefined,
  };
}

interface AuthUserAdminDeps {
  prisma: PrismaService;
}

/** 列出全部用户（按创建时间升序，最多 500 条） */
export async function listUsers(deps: AuthUserAdminDeps) {
  const users = await deps.prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  return users.map((u) => sanitizeUser(u));
}

/**
 * 创建用户：校验密码强度、用户名唯一、角色合法（admin/adult/child）。
 * guest 角色由访客短码流程产生，不允许在此创建。
 */
export async function createUser(
  deps: AuthUserAdminDeps,
  data: { username: string; password: string; role?: string; entityRestrictions?: string[] },
) {
  assertPasswordPolicy(data.password);
  const exists = await deps.prisma.user.findUnique({ where: { username: data.username } });
  if (exists) forbidden(API_ERROR.AUTH_USER_EXISTS);
  const hashedPassword = await bcrypt.hash(data.password, 10);
  const role = (data.role || 'adult') as UserRole;
  const allowed: UserRole[] = ['admin', 'adult', 'child'];
  if (!allowed.includes(role)) forbidden(API_ERROR.AUTH_INVALID_ROLE);
  const preferences = {
    entityRestrictions: data.entityRestrictions || [],
  };
  const user = await deps.prisma.user.create({
    data: { username: data.username, password: hashedPassword, role, preferences },
  });
  return sanitizeUser(user);
}

/**
 * 更新用户：修改密码/角色/受限域任一项时自增 tokenVersion，
 * 使该用户其它设备的会话立即失效（避免旧凭据继续生效）。
 * 最后一个管理员不允许降级，避免系统失去管理员。
 */
export async function updateUser(
  deps: AuthUserAdminDeps,
  userId: string,
  data: { username?: string; password?: string; role?: string; entityRestrictions?: string[] },
  actorRole: string,
) {
  const user = await deps.prisma.user.findUnique({ where: { id: userId } });
  if (!user) notFound(API_ERROR.AUTH_USER_NOT_FOUND);
  if (user.role === 'admin' && actorRole !== 'admin') {
    forbidden(API_ERROR.AUTH_CANNOT_MODIFY_ADMIN);
  }
  const updateData: Record<string, unknown> = {};
  let bumpTokenVersion = false;
  if (data.username) updateData.username = data.username;
  if (data.password) {
    assertPasswordPolicy(data.password);
    updateData.password = await bcrypt.hash(data.password, 10);
    bumpTokenVersion = true;
  }
  if (data.role) {
    const allowed = ['admin', 'adult', 'child'];
    if (!allowed.includes(data.role)) forbidden(API_ERROR.AUTH_INVALID_ROLE);
    if (data.role !== user.role) {
      // 最后一个管理员降级保护：避免降级自身导致系统无管理员
      if (user.role === 'admin' && data.role !== 'admin') {
        const adminCount = await deps.prisma.user.count({ where: { role: 'admin' } });
        if (adminCount <= 1) {
          badRequest(API_ERROR.AUTH_CANNOT_DEMOTE_LAST_ADMIN);
        }
      }
      updateData.role = data.role;
      bumpTokenVersion = true;
    }
  }
  if (data.entityRestrictions !== undefined) {
    const existing = (user.preferences || {}) as Record<string, unknown>;
    const prevRestrictions = Array.isArray(existing.entityRestrictions)
      ? existing.entityRestrictions
      : [];
    const nextRestrictions = data.entityRestrictions;
    const restrictionsChanged =
      prevRestrictions.length !== nextRestrictions.length ||
      prevRestrictions.some((r, i) => r !== nextRestrictions[i]);
    updateData.preferences = { ...existing, entityRestrictions: nextRestrictions };
    if (restrictionsChanged) {
      bumpTokenVersion = true;
    }
  }
  if (bumpTokenVersion) {
    updateData.tokenVersion = { increment: 1 };
  }
  const updated = await deps.prisma.user.update({
    where: { id: userId },
    data: updateData as never,
  });
  return sanitizeUser(updated);
}

/**
 * 删除用户：不允许删除自己、不允许删除最后一个管理员，
 * 删除后由调用方再触发 tokenVersion 失效（保证该用户其它会话立即失效）。
 */
export async function deleteUser(deps: AuthUserAdminDeps, userId: string, actorId: string) {
  if (userId === actorId) forbidden(API_ERROR.AUTH_CANNOT_DELETE_SELF);
  const user = await deps.prisma.user.findUnique({ where: { id: userId } });
  if (!user) notFound(API_ERROR.AUTH_USER_NOT_FOUND);
  const adminCount = await deps.prisma.user.count({ where: { role: 'admin' } });
  if (user.role === 'admin' && adminCount <= 1) {
    forbidden(API_ERROR.AUTH_CANNOT_DELETE_LAST_ADMIN);
  }
  await deps.prisma.user.delete({ where: { id: userId } });
  return { success: true };
}
