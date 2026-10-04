/**
 * @file process-memory.util.ts
 * @module common/observability
 *
 * Node 进程内存健康指标采集工具。
 *
 * 职责：
 * - 采集当前 Node 进程的内存使用情况（堆、RSS、V8 堆上限等），
 *   供 /health 健康检查端点与诊断面板共用。
 * - 提供 0~100 的归一化 memory 百分比，便于直接用于告警阈值判断。
 *
 * 关键依赖：
 * - node:v8：用于读取 V8 堆统计信息（used_heap_size / heap_size_limit）。
 * - process.memoryUsage()：Node 内置 API，返回 RSS、堆已用 / 总量等指标。
 */

import v8 from 'node:v8';

/**
 * 进程内存健康指标结构。
 *
 * 各字段单位与含义：
 * - memory：V8 已用堆占堆上限的百分比（0~100），用于告警阈值判断。
 * - memoryMb：已用堆大小（MB），等于 heapUsedMb，便于人类阅读。
 * - memoryLimitMb：V8 堆上限（MB），即 heap_size_limit。
 * - rssMb：进程常驻物理内存（MB），包含堆外的 C++ 对象、缓冲区等。
 * - heapUsedMb：V8 实际使用的堆内存（MB）。
 * - heapTotalMb：V8 当前分配的堆总量（MB），含已用与未使用部分。
 */
interface ProcessMemoryHealth {
  /** V8 已用堆 / 堆上限（%），用于告警 */
  memory: number;
  memoryMb: number;
  memoryLimitMb: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
}

/**
 * Node 进程内存快照（诊断 / health 共用）。
 *
 * 采集当前进程的内存使用情况并归一化为健康指标。
 *
 * @returns 包含 RSS、堆已用 / 总量、堆上限及百分比内存使用率的快照对象。
 *
 * 副作用：无（纯读取，不修改任何状态）。
 *
 * 调用场景：
 * - /health 端点返回的进程内存状态。
 * - 运维诊断 API 输出当前内存指标。
 * - 告警/监控模块周期性采样。
 */
export function getProcessMemoryHealth(): ProcessMemoryHealth {
  // 读取 Node 进程级内存指标（RSS、堆已用 / 总量等）。
  const mem = process.memoryUsage();
  // 读取 V8 堆统计：可获取 used_heap_size 与 heap_size_limit，用于计算堆占用百分比。
  const heapStats = v8.getHeapStatistics();
  // 字节转 MB 并四舍五入，便于人类阅读与跨指标对比。
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const memoryLimitMb = Math.round(heapStats.heap_size_limit / 1024 / 1024);
  // 归一化为 0~100 的百分比，并 clamp 在 100 以内，避免极端情况下数值越界。
  const memory = Math.min(
    100,
    Math.round((heapStats.used_heap_size / heapStats.heap_size_limit) * 100),
  );

  return {
    memory,
    memoryMb: heapUsedMb,
    memoryLimitMb,
    rssMb,
    heapUsedMb,
    heapTotalMb,
  };
}