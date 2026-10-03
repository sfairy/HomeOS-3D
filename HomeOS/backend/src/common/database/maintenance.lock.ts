/**
 * 所属模块：backend/common/database
 * 职责：
 *  - DB 维护通行锁（begin/end/isRunning）Redis 互斥；
 * 关键依赖：
 *  - shared/redis/service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * 数据库维护互斥标记：避免保留清理 / 分区维护与基线聚合同时打满 PG IO。
 * 进程内有效（单 homeos 实例）；多实例依赖 Redis `db-maintenance` 锁。
 */

/** Redis / 作业互斥键：retention 与 partition 共用，避免对 EventLog 并行 DDL/DELETE */
export const DB_MAINTENANCE_LOCK_KEY = 'db-maintenance';

let maintenanceRunning = false;

/** 开始维护流程：置运行中标志为 true。 */
export function beginMaintenancePass(): void {
  maintenanceRunning = true;
}

/** 结束维护流程：置运行中标志为 false。 */
export function endMaintenancePass(): void {
  maintenanceRunning = false;
}

/** 查询维护流程是否正在运行。 */
export function isMaintenancePassRunning(): boolean {
  return maintenanceRunning;
}
