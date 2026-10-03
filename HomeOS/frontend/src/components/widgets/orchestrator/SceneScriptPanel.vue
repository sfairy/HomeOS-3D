<!--
  SceneScriptPanel.vue / components/widgets/orchestrator
  场景执行面板：编排 Hub 下的双 tab（收藏/全部）结构，按关键词搜索 HA scene 域，
  一键 activate 场景；收藏项通过 localStorage 持久化（scene-favorites.util）。
  Props: defaultTab 默认页签 / tabSelectToken 外部切页令牌 / config 布局配置
         / hub-mode 是否在 Hub 上下文 / lock-domain 锁定 scene 域不显示页签头
  依赖：composables: useHubTabs tab 持久化；
        Pinia: useEntitiesStore 枚举 scene 实体
              + useLayoutStore 面板配置
              + useAuthStore 权限；
        utils: activate-scene.util 激活调用
               + scene-favorites.util 收藏读写；
        子组件：WidgetHubHeader + SearchableSelect 搜索框。
  注意：激活时在途态 Loader2 替换图标，成功后短暂 CheckCircle2 高亮反馈。
-->
<template>
  <div class="ssp-card widget-glass-card" :class="{ 'ssp-card--hub': hubMode }">
    <WidgetHubHeader
      v-if="!lockDomain"
      v-model="activeTab"
      title="场景脚本"
      accent="var(--premium-accent-purple)"
      :tabs="hubTabs"
      stacked
    >
      <template #icon
        ><Sparkles class="w-3.5 h-3.5" style="color: var(--premium-accent-purple)"
      /></template>
    </WidgetHubHeader>
    <div v-else class="ssp-hub-head">
      <Sparkles v-if="lockDomain === 'scene'" class="w-4 h-4 ssp-hub-head__icon" />
      <Play v-else-if="lockDomain === 'script'" class="w-4 h-4 ssp-hub-head__icon" />
      <Zap v-else class="w-4 h-4 ssp-hub-head__icon" />
      <span class="ssp-hub-head__title">{{ lockDomainTitle }}</span>
      <span v-if="filteredItems.length" class="ssp-hub-head__count">{{ filteredItems.length }}</span>
    </div>

    <div
      class="ssp-toolbar"
      v-show="entitiesStore.connected && (baseItems.length > 0 || searchQuery)"
    >
      <div class="ssp-toolbar-search">
        <SearchableSelect
          :model-value="searchQuery"
          variant="list-page"
          :options="searchOptions"
          :placeholder="searchPlaceholder"
          :empty-text="'无匹配项'"
          :clear-aria="'清除搜索'"
          :toggle-aria="'展开列表'"
          @update:model-value="onSearchQueryChange"
          @select="onSearchQueryChange"
        />
      </div>
      <span v-if="selectedIds.size > 0" class="ssp-selected-hint">
        {{ `已选 ${selectedIds.size} 项` }}
        <button class="ssp-batch-run" @click="batchExecute">{{ '批量执行' }}</button>
      </span>
      <span v-if="recentItems.length > 0 && !searchQuery" class="ssp-recent-hint">
        {{ '最近:' }}
        <button v-for="r in recentItems" :key="r" class="ssp-recent-item" @click="executeById(r)">
          {{ shortName(r) }}
        </button>
      </span>
    </div>

    <div class="ssp-body">
      <div v-if="!entitiesStore.connected" class="ssp-empty ssp-empty--amber">
        <Loader2 class="ssp-empty__icon animate-spin" />
        <p class="ssp-empty__title">{{ '等待 HA 连接…' }}</p>
        <p class="ssp-empty__desc">{{ '连接 Home Assistant 后即可查看场景与脚本' }}</p>
      </div>

      <div v-else-if="filteredItems.length === 0" class="ssp-empty">
        <Search v-if="searchQuery" class="ssp-empty__icon" />
        <Sparkles v-else class="ssp-empty__icon" />
        <p class="ssp-empty__title">
          {{ searchQuery ? '无匹配结果' : `暂无${activeTabLabel}设备` }}
        </p>
        <p v-if="!searchQuery" class="ssp-empty__desc">
          {{ `在 Home Assistant 中配置 ${activeDomain} 实体` }}
        </p>
      </div>

      <div v-else class="ssp-grid">
        <div
          v-for="item in filteredItems"
          :key="item.entity_id"
          role="button"
          tabindex="0"
          :data-ssp-item-id="item.entity_id"
          :class="[
            'ssp-item',
            getItemClass(item),
            {
              'ssp-item--selected': selectedIds.has(item.entity_id),
              'ssp-item--disabled': executing === item.entity_id,
              'ssp-item--locate': locateItemId === item.entity_id,
            },
          ]"
          @click="onItemClick(item, $event)"
          @keydown.enter.prevent="onItemClick(item, $event)"
          @contextmenu.prevent="toggleSelect(item.entity_id)"
        >
          <div class="ssp-item-left">
            <div class="ssp-item-icon">
              <component :is="getItemIcon(item)" class="w-4 h-4" />
            </div>
            <div class="ssp-item-info">
              <span class="ssp-item-name">{{ getItemName(item) }}</span>
              <span
                v-if="item.state !== 'off' && item.state !== 'unknown' && item.state !== 'idle'"
                class="ssp-item-state"
              >
                <span class="ssp-dot" :class="getStateDot(item)" />
                {{ getStateLabel(item) }}
              </span>
            </div>
          </div>
          <div class="ssp-item-right">
            <button
              class="ssp-fav-btn"
              :class="{ 'ssp-fav-btn--active': isFavorite(item.entity_id) }"
              @click.stop="toggleFavorite(item.entity_id)"
              :title="'收藏'"
            >
              ★
            </button>
            <Loader2
              v-if="executing === item.entity_id"
              class="w-3.5 h-3.5 animate-spin text-white/60"
            />
            <button
              v-if="activeTab === 'automation'"
              class="ssp-item-action-btn"
              @click.stop="onAutomationToggle(item)"
              :class="item.state === 'on' ? 'ssp-item-action-btn--on' : ''"
            >
              {{ item.state === 'on' ? '禁用' : '启用' }}
            </button>
            <button
              v-if="activeTab === 'script'"
              class="ssp-item-action-btn ssp-item-action-btn--run"
              @click.stop="executeItem(item)"
            >
              {{ '执行' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="ssp-footer" v-show="activeTab === 'scene' || activeTab === 'script'">
      <span class="ssp-footer-hint">{{ `右键选择多个 ${activeTabLabel} 可批量执行` }}</span>
    </div>
  </div>
</template>

<script setup>
import { readLocalStorageJson, writeLocalStorageJson } from '@/utils/core/local-storage.util'
/**
 * @file SceneScriptPanel.vue
 * @module widgets/orchestrator
 * @description 场景脚本面板：展示收藏场景与全部 scene.* 实体，支持搜索、收藏切换、
 *              一键激活场景；通过 useHubTabs 维护「收藏 / 全部」tab 持久化。
 * @dependencies
 *  - @homeos/shared: getEntityDomain 实体域判断
 *  - vue: ref/computed/watch/onUnmounted/nextTick 响应式与生命周期
 *  - @lucide/vue: Sparkles / Play / Zap / Loader2 / CheckCircle2 / Power / Star / Search 图标
 *  - @/stores/entities.store: 实体状态与 HA 服务调用
 *  - @/components/widgets/shared/WidgetHubHeader.vue: 通用 Hub 头部
 *  - @/components/common/base/SearchableSelect.vue: 可搜索下拉
 *  - @/composables/widget/useHubTabs: Hub tab 持久化 composable
 *  - @/services/notify: 错误通知
 *  - @/utils/orchestrator/scene-favorites.util: 场景收藏持久化
 *  - @/utils/orchestrator/activate-scene.util: 场景激活
 *  - @/stores/layout.store: 布局配置
 *  - @/stores/auth.store: 鉴权状态
 *  - @/utils/entity/derived.util: 实体友好名与域索引工具
 */
import { getEntityDomain } from '@homeos/shared'
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { Sparkles, Play, Zap, Loader2, CheckCircle2, Power, Star, Search } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import WidgetHubHeader from '@/components/widgets/shared/WidgetHubHeader.vue'
import SearchableSelect from '@/components/common/base/SearchableSelect.vue'
import { useHubTabs } from '@/composables/widget/useHubTabs'
import { notifyError } from '@/services/notify'
import { persistFavoriteSceneIds, resolveFavoriteSceneIds } from '@/utils/orchestrator/scene-favorites.util'
import { activateSceneById } from '@/utils/orchestrator/activate-scene.util'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import { domainIndexToArray, getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  defaultTab: { type: String, default: '' },
  lockDomain: { type: String, default: '' },
  hubMode: { type: Boolean, default: false },
})

const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()
const authStore = useAuthStore()
const executing = ref(null)
const searchQuery = ref('')
const locateItemId = ref(null)
const selectedIds = ref(new Set())
const recentItems = ref([])

const favorites = ref(resolveFavoriteSceneIds(layoutStore.layoutConfig.favoriteSceneIds))

let executeTimer = null
let locateTimer = null
const favEntities = computed(() => {
  void entitiesStore.derivedEpoch
  void entitiesStore.getDomainEpoch('scene')
  void entitiesStore.getDomainEpoch('script')
  void entitiesStore.getDomainEpoch('automation')
  const ents = {}
  for (const id of favorites.value) {
    const e = entitiesStore.getEntity(id)
    if (e) ents[id] = e
  }
  return ents
})

function isFavorite(eid) {
  return favorites.value.includes(eid)
}

function toggleFavorite(eid) {
  const idx = favorites.value.indexOf(eid)
  if (idx === -1) favorites.value.push(eid)
  else favorites.value.splice(idx, 1)
  persistFavoriteSceneIds(favorites.value, layoutStore.layoutConfig)
}

function loadRecents() {
  return readLocalStorageJson('homeos_scene_recents', [])
}

function saveRecents(items) {
  writeLocalStorageJson('homeos_scene_recents', items)
}

function entitiesForDomain(domain) {
  void entitiesStore.getDomainEpoch(domain)
  const ids = domainIndexToArray(entitiesStore.domainEntityIndex.get(domain))
  return ids.map((id) => entitiesStore.entities[id]).filter(Boolean)
}

const sceneEntities = computed(() => entitiesForDomain('scene'))
const scriptEntities = computed(() => entitiesForDomain('script'))
const automationEntities = computed(() => entitiesForDomain('automation'))

const tabs = computed(() => [
  { key: 'scene', label: '场景', icon: Sparkles, count: sceneEntities.value.length },
  { key: 'script', label: '脚本', icon: Play, count: scriptEntities.value.length },
  { key: 'automation', label: '自动化', icon: Zap, count: automationEntities.value.length },
  { key: 'favorites', label: '收藏', icon: Star, count: favorites.value.length },
])

const allHubTabDefs = computed(() => {
  const defs = tabs.value.map(({ key, label, count }) => ({
    key,
    label,
    badge: count > 0 ? count : undefined,
  }))
  if (props.lockDomain) {
    return defs.filter((d) => d.key === props.lockDomain)
  }
  return defs
})

const lockDomainTitle = computed(() => {
  if (props.lockDomain === 'scene') return 'HA 场景'
  if (props.lockDomain === 'script') return 'HA 脚本'
  if (props.lockDomain === 'automation') return 'HA 自动化'
  return 'Home Assistant'
})

const { hubTabs, activeTab } = useHubTabs({
  hubType: 'sceneScript',
  config: () => props.config,
  defaultTabProp: () => props.lockDomain || props.defaultTab,
  allTabs: allHubTabDefs,
})

watch(
  () => props.lockDomain,
  (domain) => {
    if (domain) activeTab.value = domain
  },
  { immediate: true },
)

const activeTabLabel = computed(
  () => tabs.value.find((t) => t.key === activeTab.value)?.label || '',
)

const searchPlaceholder = computed(() => {
  if (props.lockDomain === 'scene') return '搜索场景名称或 entity_id…'
  if (props.lockDomain === 'script') return '搜索脚本名称或 entity_id…'
  if (props.lockDomain === 'automation') return '搜索自动化名称或 entity_id…'
  return '搜索名称或 entity_id…'
})

const baseItems = computed(() => {
  let list = []
  if (activeTab.value === 'favorites') {
    list = Object.values(favEntities.value)
  } else {
    list = allByDomain(activeTab.value)
  }
  if (activeTab.value === 'favorites') {
    list.sort((a, b) => getItemName(a).localeCompare(getItemName(b), 'zh'))
  }
  return list.filter((item) => item?.entity_id)
})

const searchOptions = computed(() =>
  baseItems.value
    .map((entity) => ({
      value: entity.entity_id,
      label: getItemName(entity),
      hint: entity.entity_id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh')),
)

const filteredItems = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return baseItems.value
  return baseItems.value.filter((entity) => {
    const name = getItemName(entity).toLowerCase()
    const eid = entity.entity_id.toLowerCase()
    return name.includes(q) || eid.includes(q)
  })
})

function onSearchQueryChange(value) {
  if (!value) {
    searchQuery.value = ''
    locateItemId.value = null
    return
  }
  const option = searchOptions.value.find((opt) => opt.value === value)
  if (option) {
    searchQuery.value = option.label
    locateHaItem(option.value)
    return
  }
  searchQuery.value = value
  locateItemId.value = null
}

function locateHaItem(entityId) {
  locateItemId.value = entityId
  nextTick(() => {
    document
      .querySelector(`[data-ssp-item-id="${CSS.escape(entityId)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  if (locateTimer) clearTimeout(locateTimer)
  locateTimer = setTimeout(() => {
    if (locateItemId.value === entityId) locateItemId.value = null
    locateTimer = null
  }, 2400)
}

function allByDomain(domain) {
  return entitiesForDomain(domain)
}

watch(activeTab, () => {
  selectedIds.value = new Set()
  searchQuery.value = ''
  locateItemId.value = null
})

function getItemName(entity) {
  return getEntityDisplayName(entity.entity_id, entity)
}

function shortName(eid) {
  const ent = entitiesStore.getEntity(eid)
  return ent ? getEntityDisplayName(eid, ent) : eid
}

function getItemIcon(entity) {
  const domain = getEntityDomain(entity?.entity_id)
  if (domain === 'scene') return Sparkles
  if (domain === 'script') return Play
  if (domain === 'automation') return entity.state === 'on' ? CheckCircle2 : Power
  return Zap
}

function getStateDot(entity) {
  const s = entity.state
  if (s === 'on' || s === 'running') return 'ssp-dot--on'
  if (s === 'triggered' || s === 'arming') return 'ssp-dot--triggered'
  return 'ssp-dot--idle'
}

function getStateLabel(entity) {
  const s = entity.state
  const domain = getEntityDomain(entity.entity_id)
  if (domain === 'scene') return ''
  if (domain === 'script') {
    if (s === 'on') return '运行中'
    return ''
  }
  if (domain === 'automation') {
    if (s === 'on') return '已启用'
    if (s === 'off') return '已禁用'
    if (s === 'triggered') return '已触发'
    return s
  }
  return ''
}

function getItemClass(entity) {
  const s = entity.state
  const domain = getEntityDomain(entity.entity_id)
  if (domain === 'scene') return 'ssp-item--scene'
  if (domain === 'script') return s === 'on' ? 'ssp-item--running' : ''
  if (domain === 'automation') return s === 'on' ? 'ssp-item--enabled' : 'ssp-item--disabled'
  return ''
}

function onItemClick(item, event) {
  if (event.detail === 2) {
    toggleSelect(item.entity_id)
    return
  }
  executeItem(item)
}

function toggleSelect(eid) {
  const s = new Set(selectedIds.value)
  if (s.has(eid)) s.delete(eid)
  else s.add(eid)
  selectedIds.value = s
}

async function executeItem(entity) {
  if (executing.value) return
  const eid = entity.entity_id
  executing.value = eid
  try {
    await doExecute(eid)
    addRecent(eid)
  } catch (e) {
    notifyError(e, '场景执行')
  } finally {
    if (executeTimer) clearTimeout(executeTimer)
    executeTimer = setTimeout(() => {
      executing.value = null
      executeTimer = null
    }, 400)
  }
}

async function executeById(eid) {
  if (executing.value) return
  const ent = entitiesStore.getEntity(eid)
  if (!ent) return
  executing.value = eid
  try {
    await doExecute(eid)
  } catch (e) {
    notifyError(e, '场景执行')
  } finally {
    if (executeTimer) clearTimeout(executeTimer)
    executeTimer = setTimeout(() => {
      executing.value = null
      executeTimer = null
    }, 400)
  }
}

async function doExecute(eid) {
  const domain = getEntityDomain(eid)
  if (domain === 'scene') {
    await activateSceneById({
      id: eid,
      hasHaEntity: !!entitiesStore.getEntity(eid),
      canControl: authStore.canControl(eid),
      isGuest: authStore.isGuest(),
      allowedSceneIds: authStore.allowedSceneIds || [],
      callHaScene: (id) => entitiesStore.callService('scene', 'turn_on', id),
    })
  } else if (domain === 'script') {
    await entitiesStore.callService('script', 'turn_on', eid)
  } else if (domain === 'automation') {
    const ent = entitiesStore.getEntity(eid)
    const svc = ent?.state === 'on' ? 'turn_off' : 'turn_on'
    await entitiesStore.callService('automation', svc, eid)
  }
}

async function onAutomationToggle(entity) {
  if (executing.value) return
  executing.value = entity.entity_id
  try {
    const svc = entity.state === 'on' ? 'turn_off' : 'turn_on'
    await entitiesStore.callService('automation', svc, entity.entity_id)
  } catch (e) {
    notifyError(e, '自动化切换')
  } finally {
    if (executeTimer) clearTimeout(executeTimer)
    executeTimer = setTimeout(() => {
      executing.value = null
      executeTimer = null
    }, 400)
  }
}

async function batchExecute() {
  if (executing.value) return
  executing.value = '__batch__'
  try {
    for (const eid of selectedIds.value) {
      try {
        await doExecute(eid)
        await new Promise((r) => setTimeout(r, 300))
      } catch (e) {
        notifyError(e, '场景执行')
      }
    }
    selectedIds.value = new Set()
  } finally {
    executing.value = null
  }
}

function addRecent(eid) {
  recentItems.value = [eid, ...recentItems.value.filter((r) => r !== eid)]
  if (recentItems.value.length > 5) recentItems.value = recentItems.value.slice(0, 5)
  saveRecents(recentItems.value)
}

recentItems.value = loadRecents()

onUnmounted(() => {
  if (executeTimer) clearTimeout(executeTimer)
  if (locateTimer) clearTimeout(locateTimer)
})
</script>

<style scoped src="./styles/SceneScriptPanel.css"></style>
