/**
 * @file layout-floating-display.internals.ts
 * @module frontend/src/views
 */
/** 浮动组件展示辅助 */
import { clampPct } from '@/shared/utils/core/misc.util'
import { getFloatingHubTabOptions } from '@/shared/utils/registry/floating-hub-tab-options'
import { getHubTabSet } from '@/shared/utils/registry/hub-tabs-options'
import { getFloatingCatalogGroups, getWidgetCategoryLabelForType } from '@/shared/utils/registry/widget-catalog'
import type { useLayoutStore } from '@/stores/layout.store'
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'

// ── useFloatingPanelDisplay ──
export { AFH_THEME_DEFS as AFH_THEMES } from '@/shared/entity/utils/floating-entity-colors.util'

const ENTITY_FLOAT_TYPES = ['entity', 'temp', 'humidity', 'battery', 'power']

export function isEntityFloatType(type: string) {
  return ENTITY_FLOAT_TYPES.includes(type)
}

export function hubTabOptions(type: string) {
  return getHubTabSet(type) || getFloatingHubTabOptions(type)
}

export function formatPct(value: unknown) {
  const n = clampPct(value)
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`
}

/** 浮动组件类型 → 视觉色调（卡片、标签、编辑态环境色） */
const AFH_TYPE_TONE_MAP: Record<string, string> = {
  entity: 'sky',
  weather: 'sky',
  securityPanel: 'rose',
  mediaMini: 'pink',
}

export function getAfhTypeTone(type: string) {
  return AFH_TYPE_TONE_MAP[type] || 'indigo'
}

/** 浮动组件 · 功能域类别（与添加菜单分组一致） */
export function getFloatingCategoryLabel(type: string) {
  return getWidgetCategoryLabelForType(type)
}

interface FloatingPanelDisplayOptions {
  /** 布局仓库（调用方仍传入以保持签名一致；本展示派生函数不直接读取） */
  layoutStore: ReturnType<typeof useLayoutStore>
  afhEditId: Ref<string | null>
}

export function useFloatingPanelDisplay({
  afhEditId,
}: FloatingPanelDisplayOptions) {
  const openSection = ref('layout')

  const floatingCatalogGroups = computed(() => getFloatingCatalogGroups())

  watch(afhEditId, (id) => {
    if (id) openSection.value = 'layout'
  })

  function toggleFloatingVisible(fw: { visible?: boolean }) {
    fw.visible = fw.visible === false ? true : false
  }

  return {
    openSection,
    floatingCatalogGroups,
    toggleFloatingVisible,
  }
}
