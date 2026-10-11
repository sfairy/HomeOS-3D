/** - 维护与 AppConfig notification 默认值对齐的缺省 DND 窗口； */

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
