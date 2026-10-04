/**
 * 职责：
 *  - MFA TOTP 校验+可信设备Cookie辅助；
 * 关键依赖：
 *  - otplib；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { badRequest, forbidden, unauthorized } from '../../common/utils/business-exception';
import type { PrismaService } from '../../shared/prisma/service';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { API_ERROR } from '../../common/errors/api-error-messages';

interface AuthMfaDeps {
  prisma: PrismaService;
  invalidateUserSessions: (userId: string) => Promise<void>;
  recordLoginAudit: (
    username: string,
    userId: string | null | undefined,
    ip: string | undefined,
    success: boolean,
    reason?: string,
  ) => Promise<void>;
  validateUser: (
    username: string,
    pass: string,
    ip?: string,
    userAgent?: string,
  ) => Promise<{ id: string; username: string; role: string }>;
  /** 原子累加失败登录次数并在达到阈值时锁定账户，返回是否触发锁定 */
  recordFailedLoginAttempt: (
    userId: string,
    username: string,
    ip?: string,
  ) => Promise<{ lockedUntil: Date | null }>;
  login: (
    user: { id: string; username: string; role: string },
    opts?: { mfaVerified?: boolean },
  ) => Promise<{
    access_token: string;
    username: string;
    role: string;
    restrictions: string[];
    /** 远程访问地址（layout.externalUrl），供原生端 / 已配对终端取回入口 */
    external_url: string;
  }>;
}

/** 查询 MFA 启用状态（仅管理员可用，非管理员拒绝） */
export async function getMfaStatus(deps: AuthMfaDeps, userId: string) {
  const user = await deps.prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, totpEnabled: true },
  });
  if (!user || user.role !== 'admin') {
    forbidden(API_ERROR.AUTH_MFA_ADMIN_ONLY);
  }
  return { enabled: user.totpEnabled };
}

/** 发起 MFA 设置：生成 TOTP 密钥与 otpauth URI、二维码 DataURL（此时未启用） */
export async function startMfaSetup(deps: AuthMfaDeps, userId: string) {
  const user = await deps.prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'admin') {
    forbidden(API_ERROR.AUTH_MFA_ADMIN_ONLY);
  }
  const secret = generateSecret();
  await deps.prisma.user.update({
    where: { id: userId },
    data: { totpSecret: secret, totpEnabled: false },
  });
  const uri = generateURI({ issuer: 'HomeOS', label: user.username, secret });
  const qrDataUrl = await QRCode.toDataURL(uri);
  return { secret, uri, qrDataUrl };
}

/** 确认启用 MFA：校验 6 位验证码通过后置 totpEnabled=true 并自增 tokenVersion */
export async function confirmMfaSetup(deps: AuthMfaDeps, userId: string, code: string) {
  const user = await deps.prisma.user.findUnique({ where: { id: userId } });
  if (!user?.totpSecret) badRequest(API_ERROR.AUTH_MFA_SETUP_REQUIRED);
  const verified = verifySync({ token: code, secret: user.totpSecret });
  if (!verified.valid) {
    badRequest(API_ERROR.AUTH_MFA_TOTP_INVALID);
  }
  await deps.prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: true, tokenVersion: { increment: 1 } },
  });
  await deps.invalidateUserSessions(userId);
  return { enabled: true };
}

/** 关闭 MFA：校验验证码后清空密钥与启用标志，并自增 tokenVersion */
export async function disableMfa(deps: AuthMfaDeps, userId: string, code: string) {
  const user = await deps.prisma.user.findUnique({ where: { id: userId } });
  if (!user?.totpSecret || !user.totpEnabled) {
    return { enabled: false };
  }
  const verified = verifySync({ token: code, secret: user.totpSecret });
  if (!verified.valid) {
    badRequest(API_ERROR.AUTH_MFA_TOTP_INVALID);
  }
  await deps.prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, tokenVersion: { increment: 1 } },
  });
  await deps.invalidateUserSessions(userId);
  return { enabled: false };
}

/**
 * 带 MFA 的登录：先完成密码校验，再用 TOTP 验证码复核。
 * TOTP 验证码错误同样累加失败登录计数并可能触发锁定，防止慢速爆破 TOTP。
 */
export async function loginWithMfa(
  deps: AuthMfaDeps,
  username: string,
  pass: string,
  code: string,
  ip?: string,
  userAgent?: string,
) {
  const user = await deps.validateUser(username, pass, ip, userAgent);
  const row = await deps.prisma.user.findUnique({
    where: { id: user.id },
    select: { totpSecret: true, totpEnabled: true },
  });
  // 不限定角色：只要账户启用了 TOTP 即可走 MFA 复核，与 refresh 滑动续期的强制策略对称
  if (!row?.totpEnabled || !row.totpSecret) {
    badRequest(API_ERROR.AUTH_MFA_NOT_ENABLED);
  }
  const verified = verifySync({ token: code, secret: row.totpSecret });
  if (!verified.valid) {
    // TOTP 错误同样累加失败登录次数，连续失败触发锁定，防止慢速爆破 TOTP
    const { lockedUntil } = await deps.recordFailedLoginAttempt(user.id, username, ip);
    await deps.recordLoginAudit(
      username,
      user.id,
      ip,
      false,
      lockedUntil ? 'invalid_mfa_locked' : 'invalid_mfa',
    );
    unauthorized(API_ERROR.AUTH_MFA_TOTP_INVALID);
  }
  return deps.login(user, { mfaVerified: true });
}

/** 判断账户是否需要走 MFA 第二步：仅 admin 且已启用 TOTP */
export function userRequiresMfa(user: { id: string; role?: string; totpEnabled?: boolean }) {
  return user.role === 'admin' && user.totpEnabled === true;
}
