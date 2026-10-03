/**
 * @file dnd.util.ts
 * @module @homeos/shared/notification
 * @brief 免打扰（DND）时段判断与默认窗口（前后端唯一源）。
 *
 * 职责：
 *  - 维护与 AppConfig notification 默认值对齐的缺省 DND 窗口；
 *  - 判断指定小时是否处于 DND 时段（覆盖跨午夜 / 全天 / 同日窗口）；
 *  - 计算勿扰持续小时数（相等视为全天 24）。
 *
 * 关键依赖：
 *  - 后端通知发送前用 isDndActiveNow 判断是否静默（生命安全类除外）；
 *  - 前端 UI 滑块预览用 isHourInDnd 同语义别名。
 *
 * 约定：
 *  - start > end：跨午夜（如 22→8），hour >= start 或 hour < end 时静默；
 *  - start === end：视为全天免打扰；
 *  - start < end：同日窗口，start <= hour < end 时静默；
 *  - dndStart / dndEnd 任一缺失视为未配置，isDndActiveNow 返回 false。
 */

/** 与 AppConfig notification 默认值对齐的缺省 DND 窗口 — 开始小时（22 点整进入免打扰） */
export const DEFAULT_DND_START = 22;
/** 与 AppConfig notification 默认值对齐的缺省 DND 窗口 — 结束小时（次日 8 点整解除免打扰）。与 start 形成跨午夜窗口 */
export const DEFAULT_DND_END = 8;

/** 免打扰时段配置结构 */
export interface DndWindowConfig {
  dndStart?: number;
  dndEnd?: number;
}

/**
 * 判断指定小时是否处于免打扰时段。
 * @param hour 当前小时（0-23）
 * @param dndStart 开始小时
 * @param dndEnd 结束小时
 */
export function isDndActive(hour: number, dndStart: number, dndEnd: number): boolean {
  const h = Math.floor(hour);
  const s = Math.floor(dndStart);
  const e = Math.floor(dndEnd);
  if (s > e) return h >= s || h < e;
  if (s === e) return true;
  return h >= s && h < e;
}
/* knip: isHourInDnd 别名从 shared 移除，避免 Duplicate exports（isDndActive|isHourInDnd 同一函数两名称）。
 * 前端 UI 语义别名 isHourInDnd 现在仅在 frontend/src/utils/notification/dnd.util.ts 本地提供。
 */

/**
 * 基于配置判断指定时刻是否处于免打扰。
 * dndStart / dndEnd 任一缺失时视为未配置，返回 false。
 */
export function isDndActiveNow(cfg: DndWindowConfig, now: Date = new Date()): boolean {
  const { dndStart, dndEnd } = cfg;
  if (dndStart == null || dndEnd == null) return false;
  return isDndActive(now.getHours(), dndStart, dndEnd);
}

/** 计算勿扰持续小时数（相等视为全天 24） */
export function dndDurationHours(dndStart: number, dndEnd: number): number {
  if (dndStart > dndEnd) return 24 - dndStart + dndEnd;
  if (dndStart === dndEnd) return 24;
  return dndEnd - dndStart;
}
