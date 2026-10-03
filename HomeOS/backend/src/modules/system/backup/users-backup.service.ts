/**
 * @file users-backup.service.ts
 * @module system/backup
 * @description 用户备份服务。负责系统用户（admin/adult/child/guest）的导出与导入，
 * 是完整备份包（SystemBundleBackupService）的 users 分区提供方。
 *
 * 关键策略：
 *  - 导出附 kind=homeos-users，含 username / role / preferences / tokenVersion / createdAt
 *  - 导入时角色不合法回退到 adult，密码由 bcrypt 重置为随机串（不导出原密码哈希）
 *  - tokenVersion 同步写入 TokenVersionCacheService，确保导入后旧 token 立即失效
 *
 * 依赖：
 *  - PrismaService：User 表读写
 *  - TokenVersionCacheService：token 版本缓存同步
 *  - bcryptjs：随机密码哈希
 *  - crypto.randomBytes：随机密码生成
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/service';
import { TokenVersionCacheService } from '../../../common/http-security/token-version-cache.service';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { UserRole } from '../../../generated/prisma/client';

const USERS_BACKUP_KIND = 'homeos-users';
const USER_ROLES: readonly UserRole[] = ['admin', 'adult', 'child', 'guest'];

function parseUserRole(value: string | undefined | null, fallback: UserRole = 'adult'): UserRole {
  const v = String(value || '').trim();
  return USER_ROLES.includes(v as UserRole) ? (v as UserRole) : fallback;
}

/**
 * UserBackupRow：业务类型别名。
 * - 表示：modules/system/backup/users-backup.service.ts 域内联合/映射/函数签名一组相关值；
 * - 用途：避免重复字面量、统一跨文件类型引用
 */
export type UserBackupRow = {
  username: string;
  role: string;
  preferences?: Record<string, unknown> | null;
  tokenVersion?: number;
  createdAt?: string;
};

@Injectable()
/**
 * UsersBackupService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class UsersBackupService
 */
export class UsersBackupService {
  private readonly logger = new Logger(UsersBackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenVersionCache: TokenVersionCacheService,
  ) {}

  async exportUsers(): Promise<{
    kind: typeof USERS_BACKUP_KIND;
    exportedAt: string;
    users: UserBackupRow[];
  }> {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return {
      kind: USERS_BACKUP_KIND,
      exportedAt: new Date().toISOString(),
      users: rows.map((u) => ({
        username: u.username,
        role: u.role,
        preferences: (u.preferences as Record<string, unknown> | null) ?? null,
        tokenVersion: u.tokenVersion,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  }

  async importUsers(
    users: UserBackupRow[],
    opts: { skipExisting?: boolean } = {},
  ): Promise<{
    created: number;
    skipped: number;
    updated: number;
    createdUsernames: string[];
    temporaryPasswords: Array<{ username: string; temporaryPassword: string }>;
  }> {
    // 阶段一（事务外）：分类 + 预先 bcrypt 哈希，避免昂贵的哈希阻塞事务导致超时
    const toUpdate: { id: string; role: UserRole; preferences: unknown }[] = [];
    const toCreate: {
      username: string;
      passwordHash: string;
      temporaryPassword: string;
      role: UserRole;
      preferences: unknown;
      tokenVersion: number;
    }[] = [];
    let skipped = 0;

    for (const row of users) {
      if (!row.username?.trim()) continue;
      const existing = await this.prisma.user.findUnique({ where: { username: row.username } });
      if (existing) {
        if (opts.skipExisting) {
          skipped++;
          continue;
        }
        toUpdate.push({
          id: existing.id,
          role: parseUserRole(row.role, existing.role),
          preferences: row.preferences ?? existing.preferences,
        });
        continue;
      }
      const temporaryPassword = randomBytes(12).toString('base64url');
      toCreate.push({
        username: row.username,
        passwordHash: await bcrypt.hash(temporaryPassword, 10),
        temporaryPassword,
        role: parseUserRole(row.role),
        preferences: row.preferences ?? {},
        tokenVersion: row.tokenVersion ?? 0,
      });
    }

    // 阶段二（事务内）：所有写入原子化，任一失败整体回滚，避免半导入的不一致状态
    await this.prisma.$transaction(async (tx) => {
      for (const u of toUpdate) {
        await tx.user.update({
          where: { id: u.id },
          data: {
            role: u.role,
            preferences: u.preferences as never,
            tokenVersion: { increment: 1 },
          },
        });
      }
      for (const c of toCreate) {
        await tx.user.create({
          data: {
            username: c.username,
            password: c.passwordHash,
            role: c.role,
            preferences: c.preferences as never,
            tokenVersion: c.tokenVersion,
          },
        });
      }
    });

    for (const u of toUpdate) {
      this.tokenVersionCache.invalidate(u.id);
    }

    for (const c of toCreate) {
      this.logger.warn(`备份导入新用户 ${c.username},已生成临时密码,请管理员重置`);
    }

    return {
      created: toCreate.length,
      skipped,
      updated: toUpdate.length,
      createdUsernames: toCreate.map((c) => c.username),
      temporaryPasswords: toCreate.map((c) => ({
        username: c.username,
        temporaryPassword: c.temporaryPassword,
      })),
    };
  }

  /** 回滚用户导入：删除本次新建账号，并尽量恢复导入前已有用户的 role/preferences */
  async rollbackUsersImport(opts: {
    priorUsers: UserBackupRow[];
    createdUsernames: string[];
  }): Promise<void> {
    const priorByName = new Map(opts.priorUsers.map((u) => [u.username, u]));
    await this.prisma.$transaction(async (tx) => {
      for (const username of opts.createdUsernames) {
        await tx.user.deleteMany({ where: { username } });
      }
      for (const prior of opts.priorUsers) {
        if (!prior.username?.trim()) continue;
        const existing = await tx.user.findUnique({ where: { username: prior.username } });
        if (!existing) continue;
        await tx.user.update({
          where: { id: existing.id },
          data: {
            role: parseUserRole(prior.role, existing.role),
            preferences: (prior.preferences ?? existing.preferences) as never,
            tokenVersion: { increment: 1 },
          },
        });
      }
    });
    for (const prior of priorByName.values()) {
      const row = await this.prisma.user.findUnique({ where: { username: prior.username } });
      if (row) this.tokenVersionCache.invalidate(row.id);
    }
    this.logger.warn(
      `已回滚用户导入:删除 ${opts.createdUsernames.length} 个新建账号,恢复 ${opts.priorUsers.length} 个既有账号元数据`,
    );
  }
}
