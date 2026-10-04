/**
 * @file EntitySidebar.vue
 * @module components/entities
 * @brief 实体工具箱侧边栏
 *
 * 职责：
 * - 布局编辑模式下显示，提供可拖拽放置到画布的实体列表
 * - 分类标签组（控件/环境/智能/安全/其他）替代平铺 32 个 tab
 * - 实体卡片含域图标 + 彩色状态标签 + 拖拽手柄
 * - 搜索带清除按钮 + 实时计数；大量实体时切换 REST 分页拉取
 * - 排序与「仅显示在线设备」筛选
 *
 * 依赖：
 * - vue（ref/computed/watch/onUnmounted）、@homeos/shared（getEntityDomain）
 * - entities.store、layout.store
 * - entity-domain-meta（域分组/图标/颜色/标签常量）
 * - VirtualList、getEntityDisplayName/getEntityTooltip、fetchEntities API
 */
<template>
  <div class="es-root es-root--edit">
    <div class="es-header">
      <span class="es-edit-ribbon">{{ '布局编辑 · 拖拽或点击放置' }}</span>
      <div class="es-header-top">
        <h2 class="es-title">{{ '实体工具箱' }}</h2>
        <span class="es-total">{{ `${entityCount} 个实体` }}</span>
      </div>
      <div class="es-search">
        <svg
          class="es-search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="'搜索名称或 ID...'"
          class="es-search-input"
        />
        <button
          v-if="searchQuery"
          type="button"
          :aria-label="'清除搜索'"
          @click="searchQuery = ''"
          class="es-search-clear"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>

    <div class="es-filter">
      <div class="es-dropdown" ref="groupDropdownRef">
        <button
          type="button"
          class="es-dropdown-btn"
          :aria-label="groupLabel"
          :aria-expanded="groupOpen"
          @click.stop="
            () => {
              groupOpen = !groupOpen
              domainOpen = false
            }
          "
        >
          <span class="es-dropdown-label">{{ groupLabel }}</span>
          <svg
            class="es-dropdown-chev"
            :class="{ 'es-dropdown-chev--open': groupOpen }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <Teleport :to="groupTeleportTarget" :disabled="groupTeleportDisabled">
          <div
            v-if="groupOpen"
            ref="groupMenuRef"
            :class="['es-dropdown-menu', groupMenuPlacement === 'top' && 'es-dropdown-menu--top']"
            :style="groupDropdownStyle"
          >
            <div
              v-for="item in groupOptions"
              :key="item.key"
              :class="[
                'es-dropdown-item',
                activeGroup === item.key ? 'es-dropdown-item--active' : '',
              ]"
              @click.stop="selectGroup(item.key)"
            >
              <svg
                v-if="item.icon"
                class="es-dropdown-item-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                v-html="item.icon"
              ></svg>
              <span>{{ item.label }}</span>
              <span class="es-dropdown-item-count">{{ item.count }}</span>
            </div>
          </div>
        </Teleport>
      </div>
      <div class="es-dropdown es-dropdown--sub" ref="domainDropdownRef">
        <button
          type="button"
          class="es-dropdown-btn"
          :aria-label="activeDomainLabel"
          :aria-expanded="domainOpen"
          @click.stop="
            () => {
              domainOpen = !domainOpen
              groupOpen = false
            }
          "
        >
          <span class="es-dropdown-label">{{ activeDomainLabel }}</span>
          <svg
            class="es-dropdown-chev"
            :class="{ 'es-dropdown-chev--open': domainOpen }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <Teleport :to="domainTeleportTarget" :disabled="domainTeleportDisabled">
          <div
            v-if="domainOpen"
            ref="domainMenuRef"
            :class="['es-dropdown-menu', domainMenuPlacement === 'top' && 'es-dropdown-menu--top']"
            :style="domainDropdownStyle"
          >
            <div
              :class="['es-dropdown-item', activeDomain === 'all' ? 'es-dropdown-item--active' : '']"
              @click.stop="
                () => {
                  activeDomain = 'all'
                  domainOpen = false
                }
              "
            >
              <span>{{ '全部类型' }}</span>
            </div>
            <div class="es-dropdown-divider"></div>
            <div
              v-for="d in subDomains"
              :key="d.key"
              :class="['es-dropdown-item', activeDomain === d.key ? 'es-dropdown-item--active' : '']"
              @click.stop="
                () => {
                  activeDomain = d.key
                  domainOpen = false
                }
              "
            >
              <span>{{ d.label }}</span>
              <span class="es-dropdown-item-count">{{ domainCounts[d.key] || 0 }}</span>
            </div>
          </div>
        </Teleport>
      </div>
    </div>

    <div class="es-filtered-count">{{ `${filteredEntities.length} / ${listTotal} 实体` }}</div>

    <div class="es-sort-bar">
      <div class="es-sort-group">
        <button
          v-for="s in sortOptions"
          :key="s.key"
          class="es-sort-btn"
          :class="{ 'es-sort-btn--active': sortBy === s.key }"
          @click="sortBy = s.key"
        >
          {{ s.label }}
        </button>
      </div>
      <button
        type="button"
        class="es-online-btn"
        :class="{ 'es-online-btn--active': onlineOnly }"
        @click="onlineOnly = !onlineOnly"
        :title="'仅显示在线设备'"
        :aria-label="'仅显示在线设备'"
        :aria-pressed="onlineOnly"
      >
        <span
          class="es-online-dot"
          :class="onlineOnly ? 'es-dot-on' : 'es-dot-off'"
          aria-hidden="true"
        />
        <span class="es-online-label">{{ '在线' }}</span>
      </button>
    </div>

    <VirtualList
      v-if="filteredEntities.length"
      class="es-list"
      :items="filteredEntities"
      :item-height="ENTITY_SIDEBAR_ROW_HEIGHT"
      :item-gap="4"
      :item-key="(e) => e.entity_id"
    >
      <template #default="{ item: entity }">
        <div
          class="es-item"
          :class="{ 'es-item--placement': placementEntityId === entity.entity_id }"
          draggable="true"
          @dragstart="onDragStart($event, entity)"
          @click="onEntityClick(entity)"
          :title="getEntityTooltip(entity)"
        >
          <div
            class="es-item-icon"
            :style="{ '--es-icon-color': getDomainColor(entity.entity_id) }"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              v-html="getDomainIcon(entity.entity_id)"
            ></svg>
          </div>
          <div class="es-item-body">
            <span class="es-item-name">{{ getEntityDisplayName(entity.entity_id, entity) }}</span>
            <span class="es-item-id">{{ entity.entity_id }}</span>
          </div>
          <span class="es-item-state" :class="getStateClass(entity.state)">{{
            formatEntityState(entity)
          }}</span>
        </div>
      </template>
    </VirtualList>
    <div v-else-if="restLoading" class="es-list es-empty">
      <span>{{ '加载中…' }}</span>
    </div>
    <div v-else-if="useRestList && restError" class="es-list es-empty">
      <span class="es-empty-icon">⚠️</span>
      <span>{{ restErrorDetail || '实体列表加载失败' }}</span>
      <button @click="restRefresh()" class="es-empty-clear">{{ '重试' }}</button>
    </div>
    <div v-else class="es-list">
      <div v-if="!searchQuery" class="es-empty">
        <span class="es-empty-icon">📭</span>
        <span>{{ '当前域无实体' }}</span>
      </div>
      <div v-else class="es-empty">
        <span class="es-empty-icon">🔍</span>
        <span>{{ '无匹配结果' }}</span>
        <button @click="searchQuery = ''" class="es-empty-clear">{{ '清除搜索' }}</button>
      </div>
    </div>

    <div v-if="useRestList && restTotalPages > 1" class="es-pagination">
      <button type="button" class="es-page-btn" :disabled="restPage <= 1" @click="restPage--">
        {{ '上一页' }}
      </button>
      <span class="es-page-label">{{ `${restPage} / ${restTotalPages}` }}</span>
      <button
        type="button"
        class="es-page-btn"
        :disabled="restPage >= restTotalPages"
        @click="restPage++"
      >
        {{ '下一页' }}
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * 职责：实现 EntitySidebar 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { getEntityDomain } from '@homeos/shared'
import {
  ENTITY_DOMAIN_GROUP_LABELS,
  ENTITY_DOMAIN_GROUPS,
  ENTITY_DOMAIN_ICONS,
  entityDomainColor,
  entityDomainLabel,
} from '@/constants/entity-domain-meta'

import { ref, computed, watch, onUnmounted } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { resolveWidgetType } from '@/composables/widget/useWidgetPlacement'
import VirtualList from '@/components/common/base/VirtualList.vue'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { getEntityDisplayName, collectIndexedEntityIds } from '@/utils/entity/derived.util'
import { getLargeEntityThreshold, configEpoch } from '@/utils/config/frontend-config'
import { usePaginatedEntityList } from '@/composables/entity/usePaginatedEntityList'
import { useDropdownPosition } from '@/composables/ui/useDropdownPosition'
import { displayEntityStateLabel } from '@/constants/entity-state-labels'
import { formatEntityAttrValue } from '@/utils/device/attr-format.util'
import '@/assets/styles/entity-sidebar-theme.css'

/** 与 `.es-item` 锁定高度一致，虚拟滚动步长才能对齐 */
const ENTITY_SIDEBAR_ROW_HEIGHT = 54

const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()

const searchQuery = ref('')
const debouncedSearch = ref('')
const SEARCH_DEBOUNCE_MS = 250
let searchDebounceTimer = null
watch(
  searchQuery,
  (value) => {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      debouncedSearch.value = value
    }, SEARCH_DEBOUNCE_MS)
  },
  { immediate: true },
)
const activeGroup = ref('all')
const activeDomain = ref('all')
const sortBy = ref('name')
const onlineOnly = ref(false)
const groupOpen = ref(false)
const domainOpen = ref(false)
const groupDropdownRef = ref(null)
const domainDropdownRef = ref(null)
const groupMenuRef = ref(null)
const domainMenuRef = ref(null)

const {
  dropdownStyle: groupDropdownStyle,
  teleportTarget: groupTeleportTarget,
  teleportDisabled: groupTeleportDisabled,
  placement: groupMenuPlacement,
} = useDropdownPosition(groupDropdownRef, groupOpen, {
  minWidth: 120,
  maxHeight: 240,
  chromeHeight: 0,
  minListHeight: 96,
  minRowHeight: 36,
  dropdownRef: groupMenuRef,
  fitContent: true,
})
const {
  dropdownStyle: domainDropdownStyle,
  teleportTarget: domainTeleportTarget,
  teleportDisabled: domainTeleportDisabled,
  placement: domainMenuPlacement,
} = useDropdownPosition(domainDropdownRef, domainOpen, {
  minWidth: 112,
  maxHeight: 240,
  chromeHeight: 0,
  minListHeight: 96,
  minRowHeight: 36,
  dropdownRef: domainMenuRef,
  fitContent: true,
})

const domainGroups = ENTITY_DOMAIN_GROUPS

function domainLabel(key) {
  return entityDomainLabel(key)
}

const placementEntityId = computed(() => layoutStore.placementEntity?.id ?? null)

const DOMAIN_ICONS = ENTITY_DOMAIN_ICONS
const GROUP_LABELS = ENTITY_DOMAIN_GROUP_LABELS

const subDomains = computed(() => {
  const toItem = (k) => ({ key: k, label: domainLabel(k) })
  if (activeGroup.value === 'all') {
    return domainGroups.flatMap((g) => g.domains).map(toItem)
  }
  const g = domainGroups.find((d) => d.key === activeGroup.value)
  if (!g) return []
  return g.domains.map(toItem)
})

const domainCounts = computed(() => {
  const counts = {}
  for (const [d, n] of entitiesStore.domainCounts) counts[d] = n
  return counts
})

const groupCounts = computed(() => {
  const dc = domainCounts.value
  const counts = {}
  for (const g of domainGroups) {
    counts[g.key] = g.domains.reduce((sum, d) => sum + (dc[d] || 0), 0)
  }
  return counts
})

const entityCount = computed(() => entitiesStore.totalCount)

const GROUP_ICONS = {
  all: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/>',
  control:
    '<line x1="8" y1="6" x2="16" y2="6"/><line x1="12" y1="2" x2="12" y2="6"/><path d="M5 10h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"/><path d="m8 15 2 2 4-4"/>',
  env: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  smart:
    '<rect x="2" y="2" width="20" height="20" rx="5"/><path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="1"/>',
  safety: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  sense:
    '<circle cx="12" cy="12" r="2"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/>',
  other:
    '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
}

const groupOptions = computed(() => {
  const items = [{ key: 'all', label: '全部设备', icon: GROUP_ICONS.all, count: entityCount.value }]
  for (const g of domainGroups) {
    items.push({
      key: g.key,
      label: GROUP_LABELS[g.key] ?? g.key,
      icon: GROUP_ICONS[g.key] || '',
      count: groupCounts.value[g.key] || 0,
    })
  }
  return items
})

const groupLabel = computed(() => {
  if (activeGroup.value === 'all') return `全部设备 · ${entityCount.value}`
  const g = groupOptions.value.find((o) => o.key === activeGroup.value)
  return g ? `${g.label} · ${g.count}` : activeGroup.value
})

const sortOptions = computed(() => [
  { key: 'name', label: '名称' },
  { key: 'state', label: '状态' },
  { key: 'domain', label: '类型' },
])

const activeDomainLabel = computed(() => {
  if (activeDomain.value === 'all') return '全部类型'
  return domainLabel(activeDomain.value)
})

const useRestList = computed(() => {
  configEpoch.value
  return entitiesStore.totalCount > getLargeEntityThreshold()
})

const {
  items: restItems,
  total: restTotal,
  page: restPage,
  totalPages: restTotalPages,
  loading: restLoading,
  error: restError,
  errorDetail: restErrorDetail,
  refresh: restRefresh,
} = usePaginatedEntityList({ domain: activeDomain, search: debouncedSearch })

const listTotal = computed(() => (useRestList.value ? restTotal.value : entityCount.value))

function sortEntityList(result) {
  if (sortBy.value === 'name') {
    result.sort((a, b) => {
      const na = getEntityDisplayName(a.entity_id, a).toLowerCase()
      const nb = getEntityDisplayName(b.entity_id, b).toLowerCase()
      return na.localeCompare(nb)
    })
  } else if (sortBy.value === 'state') {
    result.sort((a, b) => (a.state || '').localeCompare(b.state || ''))
  } else if (sortBy.value === 'domain') {
    result.sort((a, b) => getEntityDomain(a.entity_id).localeCompare(getEntityDomain(b.entity_id)))
  }
  return result
}

const filteredEntities = computed(() => {
  void entitiesStore.derivedEpoch
  const q = debouncedSearch.value.toLowerCase().trim()
  const domain = activeDomain.value
  const group = activeGroup.value
  const groupDomainSet =
    group === 'all' ? null : new Set(domainGroups.find((g) => g.key === group)?.domains || [])

  if (useRestList.value) {
    let list = restItems.value || []
    if (groupDomainSet && domain === 'all') {
      list = list.filter((entity) => {
        const dot = entity.entity_id.indexOf('.')
        const ed = dot > 0 ? entity.entity_id.slice(0, dot) : entity.entity_id
        return groupDomainSet.has(ed)
      })
    }
    if (onlineOnly.value) {
      list = list.filter((entity) => entity.state !== 'unavailable')
    }
    return sortEntityList([...list])
  }

  const all = entitiesStore.entities
  const indexedIds = collectIndexedEntityIds(entitiesStore.domainEntityIndex, {
    domain,
    groupDomainSet,
  })
  const iterateIds = indexedIds ?? Object.keys(all)
  const domainPrefix = domain !== 'all' ? `${domain}.` : ''
  const result = []

  for (const id of iterateIds) {
    const entity = all[id]
    if (!entity) continue
    if (onlineOnly.value && entity.state === 'unavailable') continue
    if (!indexedIds && domainPrefix && !id.startsWith(domainPrefix)) continue
    if (!indexedIds && groupDomainSet) {
      const dot = id.indexOf('.')
      const ed = dot > 0 ? id.slice(0, dot) : id
      if (!groupDomainSet.has(ed)) continue
    }
    if (q) {
      const name = getEntityDisplayName(id, entity)
      if (!id.toLowerCase().includes(q) && !name.toLowerCase().includes(q)) continue
    }
    result.push(entity)
  }

  return sortEntityList(result)
})

function selectGroup(key) {
  activeGroup.value = key
  groupOpen.value = false
  activeDomain.value = 'all'
}

function formatEntityState(entity) {
  return displayEntityStateLabel(entity.entity_id, entity.state)
}

function getEntityTooltip(entity) {
  const attr = entity.attributes || {}
  const parts = [`${'ID'}: ${entity.entity_id}`, `${'状态'}: ${formatEntityState(entity)}`]
  if (attr.friendly_name) parts.push(`${'名称'}: ${attr.friendly_name}`)
  if (attr.unit_of_measurement) parts.push(`${'单位'}: ${attr.unit_of_measurement}`)
  if (attr.device_class) {
    parts.push(`${'类别'}: ${formatEntityAttrValue('device_class', attr.device_class).value}`)
  }
  const bat = attr.battery_level ?? attr.battery
  if (bat !== undefined && bat !== null) {
    parts.push(
      typeof bat === 'number'
        ? `电量: ${formatEntityAttrValue('battery_level', bat).value}`
        : `电量: ${bat}`,
    )
  }
  return parts.join('\n')
}

function onDragStart(event, entity) {
  const eid = entity.entity_id
  const type = resolveWidgetType(eid, entitiesStore.entities)
  event.dataTransfer?.setData('application/json', JSON.stringify({ id: eid, type }))
}

function onEntityClick(entity) {
  const eid = entity.entity_id
  void entitiesStore.ensureEntity(eid)
  const type = resolveWidgetType(eid, entitiesStore.entities)
  layoutStore.togglePlacementEntity({ id: eid, type })
}

function getDomainColor(eid) {
  return entityDomainColor(getEntityDomain(eid))
}

function getDomainIcon(eid) {
  return (
    DOMAIN_ICONS[getEntityDomain(eid)] ||
    '<circle cx="12" cy="12" r="8"/><path d="M12 2v4m0 12v4m-7-9h4m10 0h4"/>'
  )
}

function getStateClass(state) {
  if (!state) return ''
  if (
    state === 'on' ||
    state === 'open' ||
    state === 'unlocked' ||
    state === 'playing' ||
    state === 'streaming' ||
    state === 'cleaning' ||
    state === 'heating' ||
    state === 'cooling'
  )
    return 'es-state--on'
  if (
    state === 'off' ||
    state === 'closed' ||
    state === 'locked' ||
    state === 'docked' ||
    state === 'idle'
  )
    return 'es-state--off'
  if (state === 'unavailable') return 'es-state--err'
  if (
    state === 'paused' ||
    state === 'opening' ||
    state === 'closing' ||
    state === 'locking' ||
    state === 'unlocking'
  )
    return 'es-state--mid'
  return ''
}

useClickOutside(
  () => [groupDropdownRef.value, groupMenuRef.value].filter((el) => !!el),
  () => {
    groupOpen.value = false
  },
)
useClickOutside(
  () => [domainDropdownRef.value, domainMenuRef.value].filter((el) => !!el),
  () => {
    domainOpen.value = false
  },
)

onUnmounted(() => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
})
</script>

<style scoped>
.es-dot-on {
  background-color: var(--set-success, #4ade80);
}
.es-dot-off {
  background-color: var(--set-text-tertiary, rgba(255, 255, 255, 0.3));
}
</style>
