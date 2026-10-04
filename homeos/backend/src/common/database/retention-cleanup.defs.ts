/**
 * 保留清理步骤表驱动定义：按 RetentionTableKey 生成 cutoff 分批删除 step。
 *
 */
import type { PrismaService } from '../../shared/prisma/service';
import type { RetentionTableKey } from './retention-tables';
import { createCutoffBatchDeleteStep } from './retention-batch.util';

type IdRow = { id: number | string };

type RetentionDelegate = {
  findMany: (args: {
    where: Record<string, unknown>;
    select: { id: true };
    take: number;
    orderBy: { id: 'asc' };
  }) => Promise<IdRow[]>;
  deleteMany: (args: { where: { id: { in: Array<number | string> } } }) => Promise<{ count: number }>;
};

/** 各表时间字段与 Prisma delegate 映射（顺序与 RETENTION_TABLE_KEYS 一致） */
const RETENTION_CLEANUP_DEFS: Array<{
  key: RetentionTableKey;
  timeField: string;
  delegate: (prisma: PrismaService) => RetentionDelegate;
}> = [
  { key: 'eventLog', timeField: 'createdAt', delegate: (p) => p.eventLog as RetentionDelegate },
  {
    key: 'commandAudit',
    timeField: 'createdAt',
    delegate: (p) => p.commandAudit as RetentionDelegate,
  },
  {
    key: 'notification',
    timeField: 'createdAt',
    delegate: (p) => p.notification as RetentionDelegate,
  },
  {
    key: 'securityEvent',
    timeField: 'createdAt',
    delegate: (p) => p.securityEvent as RetentionDelegate,
  },
  {
    key: 'loginAudit',
    timeField: 'createdAt',
    delegate: (p) => p.loginAudit as RetentionDelegate,
  },
];

/**
 * 构建各保留表的 cutoff 分批删除步骤（表驱动）。
 */
export function buildRetentionCleanupSteps(
  prisma: PrismaService,
  batchSize: number,
  cutoff: Date,
  signal?: AbortSignal,
) {
  return RETENTION_CLEANUP_DEFS.map((def) => {
    const delegate = def.delegate(prisma);
    return createCutoffBatchDeleteStep({
      key: def.key,
      retentionKey: def.key,
      batchSize,
      cutoff,
      timeField: def.timeField,
      signal,
      findBatch: (where, take) =>
        delegate.findMany({
          where,
          select: { id: true },
          take,
          orderBy: { id: 'asc' },
        }),
      deleteBatch: (ids) => delegate.deleteMany({ where: { id: { in: ids } } }),
    });
  });
}
