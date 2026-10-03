/**
 * 所属模块：backend/common/utils
 * 职责：
 *  - 解析 Redis 时间线（`timeline:entity:*`）成员快照，供能源/基线聚合共用；
 * 关键依赖：
 *  - 无外部依赖，纯函数；
 * 约定：
 *  - 时间字段统一 Asia/Shanghai 时区；
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/** 时间线快照：毫秒时间戳 + HA 状态字符串 */
interface TimelineSnapshot {
  /** 采样毫秒时间戳（已校验为有限正数） */
  ts: number;
  /** HA 状态字符串（非字符串输入已 String 归一） */
  state: string;
}

/**
 * 解析时间线快照成员。
 *
 * Redis 成员形如 `{"ts":1726800000000,"state":"1234.5"}`；历史数据可能存在
 * 非法 JSON、缺 ts、ts 为 0 等脏数据，统一在此收敛为 null 由调用方跳过。
 *
 * @param item Redis 时间线成员原始字符串
 * @returns 解析后的快照；非法/脏数据返回 null
 */
export function parseTimelineSnapshot(item: string): TimelineSnapshot | null {
  let parsed: { ts?: unknown; state?: unknown };
  try {
    parsed = JSON.parse(String(item)) as { ts?: unknown; state?: unknown };
  } catch {
    return null;
  }
  const ts = Number(parsed?.ts);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return { ts, state: String(parsed?.state ?? '') };
}
