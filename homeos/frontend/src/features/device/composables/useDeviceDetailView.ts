/** 设备详情页视图模型 —— `views/DeviceDetailView.vue` 的薄壳后端。 */
import { getEntityDomain, resolveEntityArea } from '@homeos/shared'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchEntity } from '@/services/api/entities'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { hasEntityControlPopup } from '@/shared/entity/utils/popup-registry.util'
import { useRouteEntityProjection } from '@/composables/entity/useRouteEntityProjection'
import { useEntityProjection } from '@/composables/entity/useEntityProjection'
import {
  collectIndexedEntityIds,
  getEntityDisplayName,
} from '@/shared/entity/utils/derived.util'
import { copyTextToClipboard } from '@homeos/shared/utils/clipboard'
import { getDomainLabel } from '@/shared/device/utils/domain-labels.util'
import {
  buildEntityAttrEntries,
  HVAC_ACTION_LABELS,
  HVAC_MODE_LABELS,
} from '@/shared/device/utils/attr-format.util'
import {
  displayClimateOperatingLabel,
  displayEntityStateLabel,
} from '@/shared/constants/entity-state-labels'

/** 合法的详情 Tab（来自 query.tab，非法值回落 overview）。 */
const VALID_DETAIL_TABS = new Set([
  'overview',
  'history',
  'refs',
  'usage',
  'analytics',
  'attrs',
])

/** 属性面板不展示的噪声字段。 */
const SKIP_ATTRS = new Set([
  'friendly_name',
  'entity_picture',
  'icon',
  'access_token',
  'area_id',
  'area_name',
  'device_id',
])

export function useDeviceDetailView() {
  const route = useRoute()
  const router = useRouter()
  const entitiesStore = useEntitiesStore()
  const chrome = useChromeStore()

  const entityLoading = ref(false)
  const entityFetchError = ref('')
  const detailTab = ref('overview')

  const entityId = computed(() => String(route.query.id || '').trim())
  useRouteEntityProjection(computed(() => (entityId.value ? [entityId.value] : [])))
  const entityProjection = useEntityProjection(entityId)
  const entity = computed(() => {
    if (!entityId.value) return null
    return entityProjection.value ?? entitiesStore.getEntity(entityId.value) ?? null
  })
  const domain = computed(() => getEntityDomain(entityId.value) || '')
  const domainLabel = computed(() => getDomainLabel(domain.value))
  const entityName = computed(() => getEntityDisplayName(entityId.value, entity.value) || '设备详情')
  const unavailable = computed(
    () => entity.value?.state === 'unavailable' || entity.value?.state === 'unknown',
  )
  const displayState = computed(() => {
    const state = entity.value?.state
    if (domain.value === 'climate' || domain.value === 'water_heater') {
      return displayClimateOperatingLabel(
        state,
        entity.value?.attributes as Record<string, unknown> | undefined,
        HVAC_ACTION_LABELS,
        HVAC_MODE_LABELS,
      )
    }
    return displayEntityStateLabel(entityId.value, state)
  })
  const area = computed(() => resolveEntityArea(entity.value?.attributes)?.display ?? '')
  const controllable = computed(
    () => entityId.value && hasEntityControlPopup(entityId.value, entitiesStore.entities),
  )

  const detailStatCells = computed(() => {
    const cells = [
      { key: 'domain', label: '域', value: domainLabel.value || '—', tone: 'sky' },
      {
        key: 'state',
        label: '状态',
        value: displayState.value,
        tone: unavailable.value ? 'red' : 'green',
      },
    ]
    if (area.value) {
      cells.push({ key: 'area', label: '房间', value: area.value, tone: 'muted' })
    }
    if (controllable.value) {
      cells.push({ key: 'ctrl', label: '控制', value: '可用', tone: 'amber' })
    }
    return cells
  })

  const deviceId = computed(() => {
    const id = entity.value?.attributes?.device_id
    return typeof id === 'string' ? id : null
  })

  const relatedEntitiesAll = computed(() => {
    if (!deviceId.value) return [] as Array<{ id: string; name: string }>
    const matches: Array<{ id: string; name: string }> = []
    const ids =
      collectIndexedEntityIds(entitiesStore.domainEntityIndex, { domain: 'all' }) ||
      Object.keys(entitiesStore.entities)
    for (const key of ids) {
      if (key === entityId.value) continue
      const devId = entitiesStore.entities[key]?.attributes?.device_id
      if (devId === deviceId.value) {
        matches.push({
          id: key,
          name: getEntityDisplayName(key, entitiesStore.entities[key]) || key,
        })
      }
    }
    return matches.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  })

  const relatedEntities = computed(() => relatedEntitiesAll.value.slice(0, 8))
  const relatedEntitiesExtra = computed(() =>
    Math.max(0, relatedEntitiesAll.value.length - relatedEntities.value.length),
  )

  function buildAttrEntries(attrs: Record<string, unknown>) {
    return buildEntityAttrEntries(attrs, SKIP_ATTRS)
  }

  const attrTotalCount = computed(() => {
    const attrs = entity.value?.attributes
    if (!attrs) return 0
    return buildAttrEntries(attrs as Record<string, unknown>).length
  })

  const attrEntries = computed(() => {
    const attrs = entity.value?.attributes
    if (!attrs) return []
    return buildAttrEntries(attrs as Record<string, unknown>)
  })

  const detailTabs = computed(() => {
    const tabs: Array<{ id: string; label: string; count?: number }> = [
      { id: 'overview', label: '概览与健康' },
      { id: 'history', label: '状态历史' },
      { id: 'refs', label: '功能引用' },
      { id: 'usage', label: '使用统计' },
      { id: 'analytics', label: '深度分析' },
    ]
    if (attrTotalCount.value) {
      tabs.push({
        id: 'attrs',
        label: '属性',
        count: attrTotalCount.value,
      })
    }
    return tabs
  })

  function setDetailTab(tabId: string) {
    detailTab.value = tabId
    const query: Record<string, string> = { id: entityId.value }
    if (tabId !== 'overview') query.tab = tabId
    router.replace({ query })
  }

  function goBack() {
    if (window.history.length > 1) router.back()
    else router.push('/devices')
  }

  function openControl() {
    if (unavailable.value) {
      chrome.notify('设备离线，无法控制', 'error')
      return
    }
    chrome.openEntityControl(entityId.value)
  }

  async function copyId() {
    const ok = await copyTextToClipboard(entityId.value)
    chrome.notify(ok ? '已复制 entity_id' : '复制失败', ok ? 'success' : 'error')
  }

  async function hydrateEntity(id: string) {
    if (!id) {
      entityLoading.value = false
      entityFetchError.value = ''
      return
    }
    entityLoading.value = true
    entityFetchError.value = ''
    try {
      const result = await entitiesStore.ensureEntity(id)
      if (!result && !entitiesStore.getEntity(id) && entitiesStore.connected) {
        try {
          await fetchEntity(id)
        } catch (e) {
          entityFetchError.value = getApiErrorMessage(e, '加载设备失败')
        }
      }
    } finally {
      entityLoading.value = false
    }
  }

  watch(
    entityId,
    async (id) => {
      const tabFromQuery = String(route.query.tab || '')
      detailTab.value = VALID_DETAIL_TABS.has(tabFromQuery) ? tabFromQuery : 'overview'
      await hydrateEntity(id)
    },
    { immediate: true },
  )

  watch(
    () => route.query.tab,
    (tabFromQuery) => {
      const tab = String(tabFromQuery || '')
      if (!tab) {
        if (detailTab.value !== 'overview') detailTab.value = 'overview'
        return
      }
      if (VALID_DETAIL_TABS.has(tab) && detailTab.value !== tab) detailTab.value = tab
    },
  )

  watch(attrTotalCount, (count) => {
    if (detailTab.value === 'attrs' && !count) detailTab.value = 'overview'
  })

  return {
    // 状态
    entitiesStore,
    entityId,
    entity,
    entityLoading,
    entityFetchError,
    detailTab,
    // 派生
    entityName,
    detailStatCells,
    detailTabs,
    relatedEntities,
    relatedEntitiesExtra,
    attrEntries,
    attrTotalCount,
    controllable,
    // 动作
    setDetailTab,
    goBack,
    openControl,
    copyId,
    hydrateEntity,
  }
}
