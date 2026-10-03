/**
 * 执行历史通用辅助函数
 *
 * 封装 Scene/Script 等服务中重复的执行历史管理逻辑：
 * - recordExecution: 异步写入执行记录 + 自动裁剪
 * - getExecutionHistory: 读取执行历史（复用 readOrchestratorExecutionHistory）
 * - clearExecutionHistory: 清空执行历史
 *
 * 所属模块：shared/orchestrator
 * 关键依赖：
 *   - @nestjs/common（Logger 类型）
 *   - ../resilience/circuit-breaker（scheduleBackgroundTask 后台任务调度，不阻塞 API 响应）
 *   - ./orchestrator-execution-history.util（readOrchestratorExecutionHistory 读取历史）
 *   - ../database/execution-history-retention.util（trimExecutionHistory 自动裁剪旧记录）
 */
import type { Logger } from '@nestjs/common';
import { scheduleBackgroundTask } from '../../common/resilience/circuit-breaker.helper';
import { readOrchestratorExecutionHistory } from './execution-history.util';
import { trimExecutionHistory } from '../../common/database/execution-history-retention.util';
import { parseJsonArray } from '../../common/utils/json-field.util';

/** 执行历史 create 委托：对应 Prisma 的 create 方法签名 */
interface ExecutionCreateDelegate {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
}

/** 执行历史 findMany 委托：对应 Prisma 的查询方法签名（按 executedAt 倒序） */
interface ExecutionQueryDelegate {
  findMany(args: { orderBy: { executedAt: 'desc' }; take: number }): Promise<unknown[]>;
}

/** 执行历史 deleteMany 委托：对应 Prisma 的批量删除方法签名 */
interface ExecutionDeleteDelegate {
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

/** 三种 Prisma 委托的组合类型，代表一个完整的执行历史数据访问对象 */
type ExecutionDelegate = ExecutionCreateDelegate & ExecutionQueryDelegate & ExecutionDeleteDelegate;

/** recordExecution 入参：单次执行结果摘要 */
interface RecordExecutionInput {
  /** 关联的实体 ID（如 sceneId / scriptId），用于 extraFields 透传 */
  entityId: string;
  /** 实体名称，便于日志可读 */
  entityName: string;
  /** 本次执行是否成功 */
  success: boolean;
  /** 成功执行的动作数 */
  executed: number;
  /** 总动作数 */
  total: number;
}

/**
 * 异步记录一次执行结果并触发历史裁剪
 *
 * 副作用：通过 scheduleBackgroundTask 在后台执行，不阻塞调用方 API 响应。
 * 写入失败由 scheduleBackgroundTask 内部兜底记录 logger.warn。
 *
 * @param delegate Prisma 数据访问委托（需实现 create/findMany/deleteMany）
 * @param logger 调用方 Logger 实例
 * @param label 日志标签（如 "场景"），用于后台任务名
 * @param maxHistory 历史保留条数上限，超过则裁剪
 * @param input 执行结果摘要
 * @param errors 错误列表（JSON 序列化存储）
 * @param extraFields 额外字段（如 sceneId / scriptId），透传至 create.data
 */
export function recordExecution(
  delegate: ExecutionDelegate,
  logger: Logger,
  label: string,
  maxHistory: number,
  input: RecordExecutionInput,
  errors: string[],
  extraFields?: Record<string, unknown>,
) {
  scheduleBackgroundTask(logger, `${label}执行历史写入`, async () => {
    await delegate.create({
      data: {
        ...extraFields,
        success: input.success,
        executed: input.executed,
        total: input.total,
        errors: errors,
      },
    });
    await trimExecutionHistory(
      delegate as Parameters<typeof trimExecutionHistory>[0],
      maxHistory,
      logger,
    );
  });
}

/**
 * 读取执行历史并映射为 DTO
 *
 * @param delegate Prisma 查询委托
 * @param logger 调用方 Logger 实例
 * @param label 日志标签（如 "场景"），用于日志和错误提示
 * @param limit 请求条数
 * @param maxHistory 最大条数上限（用于 clamp）
 * @param mapRow 行映射函数，由调用方决定输出形状
 * @returns 映射后的 DTO 数组；读取失败返回空数组
 */
export async function getExecutionHistory<TRow, T>(
  delegate: ExecutionQueryDelegate,
  logger: Logger,
  label: string,
  limit: number,
  maxHistory: number,
  mapRow: (row: TRow) => T,
  where?: Record<string, unknown>,
): Promise<T[]> {
  return readOrchestratorExecutionHistory({
    logger,
    label: `${label}执行历史`,
    limit,
    maxHistory,
    findMany: (take) =>
      delegate.findMany({
        orderBy: { executedAt: 'desc' },
        take,
        ...(where ? { where } : {}),
      }) as Promise<TRow[]>,
    mapRow,
  });
}

/**
 * 清空执行历史
 *
 * @param delegate Prisma 删除委托
 * @returns 删除条数
 */
export async function clearExecutionHistory(
  delegate: ExecutionDeleteDelegate,
): Promise<{ deleted: number }> {
  const result = await delegate.deleteMany({ where: {} });
  return { deleted: result.count };
}

/** 自动化执行历史写入（含自动裁剪） */
interface RecordAutomationExecutionInput {
  automationId: string;
  name: string;
  success: boolean;
  /** 触发链路追踪数据（JSON 序列化存储） */
  trace: unknown[];
  error?: string | null;
}

/**
 * 异步记录自动化执行结果并触发历史裁剪
 *
 * 与 recordExecution 类似，但专为自动化设计：记录 trace 链路和 error 文案。
 * 副作用：通过 scheduleBackgroundTask 在后台执行，不阻塞调用方。
 *
 * @param delegate Prisma 数据访问委托
 * @param logger 调用方 Logger 实例
 * @param maxHistory 历史保留条数上限
 * @param input 自动化执行结果摘要
 */
export function recordAutomationExecution(
  delegate: ExecutionDelegate,
  logger: Logger,
  maxHistory: number,
  input: RecordAutomationExecutionInput,
) {
  scheduleBackgroundTask(logger, '自动化执行历史写入', async () => {
    await delegate.create({
      data: {
        automationId: input.automationId,
        name: input.name,
        success: input.success,
        trace: input.trace,
        error: input.error ?? null,
      },
    });
    await trimExecutionHistory(
      delegate as Parameters<typeof trimExecutionHistory>[0],
      maxHistory,
      logger,
    );
  });
}

/** 执行历史数据库行基础字段 */
interface ExecutionHistoryRow {
  id: string;
  executedAt: Date;
  success: boolean;
  executed: number;
  total: number;
  errors: unknown;
}

/** 执行历史输出基础字段 */
interface ExecutionHistoryOutput {
  id: string;
  executedAt: string;
  success: boolean;
  executed: number;
  total: number;
  errors: string[];
}

/**
 * 构建执行历史行映射函数
 *
 * 消除 Scene/Script 等服务中重复的行映射逻辑和冗长的 inline 类型注解。
 * 自动将 executedAt 转为 ISO 字符串，errors 解析为数组。
 *
 * @example
 * ```typescript
 * const mapRow = buildExecutionHistoryMapper<{ sceneId: string; sceneName: string }>();
 * ```
 */
export function buildExecutionHistoryMapper<TExtra = Record<string, never>>(): (
  row: ExecutionHistoryRow & TExtra,
) => ExecutionHistoryOutput & TExtra {
  return (row) => {
    const { id, executedAt, success, executed, total, errors, ...extra } = row;
    return {
      id,
      executedAt: executedAt.toISOString(),
      success,
      executed,
      total,
      errors: parseJsonArray<string>(errors),
      ...extra,
    } as ExecutionHistoryOutput & TExtra;
  };
}