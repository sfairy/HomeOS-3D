/**
 * @file useEnergySource.ts
 * @module composables/energy
 * @description 能源统计绑定解析器（composable 入口）。
 *
 * 职责：
 * - 从 haBindingsStore.statsSensors 解析各能源分类（电力/燃气/水/...）的源配置；
 * - 通过 useEntities 监听能源相关实体，结合 energySocketRefreshSeq 触发响应式刷新；
 * - 暴露 cfg/raw/primaryEntityId/configured/ensureEnergySources 等能力，并把展示逻辑委托给 useEnergySourceDisplay；
 * - 通过 createSharedComposable 全局共享，避免 Dashboard / 生活页多实例重复订阅。
 *
 * 依赖：
 * - vue（computed）
 * - @vueuse/core（createSharedComposable）
 * - @/stores/layout.store（layoutConfig.statsSensors 写入）
 * - @/stores/ha-bindings.store（statsSensors 读取）
 * - @/composables/entity/useEntity（按 ID 监听实体）
 * - @/utils/bridge/store-bridge（energySocketRefreshSeq 触发刷新）
 * - @/constants/energy-fields（分类枚举、默认值、类型）
 * - @homeos/shared（hasEnergyConfig）
 * - @/utils/energy/source.util（实体 ID 收集、字段解析、格式化）
 * - @/composables/energy/useEnergySourceDisplay（展示层）
 */
import { computed } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { useLayoutStore } from '@/stores/layout.store'
import { useHaBindingsStore } from '@/stores/ha-bindings.store'
import { useEntities } from '@/composables/entity/useEntity'
import { energySocketRefreshSeq } from '@/utils/bridge/store-bridge'
import { ENERGY_CATEGORIES, createDefaultEnergySource, type EnergyCategory } from '@/constants/energy-fields'
import { hasEnergyConfig } from '@homeos/shared'
import {
  collectEnergyWatchedEntityIds,
  formatNum,
  normalizeEnergySource,
  resolveFieldRaw,
  resolvePrimaryEntityId,
} from '@/utils/energy/source.util'
import { useEnergySourceDisplay } from '@/composables/energy/useEnergySourceDisplay'

/** 能源源状态：内部实现，被 createSharedComposable 包装为单例 */
function useEnergySourceState() {
  const layoutStore = useLayoutStore()
  const haBindingsStore = useHaBindingsStore()
  // 当前 HA 绑定的统计传感器配置（含 energySources 子结构）
  const statsSensors = computed(
    () =>
      (haBindingsStore.statsSensors || {}) as unknown as Record<string, unknown> & {
        energySources?: Record<string, unknown>
      },
  )
  // 当前需要监听的能源实体 ID 列表
  const watchedIds = computed(() => collectEnergyWatchedEntityIds(statsSensors.value))
  const entitySnapshot = useEntities(watchedIds)

  /** 实体快照视图：读取 energySocketRefreshSeq 触发响应式，保证 WS 推送后刷新 */
  function entitiesView() {
    void energySocketRefreshSeq.value
    return entitySnapshot.value
  }

  /** 取指定分类的归一化能源源配置 */
  function cfg(cat: EnergyCategory | string) {
    return normalizeEnergySource(statsSensors.value, cat)
  }

  /** 取指定分类指定字段的原始值（结合实体快照） */
  function raw(cat: EnergyCategory | string, fieldKey: string, accountIndex = 0) {
    return resolveFieldRaw(cat, fieldKey, statsSensors.value, entitiesView(), accountIndex)
  }

  /** 取指定分类的主实体 ID */
  function primaryEntityId(cat: EnergyCategory | string, accountIndex = 0) {
    return resolvePrimaryEntityId(cat, statsSensors.value, accountIndex)
  }

  /** 判断指定分类是否已配置能源源 */
  function configured(cat: EnergyCategory | string) {
    return hasEnergyConfig(cat, statsSensors.value)
  }

  /**
   * 确保 energySources 结构完整：缺失则补默认值，已存在则归一化。
   * 直接写入 layoutStore.layoutConfig.statsSensors.energySources。
   */
  function ensureEnergySources() {
    const stats = layoutStore.layoutConfig.statsSensors
    if (!stats) return
    if (!stats.energySources) stats.energySources = {}
    for (const cat of ENERGY_CATEGORIES) {
      if (!stats.energySources[cat]) {
        stats.energySources[cat] = { ...createDefaultEnergySource() }
      } else {
        stats.energySources[cat] = normalizeEnergySource(stats, cat)
      }
    }
  }

  // 委托展示层：包含格式化后的字段、单位、趋势等
  const display = useEnergySourceDisplay({
    cfg,
    raw,
    configured,
    primaryEntityId,
    entitiesView,
  })

  return {
    statsSensors,
    cfg,
    raw,
    primaryEntityId,
    configured,
    ensureEnergySources,
    ...display,
    formatNum,
  }
}

/**
 * 全局共享能源管线，避免 Dashboard / 生活页多实例重复订阅。
 * 通过 createSharedComposable 实现单例，所有调用方共享同一状态。
 */
export const useEnergySource = createSharedComposable(useEnergySourceState)
