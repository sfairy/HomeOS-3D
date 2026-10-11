/**
 * @file pagination.ts
 * @module @homeos/shared/crud
 * @brief 通用分页响应契约（backend CrudPaginatedResult 与前端分页消费共用）。
 */

/**
 * 通用分页响应结构。
 * @template T 列表元素类型
 */
export interface PaginatedResult<T> {
  /** 当前页数据列表 */
  items: T[];
  /** 满足过滤条件的总记录数 */
  total: number;
  /** 当前页码（从 1 起） */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 总页数（向上取整；total 为 0 时返回 1，避免前端除零） */
  totalPages: number;
}
