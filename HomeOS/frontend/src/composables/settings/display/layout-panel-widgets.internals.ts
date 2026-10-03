/**
 * @file layout-panel-widgets.internals.ts
 * @module frontend/src/views
 */
/** composables：自 layout.internals.ts 拆出 — 面板小组件与 Widgets 面板展示 */
import { MAX_QUICK_BUTTONS, QUICK_BUTTON_OPTIONS, normalizeQuickButtons } from '@/components/widgets/quick-actions.config'
import type { PanelWidget } from '@/types/layout'
import { useChromeStore } from '@/stores/chrome.store'
import { WIDGET_BUILDER_DEFAULT_TEMPLATE } from '@/composables/widget/useWidgetBuilderView'
import { FLOATING_HUB_DEFAULT_TAB } from '@/utils/registry/floating-hub-tab-options'
import { HERO_SWIPER_DEFAULT_SLIDES, cloneHeroSwiperSlides, serializeHeroSwiperSlides } from '@/utils/registry/hero-swiper-slide-options'
import { defaultHeroSlideConfig } from '@/utils/registry/hero-swiper-slide-registry'
import { cloneHomeClimateChartConfig, normalizeHomeClimateChartConfig, serializeHomeClimateChartConfig } from '@/utils/registry/home-climate-chart-options'
import { cloneHubTabsDraft, getHubTabSet, hasConfigurableTabs, serializeHubTabsConfig } from '@/utils/registry/hub-tabs-options'
import { cloneWeatherHubConfig, isWeatherHubWidgetType, normalizeWeatherHubConfig, serializeWeatherHubConfig } from '@/utils/registry/weather-hub-options'
import { getDashboardWidgetCatalogGroups, getSidebarWidgetCatalogGroups, getWidgetName } from '@/utils/registry/widget-catalog'
import { getSidebarWidgetDefaultHeight } from '@/utils/registry/widget-registry-meta'
import {
  clampPanelCardHeightPx,
  parsePanelCardHeightPx,
} from '@/utils/widget/panel-widget-height.util'
import { measureWidgetEjectHeightPx } from '@/utils/widget/widget-eject-html.util'
import type { Ref } from 'vue'
import { computed, getCurrentInstance, nextTick, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  buildWidgetEjectHtml,
  confirmRemoveWidget,
  useWidgetBuilder,
  useWidgetEditorState,
} from './layout-dashboard.internals'

// ── usePanelWidgets ──
function cfgStr(cfg: Record<string, unknown> | undefined, key: string): string {
  const v = cfg?.[key]
  return typeof v === 'string' ? v : ''
}

function cfgStatsField(cfg: Record<string, unknown> | undefined, field: string): string {
  const stats = cfg?.statsSensors
  if (!stats || typeof stats !== 'object') return ''
  const v = (stats as Record<string, unknown>)[field]
  return typeof v === 'string' ? v : ''
}

/** usePanelWidgets：函数，按签名入参返回处理结果。 */
export function usePanelWidgets(rightPanelWidgets: Ref<PanelWidget[]>) {
  const router = useRouter()
  const chrome = useChromeStore()
  const { editId: widgetEditId, toggleEdit, closeEdit } = useWidgetEditorState()
  const { openBuilder: navigateToBuilder } = useWidgetBuilder(router)

  /** 跳转全屏编辑器前，将行内草稿同步到 layoutConfig */
  function openBuilder(widgetId: string) {
    const w = rightPanelWidgets.value.find((item) => item.id === widgetId)
    if (w?.type === 'customHtml' && widgetEditId.value === widgetId) {
      const draft = widgetConfig.rawHtml
      // 空草稿 / 默认示例不能回写，否则会把刚按样式生成的源码盖掉
      if (typeof draft === 'string' && draft.trim() && draft !== WIDGET_BUILDER_DEFAULT_TEMPLATE) {
        w.config = { ...w.config, rawHtml: draft }
      }
    }
    navigateToBuilder(widgetId)
  }

  /** 从全屏编辑器返回后，刷新行内配置草稿 */
  watch(
    () => router.currentRoute.value.fullPath,
    (path, prev) => {
      if (!prev?.startsWith('/builder/') || path.startsWith('/builder/')) return
      if (!widgetEditId.value) return
      const w = rightPanelWidgets.value.find((item) => item.id === widgetEditId.value)
      if (w?.type === 'customHtml') {
        widgetConfig.rawHtml = cfgStr(w.config as Record<string, unknown>, 'rawHtml')
        customHtmlDraftBaseline.value = widgetConfig.rawHtml
      }
    },
  )

  const showAddWidget = ref(false)
  const widgetConfig = reactive({
    playerEntities: '',
    sensorIds: '',
    lights: '',
    climates: '',
    battery: '',
    offline: '',
    rawHtml: '',
    coverEntityIds: [] as string[],
    defaultTemplateId: '',
    quickButtons: [] as string[],
    quickSwitchEntities: [] as string[],
    defaultTab: 'overview',
    heroSwiperSlides: [] as Array<{ id: string; type: string; config?: Record<string, unknown> }>,
    weatherHub: normalizeWeatherHubConfig({}),
    homeClimateChart: normalizeHomeClimateChartConfig({}),
    hubTabs: cloneHubTabsDraft({}, 'switchGroup'),
  })

  const heightEditId = ref<string | null>(null)
  const heightDraft = ref(0)
  const heightPreset = ref(0)
  const customHtmlDraftBaseline = ref('')

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

  async function openWidgetConfig(w: PanelWidget) {
    heightEditId.value = null
    const opening = widgetEditId.value !== w.id
    if (
      opening &&
      widgetEditId.value &&
      isCustomHtmlDraftDirty.value
    ) {
      const ok = await chrome.confirm(
        '当前自定义 HTML 草稿尚未写入布局。切换微件将丢失未应用的修改，确定继续？',
        '未保存的草稿',
        { type: 'danger', confirmText: '丢弃并切换', cancelText: '继续编辑' },
      )
      if (!ok) return
    }
    toggleEdit(w.id)
    if (opening) {
      const cfg = w.config
      widgetConfig.playerEntities = cfgStr(cfg, 'playerEntities')
      widgetConfig.sensorIds = cfgStr(cfg, 'sensorIds')
      widgetConfig.lights = cfgStatsField(cfg, 'lights')
      widgetConfig.climates = cfgStatsField(cfg, 'climates')
      widgetConfig.battery = cfgStatsField(cfg, 'battery')
      widgetConfig.offline = cfgStatsField(cfg, 'offline')
      widgetConfig.quickButtons = normalizeQuickButtons(cfg?.quickButtons)
      widgetConfig.quickSwitchEntities = Array.isArray(cfg?.entities)
        ? [...(cfg.entities as string[])]
        : []
      widgetConfig.coverEntityIds = Array.isArray(cfg?.coverEntityIds)
        ? [...(cfg.coverEntityIds as string[])]
        : []
      widgetConfig.defaultTemplateId = cfgStr(cfg, 'defaultTemplateId')
      widgetConfig.rawHtml = cfgStr(cfg, 'rawHtml')
      if (w.type === 'customHtml') {
        customHtmlDraftBaseline.value = widgetConfig.rawHtml
      }
      widgetConfig.defaultTab =
        cfgStr(cfg, 'defaultTab') || FLOATING_HUB_DEFAULT_TAB[w.type] || 'overview'
      widgetConfig.heroSwiperSlides = cloneHeroSwiperSlides(
        cfg as { slides?: unknown[] } | undefined,
      )
      if (isWeatherHubWidgetType(w.type)) {
        Object.assign(widgetConfig.weatherHub, cloneWeatherHubConfig(cfg, w.type))
      }
      if (w.type === 'homeClimateChart') {
        Object.assign(widgetConfig.homeClimateChart, cloneHomeClimateChartConfig(cfg))
      }
      if (hasConfigurableTabs(w.type) && !isWeatherHubWidgetType(w.type)) {
        Object.assign(widgetConfig.hubTabs, cloneHubTabsDraft(cfg, w.type))
      }
    }
  }

  function applyHubTabsSave(w: PanelWidget) {
    const tabFields = serializeHubTabsConfig(widgetConfig.hubTabs, w.type)
    w.config = { ...w.config, ...tabFields }
    if (!('visibleTabs' in tabFields)) delete w.config.visibleTabs
  }

  const isCustomHtmlDraftDirty = computed(() => {
    const w = rightPanelWidgets.value.find((item) => item.id === widgetEditId.value)
    if (w?.type !== 'customHtml') return false
    return widgetConfig.rawHtml !== customHtmlDraftBaseline.value
  })

  function cancelWidgetConfig() {
    const w = rightPanelWidgets.value.find((item) => item.id === widgetEditId.value)
    if (!w || w.type !== 'customHtml') return

    const baseline = customHtmlDraftBaseline.value
    const target = baseline.trim() ? baseline : WIDGET_BUILDER_DEFAULT_TEMPLATE

    if (widgetConfig.rawHtml === target) {
      chrome.notify('当前内容未修改', 'info')
      return
    }

    widgetConfig.rawHtml = target
    chrome.notify(
      baseline.trim() ? '已恢复为打开面板时的内容' : '已恢复为默认示例代码',
      'success',
    )
  }

  function saveWidgetConfig() {
    const w = rightPanelWidgets.value.find((item) => item.id === widgetEditId.value)
    if (!w) return
    if (w.type === 'customHtml') {
      w.config = { ...w.config, rawHtml: widgetConfig.rawHtml }
      customHtmlDraftBaseline.value = widgetConfig.rawHtml
      closeEdit()
      chrome.notify('代码已写入布局草稿，请点击页面顶部「保存布局」同步到服务端', 'info')
      return
    } else if (w.type === 'quickActions') {
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
    } else if (w.type === 'switchGroup') {
      w.config = {
        ...w.config,
        entities: [...widgetConfig.quickSwitchEntities],
      }
      applyHubTabsSave(w)
    } else if (w.type === 'mediaMini') {
      w.config = { ...w.config, playerEntities: widgetConfig.playerEntities }
      applyHubTabsSave(w)
    } else if (w.type === 'heroSwiper') {
      w.config = {
        ...w.config,
        slides: serializeHeroSwiperSlides(widgetConfig.heroSwiperSlides),
      }
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
    } else if (w.type === 'coverGroup') {
      w.config = { ...w.config, coverEntityIds: [...widgetConfig.coverEntityIds] }
    } else if (hasConfigurableTabs(w.type) && !isWeatherHubWidgetType(w.type)) {
      applyHubTabsSave(w)
    }
    closeEdit()
    chrome.notify('已应用微件配置，请点击「保存布局」同步到服务端', 'info')
  }

  function setHeroSlideType(slideIndex: number, type: string) {
    const slide = widgetConfig.heroSwiperSlides[slideIndex]
    if (!slide) return
    slide.type = type
    slide.config = defaultHeroSlideConfig(type)
  }

  function moveHeroSlide(slideIndex: number, dir: number) {
    const list = widgetConfig.heroSwiperSlides
    const newIdx = slideIndex + dir
    if (newIdx < 0 || newIdx >= list.length) return
    ;[list[slideIndex], list[newIdx]] = [list[newIdx], list[slideIndex]]
  }

  async function ejectWidget(w: PanelWidget, idx: number) {
    const name = getWidgetName(w.type)
    chrome.notify('正在按当前部件样式生成自定义代码…', 'info')
    let rawHtml = ''
    try {
      rawHtml = await buildWidgetEjectHtml(w, name, getCurrentInstance()?.appContext ?? null)
    } catch {
      chrome.notify('按当前样式生成代码失败，请稍后重试', 'error')
      return
    }
    if (!rawHtml.trim()) {
      chrome.notify('未能生成自定义代码', 'error')
      return
    }
    closeEdit()
    widgetConfig.rawHtml = rawHtml
    customHtmlDraftBaseline.value = rawHtml
    const list = [...rightPanelWidgets.value]
    const cardHeight = measureWidgetEjectHeightPx(w)
    list[idx] = {
      ...list[idx],
      type: 'customHtml',
      config: {
        ...list[idx].config,
        rawHtml,
        ...(cardHeight > 0 ? { cardHeight } : {}),
      },
    }
    rightPanelWidgets.value = list
    await nextTick()
    chrome.notify(`已将「${name}」按当前样式转为自定义代码`, 'success')
    openBuilder(list[idx].id)
  }

  function addWidget(type: string) {
    const list = [...rightPanelWidgets.value]
    const config: Record<string, unknown> = {}
    if (type === 'customHtml') config.rawHtml = WIDGET_BUILDER_DEFAULT_TEMPLATE
    if (type === 'mediaMini') config.playerEntities = ''
    if (type === 'switchGroup') config.entities = []
    if (type === 'heroSwiper') {
      config.slides = HERO_SWIPER_DEFAULT_SLIDES.map((s) => ({
        id: s.id,
        type: s.type,
        ...(s.config ? { config: { ...s.config } } : {}),
      }))
    }
    if (type === 'weather') {
      Object.assign(config, serializeWeatherHubConfig(normalizeWeatherHubConfig({})))
    }
    if (type === 'homeClimateChart') {
      Object.assign(config, serializeHomeClimateChartConfig(normalizeHomeClimateChartConfig({})))
    }
    const presetHeight = getSidebarWidgetDefaultHeight(type)
    if (type === 'weather' || type === 'heroSwiper' || type === 'mediaMini') {
      config.cardHeight = presetHeight
    }
    list.push({ id: `widget-${Date.now()}-${Math.floor(Math.random() * 1000)}`, type, config })
    rightPanelWidgets.value = list
    if (type === 'customHtml') {
      openBuilder(list[list.length - 1].id)
    }
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
    isCustomHtmlDraftDirty,
    heightEditId,
    heightDraft,
    heightPreset,
    openHeightConfig,
    saveHeightConfig,
    resetHeightConfig,
    openWidgetConfig,
    saveWidgetConfig,
    cancelWidgetConfig,
    setHeroSlideType,
    moveHeroSlide,
    openBuilder,
    ejectWidget,
    addWidget,
    deleteWidget: confirmDeleteWidget,
    moveWidget,
  }
}

// ── useWidgetsPanelDisplay ──
/** WIDGET_PANEL_CONFIG_KEY：常量，取值语义见定义处。 */
export const WIDGET_PANEL_CONFIG_KEY = Symbol('widgetPanelConfig')

/** catalogTierClass：函数，按签名入参返回处理结果。 */
export function catalogTierClass(tier: string, dashboard = false) {
  if (tier === 'core') return dashboard ? 'text-amber-300/80 bg-amber-400/5' : 'text-purple-300/80'
  if (tier === 'admin') return 'text-rose-400/70 bg-rose-500/5'
  return dashboard ? 'text-amber-400/45' : 'text-gray-500'
}

/** widgetHasConfigPanel：函数，按签名入参返回处理结果。 */
export function widgetHasConfigPanel(type: string) {
  return (
    [
      'mediaMini',
      'quickActions',
      'switchGroup',
      'heroSwiper',
      'homeClimateChart',
      'coverGroup',
    ].includes(type) ||
    isWeatherHubWidgetType(type) ||
    isHubTabsOnlyConfig(type)
  )
}

/** isHubTabsOnlyConfig：函数，按签名入参返回处理结果。 */
export function isHubTabsOnlyConfig(type: string) {
  return (
    hasConfigurableTabs(type) &&
    !isWeatherHubWidgetType(type) &&
    !['switchGroup', 'mediaMini'].includes(type)
  )
}

/** hubTabSetFor：函数，按签名入参返回处理结果。 */
export function hubTabSetFor(type: string) {
  return getHubTabSet(type) || []
}

/** widgetConfigBtnLabel：函数，按签名入参返回处理结果。 */
export function widgetConfigBtnLabel(type: string) {
  if (type === 'mediaMini') return '配置播放器'
  if (type === 'quickActions') return '配置统计源'
  if (type === 'switchGroup') return '配置开关控制'
  if (type === 'heroSwiper') return '配置滑动页'
  if (isWeatherHubWidgetType(type)) return '配置天气中心'
  if (type === 'homeClimateChart') return '配置温湿度'
  if (type === 'coverGroup') return '配置窗帘组'
  if (hasConfigurableTabs(type)) return '配置 Tab'
  return '编辑组件槽'
}

/** widgetConfigDescription：函数，按签名入参返回处理结果。 */
export function widgetConfigDescription(type: string) {
  if (type === 'clock') return '侧栏时钟，无需额外配置'
  if (type === 'customHtml') return '自定义 HTML / Tailwind 沙盒'
  if (type === 'quickActions') return '快捷图标与汇总传感器'
  if (type === 'switchGroup') return '开关芯片与 Tab 视图'
  if (type === 'mediaMini') return '迷你媒体播放器'
  if (type === 'heroSwiper') return '三页滑动联动卡片'
  if (isWeatherHubWidgetType(type)) return '天气中心 Tab 与实体'
  if (type === 'homeClimateChart') return '全屋温湿度曲线'
  if (type === 'coverGroup') return '窗帘实体或自动分组'
  if (hasConfigurableTabs(type)) return 'Hub Tab 显隐与默认页'
  return '面板微件实例'
}

/** useQuickButtonConfig：函数，按签名入参返回处理结果。 */
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

/** toggleWidgetVisible：函数，按签名入参返回处理结果。 */
export function toggleWidgetVisible(widget: { visible?: boolean }) {
  widget.visible = widget.visible === false ? true : false
}
