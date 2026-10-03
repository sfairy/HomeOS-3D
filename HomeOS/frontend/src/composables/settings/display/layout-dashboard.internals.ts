/**
 * @file layout-dashboard.internals.ts
 * @module frontend/src/views
 */
/** composables：自 layout.internals.ts 拆出 — 嵌入页 / Dashboard 页脚 / Hero 轮播 / 楼层管理 / 小组件编辑 / 布局快照 */
import { useDropdownPosition } from '@/composables/ui/useDropdownPosition'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { clonePlain } from '@/utils/core/clone-plain.util'
import { ENERGY_FIELD_DEFS, type EnergyFieldDef } from '@/constants/energy-fields'
import { ACCOUNT_BINDING_SOURCE_OPTIONS } from '@/constants/account-binding-meta'
import {
  createDefaultDashboardFooterItems,
  createFooterItem,
  DASHBOARD_FOOTER_COLOR_ACCENT,
  DASHBOARD_FOOTER_COLORS,
  DASHBOARD_FOOTER_PRESETS,
  normalizeDashboardFooter,
  resolveFooterItemLabel,
} from '@/constants/dashboard-footer'
import type { DashboardFooterItem, FooterFieldOption } from '@/types/dashboard-footer'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { createDefaultEarthquakeConfig } from '@/types/earthquake'
import type { HaConfig, StatsSensorsConfig, UILayoutConfig } from '@/types/layout'
import { isAutoAspectRatio, probeImageAspectRatio } from '@/utils/floorplan/aspect.util'
import { EMBED_ICON_LABELS, embedIconMap, embedLucidIcons, resolveEmbedIconByIndex } from '@/utils/layout/embed-icons.util'
import { EMBED_TAB_ACCENTS, resolveEmbedIconAccent, resolveEmbedTabAccent } from '@/utils/layout/embed-nav-theme.util'
import { getEmbedBlockReason } from '@/utils/layout/embed-url.util'
import { pruneNavTabsForRemovedEmbed } from '@/utils/layout/nav-tabs.util'
import { copyTextWithNotify } from '@/services/notify'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'
import { HERO_SWIPER_SLIDE_GROUPS, HERO_SWIPER_SLIDE_TYPE_OPTIONS, getHeroSwiperPresetOptions } from '@/utils/registry/hero-swiper-slide-options'
import { HOME_CLIMATE_CHART_VIEW_OPTIONS } from '@/utils/registry/home-climate-chart-options'
import { getHubTabSet, normalizeHubTabConfig } from '@/utils/registry/hub-tabs-options'
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import type { Router } from 'vue-router'

// ── useSettingsEmbeds ──
/** useSettingsEmbeds：函数，按签名入参返回处理结果。 */
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
    () =>
      [iconPickerRef.value, iconPickerPanelRef.value].filter((el): el is HTMLElement => el != null),
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

  const embedTabsKey = computed(() =>
    (layoutStore.layoutConfig.customEmbeds || []).map((e) => e.id).join('|'),
  )

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
    const idx = (layoutStore.layoutConfig.customEmbeds || []).findIndex(
      (e) => e.id === activeEmbedId.value,
    )
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
      layoutStore.layoutConfig.customEmbeds = layoutStore.layoutConfig.customEmbeds.filter(
        (e) => e.id !== id,
      )
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

  const moviePilotUrl = computed({
    get: () => layoutStore.layoutConfig.moviePilotUrl || '',
    set: (v: string) => {
      layoutStore.layoutConfig.moviePilotUrl = v.trim()
    },
  })
  const moviePilotConfigured = computed(() => Boolean(String(moviePilotUrl.value || '').trim()))

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
    moviePilotUrl,
    moviePilotConfigured,
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

/** useDashboardFooterEditor：函数，按签名入参返回处理结果。 */
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

// ── useHeroSwiperConfigPanel ──
/** useHeroSwiperConfigPanel：函数，按签名入参返回处理结果。 */
export function useHeroSwiperConfigPanel(
  slides: () => Array<{ id: string; type: string; config?: Record<string, unknown> }>,
  emit: { (event: 'save'): void; (event: 'set-type', slideIndex: number, type: string): void; (event: 'move', slideIndex: number, dir: number): void },
) {
  const slideGroups = HERO_SWIPER_SLIDE_GROUPS
  const activeSlideKey = ref('0')

  watch(
    () => slides().length,
    () => {
      const idx = Number(activeSlideKey.value)
      if (idx >= slides().length) activeSlideKey.value = '0'
    },
  )

  const activeSlideIndex = computed(() => {
    const idx = Number(activeSlideKey.value)
    return Number.isFinite(idx) ? idx : 0
  })

  const activeSlide = computed(() => slides()[activeSlideIndex.value])

  const activeHubTabSet = computed(() =>
    activeSlide.value ? getHubTabSet(activeSlide.value.type) : null,
  )

  const slideTabDraft = ref({ defaultTab: '', visibleTabs: [] as string[] })

  watch(
    () => [activeSlideIndex.value, activeSlide.value?.type, activeSlide.value?.config] as const,
    () => {
      const slide = activeSlide.value
      if (!slide) return
      const normalized = normalizeHubTabConfig(slide.config, slide.type)
      const sameDefault = slideTabDraft.value.defaultTab === normalized.defaultTab
      const sameVisible =
        slideTabDraft.value.visibleTabs.join(',') === normalized.visibleTabs.join(',')
      if (sameDefault && sameVisible) return
      slideTabDraft.value = {
        defaultTab: normalized.defaultTab,
        visibleTabs: [...normalized.visibleTabs],
      }
    },
    { immediate: true, deep: true },
  )

  watch(
    slideTabDraft,
    (val) => {
      const slide = activeSlide.value
      if (!slide) return
      const current = normalizeHubTabConfig(slide.config, slide.type)
      if (
        current.defaultTab === val.defaultTab &&
        current.visibleTabs.join(',') === val.visibleTabs.join(',')
      ) {
        return
      }
      if (!slide.config) slide.config = {}
      slide.config.defaultTab = val.defaultTab
      slide.config.visibleTabs = [...val.visibleTabs]
    },
    { deep: true },
  )

  const activePresetOptions = computed(() =>
    activeSlide.value ? getHeroSwiperPresetOptions(activeSlide.value.type) : null,
  )

  const footHint = computed(() =>
    slides()
      .map((s) => getSlideTypeLabel(s.type))
      .join(' · '),
  )

  function getSlideTypeLabel(type: string) {
    return HERO_SWIPER_SLIDE_TYPE_OPTIONS.find((o) => o.id === type)?.label || type
  }

  function onTypeSelect(type: string) {
    emit('set-type', activeSlideIndex.value, type)
  }

  function moveSlide(dir: number) {
    emit('move', activeSlideIndex.value, dir)
    const next = activeSlideIndex.value + dir
    if (next >= 0 && next < slides().length) activeSlideKey.value = String(next)
  }

  function setSlideConfigField(field: string, value: string) {
    const slide = activeSlide.value
    if (!slide) return
    if (!slide.config) slide.config = {}
    slide.config[field] = value
  }

  const climateChartViewOptions = HOME_CLIMATE_CHART_VIEW_OPTIONS

  function setSlideConfigArray(field: string, value: string[]) {
    const slide = activeSlide.value
    if (!slide) return
    if (!slide.config) slide.config = {}
    slide.config[field] = Array.isArray(value) ? value : []
  }

  const climateTempEntities = computed<string[]>({
    get: () => (activeSlide.value?.config?.temperatureEntities as string[]) || [],
    set: (val) => setSlideConfigArray('temperatureEntities', val),
  })

  const climateHumEntities = computed<string[]>({
    get: () => (activeSlide.value?.config?.humidityEntities as string[]) || [],
    set: (val) => setSlideConfigArray('humidityEntities', val),
  })

  const tempChartSensors = computed<string>({
    get: () => (activeSlide.value?.config?.sensorIds as string) || '',
    set: (val) => setSlideConfigField('sensorIds', val),
  })

  const switchShortcutEntities = computed<string[]>({
    get: () => (activeSlide.value?.config?.entities as string[]) || [],
    set: (val) => setSlideConfigArray('entities', val),
  })

  function onHtmlInput(event: Event) {
    setSlideConfigField('rawHtml', (event.target as HTMLTextAreaElement).value)
  }

  return {
    slideGroups,
    activeSlideKey,
    activeSlideIndex,
    activeSlide,
    activeHubTabSet,
    slideTabDraft,
    activePresetOptions,
    footHint,
    climateChartViewOptions,
    climateTempEntities,
    climateHumEntities,
    tempChartSensors,
    switchShortcutEntities,
    getSlideTypeLabel,
    onTypeSelect,
    moveSlide,
    setSlideConfigField,
    onHtmlInput,
  }
}

// ── useFloorManager ──
/** useFloorManager：函数，按签名入参返回处理结果。 */
export function useFloorManager(layoutConfig: Ref<UILayoutConfig>) {
  const chrome = useChromeStore()
  const showAssetPicker = ref(false)
  const pickingFloorId = ref<string | null>(null)

  const floorSwitcherCfg = computed(() => {
    if (!layoutConfig.value.floorSwitcherConfig) {
      layoutConfig.value.floorSwitcherConfig = {
        left: -1,
        top: -1,
        direction: 'vertical',
        btnSize: 44,
        isLocked: true,
      }
    }
    return layoutConfig.value.floorSwitcherConfig
  })

  function addFloor() {
    layoutConfig.value.floors.push({
      id: `floor-${Date.now()}`,
      name: `${layoutConfig.value.floors.length + 1}F`,
      backgroundUrl: '/floorplans/lights_off.png',
      floorplanAspectRatio: '1556 / 1313',
      widgets: [],
      floatingWidgets: [],
      statsSensors: { lights: '', climates: '', battery: '', offline: '' },
    })
  }

  async function onDeleteFloor(id: string) {
    if (layoutConfig.value.floors.length <= 1) {
      chrome.notify('必须保留至少一个楼层！', 'warning')
      return
    }
    const confirmed = await chrome.confirm(
      '确定要删除该楼层吗？该楼层下的所有热区布局将永久丢失！',
      '删除楼层',
      { type: 'danger' },
    )
    if (confirmed) {
      layoutConfig.value.floors = layoutConfig.value.floors.filter((f) => f.id !== id)
      if (layoutConfig.value.activeFloorId === id) {
        layoutConfig.value.activeFloorId = layoutConfig.value.floors[0].id
      }
    }
  }

  function openFloorAssetPick(floorId: string) {
    pickingFloorId.value = floorId
    showAssetPicker.value = true
  }

  async function onSelectFloorAsset(url: string) {
    if (pickingFloorId.value) {
      const floor = layoutConfig.value.floors.find((f) => f.id === pickingFloorId.value)
      if (floor) {
        floor.backgroundUrl = url
        if (isAutoAspectRatio(floor.floorplanAspectRatio, floor.floorplanAspectRatioManual)) {
          try {
            floor.floorplanAspectRatio = await probeImageAspectRatio(url)
          } catch {
            /* 保留原比例 */
          }
        }
        chrome.notify('路径已自动填入', 'success')
      }
    }
    showAssetPicker.value = false
    pickingFloorId.value = null
  }

  function getSwitcherConfig() {
    if (!layoutConfig.value.floorSwitcherConfig) {
      layoutConfig.value.floorSwitcherConfig = {
        left: -1,
        top: -1,
        direction: 'vertical',
        btnSize: 44,
        isLocked: true,
      }
    }
    return layoutConfig.value.floorSwitcherConfig
  }

  function toggleSwitcherLock() {
    const cfg = getSwitcherConfig()
    cfg.isLocked = !cfg.isLocked
  }

  function setSwitcherDir(dir: string) {
    getSwitcherConfig().direction = dir
  }

  function toggleEventLog() {
    if (layoutConfig.value.eventLogConfig) {
      layoutConfig.value.eventLogConfig.enabled = !layoutConfig.value.eventLogConfig.enabled
    }
  }

  return {
    showAssetPicker,
    pickingFloorId,
    floorSwitcherCfg,
    addFloor,
    onDeleteFloor,
    openFloorAssetPick,
    onSelectFloorAsset,
    toggleSwitcherLock,
    setSwitcherDir,
    toggleEventLog,
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
export function useWidgetBuilder(router: Router) {
  function openBuilder(widgetId: string) {
    router.push(`/builder/${widgetId}`)
  }

  return { openBuilder }
}

export { buildWidgetEjectHtml } from '@/utils/widget/widget-eject-html.util'

/** 确认删除微件 */
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

/** applyBindingsLayoutSlice：函数，按签名入参返回处理结果。 */
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

/** applyLifeAccountsLayoutSlice：函数，按签名入参返回处理结果。 */
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

/** applySecurityModesLayoutSlice：函数，按签名入参返回处理结果。 */
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

/** applyEarthquakeLayoutSlice：函数，按签名入参返回处理结果。 */
export function applyEarthquakeLayoutSlice(
  layout: UILayoutConfig,
  slice: { earthquakeConfig?: UILayoutConfig['earthquakeConfig'] },
) {
  if (slice.earthquakeConfig) layout.earthquakeConfig = clone(slice.earthquakeConfig)
}
