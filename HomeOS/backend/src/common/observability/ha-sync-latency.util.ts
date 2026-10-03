/**
 * 所属模块：backend/common/observability
 * 职责：
 *  - HA WS 同步延迟采样+分位统计工具；
 * 关键依赖：
 *  - shared/redis, prom-client；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * HA 同步管线阶段延迟埋点（滑动窗口 p50/p99）。
 *
 * 阶段：ha_deferred_dwell → ha_receive → ingress_coalesce_dwell → ingress_flush
 *       → hot_apply → ws_emit → fe_*_apply / fe_e2e_apply。
 */

type HaSyncLatencyStage =
  | 'ha_deferred_dwell'
  | 'ha_receive'
  | 'ingress_coalesce_dwell'
  | 'ingress_flush'
  | 'hot_apply'
  | 'ws_emit'
  | 'fe_critical_apply'
  | 'fe_sensor_apply'
  | 'fe_e2e_apply';

const ALL_STAGES: readonly HaSyncLatencyStage[] = [
  'ha_deferred_dwell',
  'ha_receive',
  'ingress_coalesce_dwell',
  'ingress_flush',
  'hot_apply',
  'ws_emit',
  'fe_critical_apply',
  'fe_sensor_apply',
  'fe_e2e_apply',
] as const;

/** 滑动窗口大小：保留最近 512 个样本（环形缓冲 O(1) 写入） */
const WINDOW = 512;

/** 环形缓冲：O(1) 写入，避免满窗后每次 push 都 splice O(WINDOW) */
interface LatencyRingBuffer {
  arr: number[];
  /** 下一个写入位置（size < WINDOW 时等于 size） */
  head: number;
  size: number;
}

const stages = new Map<HaSyncLatencyStage, LatencyRingBuffer>();

/** HA WS 延期队列过载累计丢弃总数（进程级计数器，仅增不减） */
let haWsDeferredDroppedTotal = 0;

/** 获取或创建指定阶段的环形缓冲（惰性初始化） */
function ensureBuf(stage: HaSyncLatencyStage): LatencyRingBuffer {
  let buf = stages.get(stage);
  if (!buf) {
    buf = { arr: new Array<number>(WINDOW), head: 0, size: 0 };
    stages.set(stage, buf);
  }
  return buf;
}

/** 记录某一阶段耗时（毫秒） */
export function recordHaSyncLatency(stage: HaSyncLatencyStage, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const buf = ensureBuf(stage);
  buf.arr[buf.head] = durationMs;
  buf.head = (buf.head + 1) % WINDOW;
  if (buf.size < WINDOW) buf.size += 1;
}

const FE_STAGES = new Set<HaSyncLatencyStage>([
  'fe_critical_apply',
  'fe_sensor_apply',
  'fe_e2e_apply',
]);

/** 批量接收前端上报的 apply 样本（已鉴权 Socket 调用） */
export function recordHaSyncFeLatencySamples(
  samples: Array<{ stage?: string; ms?: number }>,
): number {
  if (!Array.isArray(samples) || !samples.length) return 0;
  let n = 0;
  const limit = Math.min(samples.length, 64);
  for (let i = 0; i < limit; i++) {
    const s = samples[i];
    const stage = s?.stage as HaSyncLatencyStage | undefined;
    const ms = Number(s?.ms);
    if (!stage || !FE_STAGES.has(stage) || !Number.isFinite(ms) || ms < 0 || ms > 60_000) continue;
    recordHaSyncLatency(stage, ms);
    n++;
  }
  return n;
}

/** HA WS 延期队列过载丢弃计数 */
export function addHaWsDeferredDropped(count: number): void {
  if (!Number.isFinite(count) || count <= 0) return;
  haWsDeferredDroppedTotal += Math.floor(count);
}

/** 获取 HA WS 延期队列过载累计丢弃总数（供 /metrics 快照输出） */
export function getHaWsDeferredDroppedTotal(): number {
  return haWsDeferredDroppedTotal;
}

/** 从已排序数组中取指定百分位（p50/p99/max 共用），空数组返回 0 */
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/**
 * HaSyncLatencySnapshot：业务类型别名。
 * - 表示：common/observability/ha-sync-latency.util.ts 域内联合/映射/函数签名一组相关值；
 * - 用途：避免重复字面量、统一跨文件类型引用
 */
export type HaSyncLatencySnapshot = { // 同步阶段延迟快照（样本数 p50 p99 max，毫秒）
  stage: string;
  count: number;
  p50: number;
  p99: number;
  max: number;
};

/** 导出各阶段延迟快照（毫秒） */
export function getHaSyncLatencySnapshots(): HaSyncLatencySnapshot[] {
  const out: HaSyncLatencySnapshot[] = [];
  for (const stage of ALL_STAGES) {
    const buf = stages.get(stage);
    if (!buf || buf.size === 0) {
      out.push({ stage, count: 0, p50: 0, p99: 0, max: 0 });
      continue;
    }
    // 环形缓冲按写入顺序（旧→新）还原后再排序求分位；仅在 /metrics 快照时做 O(WINDOW) 复制
    const values = new Array<number>(buf.size);
    for (let i = 0; i < buf.size; i++) {
      values[i] = buf.arr[(buf.head - buf.size + i + WINDOW) % WINDOW];
    }
    const sorted = values.sort((a, b) => a - b);
    out.push({
      stage,
      count: buf.size,
      p50: Math.round(percentile(sorted, 50) * 100) / 100,
      p99: Math.round(percentile(sorted, 99) * 100) / 100,
      max: Math.round(sorted[sorted.length - 1] * 100) / 100,
    });
  }
  return out;
}
