/**
 * 职责：
 *  - 孤儿记录 GC（扫描无主外键引用清理）；
 * 关键依赖：
 *  - shared/prisma/service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { PrismaService } from '../../shared/prisma/service';

/**
 * 清空审计表中失效的 userId（User 删除后 SET NULL 已覆盖正常路径；此处置历史脏数据）。
 * @returns 各步骤影响行数（仅 >0 的键）
 */
export async function pruneSoftReferenceOrphans(
  prisma: PrismaService,
): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};

  const commandAuditNulls = await prisma.$executeRaw`
    UPDATE "CommandAudit" AS ca
    SET "userId" = NULL
    WHERE ca."userId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "User" AS u WHERE u.id = ca."userId")
  `;
  if (commandAuditNulls > 0) deleted.commandAuditUserIdCleared = commandAuditNulls;

  const loginAuditNulls = await prisma.$executeRaw`
    UPDATE "LoginAudit" AS la
    SET "userId" = NULL
    WHERE la."userId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "User" AS u WHERE u.id = la."userId")
  `;
  if (loginAuditNulls > 0) deleted.loginAuditUserIdCleared = loginAuditNulls;

  return deleted;
}
