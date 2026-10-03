/**
 * 系统配置专家模式工具
 *
 * 职责：
 * - 维护专家模式关闭时需隐藏的分区集合（连接层 + 运维采样）。
 * - 维护专家模式关闭时需隐藏的单字段集合（屏保像素级 / 前端性能细调）。
 * - 提供按专家模式开关过滤可见分区的能力。
 *
 * 依赖：@/types/system-config-editor 的 EditableConfigSection 类型。
 *
 * 注意：分区 key（haConnector / stateStore ...）与字段 key（brandSizePx /
 *   widgetPollIntervals ...）均为配置 key，不翻译。
 */

/** 专家模式关闭时隐藏的分区（连接层 + 运维采样） */
const EXPERT_ONLY_SECTIONS = new Set([
  'haConnector',
  'stateStore',
  'wsPush',
  'commandProxy',
  'webrtc',
  'ops',
])

/** 专家模式关闭时隐藏的单字段（屏保像素级 / 前端性能细调） */
const EXPERT_ONLY_FIELD_KEYS = new Set([
  'brandSizePx',
  'brandTopVh',
  'contentShiftVh',
  'metaSizeVw',
  'secSizeVw',
  'sepSizeVw',
  'subMetaSizeVw',
  'timeSizeVw',
  'weatherIconSizeVw',
  'weatherStatsSizePx',
  'weatherTempSizeVw',
  'rebuildChunkSize',
  'rebuildDebounceMs',
  'entityCacheMaxAgeMs',
  'entityCacheSaveDebounceMs',
  'entityCacheEnabled',
  'initStatesBatchSize',
  'largeEntityThreshold',
  'workerDerivedThreshold',
  'callDedupWindowMs',
  'maxListeners',
  'optimisticTtlMs',
  'widgetPollIntervals',
  'apiRetryDelayMs',
])

import type { EditableConfigSection } from '@/types/system-config-editor'

/**
 * 按专家模式过滤可编辑分节视图
 *
 * 专家模式开启时原样返回；关闭时剔除专家专属分区与字段，并丢弃变空的分节。
 *
 * @param sectionList - 编辑器分节视图。
 * @param expertMode - 是否启用专家模式。
 * @returns 过滤后的分节数组。
 */
export function filterSectionsForExpert(sectionList: EditableConfigSection[], expertMode: boolean) {
  if (expertMode) return sectionList
  return sectionList
    .filter((s) => !EXPERT_ONLY_SECTIONS.has(s.key))
    .map((s) => ({
      ...s,
      fields: s.fields.filter((f) => !EXPERT_ONLY_FIELD_KEYS.has(f.key)),
    }))
    .filter((s) => s.fields.length > 0)
}
