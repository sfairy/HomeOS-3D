import { getErrorMessage } from '../../common/utils';
/**
 * HA area/device registry 拉取结果规范化与降级标记（纯函数）
 *
 * 职责：将 HA area_registry/list 与 device_registry/list 原始行规范化为内部结构，
 *      并提供 haRegistrySuccess / haRegistryDegraded 标记降级状态 —— 失败时返回空列表
 *      并标记 degraded，调用方须区分「真无数据」与「降级空」（避免误清空已分配区域）。
 * 关键依赖：无（纯函数）。
 */
type HaRegistryFetchOutcome<T> = {
  rows: T[];
  degraded: boolean;
  reason: string | null;
};

type HaAreaRegistryRow = { area_id: string; name: string };
type HaDeviceRegistryRow = { device_id: string; area_id: string };

/** 将 HA area_registry/list 原始行规范为 area_id + name */
export function normalizeHaAreaRegistryRows(
  rows: unknown,
): HaAreaRegistryRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const r = row as { area_id?: string; name?: string };
      return {
        area_id: String(r.area_id || '').trim(),
        name: String(r.name || r.area_id || '').trim(),
      };
    })
    .filter((row) => row.area_id);
}

/** 将 HA device_registry/list 原始行规范为已分配区域的设备 */
export function normalizeHaDeviceRegistryRows(
  rows: unknown,
): HaDeviceRegistryRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const r = row as { id?: string; area_id?: string | null };
      return {
        device_id: String(r.id || '').trim(),
        area_id: String(r.area_id || '').trim(),
      };
    })
    .filter((row) => row.device_id && row.area_id);
}

/** 成功拉取：清除降级标记 */
export function haRegistrySuccess<T>(rows: T[]): HaRegistryFetchOutcome<T> {
  return { rows, degraded: false, reason: null };
}

/** 失败拉取：空列表 + 降级原因（勿当作「真无区域/设备」） */
export function haRegistryDegraded<T>(err: unknown): HaRegistryFetchOutcome<T> {
  const reason = getErrorMessage(err);
  return { rows: [], degraded: true, reason };
}
