/**
 * @file layout-panel-widgets.internals.ts
 * @module frontend/src/views
 */
/** composables：面板小组件与 Widgets 面板展示 */
import { MAX_QUICK_BUTTONS, QUICK_BUTTON_OPTIONS, normalizeQuickButtons } from '@/components/widgets/quick-actions.config'
import type { PanelWidget } from '@/types/layout'
import { useChromeStore } from '@/stores/chrome.store'
import { FLOATING_HUB_DEFAULT_TAB } from '@/utils/registry/floating-hub-tab-options'
import { cloneHomeClimateChartConfig, normalizeHomeClimateChartConfig, serializeHomeClimateChartConfig } from '@/utils/registry/home-climate-chart-options'
import { cloneHubTabsDraft, getHubTabSet, hasConfigurableTabs, serializeHubTabsConfig } from '@/utils/registry/hub-tabs-options'
import { cloneWeatherHubConfig, isWeatherHubWidgetType, normalizeWeatherHubConfig, serializeWeatherHubConfig } from '@/utils/registry/weather-hub-options'
import { getDashboardWidgetCatalogGroups, getSidebarWidgetCatalogGroups, getWidgetName } from '@/utils/registry/widget-catalog'
import { getSidebarWidgetDefaultHeight } from '@/utils/registry/widget-registry-meta'
import {
  clampPanelCardHeightPx,
  parsePanelCardHeightPx,
} from '@/utils/widget/panel-widget-height.util'
import type { Ref } from 'vue'
import { computed, reactive, ref } from 'vue'
import { confirmRemoveWidget, useWidgetEditorState } from './layout-dashboard.internals'

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
      const cfg = w.config
      widgetConfig.playerEntities = cfgStr(cfg, 'playerEntities')
      widgetConfig.sensorIds = cfgStr(cfg, 'sensorIds')
      widgetConfig.lights = cfgStatsField(cfg, 'lights')
      widgetConfig.climates = cfgStatsField(cfg, 'climates')
      widgetConfig.battery = cfgStatsField(cfg, 'battery')
      widgetConfig.offline = cfgStatsField(cfg, 'offline')
      widgetConfig.quickButtons = normalizeQuickButtons(cfg?.quickButtons)
      widgetConfig.defaultTab =
        cfgStr(cfg, 'defaultTab') || FLOATING_HUB_DEFAULT_TAB[w.type] || 'overview'
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
  return (
    hasConfigurableTabs(type) &&
    !isWeatherHubWidgetType(type) &&
    !['mediaMini'].includes(type)
  )
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
