/** 设备详情页视图模型 —— `features/device/DeviceDetailPage.vue` 的领域逻辑层。 */
import { getEntityDomain, resolveEntityArea } from '@homeos/shared'
import { computed, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchEntity } from '@/domain/api/entities'
import { getApiErrorMessage } from '@/kernel/utils/core/error-message'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { hasEntityControlPopup } from '@/domain/entity/model/utils/popup-registry.util'
import { useRouteEntityProjection } from '@/domain/entity/composables/use-route-entity-projection'
import { useEntityProjection } from '@/domain/entity/composables/use-entity-projection'
import { getEntityDisplayName } from '@/domain/entity/model/utils/derived.util'
import { copyTextToClipboard } from '@homeos/shared/utils/clipboard'
import { getDomainLabel } from '@/features/device/model/utils/domain-labels.util'
import { buildEntityAttrEntries, HVAC_ACTION_LABELS, HVAC_MODE_LABELS } from '@/domain/entity/model/utils/attr-format.util'
import { displayClimateOperatingLabel, displayEntityStateLabel } from '@/kernel/constants/entity-state-labels'

/** 合法的详情 Tab（来自 query.tab，非法值回落 overview）。 */
const VALID_DETAIL_TABS = new Set(['overview', 'history', 'refs', 'usage', 'analytics', 'attrs'])

/**
 * 中文名称排序器：`localeCompare(name, 'zh')` 每比较一对都要重新解析 locale 规则，
 * 列表排序是 O(k log k) 次比较，必须复用同一个 Collator 实例。
 */
const zhNameCollator = new Intl.Collator('zh')

/**
 * `device_id → 归属实体集合` 索引。
 *
 * 设备详情页的「相关设备」原来订阅全局 `entityStateRevision` 后**每批都全表扫一遍**
 * （`Object.keys` 全实体 + 逐条 `getEntityDisplayName` + 每对一次 zh 排序）。
 * 而归属关系只随实体增删变化（`derivedEpoch`），与状态抖动无关：索引按 epoch 懒建，
 * 之后每批只走本设备那几条。
 */
let deviceIndexEpoch = -1
let deviceIndexByDeviceId = new Map<string, Set<string>>()

function buildDeviceEntityIndex(raw: Record<string, { attributes?: Record<string, unknown> } | undefined>) {
  const nextIndex = new Map<string, Set<string>>()
  for (const key of Object.keys(raw)) {
    const deviceId = raw[key]?.attributes?.device_id
    if (typeof deviceId !== 'string' || !deviceId) continue
    let bucket = nextIndex.get(deviceId)
    if (!bucket) nextIndex.set(deviceId, (bucket = new Set()))
    bucket.add(key)
  }
  deviceIndexByDeviceId = nextIndex
  return nextIndex
}

/**
 * 桶里的 id 是否都还在实体表里。
 *
 * `derivedEpoch` 在登出 / 重置时会回到 0，若缓存恰好也停在 0，单看 epoch 会把上一账号的
 * 索引判成有效的 —— 桶只有几条到几十条，这一次校验比全表重建便宜三个数量级。
 */
function bucketIsCurrent(bucket: Set<string> | undefined, raw: Record<string, unknown>): boolean {
  if (!bucket) return false
  for (const entityId of bucket) if (!raw[entityId]) return false
  return true
}

/** 取某设备的归属实体集合（按 epoch 懒建索引，之后每批只走本设备那几条）。 */
function deviceEntityIndex(
  epoch: number,
  raw: Record<string, { attributes?: Record<string, unknown> } | undefined>,
  deviceId: string,
): Set<string> | undefined {
  if (deviceIndexEpoch !== epoch) {
    deviceIndexEpoch = epoch
    buildDeviceEntityIndex(raw)
  }
  const bucket = deviceIndexByDeviceId.get(deviceId)
  if (bucketIsCurrent(bucket, raw)) return bucket
  // 没有桶时以「本 epoch 的索引」为准（重建也不会多出来）；只有桶失效才是跨会话残留，需重建。
  return bucket ? buildDeviceEntityIndex(raw).get(deviceId) : undefined
}

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
  const unavailable = computed(() => entity.value?.state === 'unavailable' || entity.value?.state === 'unknown')
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
  const controllable = computed(() => entityId.value && hasEntityControlPopup(entityId.value))

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
    // 显式订阅：任意实体写入（状态/属性）都会递增 revision，保证名称能刷新；
    // `derivedEpoch` 兜底实体增删（索引只在增删时重建，不再每批全表扫描）。
    void entitiesStore.entityStateRevision
    void entitiesStore.derivedEpoch
    const device = deviceId.value
    if (!device) return [] as Array<{ id: string; name: string }>
    const raw = toRaw(entitiesStore.entities)
    const bucket = deviceEntityIndex(entitiesStore.derivedEpoch, raw, device)
    if (!bucket) return [] as Array<{ id: string; name: string }>
    const matches: Array<{ id: string; name: string }> = []
    for (const key of bucket) {
      if (key === entityId.value) continue
      const entity = raw[key]
      matches.push({
        id: key,
        name: getEntityDisplayName(key, entity) || key,
      })
    }
    return matches.sort((a, b) => zhNameCollator.compare(a.name, b.name))
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
