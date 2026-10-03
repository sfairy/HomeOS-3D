/**
 * Widget Hub Tab 状态管理：根据布局配置过滤可见 Tab 并解析默认/当前激活项。
 *
 * 所属模块：widget/composables
 * 职责：在 Hub 类面板（如智能管家面板、生活面板等）中，依据用户配置的 visibleTabs 与 defaultTab，
 *      结合传入的全量 Tab 列表，派生「实际可见 Tab 列表」与「当前激活 Tab」，并在配置变化时自动回退。
 * 依赖：
 *   - vue（ref / computed / watch / toValue / MaybeRefOrGetter）
 *   - @/utils/registry/hub-tabs-options（Tab 配置归一化、过滤、默认值解析）
 */
import { ref, computed, watch, toValue, type MaybeRefOrGetter } from 'vue'
import {
  normalizeHubTabConfig,
  resolveHubTab,
  filterTabsByVisible,
  resolveHubTabId,
} from '@/utils/registry/hub-tabs-options'

/** Hub Tab 定义：唯一 key、显示文案与可选徽标（badge） */
interface HubTabDef {
  key: string
  label: string
  badge?: string | number
}

/**
 * Hub Tab 组合式函数：基于 hubType 与配置计算可见 Tab 与激活 Tab。
 *
 * @param {object} options
 * @param {string} options.hubType  Hub 类型标识，用于区分不同面板（如 smartAdvisor、lifeMode 等）
 * @param {MaybeRefOrGetter<Record<string, unknown> | undefined>} options.config  布局配置（含 visibleTabs / defaultTab）
 * @param {MaybeRefOrGetter<string | undefined>} options.defaultTabProp  外部传入的默认 Tab 值（优先级高于配置内 defaultTab）
 * @param {MaybeRefOrGetter<HubTabDef[]>} options.allTabs  该 Hub 的全量 Tab 列表
 * @returns 含 hubTabs（可见 Tab 列表）、activeTab（当前激活）、tabConfig（归一化配置）、resolveActiveTab（手动解析函数）
 */
export function useHubTabs(options: {
  hubType: string
  config: MaybeRefOrGetter<Record<string, unknown> | undefined>
  defaultTabProp?: MaybeRefOrGetter<string | undefined>
  /** 外部再次请求同一 Tab 时递增，强制 activeTab 重新解析 */
  tabSelectToken?: MaybeRefOrGetter<number | undefined>
  allTabs: MaybeRefOrGetter<HubTabDef[]>
}) {
  // 归一化配置：把可见 Tab、默认 Tab 等字段统一成结构化对象
  const tabConfig = computed(() => normalizeHubTabConfig(toValue(options.config), options.hubType))

  // 根据配置过滤全量 Tab，得到实际可展示的 Tab 列表
  const hubTabs = computed(() =>
    filterTabsByVisible(toValue(options.allTabs), toValue(options.config), options.hubType),
  )

  /**
   * 解析当前应该激活的 Tab：优先使用传入的 raw，其次 defaultTabProp，最后回退到配置内 defaultTab。
   * @param {string} [raw]  外部指定值（如 URL query）
   * @returns 解析后实际可激活的 Tab id（保证存在于 hubTabs 中）
   */
  function resolveActiveTab(raw?: string) {
    const ids = hubTabs.value.map((t) => resolveHubTabId(t))
    return resolveHubTab(
      raw || toValue(options.defaultTabProp) || tabConfig.value.defaultTab,
      toValue(options.config),
      options.hubType,
      ids,
    )
  }

  // 当前激活 Tab，初始化时即解析一次
  const activeTab = ref(resolveActiveTab())

  // 监听可见 Tab 列表变化：若当前激活 Tab 不再可见，则回退到默认 Tab
  watch(
    () => tabConfig.value.visibleTabs.join(','),
    () => {
      if (!hubTabs.value.some((t) => resolveHubTabId(t) === activeTab.value)) {
        activeTab.value = resolveActiveTab(toValue(options.defaultTabProp))
      }
    },
    { immediate: true },
  )

  // 监听默认 Tab / 选择令牌：外部可重复请求同一 Tab
  watch(
    () =>
      [
        toValue(options.defaultTabProp),
        tabConfig.value.defaultTab,
        toValue(options.tabSelectToken) ?? 0,
      ] as const,
    ([nextDefaultProp, nextDefaultTab, nextToken], prev) => {
      const prevDefaultProp = prev?.[0]
      const prevDefaultTab = prev?.[1]
      const prevToken = prev?.[2] ?? 0
      const tokenBumped = nextToken !== prevToken
      const defaultChanged =
        nextDefaultProp !== prevDefaultProp || nextDefaultTab !== prevDefaultTab
      if (
        !defaultChanged &&
        !tokenBumped &&
        hubTabs.value.some((t) => resolveHubTabId(t) === activeTab.value)
      ) {
        return
      }
      activeTab.value = resolveActiveTab(nextDefaultProp)
    },
    { immediate: true },
  )

  return { hubTabs, activeTab, tabConfig, resolveActiveTab }
}