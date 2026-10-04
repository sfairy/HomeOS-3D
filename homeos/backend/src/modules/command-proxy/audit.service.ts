/**
 * 命令代理审计服务模块。
 *
 * 职责：
 *  - 记录 HA 服务调用命令的审计日志（用户、域、服务、实体、成功/失败、错误信息）。
 *  - 提供审计日志的查询（分页/按实体/按用户）与清除能力，供管理员审查。
 *  - 审计写入通过 setImmediate 异步执行，避免阻塞主请求链路；写入失败仅记录告警不抛出。
 *
 * 依赖：
 *  - PrismaService：commandAudit 表的读写。
 *  - command-proxy.dto 中的 CallServiceDto 类型。
 */
import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import type { CallServiceDto } from './dto';

/**
 * 命令审计服务（DI 角色：Provider）。
 * 负责命令调用审计的写入、查询与清除。
 */
@Injectable()
export class CommandProxyAuditService {
  private readonly logger = new Logger(CommandProxyAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 异步写入一条命令审计记录。
   * 通过 setImmediate 将写入推迟到事件循环下一轮，避免阻塞当前请求；
   * 写入失败时仅记录 warn 日志，不影响主流程。
   *
   * @param user 调用方用户信息（userId/username/role）
   * @param dto 调用 DTO（包含 domain/service/entity_id）
   * @param success 是否执行成功
   * @param error 失败时的错误信息（可选）
   */
  logCommandAudit(
    user: { userId?: string; username?: string; role?: string } | undefined,
    dto: CallServiceDto,
    success: boolean,
    error?: string,
  ) {
    setImmediate(() => {
      this.prisma.commandAudit
        .create({
          data: {
            userId: user?.userId,
            username: user?.username,
            role: user?.role,
            domain: dto.domain,
            service: dto.service,
            entityId: dto.entity_id,
            success,
            error: error || null,
          },
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `命令审计写入失败: ${dto.domain}.${dto.service} user=${user?.username ?? user?.userId ?? '?'} - ${getErrorMessage(err)}`,
          );
        });
    });
  }

  /**
   * 构建审计查询的 Prisma where 条件。
   * - entityId 含点号（如 light.a）时按精确匹配，避免 light.a 误命中 light.abc。
   * - entityId 不含点号时按包含匹配，便于模糊搜索。
   * - username 按前缀匹配（startsWith），命中 [username, createdAt] 复合索引，
   *   避免 contains（%username%）导致的索引失效全表扫描。
   *
   * @param entityId 实体 ID（可选）
   * @param username 用户名（可选）
   * @returns 构造好的 where 条件，无条件时返回 undefined
   */
  buildCommandAuditWhere(entityId?: string, username?: string) {
    const where: {
      entityId?: string | { contains: string };
      username?: string | { startsWith: string };
    } = {};
    if (entityId?.trim()) {
      const id = entityId.trim();
      // 完整 entity_id（含 domain.）精确匹配，避免 light.a 命中 light.abc
      where.entityId = id.includes('.') ? id : { contains: id };
    }
    if (username?.trim()) where.username = { startsWith: username.trim() };
    return Object.keys(where).length ? where : undefined;
  }

  /**
   * 分页查询命令审计日志。
   * - 优先按 page 分页（page 从 1 开始，返回 total/totalPages）。
   * - 未指定 page 时按 skip 偏移量查询，返回数组。
   * - 单页最多 500 条，默认 50 条。
   *
   * @param opts.limit 单页条数（默认 50，上限 500）
   * @param opts.skip 跳过条数（仅在未指定 page 时生效）
   * @param opts.page 页码（从 1 开始，指定后返回分页结构）
   * @param opts.entityId 实体 ID 过滤
   * @param opts.username 用户名过滤
   * @returns 分页结构或数组
   */
  async listCommandAudit(opts: {
    limit?: string;
    skip?: string;
    page?: string;
    entityId?: string;
    username?: string;
  }) {
    const take = Math.min(parseInt(opts.limit || '50', 10) || 50, 500);
    const where = this.buildCommandAuditWhere(opts.entityId, opts.username);
    const pageNum = opts.page ? Math.max(parseInt(opts.page, 10) || 1, 1) : 0;
    const skipN =
      pageNum > 0 ? (pageNum - 1) * take : Math.max(parseInt(opts.skip || '0', 10) || 0, 0);
    const orderBy = { createdAt: 'desc' as const };
    if (pageNum > 0) {
      const [items, total] = await Promise.all([
        this.prisma.commandAudit.findMany({ where, orderBy, skip: skipN, take }),
        this.prisma.commandAudit.count({ where }),
      ]);
      return {
        items,
        total,
        page: pageNum,
        totalPages: Math.max(1, Math.ceil(total / take)),
      };
    }
    return this.prisma.commandAudit.findMany({ where, orderBy, skip: skipN, take });
  }

  /**
   * 清除命令审计日志。
   * 不传条件时清空全部；传 entityId/username 时按对应过滤清除。
   *
   * @param entityId 实体 ID 过滤（可选）
   * @param username 用户名过滤（可选）
   * @returns deleted 已删除条数
   */
  async clearCommandAudit(entityId?: string, username?: string) {
    const where = this.buildCommandAuditWhere(entityId, username);
    const result = await this.prisma.commandAudit.deleteMany({ where: where || {} });
    return { deleted: result.count };
  }
}