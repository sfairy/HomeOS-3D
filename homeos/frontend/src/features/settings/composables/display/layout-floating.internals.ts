/**
 * @file layout-floating.internals.ts
 * @module frontend/src/views
 */
/** composables：浮动小组件与浮动面板展示 */
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import type { FloatingWidget, UILayoutConfig } from '@/types/layout'
import { clampPct } from '@/utils/core/misc.util'
export { clampPct }
import { mirrorSecurityPanelZonesToLayout } from '@/utils/security/panel-layout.util'
import { FLOATING_HUB_DEFAULT_TAB, getFloatingHubTabOptions } from '@/utils/registry/floating-hub-tab-options'
import { cloneHubTabsDraft, getHubTabSet, hasConfigurableTabs, serializeHubTabsConfig } from '@/utils/registry/hub-tabs-options'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { FLOATING_HUB_TYPE_SET, FLOATING_HUB_WIDTH_MAP, getFloatingCatalogGroups, getWidgetCategoryLabelForType, getWidgetIcon, getWidgetName } from '@/utils/registry/widget-catalog'
import { Code } from '@lucide/vue'
import type { Ref } from 'vue'
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { confirmRemoveWidget, useWidgetEditorState } from './layout-dashboard.internals'

// ── useFloatingWidgets ──
/** 浮动组件 安防区域配置项 */
interface AfhZone {
  id: string
  name: string
  zoneType: string
  sensors: unknown[]
  roomId?: string
}

export function useFloatingWidgets(layoutConfig: Ref<UILayoutConfig>) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const router = useRouter()
  const { editId: afhEditId, toggleEdit, closeEdit } = useWidgetEditorState()

  const showAddFloating = ref(false)
  const afhEditSnapshot = ref<string | null>(null)
  const afhConfig = reactive({
    entityId: '',
    title: '',
    width: '160px',
    height: 'auto',
    theme: 'glass',
    showIcon: true,
    showZones: true,
    rawHtml: '',
    zones: [] as AfhZone[],
    sensorIds: '',
    playerEntities: '',
    quickSwitchEntities: [] as string[],
    customColorsEnabled: false,
    customColorAccent: '',
    customColorLabel: '',
    customColorValue: '',
  })

  const afhHubTabs = reactive({
    defaultTab: 'overview',
    visibleTabs: [] as string[],
  })

  const floatingWidgets = computed(() => layoutConfig.value.floatingWidgets || [])

  async function toggleAfhLock() {
    const prev = layoutConfig.value.isAfhLocked
    layoutConfig.value.isAfhLocked = !prev
    try {
      const ok = await layoutStore.saveLayout(true)
      if (!ok) {
        layoutConfig.value.isAfhLocked = prev
        chrome.notify('保存失败，已回滚锁定状态', 'error')
      }
    } catch (e) {
      layoutConfig.value.isAfhLocked = prev
      chrome.notify((e as { message?: string })?.message || '保存失败，已回滚锁定状态', 'error')
    }
  }

  function addFloatingWidgetByType(type: string) {
    const extraConfig: Record<string, unknown> =
      type === 'securityPanel' ? { zones: [], showZones: true } : {}
    if (hasConfigurableTabs(type)) {
      Object.assign(extraConfig, serializeHubTabsConfig(cloneHubTabsDraft({}, type), type))
    } else if (FLOATING_HUB_DEFAULT_TAB[type]) {
      extraConfig.defaultTab = FLOATING_HUB_DEFAULT_TAB[type]
    }
    const widget: FloatingWidget = {
      id: `fw-${Date.now()}`,
      enabled: true,
      type,
      xPct: 50,
      yPct: 50,
      config: {
        title: getWidgetName(type) || '新组件',
        width: FLOATING_HUB_WIDTH_MAP[type] || '160px',
        height: 'auto',
        theme: type === 'entity' ? 'auto' : 'glass',
        showIcon: true,
        entityId: '',
        ...extraConfig,
      },
    }
    layoutStore.addFloatingWidget(widget)
    showAddFloating.value = false
    chrome.notify('已添加新的浮动组件', 'success')
  }

  function buildAfhEditSnapshot(widget: FloatingWidget) {
    return JSON.stringify({
      xPct: widget.xPct,
      yPct: widget.yPct,
      entityId: afhConfig.entityId,
      title: afhConfig.title,
      width: afhConfig.width,
      height: afhConfig.height,
      theme: afhConfig.theme,
      showIcon: afhConfig.showIcon,
      showZones: afhConfig.showZones,
      rawHtml: afhConfig.rawHtml,
      zones: afhConfig.zones.map((z) => ({
        ...z,
        sensors: Array.isArray(z.sensors) ? [...z.sensors] : [],
      })),
      defaultTab: afhHubTabs.defaultTab,
      visibleTabs: [...afhHubTabs.visibleTabs],
      sensorIds: afhConfig.sensorIds,
      playerEntities: afhConfig.playerEntities,
      quickSwitchEntities: [...afhConfig.quickSwitchEntities],
      customColorsEnabled: afhConfig.customColorsEnabled,
      customColorAccent: afhConfig.customColorAccent,
      customColorLabel: afhConfig.customColorLabel,
      customColorValue: afhConfig.customColorValue,
    })
  }

  function applyAfhEditSnapshot(snapshotJson: string) {
    const snap = JSON.parse(snapshotJson) as {
      xPct: number
      yPct: number
      entityId?: string
      title?: string
      width?: string
      height?: string
      theme?: string
      showIcon?: boolean
      showZones?: boolean
      rawHtml?: string
      zones?: Array<{
        zoneType?: string
        sensors?: string[]
        roomId?: string
        [key: string]: unknown
      }>
      defaultTab?: string
      visibleTabs?: string[]
      sensorIds?: string
      playerEntities?: string
      quickSwitchEntities?: string[]
      customColorsEnabled?: boolean
      customColorAccent?: string
      customColorLabel?: string
      customColorValue?: string
    }
    const widget = floatingWidgets.value.find((w) => w.id === afhEditId.value)
    if (widget) {
      widget.xPct = snap.xPct
      widget.yPct = snap.yPct
    }
    afhConfig.entityId = snap.entityId || ''
    afhConfig.title = snap.title || ''
    afhConfig.width = snap.width || '160px'
    afhConfig.height = snap.height || 'auto'
    afhConfig.theme = snap.theme || 'glass'
    afhConfig.showIcon = snap.showIcon !== false
    afhConfig.showZones = snap.showZones !== false
    afhConfig.rawHtml = snap.rawHtml || ''
    afhConfig.zones = Array.isArray(snap.zones)
      ? snap.zones.map((z) => ({
          id: String((z as { id?: string }).id ?? `zone-${Math.random().toString(36).slice(2, 8)}`),
          name: String((z as { name?: string }).name ?? ''),
          zoneType: z.zoneType || 'all',
          sensors: Array.isArray(z.sensors) ? [...z.sensors] : [],
          roomId: z.roomId || '',
        }))
      : []
    afhHubTabs.defaultTab = snap.defaultTab || 'overview'
    afhHubTabs.visibleTabs = Array.isArray(snap.visibleTabs) ? [...snap.visibleTabs] : []
    afhConfig.sensorIds = snap.sensorIds || ''
    afhConfig.playerEntities = snap.playerEntities || ''
    afhConfig.quickSwitchEntities = Array.isArray(snap.quickSwitchEntities)
      ? [...snap.quickSwitchEntities]
      : []
    afhConfig.customColorsEnabled = snap.customColorsEnabled === true
    afhConfig.customColorAccent = snap.customColorAccent || ''
    afhConfig.customColorLabel = snap.customColorLabel || ''
    afhConfig.customColorValue = snap.customColorValue || ''
  }

  const isAfhEditorDirty = computed(() => {
    if (!afhEditId.value || !afhEditSnapshot.value) return false
    const widget = floatingWidgets.value.find((w) => w.id === afhEditId.value)
    if (!widget) return false
    return afhEditSnapshot.value !== buildAfhEditSnapshot(widget)
  })

  async function toggleAfhEditor(widgetId: string) {
    const opening = afhEditId.value !== widgetId
    if (opening && afhEditId.value && isAfhEditorDirty.value) {
      const ok = await chrome.confirm(
        '当前浮动部件编辑尚未写入布局。切换目标将丢失未应用的修改，确定继续？',
        '未保存的草稿',
        { type: 'danger', confirmText: '丢弃并切换', cancelText: '继续编辑' },
      )
      if (!ok) return
    }
    toggleEdit(widgetId)
    if (!opening) {
      afhEditSnapshot.value = null
      return
    }
    const widget = floatingWidgets.value.find((w) => w.id === widgetId)
    if (widget) {
      const cfg = (widget.config || {}) as Record<string, unknown>
      afhConfig.entityId = String(cfg.entityId || '')
      afhConfig.title = String(cfg.title || '')
      afhConfig.width = String(cfg.width || '160px')
      afhConfig.height = String(cfg.height || 'auto')
      afhConfig.theme = String(cfg.theme || 'glass')
      afhConfig.showIcon = cfg.showIcon !== false
      afhConfig.showZones = cfg.showZones !== false
      afhConfig.rawHtml = String(cfg.rawHtml || '')
      afhConfig.zones = Array.isArray(cfg.zones)
        ? (cfg.zones as AfhZone[]).map((z) => ({
            ...z,
            zoneType: z.zoneType || 'all',
            sensors: Array.isArray(z.sensors) ? [...z.sensors] : [],
            roomId: z.roomId || '',
          }))
        : []
      if (hasConfigurableTabs(widget.type)) {
        Object.assign(afhHubTabs, cloneHubTabsDraft(widget.config, widget.type))
      } else {
        afhHubTabs.defaultTab = ''
        afhHubTabs.visibleTabs = []
      }
      afhConfig.sensorIds = String(cfg.sensorIds || '')
      afhConfig.playerEntities = String(cfg.playerEntities || '')
      afhConfig.quickSwitchEntities = Array.isArray(cfg.entities)
        ? [...(cfg.entities as string[])]
        : []
      afhConfig.customColorsEnabled = cfg.customColorsEnabled === true
      afhConfig.customColorAccent = String(cfg.customColorAccent || '')
      afhConfig.customColorLabel = String(cfg.customColorLabel || '')
      afhConfig.customColorValue = String(cfg.customColorValue || '')
      afhEditSnapshot.value = buildAfhEditSnapshot(widget)
    }
  }

  function cancelAfhEditor() {
    if (!afhEditId.value) return
    if (afhEditSnapshot.value) {
      try {
        applyAfhEditSnapshot(afhEditSnapshot.value)
      } catch {
        /* 忽略畸形快照 */
      }
    }
    afhEditSnapshot.value = null
    closeEdit()
  }

  function addSecurityZone() {
    afhConfig.zones.push({
      id: `zone-${Date.now()}`,
      name: '',
      zoneType: 'all',
      sensors: [],
      roomId: '',
    })
  }

  function saveAfhConfig() {
    void saveAfhConfigAsync()
  }

  async function saveAfhConfigAsync() {
    if (!afhEditId.value) return
    const widget = floatingWidgets.value.find((w) => w.id === afhEditId.value)
    const widgetType = widget?.type || ''
    const { normalizeZonesForApi } = await import('@/utils/security/zones-api.util')
    const zonesForSave = normalizeZonesForApi(
      (afhConfig.zones || []).map((z) => ({
        id: z.id,
        name: z.name,
        zoneType: z.zoneType,
        sensors: (Array.isArray(z.sensors) ? z.sensors : []).map(String),
        roomId: z.roomId,
      })),
    )
    const nextConfig: Record<string, unknown> = {
      ...(widget?.config || {}),
      entityId: afhConfig.entityId,
      title: afhConfig.title,
      width: afhConfig.width,
      height: afhConfig.height,
      theme: afhConfig.theme,
      showIcon: afhConfig.showIcon,
      showZones: afhConfig.showZones,
      rawHtml: afhConfig.rawHtml,
      zones: zonesForSave,
      sensorIds: afhConfig.sensorIds || '',
      playerEntities: afhConfig.playerEntities || '',
    }
    if (widgetType === 'entity') {
      nextConfig.customColorsEnabled = afhConfig.customColorsEnabled === true
      nextConfig.customColorAccent = String(afhConfig.customColorAccent || '').trim()
      nextConfig.customColorLabel = String(afhConfig.customColorLabel || '').trim()
      nextConfig.customColorValue = String(afhConfig.customColorValue || '').trim()
      if (!nextConfig.customColorsEnabled) {
        delete nextConfig.customColorAccent
        delete nextConfig.customColorLabel
        delete nextConfig.customColorValue
      }
    }
    if (hasConfigurableTabs(widgetType)) {
      const tabFields = serializeHubTabsConfig(afhHubTabs, widgetType)
      Object.assign(nextConfig, tabFields)
      if (!('visibleTabs' in tabFields)) delete nextConfig.visibleTabs
    }
    layoutStore.updateFloatingWidget(afhEditId.value, {
      config: nextConfig,
    })
    afhEditSnapshot.value = null
    closeEdit()

    if (widgetType === 'securityPanel') {
      const authStore = useAuthStore()
      if (zonesForSave.length) {
        mirrorSecurityPanelZonesToLayout(layoutStore, zonesForSave)
      }
      if (authStore.role !== 'admin') {
        chrome.notify(
          '浮动组件配置已更新（仅管理员可同步区域到后端），请点击侧边栏「保存全部」持久化',
          'info',
        )
        return
      }
      if (!zonesForSave.length) {
        chrome.notify(
          '浮动组件已更新；未配置区域时不会覆盖后端已有区域，请点击侧边栏「保存全部」持久化',
          'info',
        )
        return
      }
      const { postSecurityZonesSafe } = await import('@/utils/security/zones-api.util')
      const result = await postSecurityZonesSafe(zonesForSave)
      if (result.ok) {
        chrome.notify(
          '浮动组件与安防区域已同步到后端，请点击侧边栏「保存全部」持久化布局',
          'success',
        )
        return
      }
      if (result.unauthorized) {
        // 全局 401 拦截器会提示并跳转登录，避免重复 toast
        return
      }
      chrome.notify(`布局已更新，但区域同步失败：${result.error}`, 'warning')
      return
    }

    chrome.notify('浮动组件配置已更新，请点击侧边栏「保存全部」持久化', 'info')
  }

  async function removeFloatingWidgetById(id: string) {
    const fw = floatingWidgets.value.find((w) => w.id === id)
    const title = fw?.config?.title || fw?.type || '组件'
    const ok = await confirmRemoveWidget(chrome, {
      message: `确定删除浮动组件「${title}」？`,
      title: '删除组件',
      confirmOptions: { confirmText: '删除', type: 'danger' },
    })
    if (!ok) return
    layoutStore.removeFloatingWidget(id)
    if (afhEditId.value === id) closeEdit()
  }

  function getAfhIcon(type: string) {
    return getWidgetIcon(type) || Code
  }

  function isValidFloatingType(type: string) {
    return FLOATING_HUB_TYPE_SET.has(type)
  }

  function goSecurityModes() {
    router.push(SETTINGS_ROUTES.securityModes())
  }

  watch(
    () => layoutStore.layoutDirty,
    (dirty) => {
      if (!dirty && afhEditId.value) {
        afhEditSnapshot.value = null
        closeEdit()
      }
    },
  )

  return {
    showAddFloating,
    afhEditId,
    afhConfig,
    afhHubTabs,
    isAfhEditorDirty,
    floatingWidgets,
    toggleAfhLock,
    addFloatingWidgetByType,
    toggleAfhEditor,
    cancelAfhEditor,
    addSecurityZone,
    saveAfhConfig,
    removeFloatingWidgetById,
    getAfhIcon,
    isValidFloatingType,
    goSecurityModes,
  }
}

// ── useFloatingPanelDisplay ──
export { AFH_THEME_DEFS as AFH_THEMES } from '@/utils/floorplan/floating-entity-colors.util'

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
