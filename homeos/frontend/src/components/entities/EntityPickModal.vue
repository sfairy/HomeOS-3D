<!--
  EntityPickModal.vue / components/entities
  实体选择弹窗：通用 HA 实体批量或单选选择器 Modal，支持按 domain 过滤、
  关键词搜索、大实体量 REST 分页搜索 + 虚拟滚动（超阈值自动启用），展示复选圈。
-->
<template>
  <Transition name="hos-modal">
    <div v-if="isOpen" ref="rootRef" class="hos-modal-root">
      <div class="hos-modal-backdrop" @click="$emit('close')" />
      <div
        ref="panelRef"
        class="hos-modal-panel hos-modal-panel--md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="epm-title"
      >
        <div class="hos-modal-head">
          <div class="hos-modal-head-left">
            <div>
              <h2 id="epm-title" class="hos-modal-title">{{ `选择常用 ${domainLabelText}` }}</h2>
              <p class="hos-modal-subtitle">{{ `已选择 ${selectedIds.length} 个设备` }}</p>
            </div>
          </div>
          <button
            type="button"
            class="hos-modal-close"
            :aria-label="'关闭'"
            @click="$emit('close')"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="hos-modal-body hos-modal-body--flush">
          <div class="hos-modal-search-wrap">
            <Search class="hos-modal-search-icon w-4 h-4" />
            <input
              v-model="query"
              type="text"
              :placeholder="'搜索实体名称或 ID...'"
              class="hos-modal-search"
            />
          </div>
          <div class="hos-modal-actions-row">
            <span>{{ `共找到 ${filteredEntities.length} 个实体` }}</span>
            <div class="flex gap-4">
              <button type="button" class="hos-modal-link" @click="selectAll">{{ '全选' }}</button>
              <button
                type="button"
                class="hos-modal-link"
                style="color: var(--hos-fg-2)"
                @click="clearAll"
              >
                {{ '清空' }}
              </button>
            </div>
          </div>
          <div
            v-if="filteredEntities.length > 0"
            ref="listEl"
            :class="['hos-modal-list', useVirtualScroll && 'hos-modal-list--virtual']"
            role="listbox"
            aria-multiselectable="true"
            :aria-label="`常用${domainLabelText}列表`"
            @scroll="useVirtualScroll ? onListScroll : undefined"
          >
            <div v-if="useVirtualScroll" :style="{ height: `${virtualPaddingTop}px` }" />
            <div
              v-for="entity in visibleEntities"
              :key="entity.entity_id"
              class="hos-modal-list-row"
              :class="{ 'hos-modal-list-row--selected': selectedSet.has(entity.entity_id) }"
              role="option"
              tabindex="0"
              :aria-selected="selectedSet.has(entity.entity_id)"
              @click="toggleEntity(entity.entity_id)"
              @keydown.enter.prevent="toggleEntity(entity.entity_id)"
              @keydown.space.prevent="toggleEntity(entity.entity_id)"
              @keydown.down.prevent="moveRowFocus($event, 1)"
              @keydown.up.prevent="moveRowFocus($event, -1)"
            >
              <div class="flex items-center gap-4 min-w-0">
                <div
                  class="epm-state-dot shrink-0"
                  :class="{
                    'epm-state-dot--on':
                      entity.state === 'on' || (domain === 'climate' && entity.state !== 'off'),
                  }"
                />
                <div class="flex-1 min-w-0">
                  <span
                    class="epm-entity-name block truncate"
                    :class="
                      selectedSet.has(entity.entity_id)
                        ? 'epm-entity-name--selected'
                        : 'epm-entity-name--default'
                    "
                    >{{ getEntityDisplayName(entity.entity_id, entity) }}</span
                  >
                  <span class="epm-entity-id font-mono block truncate">{{ entity.entity_id }}</span>
                </div>
              </div>
              <div class="shrink-0">
                <CheckCircle
                  v-if="selectedSet.has(entity.entity_id)"
                  class="w-6 h-6 epm-check-icon"
                />
                <Circle v-else class="w-6 h-6 epm-circle-icon" />
              </div>
            </div>
            <div v-if="useVirtualScroll" :style="{ height: `${virtualPaddingBottom}px` }" />
          </div>
          <div v-else class="hos-modal-empty">{{ '没有找到相关实体' }}</div>
        </div>
        <div class="hos-modal-footer">
          <button
            type="button"
            class="hos-modal-btn hos-modal-btn--primary hos-modal-btn--full"
            @click="onSave"
          >
            {{ `确认并保存选择 (${selectedIds.length})` }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { getEntityDomain } from '@homeos/shared'
import { ref, computed, watch, onUnmounted } from 'vue'
import { X, Search, CheckCircle, Circle } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useEscLayer } from '@/composables/ui/useEscStack'
import { useBackgroundInert } from '@/composables/ui/useBackgroundInert'
import { useBodyScrollLock } from '@/composables/ui/useBodyScrollLock'
import { fetchEntities } from '@/services/api/entities'
import { collectIndexedEntityIds, getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import { getLargeEntityThreshold } from '@/shared/utils/config/frontend-config'
import { isBatterySensorEntity } from '@/shared/device/utils/group-battery.util'

const props = defineProps({
  isOpen: { type: Boolean },
  domain: { default: 'light' },
  /** 多域选择，如 ['switch', 'input_boolean']；设置后优先于 domain */
  domains: { type: Array, default: null },
  domainLabel: { default: '' },
  initialIds: { type: Array, default: null },
  standalone: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'save'])

const domainLabelText = computed(() => props.domainLabel || '设备')
const effectiveDomains = computed(() => {
  if (Array.isArray(props.domains) && props.domains.length) return props.domains
  return [props.domain]
})
const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()

/** 浮层最外层节点与面板：焦点陷阱管面板，背景隔离要的是整层（含背板）。 */
const rootRef = ref(null)
const panelRef = ref(null)
/** 浮层可见性：焦点陷阱 / Esc 层级 / 背景隔离 / 滚动锁共用同一判据。 */
const isActive = computed(() => !!props.isOpen)

useFocusTrap(panelRef, isActive)
// Esc 关掉选择器：它是上面「常用设备」设置项的编辑入口，没有 Esc 就只能靠点关闭按钮。
useEscLayer(isActive, '实体选择器', () => emit('close'))
useBackgroundInert(rootRef, isActive, '实体选择器')
useBodyScrollLock(isActive, '实体选择器')

/**
 * 方向键在列表内移动焦点。
 *
 * 用事件现场的 DOM 兄弟节点找下一行、不维护「当前行索引」：虚拟滚动会随滚动
 * 增删行元素，索引状态一旦与 DOM 不同步，方向键就会跳到看不见的行上。
 *
 * @param event - 行上的 keydown 事件（`currentTarget` 即当前行）
 * @param delta - +1 下一行 / -1 上一行
 */
function moveRowFocus(event, delta) {
  const row = event.currentTarget
  const rows = [...row.parentElement.querySelectorAll('[role="option"]')]
  const next = rows[rows.indexOf(row) + delta]
  if (next instanceof HTMLElement) next.focus()
}

const query = ref('')
const selectedIds = ref([])
const listEl = ref(null)
const listScrollTop = ref(0)
const restItems = ref([])
const restLoading = ref(false)
let restSearchTimer = null
/** 与 modal-theme.css 中 .hos-modal-list-row + gap 对齐 */
const ROW_HEIGHT = 60
const ROW_GAP = 6
const ROW_STRIDE = ROW_HEIGHT + ROW_GAP
const VISIBLE_BUFFER = 6
const VIRTUAL_THRESHOLD = 80
let scrollRaf = 0

const PICK_ANY_ENTITY_DOMAINS = new Set(['offline', 'other'])

function entityMatchesDomains(entityId) {
  if (PICK_ANY_ENTITY_DOMAINS.has(props.domain) && !props.domains?.length) return true
  const domain = getEntityDomain(entityId)
  return effectiveDomains.value.includes(domain)
}

const useRestSearch = computed(() => entitiesStore.totalCount >= getLargeEntityThreshold())

async function fetchRestEntities() {
  if (!useRestSearch.value || !props.isOpen) return
  restLoading.value = true
  try {
    const searchTerm = query.value.trim()
    const domains = effectiveDomains.value
    const fetchOne = async (dom) => {
      const params = { limit: 200, page: 1 }
      if (!PICK_ANY_ENTITY_DOMAINS.has(dom)) {
        if (dom === 'sensor' || dom === 'battery') params.domain = 'sensor'
        else params.domain = dom
      }
      if (searchTerm) params.search = searchTerm
      const { data } = await fetchEntities(params, { timeout: 60_000 })
      return data?.entities || []
    }
    let items = []
    if (PICK_ANY_ENTITY_DOMAINS.has(props.domain) && !props.domains?.length) {
      items = await fetchOne(props.domain)
    } else if (domains.length === 1) {
      items = await fetchOne(domains[0])
    } else {
      const batches = await Promise.all(domains.map((domain) => fetchOne(domain)))
      const seen = new Set()
      items = []
      for (const batch of batches) {
        for (const entity of batch) {
          if (!seen.has(entity.entity_id)) {
            seen.add(entity.entity_id)
            items.push(entity)
          }
        }
      }
    }
    restItems.value = items
  } catch {
    restItems.value = []
  } finally {
    restLoading.value = false
  }
}

watch([query, () => props.isOpen, () => props.domain, () => props.domains], () => {
  if (!useRestSearch.value || !props.isOpen) return
  if (restSearchTimer) clearTimeout(restSearchTimer)
  restSearchTimer = setTimeout(() => {
    void fetchRestEntities()
  }, 250)
})

onUnmounted(() => {
  if (restSearchTimer) clearTimeout(restSearchTimer)
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
})

const selectedSet = computed(() => new Set(selectedIds.value))

function entitiesFromIndex() {
  const index = entitiesStore.domainEntityIndex
  if (!index?.size) return []
  if (PICK_ANY_ENTITY_DOMAINS.has(props.domain) && !props.domains?.length) {
    const ids = collectIndexedEntityIds(index, { domain: 'all' }) || []
    return ids.map((id) => entitiesStore.entities[id]).filter(Boolean)
  }
  const domains = effectiveDomains.value
  if (domains.length === 1 && domains[0] === 'battery') {
    const sensorIds = collectIndexedEntityIds(index, { domain: 'sensor' }) || []
    return sensorIds
      .map((id) => entitiesStore.entities[id])
      .filter((entity) => entity && isBatterySensorEntity(entity))
  }
  if (domains.length === 1 && domains[0] === 'sensor') {
    const sensorIds = collectIndexedEntityIds(index, { domain: 'sensor' }) || []
    const binaryIds = collectIndexedEntityIds(index, { domain: 'binary_sensor' }) || []
    return [...sensorIds, ...binaryIds].map((id) => entitiesStore.entities[id]).filter(Boolean)
  }
  const seen = new Set()
  const out = []
  for (const dom of domains) {
    const ids = collectIndexedEntityIds(index, { domain: dom }) || []
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id)
        const ent = entitiesStore.entities[id]
        if (ent) out.push(ent)
      }
    }
  }
  return out
}

function loadSelectedIds() {
  if (Array.isArray(props.initialIds)) {
    selectedIds.value = [...props.initialIds]
  } else if (props.domain === 'offline') {
    const favoriteEntities = layoutStore.layoutConfig.favoriteEntities || {}
    selectedIds.value = [...new Set([...(favoriteEntities.offline || []), ...(favoriteEntities.other || [])])]
  } else {
    selectedIds.value = [...(layoutStore.layoutConfig.favoriteEntities?.[props.domain] || [])]
  }
}

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      query.value = ''
      listScrollTop.value = 0
      if (listEl.value) listEl.value.scrollTop = 0
      loadSelectedIds()
      if (useRestSearch.value) void fetchRestEntities()
    }
  },
  { immediate: true },
)

const filteredEntities = computed(() => {
  let entities =
    useRestSearch.value && props.isOpen
      ? restItems.value.map((entity) => entitiesStore.entities[entity.entity_id] || entity)
      : entitiesFromIndex()
  if (!PICK_ANY_ENTITY_DOMAINS.has(props.domain) && !useRestSearch.value) {
    if (!props.domains?.length && props.domain === 'battery') {
      entities = entities.filter((entity) => isBatterySensorEntity(entity))
    } else if (!props.domains?.length && props.domain === 'sensor') {
      entities = entities.filter((entity) => {
        const domain = getEntityDomain(entity.entity_id)
        return domain === 'sensor' || domain === 'binary_sensor'
      })
    } else if (!props.domains?.length) {
      entities = entities.filter((entity) => entity.entity_id.startsWith(props.domain + '.'))
    } else {
      entities = entities.filter((entity) => entityMatchesDomains(entity.entity_id))
    }
  }
  if (query.value && !useRestSearch.value) {
    const searchTerm = query.value.toLowerCase()
    entities = entities.filter(
      (entity) =>
        entity.entity_id.toLowerCase().includes(searchTerm) ||
        getEntityDisplayName(entity.entity_id, entity).toLowerCase().includes(searchTerm),
    )
  }
  return entities.sort((a, b) => {
    const aFav = selectedIds.value.includes(a.entity_id) ? -1 : 1
    const bFav = selectedIds.value.includes(b.entity_id) ? -1 : 1
    if (aFav !== bFav) return aFav - bFav
    return getEntityDisplayName(a.entity_id, a).localeCompare(getEntityDisplayName(b.entity_id, b))
  })
})

const useVirtualScroll = computed(() => filteredEntities.value.length > VIRTUAL_THRESHOLD)

const virtualRange = computed(() => {
  const total = filteredEntities.value.length
  if (!total || !useVirtualScroll.value) return { start: 0, end: total }
  const viewport = listEl.value?.clientHeight || 420
  const visibleCount = Math.ceil(viewport / ROW_STRIDE) + VISIBLE_BUFFER * 2
  const maxScroll = Math.max(0, total * ROW_STRIDE - ROW_GAP - viewport)
  const scrollTop = listScrollTop.value

  if (scrollTop >= maxScroll - 2) {
    const end = total
    return { start: Math.max(0, end - visibleCount), end }
  }

  const start = Math.max(0, Math.floor(scrollTop / ROW_STRIDE) - VISIBLE_BUFFER)
  const end = Math.min(total, start + visibleCount)
  return { start, end }
})

const visibleEntities = computed(() => {
  const { start, end } = virtualRange.value
  return filteredEntities.value.slice(start, end)
})

const virtualPaddingTop = computed(() =>
  useVirtualScroll.value ? virtualRange.value.start * ROW_STRIDE : 0,
)
const virtualPaddingBottom = computed(() => {
  if (!useVirtualScroll.value) return 0
  const total = filteredEntities.value.length
  const remaining = total - virtualRange.value.end
  return Math.max(0, remaining * ROW_STRIDE)
})

function onListScroll(event) {
  const el = event.target
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
    listScrollTop.value = maxScroll - el.scrollTop < 2 ? maxScroll : el.scrollTop
  })
}

function toggleEntity(eid) {
  const itemIndex = selectedIds.value.indexOf(eid)
  if (itemIndex > -1) selectedIds.value.splice(itemIndex, 1)
  else selectedIds.value.push(eid)
}

function selectAll() {
  selectedIds.value = filteredEntities.value.map((entity) => entity.entity_id)
}
function clearAll() {
  selectedIds.value = []
}

async function onSave() {
  if (props.standalone) {
    emit('save', [...selectedIds.value])
    emit('close')
    return
  }
  if (!layoutStore.layoutConfig.favoriteEntities) layoutStore.layoutConfig.favoriteEntities = {}
  layoutStore.layoutConfig.favoriteEntities[props.domain] = [...selectedIds.value]
  if (props.domain === 'offline') delete layoutStore.layoutConfig.favoriteEntities.other
  const ok = await layoutStore.saveLayout(false)
  if (ok) emit('close')
}
</script>

<style scoped src="./styles/entity-modals.css"></style>
