/**
 * 职责：
 *  - DB 维护通行锁（begin/end/isRunning）Redis 互斥；
 * 关键依赖：
 *  - shared/redis/service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/** Redis / 作业互斥键：retention 与 partition 共用，避免对 EventLog 并行 DDL/DELETE */
export const DB_MAINTENANCE_LOCK_KEY = 'db-maintenance';

/** 开始维护流程（进程内维护标记已随 isMaintenancePassRunning 移除，保留钩子）。 */
export function beginMaintenancePass(): void {
  // no-op：进程内标记已废弃，Redis 互斥仍由 DB_MAINTENANCE_LOCK_KEY 保证
}

/** 结束维护流程（保留钩子，语义同上）。 */
export function endMaintenancePass(): void {
  // no-op：进程内标记已废弃
}

