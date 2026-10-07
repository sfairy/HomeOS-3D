/**
 * @file useFloatingHub.ts
 * @module frontend/src/composables
 */
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { formatLocaleTime } from '@/utils/format/locale-format.util'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { viewportPointToPopupAnchor } from '@/composables/ui/usePopupPosition'
import { usePerfClock } from '@/composables/ui/usePerfClock'
import { useEntityDisplayEpoch } from '@/composables/entity/useEntityDisplayEpoch'
import {
  isElectricityEntity,
  isGasEntity,
  isWaterEntity,
  isCommEntity,
  isUtilityEntity,
} from '@/composables/entity/useEntityType'
import { isFloatingPanelType, FLOATING_HUB_WIDTH_MAP } from '@/utils/registry/widget-registry'
import type { FloatingWidget } from '@/types/layout'
import type { FloatingHubContext } from '@/components/shell/floating-hub/context'
import {
  getPanelEdgeAnchorFromRect,
  getWidgetAnchorTransform,
  anchorPctFromPointer,
  popupAnchorFromWidgetRect,
  rectCenterPct,
  sanitizeWidgetPct,
  isValidRootRect,
} from '@/utils/floorplan/floating-hub-layout.util'
import {
  buildAfhAccentStyle,
  resolveAfhWidgetTheme,
} from '@/utils/floorplan/floating-entity-colors.util'
import { resolveAqiSensorId, collectSensorEntityIds } from '@/utils/weather/weather-metric.util'

const AsyncUtilityMeterInfoPopup = defineAsyncComponent(
  () => import('@/components/entities/popups/UtilityMeterInfoPopup.vue'),
)
const AsyncCommInfoPopup = defineAsyncComponent(
  () => import('@/components/entities/popups/CommInfoPopup.vue'),
)

const HUB_CLOCK_TIME_OPTS = {
  hour: '2-digit',
  minute: '2-digit',
} as const satisfies Intl.DateTimeFormatOptions
const FLOATING_DRAG_THRESHOLD_PX = 4

export function useFloatingHub(rootRef: Ref<HTMLElement | null>) {
  const layoutStore = useLayoutStore()
  const entitiesStore = useEntitiesStore()
  const entityDisplayEpoch = useEntityDisplayEpoch(['sensor', 'binary_sensor'])

  const { now: clockNow } = usePerfClock()
  const nowTime = computed(() => formatLocaleTime(clockNow.value, HUB_CLOCK_TIME_OPTS))

  const enabledWidgets = computed(() => {
    return (layoutStore.layoutConfig.floatingWidgets || []).filter(
      (w) => w.enabled && w.visible !== false,
    )
  })

  watch(
    () => layoutStore.layoutConfig.floatingWidgets,
    (widgets) => {
      if (!widgets) return
      for (const widget of widgets) {
        if (!widget.enabled || widget.visible === false) continue
        if (!Number.isFinite(widget.xPct) || !Number.isFinite(widget.yPct)) {
          sanitizeWidgetPct(widget)
        }
      }
    },
    { immediate: true, deep: true },
  )

  function findWidgetElement(widgetId: string) {
    const root = rootRef.value
    if (!root) return null
    return root.querySelector<HTMLElement>(`[data-afh-id="${widgetId}"]`)
  }

  function recoverWidgetPctFromDom(widget: FloatingWidget) {
    const root = rootRef.value
    const element = findWidgetElement(widget.id)
    if (!root || !element) {
      sanitizeWidgetPct(widget)
      return
    }
    const rootRect = root.getBoundingClientRect()
    if (!isValidRootRect(rootRect)) {
      sanitizeWidgetPct(widget)
      return
    }
    const center = rectCenterPct(element.getBoundingClientRect(), rootRect)
    widget.xPct = center.xPct
    widget.yPct = center.yPct
  }

  function entityState(eid: string): string {
    void entityDisplayEpoch.value
    if (!eid) return '--'
    const entity = entitiesStore.getEntity(eid)
    return entity?.state ?? '--'
  }

  function unitLabel(eid: string): string {
    void entityDisplayEpoch.value
    if (!eid) return ''
    return String(entitiesStore.getEntity(eid)?.attributes?.unit_of_measurement ?? '')
  }

  function friendlyName(eid: string) {
    void entityDisplayEpoch.value
    if (!eid) return '未绑定实体'
    return getEntityDisplayName(eid, entitiesStore.getEntity(eid))
  }

  function sensorValue(eid: string, keywords: string | string[]) {
    void entityDisplayEpoch.value
    if (eid) {
      const state = entitiesStore.getEntity(eid)?.state
      if (state && state !== 'unknown' && state !== 'unavailable') return state
    }
    const kwList = Array.isArray(keywords) ? keywords : [keywords]
    const domains = ['sensor', 'binary_sensor']
    for (const kw of kwList) {
      const needle = String(kw).toLowerCase()
      for (const domain of domains) {
        const ids = entitiesStore.sensorIndex.get(domain) || []
        for (let i = 0; i < ids.length; i++) {
          const key = ids[i]
          if (!key.toLowerCase().includes(needle)) continue
          const state = entitiesStore.getEntity(key)?.state
          if (state && state !== 'unknown' && state !== 'unavailable') return state
        }
      }
    }
    return '--'
  }

  function aqiValue(eid: string) {
    void entityDisplayEpoch.value
    void entitiesStore.getDomainEpoch('sensor')
    if (eid) {
      const ent = entitiesStore.getEntity(eid)
      const state = ent?.state
      // 绑定覆盖：仍须排除误绑的 PM2.5 浓度实体
      if (
        state &&
        state !== 'unknown' &&
        state !== 'unavailable' &&
        !String(eid).toLowerCase().includes('pm25') &&
        !String(eid).toLowerCase().includes('pm2_5') &&
        String(ent?.attributes?.device_class || '').toLowerCase() !== 'pm25'
      ) {
        return String(state)
      }
    }
    const weatherEid = String(layoutStore.layoutConfig.haConfig?.weatherEntityId || '').trim()
    const loc = weatherEid.match(/^weather\.(.+)$/)
    if (loc) void entitiesStore.ensureEntity(`sensor.${loc[1]}_aqi`)
    const sensorIds = collectSensorEntityIds({
      sensorIndexIds: entitiesStore.sensorIndex.get('sensor'),
      domainSensorIds: entitiesStore.domainEntityIndex.get('sensor'),
      allEntityIds: Object.keys(entitiesStore.entities),
    })
    const resolved =
      resolveAqiSensorId((id) => entitiesStore.getEntity(id), weatherEid, sensorIds) ||
      resolveAqiSensorId((id) => entitiesStore.getEntity(id), '', sensorIds)
    if (!resolved) return '--'
    const state = entitiesStore.getEntity(resolved)?.state
    return state && state !== 'unknown' && state !== 'unavailable' ? String(state) : '--'
  }

  function aqiLevel(val: string) {
    if (!val || val === '--') return ''
    const v = parseFloat(val)
    if (v <= 50) return 'afh-value--good'
    if (v <= 100) return 'afh-value--moderate'
    return 'afh-value--bad'
  }

  function batteryColor(val: string) {
    if (!val || val === '--') return ''
    const v = parseFloat(val)
    if (v > 50) return 'afh-value--good'
    if (v > 20) return 'afh-value--moderate'
    return 'afh-value--bad'
  }

  function getWidgetTheme(widget: FloatingWidget) {
    return resolveAfhWidgetTheme(widget)
  }

  function getWidgetStyle(widget: FloatingWidget) {
    const xPct = Number.isFinite(widget.xPct) ? widget.xPct : 50
    const yPct = Number.isFinite(widget.yPct) ? widget.yPct : 50
    const isPanel = isFloatingPanelType(widget.type)
    const width =
      widget.config.width || (isPanel ? FLOATING_HUB_WIDTH_MAP[widget.type] : null) || 'auto'
    const transform =
      draggingId.value === widget.id && frozenTransform
        ? frozenTransform
        : getWidgetAnchorTransform({ ...widget, xPct, yPct })
    return {
      left: xPct + '%',
      top: yPct + '%',
      width,
      height: widget.config.height || 'auto',
      transform,
      ...buildAfhAccentStyle(widget),
    }
  }

  const activePopupId = ref<string | null>(null)
  const activePopupEntityId = ref('')
  const activePopupX = ref(50)
  const activePopupY = ref(50)

  const activePopupAnchor = computed(() => {
    if (!activePopupId.value) return null
    const widget = enabledWidgets.value.find((w) => w.id === activePopupId.value)
    if (!widget) return null
    const element = findWidgetElement(widget.id)
    if (element) {
      const { rawX, rawY } = popupAnchorFromWidgetRect(element.getBoundingClientRect())
      return viewportPointToPopupAnchor(rawX, rawY)
    }
    const root = rootRef.value
    if (!root) return null
    const rect = root.getBoundingClientRect()
    const rawX = rect.left + (widget.xPct / 100) * rect.width
    const rawY = rect.top + (widget.yPct / 100) * rect.height + 30
    return viewportPointToPopupAnchor(rawX, rawY)
  })

  const activePopupComponent = computed(() => {
    if (!activePopupId.value) return null
    const eid = activePopupEntityId.value
    if (isElectricityEntity(eid) || isGasEntity(eid) || isWaterEntity(eid)) {
      return AsyncUtilityMeterInfoPopup
    }
    if (isCommEntity(eid)) return AsyncCommInfoPopup
    return null
  })

  function onWidgetClick(widget: FloatingWidget) {
    if (!widget.config?.entityId) return
    const eid = String(widget.config.entityId)
    if (!isUtilityEntity(eid)) return
    if (draggingId.value) return
    activePopupEntityId.value = eid
    activePopupX.value = widget.xPct
    activePopupY.value = widget.yPct
    activePopupId.value = activePopupId.value === widget.id ? null : widget.id
  }

  const draggingId = ref<string | null>(null)
  let startX = 0
  let startY = 0
  let grabOffsetPxX = 0
  let grabOffsetPxY = 0
  let frozenTransform = ''
  let dragCommitted = false

  function onDragStart(widget: FloatingWidget, event: MouseEvent | TouchEvent) {
    if (layoutStore.layoutConfig.isAfhLocked !== false) return
    const root = rootRef.value
    if (!root) return

    const rootRect = root.getBoundingClientRect()
    if (!isValidRootRect(rootRect)) return

    if (!Number.isFinite(widget.xPct) || !Number.isFinite(widget.yPct)) {
      recoverWidgetPctFromDom(widget)
    }

    const pos = 'touches' in event ? event.touches[0] : event
    const anchorX = rootRect.left + (widget.xPct / 100) * rootRect.width
    const anchorY = rootRect.top + (widget.yPct / 100) * rootRect.height

    frozenTransform = getWidgetAnchorTransform(widget)
    grabOffsetPxX = pos.clientX - anchorX
    grabOffsetPxY = pos.clientY - anchorY
    draggingId.value = widget.id
    dragCommitted = false
    startX = pos.clientX
    startY = pos.clientY

    if (event.cancelable) event.preventDefault()
  }

  function onDragMove(event: MouseEvent | TouchEvent) {
    if (!draggingId.value) return
    const widget = enabledWidgets.value.find((w) => w.id === draggingId.value)
    if (!widget) return

    const root = rootRef.value
    if (!root) return
    const pos = 'touches' in event ? event.touches[0] : event
    const rootRect = root.getBoundingClientRect()
    if (!isValidRootRect(rootRect)) return

    if (!dragCommitted) {
      if (Math.hypot(pos.clientX - startX, pos.clientY - startY) < FLOATING_DRAG_THRESHOLD_PX)
        return
      layoutStore.pushEditHistory(true, true)
      dragCommitted = true
    }

    const next = anchorPctFromPointer(
      pos.clientX,
      pos.clientY,
      rootRect,
      grabOffsetPxX,
      grabOffsetPxY,
      { xPct: widget.xPct, yPct: widget.yPct },
    )
    widget.xPct = next.xPct
    widget.yPct = next.yPct

    if (event.cancelable) event.preventDefault()
  }

  function onDragEnd() {
    if (!draggingId.value) return

    if (dragCommitted) {
      const widget = enabledWidgets.value.find((w) => w.id === draggingId.value)
      const element = findWidgetElement(draggingId.value)
      const root = rootRef.value
      if (widget && element && root && isFloatingPanelType(widget.type)) {
        const rootRect = root.getBoundingClientRect()
        if (isValidRootRect(rootRect)) {
          const anchor = getPanelEdgeAnchorFromRect(element.getBoundingClientRect(), rootRect)
          widget.xPct = anchor.xPct
          widget.yPct = anchor.yPct
        }
      }
      layoutStore.layoutDirty = true
    }

    dragCommitted = false
    draggingId.value = null
    frozenTransform = ''
  }

  onMounted(() => {
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    window.addEventListener('touchmove', onDragMove, { passive: false })
    window.addEventListener('touchend', onDragEnd)
  })

  onUnmounted(() => {
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
    window.removeEventListener('touchmove', onDragMove)
    window.removeEventListener('touchend', onDragEnd)
  })

  const context: FloatingHubContext = {
    layoutStore,
    enabledWidgets,
    draggingId,
    nowTime,
    onDragStart,
    onWidgetClick,
    getWidgetTheme,
    getWidgetStyle,
    entityState,
    unitLabel,
    friendlyName,
    sensorValue,
    aqiValue,
    aqiLevel,
    batteryColor,
    isGasEntity,
    isWaterEntity,
    isCommEntity,
    isUtilityEntity,
    isFloatingPanelType,
  }

  return {
    ...context,
    activePopupId,
    activePopupEntityId,
    activePopupX,
    activePopupY,
    activePopupAnchor,
    activePopupComponent,
    context,
  }
}
