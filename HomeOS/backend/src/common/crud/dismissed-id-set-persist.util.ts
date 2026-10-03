/**
 * 「已确认/已忽略 ID 集合」的加载与持久化工具
 *
 * 所属模块：backend/src/common/crud
 * 职责：将「用户已确认的告警/事件 ID 集合」统一存放在 RuntimeKv 中，
 *   提供 load / persist 两个原子操作，供 Frigate、异常检测等多个模块复用，
 *   避免各自重复实现 findUnique + Set 装填逻辑。
 * 关键依赖：
 *   - @nestjs/common#Logger：用于结构化日志输出
 *   - ../prisma/runtime-kv.util：底层 RuntimeKv 读写实现
 */
import type { Logger } from '@nestjs/common';
import { loadRuntimeKv, persistRuntimeKv } from '../../shared/prisma/runtime-kv.util';

/** RuntimeKv 读取器类型：约束参数与 loadRuntimeKv 的第一个入参一致 */
type RuntimeKvReader = Parameters<typeof loadRuntimeKv>[0];
/** RuntimeKv 写入器类型：约束参数与 persistRuntimeKv 的第三个入参一致 */
type RuntimeKvWriter = Parameters<typeof persistRuntimeKv>[2];

/**
 * 从 RuntimeKv 加载「用户已确认 ID 集合」（存储形态 `{ ids: string[] }`）。
 * Frigate / 异常检测等共用，避免各自重复 findUnique + Set 装填。
 *
 * @param prisma    Prisma 读取器（PrismaService 或兼容委托）
 * @param configId  RuntimeKv 行 id
 * @returns Set<string> 已确认 ID 集合；若记录不存在或字段缺失返回空 Set
 */
export async function loadDismissedIdSet(
  prisma: RuntimeKvReader,
  configId: string,
): Promise<Set<string>> {
  const data = await loadRuntimeKv<{ ids?: string[] }>(prisma, configId);
  const set = new Set<string>();
  // 数组校验后逐项加入 Set，自动去重
  if (Array.isArray(data?.ids)) {
    for (const id of data.ids) set.add(id);
  }
  return set;
}

/**
 * 防抖持久化「已确认 ID 集合」（统一结构化日志，替代静默 setImmediate）。
 *
 * 将 Set 展开为数组后写入 RuntimeKv；底层 persistRuntimeKv 已内置防抖，
 * 高频调用时仅最后一次会真正落库。
 *
 * @param logger   日志实例，用于记录写入结果与异常
 * @param label    日志标签（如 'frigate' / 'anomaly'），便于区分来源
 * @param prisma   Prisma 写入器
 * @param configId RuntimeKv 行 id
 * @param set      待持久化的 ID 集合
 */
export function persistDismissedIdSet(
  logger: Logger,
  label: string,
  prisma: RuntimeKvWriter,
  configId: string,
  set: Set<string>,
): void {
  persistRuntimeKv(logger, label, prisma, configId, { ids: [...set] });
}