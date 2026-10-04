/**
 * 大表历史清理：分批删除工具
 *
 * 职责：为数据库历史数据保留（retention）提供「分批查找 + 分批删除」的通用流程，
 *   避免一次性 deleteMany 触发长事务与锁表，影响线上业务读写。
 * 关键依赖：retention-tables 的 RetentionTableKey 类型（仅编译期，无运行时依赖）
 */
import type { RetentionTableKey } from './retention-tables';

/**
 * 大表历史清理：分批删除，避免长事务锁表。
 *
 * 算法流程：循环查找一批 → 删除一批 → 累计；当某批返回行数 < batchSize 时认为已清完。
 * 通过 maxBatches 兜底，防止异常场景（如 findBatch 永远返回相同行）下死循环。
 *
 * @param opts
 *   - findBatch(take)：按 take 返回一批待删除记录（必须含 id 字段）
 *   - deleteBatch(ids)：按 id 数组删除，返回 { count } 删除条数
 *   - batchSize：单批大小，默认 800
 *   - maxBatches：最大循环次数，默认 500（即默认最多删除 0.4M 行）
 * @returns 累计删除的记录数
 */
async function deleteRecordsInBatches<T extends { id: number | string }>(opts: {
  findBatch: (take: number) => Promise<T[]>;
  deleteBatch: (ids: Array<T['id']>) => Promise<{ count: number }>;
  batchSize?: number;
  maxBatches?: number;
  /** 关机 / 取消时中断长跑清理 */
  signal?: AbortSignal;
}): Promise<number> {
  // 默认参数：单批 800 行，最多 500 批（≈ 0.4M 行上限）
  const batchSize = opts.batchSize ?? 800;
  const maxBatches = opts.maxBatches ?? 500;
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    if (opts.signal?.aborted) break;
    const rows = await opts.findBatch(batchSize);
    // 查不到数据：清理完成，提前退出
    if (!rows.length) break;
    const ids = rows.map((r) => r.id);
    const result = await opts.deleteBatch(ids);
    total += result.count;
    // 不足 batchSize：说明已是最后一批，避免再次空查
    if (rows.length < batchSize) break;
  }
  return total;
}

/**
 * 按时间字段 cutoff 分批删除（eventLog / sceneExecution 等共用）。
 *
 * 工厂函数：把「按 timeField < cutoff 查找 + 按 id 删除」的标准流程封装为一个 step 对象，
 * 供 DatabaseRetentionService 统一编排多个清理步骤。
 *
 * @param opts
 *   - key：步骤标识，用于日志与返回结果中区分不同表
 *   - retentionKey：按表保留策略配置键（retention.<key>），供调用方按表解析独立保留期
 *   - batchSize：单批大小
 *   - cutoff：时间阈值，早于此时间的记录将被删除（run 时可传入覆盖值，实现按表独立保留期）
 *   - timeField：用于过滤的时间字段名（如 'createdAt' / 'executedAt'）
 *   - findBatch / deleteBatch：实际数据库操作回调
 * @returns { key, retentionKey, run } step 对象，run(cutoffOverride?) 执行后返回 { count }
 */
export function createCutoffBatchDeleteStep(opts: {
  key: string;
  retentionKey: RetentionTableKey;
  batchSize: number;
  cutoff: Date;
  timeField: string;
  findBatch: (
    where: Record<string, unknown>,
    take: number,
  ) => Promise<Array<{ id: number | string }>>;
  deleteBatch: (ids: Array<number | string>) => Promise<{ count: number }>;
  signal?: AbortSignal;
}) {
  return {
    key: opts.key,
    retentionKey: opts.retentionKey,
    run: async (cutoffOverride?: Date) => ({
      // 动态构造 where 条件：{ [timeField]: { lt: cutoff } }；未传覆盖值时用创建时 cutoff
      count: await deleteRecordsInBatches({
        batchSize: opts.batchSize,
        signal: opts.signal,
        findBatch: (take) =>
          opts.findBatch(
            { [opts.timeField]: { lt: cutoffOverride ?? opts.cutoff } },
            take,
          ),
        deleteBatch: opts.deleteBatch,
      }),
    }),
  };
}