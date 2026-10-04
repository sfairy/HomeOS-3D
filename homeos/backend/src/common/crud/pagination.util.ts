/**
 * 通用分页工具集
 *
 * 职责：为 BaseCrudService 及各业务 Controller 提供统一的分页参数解析与
 *   分页响应结构组装能力，避免各模块重复实现 page/limit 解析逻辑。
 * 关键依赖：@homeos/shared（分页响应契约 PaginatedResult）
 */
import type { PaginatedResult } from '@homeos/shared';

/** 将数字夹到 [min, max]（NaN / 非有限值回退到 min） */
export function clampInt(value: number, min: number, max: number): number {
  // 非有限值（NaN/Infinity）直接退回下界，避免下游计算出现 NaN 污染
  if (!Number.isFinite(value)) return min;
  // 先 floor 保证整数，再依次夹取上下界
  return Math.min(Math.max(Math.floor(value), min), max);
}

/** 解析可选整数查询参数：缺省/空串/非法数字时回退 fallback（未传 fallback 则回退 undefined） */
export function parseOptionalInt(value: string | undefined, fallback: number): number;
export function parseOptionalInt(value?: string, fallback?: number): number | undefined;
export function parseOptionalInt(value?: string, fallback?: number): number | undefined {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * 解析整数查询参数（宽松语义）：仅缺省/空串回退 fallback，
 * 非法数字得到 NaN 并透传给调用方（与内联 `x ? parseInt(x, 10) : fallback` 行为一致）。
 */
export function parseIntParam(value: string | undefined, fallback: number): number;
export function parseIntParam(value?: string, fallback?: number): number | undefined {
  return value ? parseInt(value, 10) : fallback;
}


/**
 * 解析联动器列表分页查询参数。
 *
 * @param page  查询字符串中的 page 参数（字符串形式）
 * @param limit 查询字符串中的 limit 参数（字符串形式）
 * @param options 可选约束：minSize（最小页大小，默认 5）、maxSize（最大页大小，默认 200）
 * @returns { pageNum, pageSize, enabled }
 *   - pageNum：从 1 起的页码
 *   - pageSize：每页条数；0 表示不分页
 *   - enabled：是否启用分页；当 page 与 limit 均为有效正整数时为 true
 */
export function parseCrudPagination(
  page?: string,
  limit?: string,
  options?: { minSize?: number; maxSize?: number },
) {
  // 默认页大小约束：下限 5（避免过小造成多次查询），上限 200（避免单次回包过大）
  const minSize = options?.minSize ?? 5;
  const maxSize = options?.maxSize ?? 200;
  // parseInt 容错：'' / 非数字均退回 0，再被 Math.max(1, ...) 兜为 1
  const pageNum = Math.max(1, parseInt(page || '0', 10) || 0);
  const parsedLimit = parseInt(limit || '0', 10);
  // limit>0 才走分页，否则视为「不分页」一次取全量
  const pageSize = parsedLimit > 0 ? clampInt(parsedLimit, minSize, maxSize) : 0;
  return {
    pageNum,
    pageSize,
    enabled: pageSize > 0 && pageNum > 0,
  };
}

/**
 * 解析 page/limit 为独立分页变量（execution-history / config-audit 风格端点）。
 *
 * 与 parseCrudPagination 的差异：
 *   - 参数缺省时返回 0（表示「不分页」，由调用方走全量查询分支）；
 *   - limit 无「>0 才启用分页」语义，非法输入回退默认值后仍视为分页。
 *
 * @param page    查询字符串 page
 * @param limit   查询字符串 limit
 * @param options 可选约束：defaultLimit（默认 20）、maxLimit（默认 100，支持动态上限）
 */
export function parsePageLimit(
  page: string | undefined,
  limit: string | undefined,
  options?: { defaultLimit?: number; maxLimit?: number },
): { pageNum: number; pageSize: number } {
  const defaultLimit = options?.defaultLimit ?? 20;
  const maxLimit = options?.maxLimit ?? 100;
  return {
    // 页码不设实际上限（与原 Math.max(1, parseInt||1) 内联一致），仅兜底非法/<=0 为 1
    pageNum: page ? clampInt(parseInt(page, 10) || 1, 1, Number.MAX_SAFE_INTEGER) : 0,
    pageSize: limit ? clampInt(parseInt(limit, 10) || defaultLimit, 1, maxLimit) : 0,
  };
}

/**
 * 通用分页响应结构（契约由 @homeos/shared PaginatedResult 统一维护）。
 * @template T 列表元素类型
 */
export type CrudPaginatedResult<T> = PaginatedResult<T>;

/**
 * 组装分页响应对象。
 *
 * @param items    当前页数据列表
 * @param total    总记录数
 * @param page     当前页码
 * @param pageSize 每页条数
 * @returns CrudPaginatedResult<T>
 *   totalPages 计算用 Math.ceil，并 `|| 1` 兜底防止 pageSize=0 / total=0 时出现 NaN 或 0
 */
export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): CrudPaginatedResult<T> {
  return {
    items,
    total,
    page,
    pageSize,
    // Logic fix: pageSize<=0 时 Math.ceil(total/0) 得到 Infinity，需显式兜底为 1 页。
    totalPages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1,
  };
}

/**
 * 通用列表分页入口：无 page/limit 时走 findAll，否则走 findAllPaginated。
 *
 * 调用场景：BaseCrudService 子类的 Controller 在路由层调用本工具，
 * 由它根据查询参数自动选择「全量返回」或「分页返回」。
 *
 * @param page             查询字符串 page
 * @param limit            查询字符串 limit
 * @param findAll          全量查询回调
 * @param findAllPaginated 分页查询回调
 * @returns 数组（未分页）或 CrudPaginatedResult（已分页）
 */
export async function runCrudFindAll<T>(
  page: string | undefined,
  limit: string | undefined,
  findAll: () => Promise<T[]>,
  findAllPaginated: (pageNum: number, pageSize: number) => Promise<CrudPaginatedResult<T>>,
): Promise<T[] | CrudPaginatedResult<T>> {
  const { pageNum, pageSize, enabled } = parseCrudPagination(page, limit);
  if (!enabled) return findAll();
  return findAllPaginated(pageNum, pageSize);
}