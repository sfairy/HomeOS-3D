/**
 * @file prometheus-metrics.util.ts
 * @module common/observability
 *
 * 最小化 Prometheus 文本指标格式化工具。
 *
 * 职责：将 HomeOS 运行时指标（进程存活、HA 连接态、实体数、WS 客户端数、
 *   运行时长、HA WS 丢弃计数、同步管线各阶段延迟分位）格式化为 Prometheus
 *   文本展示格式（text exposition），供 /metrics 端点与单测共用。
 * 关键依赖：./ha-sync-latency.util（同步延迟快照与丢弃计数）。
 */

import {
  getHaSyncLatencySnapshots,
  getHaWsDeferredDroppedTotal,
  type HaSyncLatencySnapshot,
} from './ha-sync-latency.util';

/**
 * 最小 Prometheus 文本指标格式（供 /metrics 与单测共用）。
 *
 * @param input 运行时指标输入：
 *   - haConnected：HA WebSocket 是否已连接（1/0）
 *   - entityCount：当前缓存的 HA 实体数
 *   - socketClients：已连接的 Socket.IO 客户端数
 *   - uptimeSeconds：进程运行时长（秒）
 *   - latency：HA 同步管线各阶段延迟快照（缺省自动采集）
 *   - haWsDeferredDroppedTotal：HA WS 延期队列累计丢弃数（缺省自动采集）
 * @returns Prometheus 文本展示格式字符串
 */
export function formatHomeosPrometheusMetrics(input: {
  haConnected: boolean;
  entityCount: number;
  socketClients: number;
  uptimeSeconds: number;
  latency?: HaSyncLatencySnapshot[];
  haWsDeferredDroppedTotal?: number;
}): string {
  const haConnected = input.haConnected ? 1 : 0;
  const deferredDropped =
    input.haWsDeferredDroppedTotal ?? getHaWsDeferredDroppedTotal();
  const lines = [
    '# HELP homeos_up HomeOS process is up',
    '# TYPE homeos_up gauge',
    'homeos_up 1',
    '# HELP homeos_ha_connected Home Assistant WebSocket connected (1/0)',
    '# TYPE homeos_ha_connected gauge',
    `homeos_ha_connected ${haConnected}`,
    '# HELP homeos_entity_count Cached HA entity count',
    '# TYPE homeos_entity_count gauge',
    `homeos_entity_count ${input.entityCount}`,
    '# HELP homeos_socket_clients Connected Socket.IO clients',
    '# TYPE homeos_socket_clients gauge',
    `homeos_socket_clients ${input.socketClients}`,
    '# HELP homeos_uptime_seconds Process uptime in seconds',
    '# TYPE homeos_uptime_seconds gauge',
    `homeos_uptime_seconds ${input.uptimeSeconds}`,
    '# HELP homeos_ha_ws_deferred_dropped_total HA WS deferred ingress events dropped under overload',
    '# TYPE homeos_ha_ws_deferred_dropped_total counter',
    `homeos_ha_ws_deferred_dropped_total ${deferredDropped}`,
  ];

  const latency = input.latency ?? getHaSyncLatencySnapshots();
  lines.push(
    '# HELP homeos_ha_sync_latency_ms HA sync pipeline stage latency milliseconds',
    '# TYPE homeos_ha_sync_latency_ms gauge',
    '# HELP homeos_ha_sync_latency_samples HA sync latency sample count',
    '# TYPE homeos_ha_sync_latency_samples gauge',
  );
  for (const snap of latency) {
    lines.push(
      `homeos_ha_sync_latency_ms{stage="${snap.stage}",quantile="p50"} ${snap.p50}`,
      `homeos_ha_sync_latency_ms{stage="${snap.stage}",quantile="p99"} ${snap.p99}`,
      `homeos_ha_sync_latency_ms{stage="${snap.stage}",quantile="max"} ${snap.max}`,
      `homeos_ha_sync_latency_samples{stage="${snap.stage}"} ${snap.count}`,
    );
  }

  lines.push('');
  return lines.join('\n');
}
