<!--
  组件文件：DeviceDetailView.vue
  所属模块：frontend/src/views
  组件职责：单实体详情页。顶部 ListPageHero 展示设备友好名与 entity_id，返回按钮 + 事件历史跳转 +
    域/状态/房间/控制四项 Metrics；主体用 list-page__tabs 展示 7 个子面板 Tab：
    概览 DeviceOverviewPanel、状态历史 DeviceStateHistoryPanel、
    关联引用 DeviceEntityReferencesPanel、用量 DeviceUsageStats、分析 DeviceAnalyticsPanel、
    属性 DeviceAttrsPanel；空态分为「未指定 id」「HA 未连接」「实体不存在」三档 VEmptyState 兜底。
  依赖关系：@homeos/shared 的 getEntityDomain/resolveEntityArea；vue-router（query.id/back 路由）；
    @lucide/vue ChevronLeft/Cpu；Pinia：useEntitiesStore（实体缓存与 connect 状态）、useChromeStore；
    composables：useRouteEntityProjection、useEntityProjection（实体扩展字段）；
    services：fetchEntity + getApiErrorMessage；七个 devices 子面板组件；
    utils：device/domain-labels、derived.util、entity-state-labels、attr-format、clipboard。
  注意事项：Tab 切换不触发额外请求（按需 visible 控制子面板自更新）；--page-accent 为 devices sky 主题；
    当 HA 未连接但实体缺失时给出「等待连接」文案而非直接报错。
-->
<template>
  <div class="list-page device-detail-view" :style="pageAccentStyle">
    <ListPageHero v-if="entityId" :title="entityName" :hint="entityId" tone="sky">
      <template #icon>
        <Cpu class="w-5 h-5" />
      </template>
      <template #aside>
        <div class="device-detail-view__hero-aside">
          <button type="button" class="device-detail-view__back-btn" @click="goBack">
            <ChevronLeft class="device-detail-view__back-icon" aria-hidden="true" />
            <span>{{ '返回' }}</span>
          </button>
          <router-link
            :to="{ path: '/events', query: { entity_id: entityId } }"
            class="list-page__link-btn"
          >
            {{ '事件历史' }}
          </router-link>
        </div>
      </template>
      <template v-if="entity && !entityLoading" #stats>
        <ListPageMetrics :cells="detailStatCells" />
      </template>
    </ListPageHero>

    <VEmptyState
      v-if="!entityId"
      tone="sky"
      :title="'未指定设备'"
      :description="'请从设备列表进入，或访问 /device?id=light.xxx'"
    />

    <section v-else class="list-page__panel device-detail-view__panel">
      <ApiQueryState
        :loading="entityLoading"
        :error="entityFetchError"
        tone="sky"
        error-title="设备加载失败"
        @retry="hydrateEntity(entityId)"
      >
        <template v-if="entity">
          <div class="device-detail-view__panel-toolbar list-page__panel-toolbar">
            <div
              class="list-page__tabs device-detail-view__tabs"
              role="tablist"
              :aria-label="'设备详情视图'"
            >
              <button
                v-for="tab in detailTabs"
                :key="tab.id"
                type="button"
                role="tab"
                :aria-selected="detailTab === tab.id"
                :class="['list-page__tab', detailTab === tab.id && 'list-page__tab--on']"
                @click="setDetailTab(tab.id)"
              >
                {{ tab.label }}
                <span v-if="tab.count != null" class="list-page__tab-count">{{ tab.count }}</span>
              </button>
            </div>
          </div>

          <div class="list-page__panel-body device-detail-view__panel-body">
            <div v-show="detailTab === 'overview'" class="device-detail-view__tab-stack">
              <DeviceOverviewPanel
                :entity-id="entityId"
                :visible="detailTab === 'overview'"
                :controllable="!!controllable"
                :related-entities="relatedEntities"
                :related-entities-extra="relatedEntitiesExtra"
                :has-attrs="attrEntries.length > 0"
                @navigate="setDetailTab"
                @control="openControl"
                @copy-id="copyId"
              />
            </div>

            <div v-show="detailTab === 'history'" class="device-detail-view__tab-stack">
              <DeviceStateHistoryPanel :entity-id="entityId" :visible="detailTab === 'history'" />
            </div>

            <div v-show="detailTab === 'refs'" class="device-detail-view__tab-stack">
              <DeviceEntityReferencesPanel :entity-id="entityId" :visible="detailTab === 'refs'" />
            </div>

            <div v-show="detailTab === 'usage'" class="device-detail-view__tab-stack">
              <DeviceUsageStats :entity-id="entityId" :visible="detailTab === 'usage'" />
            </div>

            <div v-show="detailTab === 'analytics'" class="device-detail-view__tab-stack">
              <DeviceAnalyticsPanel :entity-id="entityId" :visible="detailTab === 'analytics'" />
            </div>

            <div
              v-show="detailTab === 'attrs' && attrTotalCount > 0"
              class="device-detail-view__tab-stack"
            >
              <DeviceAttrsPanel :entries="attrEntries" :total-count="attrTotalCount" />
            </div>
          </div>
        </template>
      </ApiQueryState>

      <VEmptyState
        v-if="!entityLoading && !entityFetchError && !entity && !entitiesStore.connected"
        tone="amber"
        :title="'等待连接'"
        :description="'Home Assistant 未连接，无法加载设备状态'"
      />
      <VEmptyState
        v-else-if="!entityLoading && !entityFetchError && !entity"
        tone="rose"
        :title="'设备不存在'"
        :description="'实体 {id} 未在 state-store 中找到'.replace('{id}', entityId)"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { getEntityDomain, resolveEntityArea } from '@homeos/shared'
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronLeft, Cpu } from '@lucide/vue'
import ListPageHero from '@/components/common/list-page/ListPageHero.vue'
import ListPageMetrics from '@/components/common/list-page/ListPageMetrics.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { fetchEntity } from '@/services/api/entities'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { hasEntityControlPopup } from '@/utils/entity/popup-registry'
import { useRouteEntityProjection } from '@/composables/entity/useRouteEntityProjection'
import { useEntityProjection } from '@/composables/entity/useEntityProjection'
import { getEntityDisplayName, collectIndexedEntityIds } from '@/utils/entity/derived.util'
import { copyTextToClipboard } from '@/utils/core/clipboard.util'
import DeviceOverviewPanel from '@/components/devices/DeviceOverviewPanel.vue'
import DeviceStateHistoryPanel from '@/components/devices/DeviceStateHistoryPanel.vue'
import DeviceEntityReferencesPanel from '@/components/devices/DeviceEntityReferencesPanel.vue'
import DeviceUsageStats from '@/components/devices/DeviceUsageStats.vue'
import DeviceAnalyticsPanel from '@/components/devices/DeviceAnalyticsPanel.vue'
import DeviceAttrsPanel from '@/components/devices/DeviceAttrsPanel.vue'
import { getDomainLabel } from '@/utils/device/domain-labels.util'
import {
  buildEntityAttrEntries,
  HVAC_ACTION_LABELS,
  HVAC_MODE_LABELS,
} from '@/utils/device/attr-format.util'
import {
  displayClimateOperatingLabel,
  displayEntityStateLabel,
} from '@/constants/entity-state-labels'

const VALID_DETAIL_TABS = new Set([
  'overview',
  'history',
  'refs',
  'usage',
  'analytics',
  'attrs',
])

const route = useRoute()
const router = useRouter()
const entitiesStore = useEntitiesStore()
const chrome = useChromeStore()

const entityLoading = ref(false)
const entityFetchError = ref('')
const detailTab = ref('overview')

/**
 * 页面主色注入（Task 4：DeviceDetail 同步 Devices 的 sky 主题）
 * 通过 :style 在根元素注入 --page-accent / --page-accent-rgb，
 * 配合 list-page-views.css 与 devices-theme.css 中已有的 var(--page-accent) 引用，
 * 并在 scoped CSS 中派生 --page-accent-bg/border/glow/text 与 --set-* 语义色。
 */
const pageAccentStyle = {
  '--page-accent': 'var(--module-accent-devices)',
  '--page-accent-rgb': 'var(--module-accent-devices-rgb)',
  '--page-accent-secondary': 'var(--module-accent-devices-sub)',
  '--page-accent-secondary-rgb': 'var(--module-accent-devices-sub-rgb)',
} as Record<string, string>

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

const SKIP_ATTRS = new Set([
  'friendly_name',
  'entity_picture',
  'icon',
  'access_token',
  'area_id',
  'area_name',
  'device_id',
])

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
</script>

<style>
/* 与 DevicesView 共用：卡片/指标栅格/概览布局。两页是独立懒加载路由，
   只挂在列表页时，直达 /device 或刷新详情会出现「HTML 在、样式不在」。 */
@import '@/views/styles/devices-theme.css';
</style>
<style scoped src="./styles/DeviceDetailView.css"></style>
