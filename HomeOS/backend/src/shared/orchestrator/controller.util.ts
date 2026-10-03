/**
 * @file orchestrator-controller.util.ts
 * @module backend/src/shared/orchestrator
 */
/**
 * 联动器控制器横切工具：分页解析、批量同步状态、阻塞行标记、漂移修复结果包装。
 *
 * 职责：
 *   - mapOrchestratorBlockedRows：标记需 HA 同步但缺少 haConfigId 的行为阻塞；
 *   - parseOrchestratorDriftDirection：解析漂移修复方向（push/pull）；
 *   - wrapOrchestratorRepairAllResult：包装批量修复结果为统一响应体。
 * 关键依赖：./ha-sync.internals（批量同步状态解析）、./auto-sync.util（保存后自动同步）。
 */
import type { Logger } from '@nestjs/common';
import { parseCrudPagination, type CrudPaginatedResult } from '../../common/crud/pagination.util';
import {
  getBulkSyncStatuses,
  parseBulkSyncStatusIds,
  type SyncStatusResult,
} from './ha-sync.internals';
import {
  maybeAutoSyncOnSave,
  type OrchestratorHaSyncConfig,
} from './auto-sync.util';

/** 标记需 HA 同步但缺少 haConfigId 的行为阻塞（附 blockedReason），requireEnabled 时仅标记已启用项 */
function mapOrchestratorBlockedRows<
  T extends { haConfigId: string | null; runOnHa: boolean; enabled?: boolean },
>(
  rows: T[],
  haSyncEnabled: boolean,
  blockedReason: string,
  options?: { requireEnabled?: boolean },
): T[] {
  const requireEnabled = options?.requireEnabled ?? false;
  return rows.map((row) => {
    const blocked =
      haSyncEnabled && row.runOnHa && !row.haConfigId && (!requireEnabled || row.enabled);
    return blocked ? { ...row, blockedReason } : row;
  });
}

/** 解析漂移修复方向：'pull' 为从 HA 拉取覆盖本地，其余默认 'push'（推送本地到 HA） */
function parseOrchestratorDriftDirection(direction?: string): 'push' | 'pull' {
  return direction === 'pull' ? 'pull' : 'push';
}

/** 包装批量漂移修复结果为统一响应体（含 repaired/failed 计数与错误列表） */
function wrapOrchestratorRepairAllResult(result: {
  repaired: number;
  failed: number;
  errors?: string[];
}) {
  return {
    repaired: result.repaired,
    failed: result.failed,
    errors: Array.isArray(result.errors) ? result.errors : undefined,
    message: result.failed
      ? `已修复 ${result.repaired} 条，${result.failed} 条失败`
      : `已修复 ${result.repaired} 条`,
  };
}

/** 执行全量漂移修复：解析方向后调用 repair 回调，完成后执行 after 钩子。 */
export async function runOrchestratorRepairAllDrift(
  direction: string | undefined,
  repair: (dir: 'push' | 'pull') => Promise<{
    repaired: number;
    failed: number;
    errors?: string[];
  }>,
  after?: () => Promise<void>,
) {
  const result = await repair(parseOrchestratorDriftDirection(direction));
  if (after) await after();
  return wrapOrchestratorRepairAllResult(result);
}

/** 执行单条漂移修复：按 id 与方向调用 repair 回调，完成后执行 after 钩子。 */
export async function runOrchestratorRepairDrift(
  id: string,
  direction: string | undefined,
  repair: (itemId: string, dir: 'push' | 'pull') => Promise<unknown>,
  after?: () => Promise<void>,
) {
  const result = await repair(id, parseOrchestratorDriftDirection(direction));
  if (after) await after();
  return result;
}

/** 查询全部或分页记录；HA 同步启用时屏蔽 runOnHa 条目并附加 blockedMsg。 */
export async function findAllWithOrchestratorBlocking<
  Row extends { haConfigId: string | null; runOnHa: boolean; enabled?: boolean },
>(opts: {
  haSyncEnabled: boolean;
  blockedMsg: string;
  page?: string;
  limit?: string;
  findAll: () => Promise<Row[]>;
  findAllPaginated: (pageNum: number, pageSize: number) => Promise<CrudPaginatedResult<Row>>;
  mapOptions?: { requireEnabled?: boolean };
}) {
  const { pageNum, pageSize, enabled } = parseCrudPagination(opts.page, opts.limit);
  if (!enabled) {
    const rows = await opts.findAll();
    return mapOrchestratorBlockedRows(rows, opts.haSyncEnabled, opts.blockedMsg, opts.mapOptions);
  }
  const result = await opts.findAllPaginated(pageNum, pageSize);
  return {
    ...result,
    items: mapOrchestratorBlockedRows(
      result.items,
      opts.haSyncEnabled,
      opts.blockedMsg,
      opts.mapOptions,
    ),
  };
}

/** 从 HA 拉取单条联动器配置并落库（可指定 runOnHa） */
export async function runOrchestratorSyncFromHa(
  body: { haConfigId: string; runOnHa?: boolean },
  syncFrom: (haConfigId: string, opts?: { runOnHa?: boolean }) => Promise<unknown>,
  after?: () => Promise<void>,
) {
  const result = await syncFrom(body.haConfigId, { runOnHa: body.runOnHa });
  if (after) await after();
  return result;
}

/** 联动器 sync/remove-from-ha 端点共用逻辑 */
export async function runOrchestratorRemoveFromHa(
  body: { haConfigId: string; entity_id?: string; name?: string },
  remove: (haConfigId: string, opts?: { entityId?: string; name?: string }) => Promise<unknown>,
  after?: () => Promise<void>,
) {
  const result = await remove(body.haConfigId, {
    entityId: body.entity_id,
    name: body.name,
  });
  if (after) await after();
  return result;
}

/** 联动器批量 sync-status */
export async function runOrchestratorGetBulkSyncStatuses(
  idsQuery: string | undefined,
  getSyncStatus: (id: string) => Promise<SyncStatusResult>,
) {
  const ids = parseBulkSyncStatusIds(idsQuery);
  const statuses = await getBulkSyncStatuses(ids, getSyncStatus);
  return { statuses };
}

type HaSyncFn = (id: string) => Promise<{ success: boolean; message?: string }>;

/**
 * 创建/更新后：可选自动推 HA，再执行 after（如 reloadRules）。
 * syncId 一般为 result.id（更新时可传路由 id）。
 */
export async function runOrchestratorMutationWithAutoSync<T>(opts: {
  mutate: () => Promise<T>;
  cfg: OrchestratorHaSyncConfig;
  logger: Logger;
  label: string;
  syncToHA: HaSyncFn;
  syncId: (result: T) => string;
  shouldSync?: (result: T) => boolean;
  after?: () => Promise<void>;
}): Promise<T> {
  const result = await opts.mutate();
  if (opts.shouldSync?.(result) !== false) {
    maybeAutoSyncOnSave(opts.cfg, opts.logger, opts.label, () =>
      opts.syncToHA(opts.syncId(result)),
    );
  }
  if (opts.after) await opts.after();
  return result;
}

/** 同步操作（全量推送/拉取/单条推送）后可选 after */
export async function runOrchestratorHaSyncThen<T>(
  sync: () => Promise<T>,
  after?: () => Promise<void>,
): Promise<T> {
  const result = await sync();
  if (after) await after();
  return result;
}
