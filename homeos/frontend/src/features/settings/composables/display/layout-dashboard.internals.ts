/**
 * @file layout-dashboard.internals.ts
 * @module frontend/src/views
 */
/** Dashboard / footer / widget editor */
import { ACCOUNT_BINDING_SOURCE_OPTIONS } from '@/shared/constants/account-binding-meta'
import {
  createDefaultDashboardFooterItems,
  createFooterItem,
  DASHBOARD_FOOTER_COLOR_ACCENT,
  DASHBOARD_FOOTER_COLORS,
  DASHBOARD_FOOTER_PRESETS,
  normalizeDashboardFooter,
  resolveFooterItemLabel,
} from '@/shared/constants/dashboard-footer'
import { ENERGY_FIELD_DEFS, type EnergyFieldDef } from '@/shared/energy/constants/energy-fields'
import type { DashboardFooterItem, FooterFieldOption } from '@/shared/types/dashboard-footer'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import type { UILayoutConfig } from '@/shared/types/layout'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'

// ── useDashboardFooterEditor ──
const PRESET_LABELS: Record<string, string> = {
  'ct-balance': '电信 · 余额',
  'ct-data': '电信 · 流量剩余',
  'cu-balance': '联通 · 余额',
  'cu-data': '联通 · 流量剩余',
  'entity-custom': '模板实体',
  'gas-balance': '燃气 · 余额',
  'gas-month': '燃气 · 月用量',
  'grid-balance': '电网 · 余额',
  'grid-daily': '电网 · 日用量',
  'grid-month': '电网 · 月用量',
  'water-balance': '水务 · 余额',
}

function buildFooterItemTabs(
  items: DashboardFooterItem[],
  fieldOptionsFn: (source: string) => FooterFieldOption[],
  sourceOptions: { value: string; label: string }[],
) {
  return items.map((item, idx) => ({
    id: item.id,
    label: resolveFooterItemLabel(item, idx, fieldOptionsFn, sourceOptions).slice(0, 14),
    emoji: item.icon || '⚡',
    accent: DASHBOARD_FOOTER_COLOR_ACCENT[item.color] || '#fbbf24',
    disabled: !item.enabled,
  }))
}

export function useDashboardFooterEditor(layoutConfig: Ref<UILayoutConfig>) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  /** 直接读 Pinia reactive，避免 shallowRef 导致 items 变更不触发 computed */
  const footerCfg = computed(() => {
    if (!layoutStore.layoutConfig.dashboardFooter) {
      layoutStore.layoutConfig.dashboardFooter = normalizeDashboardFooter(null)
    }
    return layoutStore.layoutConfig.dashboardFooter
  })

  function ensureFooter() {
    if (!layoutConfig.value.dashboardFooter) {
      layoutConfig.value.dashboardFooter = normalizeDashboardFooter(null)
    }
    return layoutConfig.value.dashboardFooter
  }

  function toggleDashboardFooter() {
    const cfg = ensureFooter()
    cfg.enabled = !cfg.enabled
    layoutStore.layoutDirty = true
  }

  function resetDashboardFooter() {
    layoutConfig.value.dashboardFooter = {
      enabled: true,
      items: createDefaultDashboardFooterItems(),
    }
    layoutStore.layoutDirty = true
    chrome.notify('已恢复默认底部信息栏配置', 'success')
  }

  function addPreset(presetKey: string) {
    const preset = DASHBOARD_FOOTER_PRESETS.find((p) => p.key === presetKey)
    if (!preset) return
    const cfg = ensureFooter()
    cfg.items.push(
      createFooterItem({
        kind: preset.kind || 'binding',
        source: preset.source,
        primaryField: preset.primaryField,
        secondaryField: preset.secondaryField,
        icon: preset.icon,
        color: preset.color,
        showProgress: preset.showProgress,
        label: PRESET_LABELS[preset.key ?? ''] ?? preset.key,
      }),
    )
    layoutStore.layoutDirty = true
  }

  function addCustomEntity() {
    const cfg = ensureFooter()
    cfg.items.push(createFooterItem({ kind: 'entity', icon: '📡', color: 'rose' }))
    layoutStore.layoutDirty = true
  }

  function removeItem(index: number) {
    const cfg = ensureFooter()
    cfg.items = cfg.items.filter((_, i) => i !== index)
    layoutStore.layoutDirty = true
  }

  function reorderItems(fromIndex: number, toIndex: number) {
    const cfg = ensureFooter()
    const items = [...cfg.items]
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return
    if (fromIndex === toIndex) return
    const [row] = items.splice(fromIndex, 1)
    items.splice(toIndex, 0, row)
    cfg.items = items
    layoutStore.layoutDirty = true
  }

  function moveItem(index: number, dir: number) {
    reorderItems(index, index + dir)
  }

  function fieldOptions(source: string) {
    return ((ENERGY_FIELD_DEFS as Record<string, EnergyFieldDef[]>)[source] || [])
      .filter((f) => f.type === 'number' || f.type === 'string')
      .map((f) => ({
        value: f.key,
        label: f.label,
      }))
  }

  const sourceOptions = computed(() => ACCOUNT_BINDING_SOURCE_OPTIONS)

  const colorOptions = DASHBOARD_FOOTER_COLORS

  const presetOptions = computed(() =>
    DASHBOARD_FOOTER_PRESETS.map((p) => ({
      key: p.key,
      label: PRESET_LABELS[p.key ?? ''] ?? p.key,
    })),
  )

  function buildItemTabs(items: DashboardFooterItem[]) {
    return buildFooterItemTabs(items, fieldOptions, sourceOptions.value)
  }

  return {
    footerCfg,
    toggleDashboardFooter,
    resetDashboardFooter,
    addPreset,
    addCustomEntity,
    removeItem,
    moveItem,
    reorderItems,
    fieldOptions,
    sourceOptions,
    colorOptions,
    presetOptions,
    buildItemTabs,
  }
}

// ── useWidgetEditorBase ──
/** 微件编辑态：展开/收起配置面板 */
export function useWidgetEditorState() {
  const editId = ref<string | null>(null)

  function toggleEdit(id: string) {
    editId.value = editId.value === id ? null : id
  }

  function closeEdit() {
    editId.value = null
  }

  function isEditing(id: string) {
    return editId.value === id
  }

  return { editId, toggleEdit, closeEdit, isEditing }
}

/** 跳转 Widget Builder */
export async function confirmRemoveWidget(
  _uiStore: {
    confirm: (message: string, title?: string, opts?: Record<string, string>) => Promise<boolean>
  },
  {
    name,
    title = '删除组件',
    message,
    confirmOptions,
  }: {
    name?: string
    title?: string
    message?: string
    confirmOptions?: Record<string, string>
  } = {},
) {
  const chrome = useChromeStore()
  const body = message ?? (name ? `确定删除「${name}」？` : '确定删除该组件？')
  return chrome.confirm(body, title, confirmOptions)
}


export {
  pickBindingsLayoutSlice,
  liveBindingsLayoutSlice,
  applyBindingsLayoutSlice,
  pickLifeAccountsLayoutSlice,
  liveLifeAccountsLayoutSlice,
  applyLifeAccountsLayoutSlice,
  pickSecurityModesLayoutSlice,
  liveSecurityModesLayoutSlice,
  applySecurityModesLayoutSlice,
  pickEarthquakeLayoutSlice,
  applyEarthquakeLayoutSlice,
} from '@/features/settings/composables/display/layout-dashboard-slices.internals'

export { useSettingsEmbeds } from '@/features/settings/composables/display/layout-dashboard-embeds.internals'
