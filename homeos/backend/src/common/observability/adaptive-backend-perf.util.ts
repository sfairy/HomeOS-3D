/**
 * @file adaptive-backend-perf.util.ts
 * @module common/observability
 *
 * 自适应后端性能工具集。
 *
 * 职责：
 * - 根据当前缓存的 HA 实体数量，在内存中动态调整 WS 推送与状态存储相关的批处理参数，
 *   以避免大规模安装（实体数巨大）时出现 WS 风暴、内存膨胀与补发缓冲压力。
 * - 提供面向运维诊断 API 的调优建议字符串，供前端/CLI 展示。
 *
 * 设计要点：
 * - 所有调参均为“内存热更新”，仅在进程运行期生效，不会回写持久化配置文件。
 * - latencyProfile=realtime 时禁止自动抬高 coalesce / sensor flush 窗口。
 * - latencyProfile=bulk 时更激进放宽窗口以保吞吐。
 */

import type { AppConfigData } from '../../shared/app-config/types';

/** 默认“大实体”判定阈值：实体数 ≥ 2000 触发 large 档位自适应。 */
const LARGE_ENTITY_THRESHOLD = 2000;

/** 上一次执行自适应时记录的实体数，用于在数量未变化时短路跳过。 */
let lastAppliedCount = 0;

/**
 * 自适应基线快照：在首次抬高参数前记录用户原始值，
 * 用于实体规模回落到阈值以下时恢复原配置。
 */
let adaptiveBaseline: {
  ingressCoalesceWindowMs?: number;
  sensorFlushIntervalMs?: number;
  stateBatchMax?: number;
} | null = null;

/**
 * 超大规模安装时自动抬高 WS 批处理参数（内存热更新，不持久化覆盖用户更大值）。
 */
export function applyAdaptiveBackendPerfInPlace(
  config: AppConfigData,
  entityCount: number,
): boolean {
  if (!entityCount || entityCount === lastAppliedCount) return false;

  const largeThreshold =
    config.frontend.largeEntityThreshold > 0
      ? config.frontend.largeEntityThreshold
      : LARGE_ENTITY_THRESHOLD;
  const xlargeThreshold =
    config.frontend.workerDerivedThreshold > 0 ? config.frontend.workerDerivedThreshold : 2000;

  const profile = config.wsPush.latencyProfile ?? 'realtime';

  if (entityCount < largeThreshold) {
    if (lastAppliedCount >= largeThreshold && adaptiveBaseline) {
      if (adaptiveBaseline.ingressCoalesceWindowMs != null) {
        config.haConnector.ingressCoalesceWindowMs = adaptiveBaseline.ingressCoalesceWindowMs;
      }
      if (adaptiveBaseline.sensorFlushIntervalMs != null) {
        config.wsPush.sensorFlushIntervalMs = adaptiveBaseline.sensorFlushIntervalMs;
      }
      if (adaptiveBaseline.stateBatchMax != null) {
        config.wsPush.stateBatchMax = adaptiveBaseline.stateBatchMax;
      }
      adaptiveBaseline = null;
    }
    lastAppliedCount = entityCount;
    return true;
  }

  lastAppliedCount = entityCount;

  // realtime：禁止因实体规模自动抬高延迟窗口（仍可收紧 recentChanges）
  if (profile === 'realtime') {
    const recentCap = entityCount >= xlargeThreshold ? 1200 : 2000;
    let applied = false;
    if ((config.stateStore.maxRecentChanges ?? 3000) > recentCap) {
      config.stateStore.maxRecentChanges = recentCap;
      applied = true;
    }
    return applied;
  }

  if (!adaptiveBaseline) {
    adaptiveBaseline = {
      ingressCoalesceWindowMs: config.haConnector.ingressCoalesceWindowMs,
      sensorFlushIntervalMs: config.wsPush.sensorFlushIntervalMs,
      stateBatchMax: config.wsPush.stateBatchMax,
    };
  }

  const tier = entityCount >= xlargeThreshold ? 'xlarge' : 'large';
  const targets =
    profile === 'bulk'
      ? tier === 'xlarge'
        ? { ingressCoalesceWindowMs: 40, sensorFlushIntervalMs: 250, stateBatchMax: 600 }
        : { ingressCoalesceWindowMs: 24, sensorFlushIntervalMs: 180, stateBatchMax: 400 }
      : tier === 'xlarge'
        ? { ingressCoalesceWindowMs: 30, sensorFlushIntervalMs: 200, stateBatchMax: 500 }
        : { ingressCoalesceWindowMs: 16, sensorFlushIntervalMs: 150, stateBatchMax: 350 };

  let applied = false;

  if ((config.haConnector.ingressCoalesceWindowMs ?? 16) < targets.ingressCoalesceWindowMs) {
    config.haConnector.ingressCoalesceWindowMs = targets.ingressCoalesceWindowMs;
    applied = true;
  }
  if ((config.wsPush.sensorFlushIntervalMs ?? 120) < targets.sensorFlushIntervalMs) {
    config.wsPush.sensorFlushIntervalMs = targets.sensorFlushIntervalMs;
    applied = true;
  }
  if ((config.wsPush.stateBatchMax ?? 300) < targets.stateBatchMax) {
    config.wsPush.stateBatchMax = targets.stateBatchMax;
    applied = true;
  }

  const recentCap = tier === 'xlarge' ? 1200 : 2000;
  if ((config.stateStore.maxRecentChanges ?? 3000) > recentCap) {
    config.stateStore.maxRecentChanges = recentCap;
    applied = true;
  }

  return applied;
}

/**
 * 根据实体规模给出后端调优建议（运维诊断 API 使用）。
 */
export function buildBackendPerfSuggestions(entityCount: number, xlargeThreshold = 3500): string[] {
  if (entityCount < 2000) return [];
  const tips = [`实体数 ${entityCount}：建议 Redis maxmemory ≥ 512MB`];
  if (entityCount >= xlargeThreshold) {
    tips.push('超大规模：考虑将 ingressCoalesceWindowMs 调至 20ms+、stateBatchMax 调至 400+');
    tips.push(`实体缓存约 ${entityCount} 条：建议启用 Redis 以减轻 L1 重启压力`);
    tips.push('超大规模：确认 wsPush.coldEntityOnDemand=true，WS 仅推送关键域与热点实体');
  }
  if (entityCount >= 2000) {
    tips.push('可在高级参数调低 stateStore.maxRecentChanges（默认 3000）以减少 WS 补发缓冲占用');
    tips.push(
      `实体数 ≥${entityCount}：建议保持 wsPush.coldEntityOnDemand（非可见实体不推，列表页 REST 按需补全）`,
    );
    tips.push('当前默认 wsPush.latencyProfile=realtime（禁止大实体自适应抬高 flush）；吞吐优先可改 balanced/bulk');
  }
  return tips;
}
