/**
 * @file auth-login-audit.helper.ts
 * @module backend/src/modules
 *
 * 登录审计辅助函数：将每次登录尝试（成功/失败）落 LoginAudit 表，
 * 失败时 reason 标注原因（invalid_password / account_locked / invalid_mfa 等）。
 * 写入失败仅 warn 不抛错，确保审计异常不影响登录主流程。
 */
import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../shared/prisma/service';

interface AuthLoginAuditDeps {
  prisma: PrismaService;
  logger: Pick<Logger, 'warn'>;
}

/**
 * 记录一条登录审计：ip 截断至 64 字符，userId 缺失时落 null。
 * 写入异常仅 warn 不上抛，避免审计写入失败影响登录主流程。
 */
export async function recordLoginAudit(
  deps: AuthLoginAuditDeps,
  username: string,
  userId: string | null | undefined,
  ip: string | undefined,
  success: boolean,
  reason?: string,
) {
  try {
    await deps.prisma.loginAudit.create({
      data: {
        username,
        userId: userId ?? undefined,
        ip: ip?.slice(0, 64),
        success,
        reason,
      },
    });
  } catch (err) {
    deps.logger.warn(`登录审计写入失败: ${(err as Error).message}`);
  }
}

/**
 * 分页查询登录审计记录（按 createdAt 倒序）。
 * limit 自动收敛到 1–200，page 至少为 1，返回分页元信息。
 */
export async function getLoginAudit(deps: AuthLoginAuditDeps, limit = 50, page = 1) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const pageNum = Math.max(Number(page) || 1, 1);
  const skip = (pageNum - 1) * take;
  const [rows, total] = await Promise.all([
    deps.prisma.loginAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    deps.prisma.loginAudit.count(),
  ]);
  const items = rows.map((r) => ({
    id: r.id,
    username: r.username,
    userId: r.userId,
    ip: r.ip,
    success: r.success,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
  const totalPages = Math.max(1, Math.ceil(total / take));
  return { items, total, page: pageNum, totalPages, limit: take };
}
