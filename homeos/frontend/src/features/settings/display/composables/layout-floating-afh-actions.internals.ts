/**
 * @file layout-floating-afh-actions.internals.ts
 * @module frontend/src/views
 */
/** 浮动组件：AFH 保存 / 删除 / 跳转 */
import { confirmRemoveWidget } from '@/features/settings/display/composables/layout-dashboard.internals'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { SETTINGS_ROUTES } from '@/shared/utils/registry/settings-route.util'
import { Code } from '@lucide/vue'
import { FLOATING_HUB_TYPE_SET, getWidgetIcon } from '@/shared/utils/registry/widget-catalog'
import { hasConfigurableTabs, serializeHubTabsConfig } from '@/shared/utils/registry/hub-tabs-options'
import { mirrorSecurityPanelZonesToLayout } from '@/shared/security/utils/panel-layout.util'
import type { FloatingWidget } from '@/shared/types/layout'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'

export function useFloatingAfhActions(opts: {
  floatingWidgets: Ref<FloatingWidget[]>
  afhEditId: Ref<string | null>
  afhConfig: {
    entityId: string
    title: string
    width: string
    height: string
    theme: string
    showIcon: boolean
    showZones: boolean
    rawHtml: string
    zones: Array<{
      id: string
      name: string
      zoneType: string
      sensors: unknown[]
      roomId?: string
    }>
    sensorIds: string
    playerEntities: string
    customColorsEnabled: boolean
    customColorAccent: string
    customColorLabel: string
    customColorValue: string
  }
  afhHubTabs: { defaultTab: string; visibleTabs: string[] }
  afhEditSnapshot: Ref<string | null>
  closeEdit: () => void
}) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const router = useRouter()
  const { floatingWidgets, afhEditId, afhConfig, afhHubTabs, afhEditSnapshot, closeEdit } = opts

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
    const { normalizeZonesForApi } = await import('@/shared/security/utils/zones-api.util')
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
      if (zonesForSave.length) {
        mirrorSecurityPanelZonesToLayout(layoutStore, zonesForSave)
      }
      if (!zonesForSave.length) {
        chrome.notify(
          '浮动组件已更新；未配置区域时不会覆盖后端已有区域，请点击侧边栏「保存全部」持久化',
          'info',
        )
        return
      }
      const { postSecurityZonesSafe } = await import('@/shared/security/utils/zones-api.util')
      const result = await postSecurityZonesSafe(zonesForSave)
      if (result.ok) {
        chrome.notify(
          '浮动组件与安防区域已同步到后端，请点击侧边栏「保存全部」持久化布局',
          'success',
        )
        return
      }
      if (result.unauthorized) {
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

  return {
    addSecurityZone,
    saveAfhConfig,
    saveAfhConfigAsync,
    removeFloatingWidgetById,
    getAfhIcon,
    isValidFloatingType,
    goSecurityModes,
  }
}
