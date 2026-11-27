import { useDropdownPosition } from '@/kernel/ui/popup/use-dropdown-position'
import { useClickOutside } from '@/kernel/ui/use-click-outside'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useLayoutStore } from '@/domain/layout/store/layout.store'
import { EMBED_ICON_LABELS, embedIconMap, embedLucidIcons, resolveEmbedIconByIndex } from '@/kernel/layout'
import { EMBED_TAB_ACCENTS, resolveEmbedIconAccent, resolveEmbedTabAccent } from '@/kernel/layout'
import { getEmbedBlockReason } from '@/kernel/layout'
import { pruneNavTabsForRemovedEmbed } from '@/kernel/layout'
import { copyTextWithNotify } from '@/kernel/ui/notify'
import { useSettingsHubRouteSection } from '@/features/settings/shared/hub'
import { computed, ref, watch, type Ref, reactive } from 'vue'
import { clonePlain } from '@/kernel/core/clone-plain'
import type { HaConfig, StatsSensorsConfig, UILayoutConfig, PanelWidget } from '@/kernel/types/layout'
import { createDefaultEarthquakeConfig } from '@/kernel/earthquake'
import { ACCOUNT_BINDING_SOURCE_OPTIONS } from '@/domain/energy/constants/account-binding-meta'
import {
  createDefaultDashboardFooterItems,
  createFooterItem,
  DASHBOARD_FOOTER_COLOR_ACCENT,
  DASHBOARD_FOOTER_COLORS,
  DASHBOARD_FOOTER_PRESETS,
  normalizeDashboardFooter,
  resolveFooterItemLabel,
} from '@/domain/energy/constants/dashboard-footer'
import { ENERGY_FIELD_DEFS, type EnergyFieldDef } from '@/domain/energy/constants/energy-fields'
import type { DashboardFooterItem, FooterFieldOption } from '@/kernel/dashboard-footer'
import { MAX_QUICK_BUTTONS, QUICK_BUTTON_OPTIONS, normalizeQuickButtons } from '@/domain/widget/quick-actions.config'
import { FLOATING_HUB_DEFAULT_TAB } from '@/kernel/registry/floating-hub-tab-options'
import {
  cloneHomeClimateChartConfig,
  normalizeHomeClimateChartConfig,
  serializeHomeClimateChartConfig,
} from '@/kernel/registry/home-climate-chart-options'
import {
  cloneHubTabsDraft,
  getHubTabSet,
  hasConfigurableTabs,
  serializeHubTabsConfig,
} from '@/kernel/registry/hub-tabs-options'
import {
  cloneWeatherHubConfig,
  isWeatherHubWidgetType,
  normalizeWeatherHubConfig,
  serializeWeatherHubConfig,
} from '@/kernel/registry/weather-hub-options'
import {
  getDashboardWidgetCatalogGroups,
  getSidebarWidgetCatalogGroups,
  getWidgetName,
} from '@/kernel/registry/widget-catalog'
import { getSidebarWidgetDefaultHeight } from '@/kernel/registry/widget-registry-meta'
import { clampPanelCardHeightPx, parsePanelCardHeightPx } from '@/domain/widget/panel-widget-height'

/* ── 原 layout-dashboard-embeds.internals.ts 的实现 ── */
/** 设置：嵌入页 Hub */

// ── useSettingsEmbeds ──
export function useSettingsEmbeds(activeTabProp: () => string) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const activeEmbedId = ref('')
  const iconPickerOpen = ref(false)
  const iconPickerRef = ref<HTMLElement | null>(null)
  const iconPickerPanelRef = ref<HTMLElement | null>(null)

  const {
    dropdownStyle: iconPickerDropdownStyle,
    teleportTarget: iconPickerTeleportTarget,
    placement: iconPickerPlacement,
    teleportDisabled: iconPickerTeleportDisabled,
  } = useDropdownPosition(iconPickerRef, iconPickerOpen, {
    minWidth: 248,
    maxHeight: 280,
    chromeHeight: 0,
    minListHeight: 96,
    dropdownRef: iconPickerPanelRef,
  })

  useClickOutside(
    () => [iconPickerRef.value, iconPickerPanelRef.value].filter((el): el is HTMLElement => el != null),
    () => {
      iconPickerOpen.value = false
    },
  )

  const embedCount = computed(() => layoutStore.layoutConfig.customEmbeds?.length || 0)

  function embedIconAccent(icon: string) {
    return resolveEmbedIconAccent(icon)
  }

  function embedIconLabel(icon: string) {
    return EMBED_ICON_LABELS[icon || 'MonitorPlay'] || '图标'
  }

  const embedTabsKey = computed(() => (layoutStore.layoutConfig.customEmbeds || []).map((e) => e.id).join('|'))

  const embedTabs = computed(() =>
    (layoutStore.layoutConfig.customEmbeds || []).map((e, idx) => ({
      id: e.id,
      label: (e.name || `页面 ${idx + 1}`).slice(0, 14),
      icon: embedIconMap[e.icon || 'MonitorPlay'],
      accent: resolveEmbedTabAccent(e, idx),
    })),
  )

  useSettingsHubRouteSection(activeEmbedId, embedTabs, {
    tabId: 'embeds',
    activeTab: activeTabProp,
  })

  const activeEmbed = computed(
    () => layoutStore.layoutConfig.customEmbeds?.find((e) => e.id === activeEmbedId.value) ?? null,
  )

  const activeEmbedAccent = computed(() => {
    if (!activeEmbed.value) return EMBED_TAB_ACCENTS[0]
    const idx = (layoutStore.layoutConfig.customEmbeds || []).findIndex((e) => e.id === activeEmbedId.value)
    return resolveEmbedTabAccent(activeEmbed.value, Math.max(0, idx))
  })

  const activeEmbedIconAccent = computed(
    () => embedIconAccent(activeEmbed.value?.icon || '') || activeEmbedAccent.value,
  )

  watch(
    embedTabs,
    (tabs) => {
      if (!tabs.length) {
        activeEmbedId.value = ''
        return
      }
      if (!tabs.some((t) => t.id === activeEmbedId.value)) {
        activeEmbedId.value = tabs[tabs.length - 1].id
      }
    },
    { immediate: true },
  )

  function embedUrlWarning(url: string) {
    return getEmbedBlockReason(url)
  }

  function pickEmbedIcon(iconName: string) {
    if (activeEmbed.value) activeEmbed.value.icon = iconName
    iconPickerOpen.value = false
  }

  async function copyEmbedUrl(url: string) {
    await copyTextWithNotify(url, {
      successMessage: '内嵌 URL 已复制',
      emptyMessage: '请先填写内嵌地址',
    })
  }

  function addEmbed() {
    if (!layoutStore.layoutConfig.customEmbeds) layoutStore.layoutConfig.customEmbeds = []
    const nextIdx = layoutStore.layoutConfig.customEmbeds.length
    // 裸时间戳 id；顶栏 Tab id 由 embedNavTabId 统一加 embed- 前缀，避免 embed-embed-* 双前缀
    const id = String(Date.now())
    layoutStore.layoutConfig.customEmbeds.push({
      id,
      name: '新网页',
      url: '',
      icon: resolveEmbedIconByIndex(nextIdx),
    })
    activeEmbedId.value = id
  }

  async function removeEmbed(id: string) {
    const embed = layoutStore.layoutConfig.customEmbeds?.find((e) => e.id === id)
    const ok = await chrome.confirm(
      embed?.name ? `确定删除内嵌页「${embed.name}」？` : '确定删除该内嵌页？',
      '删除内嵌页',
      { confirmText: '删除', type: 'danger' },
    )
    if (!ok) return
    if (layoutStore.layoutConfig.customEmbeds) {
      layoutStore.layoutConfig.customEmbeds = layoutStore.layoutConfig.customEmbeds.filter((e) => e.id !== id)
    }
    pruneNavTabsForRemovedEmbed(layoutStore.layoutConfig, id)
  }

  function onEmbedReorder({ fromIndex, toIndex }: { fromIndex: number; toIndex: number }) {
    const list = layoutStore.layoutConfig.customEmbeds
    if (!list || fromIndex === toIndex) return
    const item = list.splice(fromIndex, 1)[0]
    list.splice(toIndex, 0, item)
    layoutStore.layoutConfig.customEmbeds = [...list]
  }

  return {
    embedIconMap,
    embedLucidIcons,
    embedCount,
    activeEmbedId,
    iconPickerOpen,
    iconPickerRef,
    iconPickerPanelRef,
    iconPickerDropdownStyle,
    iconPickerTeleportTarget,
    iconPickerTeleportDisabled,
    iconPickerPlacement,
    embedTabsKey,
    embedTabs,
    activeEmbed,
    activeEmbedAccent,
    activeEmbedIconAccent,
    embedIconLabel,
    embedIconAccent,
    embedUrlWarning,
    pickEmbedIcon,
    copyEmbedUrl,
    addEmbed,
    removeEmbed,
    onEmbedReorder,
  }
}

/* ── 原 layout-dashboard-slices.internals.ts 的实现 ── */
/** 布局切片 pick/live/apply */

// ── settings-layout-snapshot.util ──
const clone = clonePlain

/** 集成绑定 Tab 管辖的 layout 切片 */
export function pickBindingsLayoutSlice(layout: UILayoutConfig) {
  return { haConfig: clone(layout.haConfig) }
}

/** pending 检测用：必须返回 store 活引用，禁止 clone（否则 deep-watch 无法感知嵌套修改） */
export function liveBindingsLayoutSlice(layout: UILayoutConfig) {
  return { haConfig: layout.haConfig }
}

export function applyBindingsLayoutSlice(layout: UILayoutConfig, slice: { haConfig?: HaConfig }) {
  if (slice.haConfig) layout.haConfig = clone(slice.haConfig)
}

/** 生活账户 Tab 管辖的 layout 切片 */
export function pickLifeAccountsLayoutSlice(layout: UILayoutConfig) {
  return {
    energySources: clone(layout.statsSensors?.energySources || {}),
  }
}

/** pending 检测用：活引用 */
export function liveLifeAccountsLayoutSlice(layout: UILayoutConfig) {
  const stats = layout.statsSensors
  if (!stats) return { energySources: undefined as StatsSensorsConfig['energySources'] | undefined }
  if (!stats.energySources) stats.energySources = {}
  return { energySources: stats.energySources }
}

export function applyLifeAccountsLayoutSlice(
  layout: UILayoutConfig,
  slice: { energySources?: StatsSensorsConfig['energySources'] },
) {
  if (!layout.statsSensors) return
  if (slice.energySources) {
    layout.statsSensors.energySources = clone(slice.energySources)
  }
}

/** 安防场景 Tab 管辖的 layout 切片 */
export function pickSecurityModesLayoutSlice(layout: UILayoutConfig) {
  return {
    securityModes: clone(layout.securityModes),
    securityEmergency: clone(layout.securityEmergency),
    securityModeLinks: clone(layout.securityModeLinks),
  }
}

/** pending 检测用：活引用 */
export function liveSecurityModesLayoutSlice(layout: UILayoutConfig) {
  return {
    securityModes: layout.securityModes,
    securityEmergency: layout.securityEmergency,
    securityModeLinks: layout.securityModeLinks,
  }
}

export function applySecurityModesLayoutSlice(
  layout: UILayoutConfig,
  slice: ReturnType<typeof pickSecurityModesLayoutSlice>,
) {
  if (slice.securityModes) layout.securityModes = clone(slice.securityModes)
  if (slice.securityEmergency) layout.securityEmergency = clone(slice.securityEmergency)
  if (slice.securityModeLinks) layout.securityModeLinks = clone(slice.securityModeLinks)
}

/** 地震预警（告警 Tab）管辖的 layout 切片 */
export function pickEarthquakeLayoutSlice(layout: UILayoutConfig) {
  return { earthquakeConfig: clone(layout.earthquakeConfig || createDefaultEarthquakeConfig()) }
}

export function applyEarthquakeLayoutSlice(
  layout: UILayoutConfig,
  slice: { earthquakeConfig?: UILayoutConfig['earthquakeConfig'] },
) {
  if (slice.earthquakeConfig) layout.earthquakeConfig = clone(slice.earthquakeConfig)
}

/* ── 原 layout-dashboard.internals.ts 的实现 ── */
/** Dashboard / footer / widget editor */

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
  return items.map((item, itemIndex) => ({
    id: item.id,
    label: resolveFooterItemLabel(item, itemIndex, fieldOptionsFn, sourceOptions).slice(0, 14),
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

/* ── 原 layout-panel-widgets.internals.ts 的实现 ── */
/** composables：面板小组件与 Widgets 面板展示 */

// ── usePanelWidgets ──
function cfgStr(cfg: Record<string, unknown> | undefined, rawConfig: string): string {
  const v = cfg?.[rawConfig]
  return typeof v === 'string' ? v : ''
}

function cfgStatsField(cfg: Record<string, unknown> | undefined, configRecord: string): string {
  const stats = cfg?.statsSensors
  if (!stats || typeof stats !== 'object') return ''
  const v = (stats as Record<string, unknown>)[configRecord]
  return typeof v === 'string' ? v : ''
}

export function usePanelWidgets(rightPanelWidgets: Ref<PanelWidget[]>) {
  const chrome = useChromeStore()
  const { editId: widgetEditId, toggleEdit, closeEdit } = useWidgetEditorState()

  const showAddWidget = ref(false)
  const widgetConfig = reactive({
    playerEntities: '',
    sensorIds: '',
    lights: '',
    climates: '',
    battery: '',
    offline: '',
    quickButtons: [] as string[],
    defaultTab: 'overview',
    weatherHub: normalizeWeatherHubConfig({}),
    homeClimateChart: normalizeHomeClimateChartConfig({}),
    hubTabs: cloneHubTabsDraft({}, 'mediaMini'),
  })

  const heightEditId = ref<string | null>(null)
  const heightDraft = ref(0)
  const heightPreset = ref(0)

  function openHeightConfig(w: PanelWidget) {
    if (heightEditId.value === w.id) {
      heightEditId.value = null
      return
    }
    closeEdit()
    heightEditId.value = w.id
    heightPreset.value = getSidebarWidgetDefaultHeight(w.type)
    const current = clampPanelCardHeightPx(w.config?.cardHeight)
    heightDraft.value = current > 0 ? current : heightPreset.value
  }

  function saveHeightConfig() {
    const id = heightEditId.value
    if (!id) return
    // 保存即写入固定高度（含等于类型预设）；主页按该像素渲染，与恢复预设同值同高
    const h = clampPanelCardHeightPx(heightDraft.value)
    rightPanelWidgets.value = rightPanelWidgets.value.map((item) => {
      if (item.id !== id) return item
      const config = { ...(item.config || {}) }
      if (h > 0) config.cardHeight = h
      else delete config.cardHeight
      return { ...item, config }
    })
    heightEditId.value = null
  }

  /** 立即清除自定义高度，回到类型预设像素（与保存该数值的主页显示一致） */
  function resetHeightConfig() {
    const id = heightEditId.value
    heightDraft.value = heightPreset.value
    if (!id) return
    rightPanelWidgets.value = rightPanelWidgets.value.map((item) => {
      if (item.id !== id) return item
      if (!parsePanelCardHeightPx(item.config?.cardHeight)) return item
      const config = { ...(item.config || {}) }
      delete config.cardHeight
      return { ...item, config }
    })
    heightEditId.value = null
  }

  function openWidgetConfig(w: PanelWidget) {
    heightEditId.value = null
    const opening = widgetEditId.value !== w.id
    toggleEdit(w.id)
    if (opening) {
      const widgetConfigRecord = w.config
      widgetConfig.playerEntities = cfgStr(widgetConfigRecord, 'playerEntities')
      widgetConfig.sensorIds = cfgStr(widgetConfigRecord, 'sensorIds')
      widgetConfig.lights = cfgStatsField(widgetConfigRecord, 'lights')
      widgetConfig.climates = cfgStatsField(widgetConfigRecord, 'climates')
      widgetConfig.battery = cfgStatsField(widgetConfigRecord, 'battery')
      widgetConfig.offline = cfgStatsField(widgetConfigRecord, 'offline')
      widgetConfig.quickButtons = normalizeQuickButtons(widgetConfigRecord?.quickButtons)
      widgetConfig.defaultTab =
        cfgStr(widgetConfigRecord, 'defaultTab') || FLOATING_HUB_DEFAULT_TAB[w.type] || 'overview'
      if (isWeatherHubWidgetType(w.type)) {
        Object.assign(widgetConfig.weatherHub, cloneWeatherHubConfig(widgetConfigRecord, w.type))
      }
      if (w.type === 'homeClimateChart') {
        Object.assign(widgetConfig.homeClimateChart, cloneHomeClimateChartConfig(widgetConfigRecord))
      }
      if (hasConfigurableTabs(w.type) && !isWeatherHubWidgetType(w.type)) {
        Object.assign(widgetConfig.hubTabs, cloneHubTabsDraft(widgetConfigRecord, w.type))
      }
    }
  }

  function applyHubTabsSave(w: PanelWidget) {
    const tabFields = serializeHubTabsConfig(widgetConfig.hubTabs, w.type)
    w.config = { ...w.config, ...tabFields }
    if (!('visibleTabs' in tabFields)) delete w.config.visibleTabs
  }

  function saveWidgetConfig() {
    const w = rightPanelWidgets.value.find((item) => item.id === widgetEditId.value)
    if (!w) return
    if (w.type === 'quickActions') {
      w.config = {
        ...w.config,
        statsSensors: {
          lights: widgetConfig.lights,
          climates: widgetConfig.climates,
          battery: widgetConfig.battery,
          offline: widgetConfig.offline,
        },
        quickButtons: normalizeQuickButtons(widgetConfig.quickButtons),
      }
    } else if (w.type === 'mediaMini') {
      w.config = { ...w.config, playerEntities: widgetConfig.playerEntities }
      applyHubTabsSave(w)
    } else if (isWeatherHubWidgetType(w.type)) {
      w.config = {
        ...w.config,
        ...serializeWeatherHubConfig(widgetConfig.weatherHub),
      }
    } else if (w.type === 'homeClimateChart') {
      w.config = {
        ...w.config,
        ...serializeHomeClimateChartConfig(widgetConfig.homeClimateChart),
      }
    } else if (hasConfigurableTabs(w.type) && !isWeatherHubWidgetType(w.type)) {
      applyHubTabsSave(w)
    }
    closeEdit()
    chrome.notify('已应用微件配置，请点击「保存布局」同步到服务端', 'info')
  }

  function addWidget(type: string) {
    const list = [...rightPanelWidgets.value]
    const config: Record<string, unknown> = {}
    if (type === 'mediaMini') config.playerEntities = ''
    if (type === 'weather') {
      Object.assign(config, serializeWeatherHubConfig(normalizeWeatherHubConfig({})))
    }
    if (type === 'homeClimateChart') {
      Object.assign(config, serializeHomeClimateChartConfig(normalizeHomeClimateChartConfig({})))
    }
    const presetHeight = getSidebarWidgetDefaultHeight(type)
    if (type === 'weather' || type === 'mediaMini') {
      config.cardHeight = presetHeight
    }
    list.push({ id: `widget-${Date.now()}-${Math.floor(Math.random() * 1000)}`, type, config })
    rightPanelWidgets.value = list
  }

  function deleteWidget(id: string) {
    if (widgetEditId.value === id) closeEdit()
    if (heightEditId.value === id) heightEditId.value = null
    rightPanelWidgets.value = rightPanelWidgets.value.filter((w) => w.id !== id)
  }

  async function confirmDeleteWidget(id: string) {
    const w = rightPanelWidgets.value.find((item) => item.id === id)
    const name = w ? getWidgetName(w.type) : id
    const confirmed = await confirmRemoveWidget(chrome, {
      message: `确定删除侧栏组件「${name}」？`,
      title: '删除组件',
    })
    if (!confirmed) return
    deleteWidget(id)
  }

  function moveWidget(idx: number, dir: -1 | 1) {
    const list = [...rightPanelWidgets.value]
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= list.length) return
    ;[list[idx], list[newIdx]] = [list[newIdx], list[idx]]
    rightPanelWidgets.value = list
  }

  return {
    sidebarWidgetGroups: computed(() => getSidebarWidgetCatalogGroups()),
    dashboardWidgetGroups: computed(() => getDashboardWidgetCatalogGroups()),
    showAddWidget,
    widgetEditId,
    widgetConfig,
    heightEditId,
    heightDraft,
    heightPreset,
    openHeightConfig,
    saveHeightConfig,
    resetHeightConfig,
    openWidgetConfig,
    saveWidgetConfig,
    addWidget,
    deleteWidget: confirmDeleteWidget,
    moveWidget,
  }
}

// ── useWidgetsPanelDisplay ──
/** WIDGET_PANEL_CONFIG_KEY：常量，取值语义见定义处。 */
export const WIDGET_PANEL_CONFIG_KEY = Symbol('widgetPanelConfig')

export function catalogTierClass(tier: string, dashboard = false) {
  if (tier === 'core') return dashboard ? 'text-amber-300/80 bg-amber-400/5' : 'text-purple-300/80'
  if (tier === 'admin') return 'text-rose-400/70 bg-rose-500/5'
  return dashboard ? 'text-amber-400/45' : 'text-gray-500'
}

export function widgetHasConfigPanel(type: string) {
  return (
    ['mediaMini', 'quickActions', 'homeClimateChart'].includes(type) ||
    isWeatherHubWidgetType(type) ||
    isHubTabsOnlyConfig(type)
  )
}

export function isHubTabsOnlyConfig(type: string) {
  return hasConfigurableTabs(type) && !isWeatherHubWidgetType(type) && !['mediaMini'].includes(type)
}

export function hubTabSetFor(type: string) {
  return getHubTabSet(type) || []
}

export function widgetConfigBtnLabel(type: string) {
  if (type === 'mediaMini') return '配置播放器'
  if (type === 'quickActions') return '配置统计源'
  if (isWeatherHubWidgetType(type)) return '配置天气中心'
  if (type === 'homeClimateChart') return '配置温湿度'
  if (hasConfigurableTabs(type)) return '配置 Tab'
  return '编辑组件槽'
}

export function widgetConfigDescription(type: string) {
  if (type === 'clock') return '侧栏时钟，无需额外配置'
  if (type === 'quickActions') return '快捷图标与汇总传感器'
  if (type === 'mediaMini') return '迷你媒体播放器'
  if (isWeatherHubWidgetType(type)) return '天气中心 Tab 与实体'
  if (type === 'homeClimateChart') return '全屋温湿度曲线'
  if (hasConfigurableTabs(type)) return 'Hub Tab 显隐与默认页'
  return '面板微件实例'
}

export function useQuickButtonConfig(widgetConfig: { quickButtons: string[] }) {
  const quickButtonOptions = QUICK_BUTTON_OPTIONS
  const maxQuickButtons = MAX_QUICK_BUTTONS
  const quickSelectedCount = computed(() => widgetConfig.quickButtons.length)
  const quickButtonsFull = computed(() => quickSelectedCount.value >= MAX_QUICK_BUTTONS)

  function isQuickButtonOn(id: string) {
    return widgetConfig.quickButtons.includes(id)
  }

  function quickButtonOrder(id: string) {
    return widgetConfig.quickButtons.indexOf(id) + 1
  }

  function toggleQuickButton(id: string) {
    const list = widgetConfig.quickButtons
    const idx = list.indexOf(id)
    if (idx > -1) {
      if (list.length <= 1) return
      list.splice(idx, 1)
      return
    }
    if (list.length >= MAX_QUICK_BUTTONS) return
    list.push(id)
  }

  return {
    quickButtonOptions,
    maxQuickButtons,
    quickSelectedCount,
    quickButtonsFull,
    isQuickButtonOn,
    quickButtonOrder,
    toggleQuickButton,
  }
}

export function toggleWidgetVisible(widget: { visible?: boolean }) {
  widget.visible = widget.visible === false ? true : false
}
