/**
 * 执行历史保留工具：写入后自动裁剪超出 maxHistory 的旧记录。
 * 供 Script/Scene/Automation 等执行历史共用。
 *
 * 所属模块：backend/src/common/database
 * 职责：在每次写入执行历史后调用，按 maxHistory 阈值裁剪旧记录，
 *   防止 sceneExecution / scriptExecution 等表无限增长。
 * 关键依赖：@nestjs/common#Logger（仅用于裁剪日志输出）
 */
import type { Logger } from '@nestjs/common';

/**
 * 执行历史委托类型：约束可被裁剪的 Prisma 委托须提供的方法签名。
 * 通过结构化类型而非继承，让 ScriptExecution / SceneExecution 等委托均可复用。
 */
interface RetentionDelegate {
  /** 按执行时间倒序查找记录，配合 skip 跳过保留窗口 */
  findMany(args: {
    orderBy: { executedAt: 'desc' };
    take: number;
    skip: number;
    select: { executedAt: boolean };
  }): Promise<{ executedAt: Date }[]>;
  /** 按时间阈值批量删除 */
  deleteMany(args: { where: { executedAt: { lt: Date } } }): Promise<{ count: number }>;
}

/**
 * 裁剪执行历史：保留最近 maxHistory 条，删除更早的记录。
 *
 * 算法：
 *   1. 跳过前 maxHistory 条（最新的），取第 maxHistory+1 条的 executedAt 作为阈值；
 *   2. 若该条存在，则删除所有 executedAt < 阈值 的记录。
 * 通过 OFFSET 而非 COUNT + 二次查询实现，单次 findMany 即可定位阈值。
 *
 * @param delegate   Prisma 委托
 * @param maxHistory 保留条数上限
 * @param logger     日志实例，仅在有删除时记录 debug 日志
 */
export async function trimExecutionHistory(
  delegate: RetentionDelegate,
  maxHistory: number,
  logger: Logger,
) {
  // 倒序跳过 maxHistory 条，取 1 条作为「最早保留记录」
  const oldRecords = await delegate.findMany({
    orderBy: { executedAt: 'desc' },
    take: 1,
    skip: maxHistory,
    select: { executedAt: true },
  });
  if (oldRecords.length > 0) {
    // 拿到「最早保留记录」的时间戳，删除所有早于此时间的记录
    const result = await delegate.deleteMany({
      where: { executedAt: { lt: oldRecords[0].executedAt } },
    });
    if (result.count > 0) {
      logger.debug(`已清理 ${result.count} 条超出保留上限的执行历史`);
    }
  }
}