/**
 * 联动器执行历史读取工具（automation / scene / script 共用）。
 *
 * 所属模块：shared/orchestrator
 * 职责：
 *   - clampHistoryLimit：将请求条数规范到 [1, max] 区间，避免越界查询。
 *   - readOrchestratorExecutionHistory：统一读取入口，封装 clamp、查询失败兜底与行映射。
 * 关键依赖：
 *   - @nestjs/common（Logger 类型，用于失败时输出 warn）
 *   - ../utils（getErrorMessage 提取异常文案）
 *   - ../crud/pagination.util（clampInt 提供整数上下限裁剪）
 */
import type { Logger } from '@nestjs/common';
import { getErrorMessage } from '../../common/utils';
import { clampInt } from '../../common/crud/pagination.util';

/** 执行历史查询条数限制（至少 1，不超过 max） */
function clampHistoryLimit(limit: number, max = 100): number {
  return clampInt(limit, 1, max);
}

/** 将 Prisma 执行历史行映射为 API DTO */
function mapOrchestratorExecutionRows<TRow, T>(rows: TRow[], mapRow: (row: TRow) => T): T[] {
  return rows.map(mapRow);
}

/**
 * 读取联动器执行历史（automation/scene/script 共用）。
 * 统一 clampHistoryLimit 上下限与失败兜底；记录形状由调用方 mapRow 决定（不限定字段）。
 */
export async function readOrchestratorExecutionHistory<TRow, T>(opts: {
  logger: Logger;
  label: string;
  limit: number;
  maxHistory: number;
  findMany: (take: number) => Promise<TRow[]>;
  mapRow: (row: TRow) => T;
}): Promise<T[]> {
  const take = clampHistoryLimit(opts.limit, opts.maxHistory);
  try {
    const rows = await opts.findMany(take);
    return mapOrchestratorExecutionRows(rows, opts.mapRow);
  } catch (err: unknown) {
    opts.logger.warn(`读取${opts.label}失败: ${getErrorMessage(err)}`);
    return [];
  }
}
