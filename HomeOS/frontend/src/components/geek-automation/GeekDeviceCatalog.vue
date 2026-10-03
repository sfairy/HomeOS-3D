<!--
  GeekDeviceCatalog.vue
  职责：geek-automation 编辑器内通用的「设备目录」选择面板。
       统一承载 房间 → 设备 → 能力/事件/属性 三层选择，支持搜索、房间/类型筛选、分页加载。
  所属模块：geek-automation。
  关键依赖：
    - useEntitiesStore + useAreaOptions：实体索引与房间下拉数据。
    - device-catalog.util：构建/筛选/分组设备目录条目。
    - capabilities.util / capability-model.util：能力清单与分组。
    - derived.util：从 domain 实体索引收集相关 entityId。
  Props：
    - modelValue：当前选中的 entityId。
    - mode：trigger / condition / action，决定右侧面板展示能力/事件/属性。
    - capabilityId：当前选中的能力 id（用于高亮）。
    - attribute：当前选中的属性（空=状态）。
    - domainFilter：限定可选 domain 白名单（如 ['scene']）。
    - entityOnly：仅选实体（场景/脚本等），隐藏能力/事件/属性面板。
  Emits：
    - update:modelValue：选中实体变更。
    - pick-capability：选中能力（mode=action 时）。
    - pick-attribute：选中属性（mode=trigger/condition 时）。
    - pick-event：选中事件预设（mode=trigger/condition 时）。
  关键交互：
    - 同一物理设备的多个实体（如多灯）合并为 group，可在 variants 中切换具体实体。
    - mode=action 显示能力 chip；mode=trigger/condition 显示事件/属性双 tab。
    - 列表超长时分页加载，搜索/筛选切换时重置分页。
-->
<template>
  <div class="gdc">
    <div class="gdc-toolbar">
      <input
        v-model="query"
        class="gdc-search"
        type="search"
        :placeholder="'搜索设备名 / 房间 / ID'"
      />
      <button
        v-if="modelValue"
        type="button"
        class="gdc-clear"
        @click="clearPick"
      >
        {{ '清除' }}
      </button>
    </div>

    <div v-if="areaOptions.length || domainOptions.length" class="gdc-filters">
      <HosSelect
        v-if="areaOptions.length"
        v-model="areaId"
        :options="areaOptions"
        :placeholder="'全部房间'"
        variant="orchestrator"
        size="sm"
        block
        :aria-label="'房间'"
        search-placeholder="搜索房间"
      />
      <HosSelect
        v-if="domainOptions.length"
        v-model="domain"
        :options="domainOptions"
        :placeholder="'全部类型'"
        variant="orchestrator"
        size="sm"
        block
        :aria-label="'类型'"
        search-placeholder="搜索类型"
      />
    </div>

    <p v-if="selectedLabel" class="gdc-picked">
      {{ '已选' }} · <strong>{{ selectedLabel }}</strong>
    </p>

    <div class="gdc-list" role="list">
      <p v-if="!groups.length" class="gdc-empty">{{ '没有匹配的设备' }}</p>
      <button
        v-for="g in visibleGroups"
        :key="g.key"
        type="button"
        role="listitem"
        :class="['gdc-row', isGroupSelected(g) && 'is-on']"
        @click="pickGroup(g)"
      >
        <span class="gdc-row__icon">{{ domainGlyph(g.domain) }}</span>
        <span class="gdc-row__body">
          <strong>{{ g.title }}</strong>
          <em>{{ g.areaName }} · {{ g.domainLabel }}</em>
          <em v-if="g.entities.length > 1" class="gdc-row__multi">
            {{ `${g.entities.length} 个相关实体` }}
          </em>
        </span>
        <span class="gdc-row__state">{{ stateOf(g.primaryEntityId) }}</span>
      </button>
      <button
        v-if="groups.length > listLimit"
        type="button"
        class="gdc-more"
        @click="listLimit += 40"
      >
        {{ `再显示 ${Math.min(40, groups.length - listLimit)} 项…` }}
      </button>
    </div>

    <div v-if="showEntityVariants && activeGroup" class="gdc-variants">
      <p class="gdc-variants__title">{{ '选择实体' }}</p>
      <button
        v-for="e in activeGroup.entities"
        :key="e.entityId"
        type="button"
        :class="['gdc-variant', modelValue === e.entityId && 'is-on']"
        @click="pickEntity(e.entityId)"
      >
        <strong>{{ e.name }}</strong>
        <span>{{ e.domainLabel }} · {{ e.entityId }}</span>
      </button>
    </div>

    <div v-if="!entityOnly && mode === 'action' && modelValue" class="gdc-caps">
      <p class="gdc-caps__title">{{ '能力（方法）' }}</p>
      <div v-for="g in capGroups" :key="g.group" class="gdc-caps__group">
        <em>{{ g.group }}</em>
        <div class="gdc-caps__grid">
          <button
            v-for="c in g.items"
            :key="c.id"
            type="button"
            :class="['gdc-cap', capabilityId === c.id && 'is-on']"
            :title="c.intent || c.label"
            @click="pickCap(c)"
          >
            {{ c.intent || c.label }}
          </button>
        </div>
      </div>
      <p v-if="!caps.length" class="gdc-empty">{{ '该设备暂无已知能力' }}</p>
    </div>

    <div
      v-if="!entityOnly && (mode === 'trigger' || mode === 'condition') && modelValue"
      class="gdc-facet"
    >
      <div class="gdc-facet__tabs">
        <button
          type="button"
          :class="['gdc-facet__tab', facetTab === 'event' && 'is-on']"
          @click="facetTab = 'event'"
        >
          {{ '事件' }}
        </button>
        <button
          type="button"
          :class="['gdc-facet__tab', facetTab === 'attr' && 'is-on']"
          @click="facetTab = 'attr'"
        >
          {{ '属性' }}
        </button>
      </div>
      <div v-if="facetTab === 'event'" class="gdc-caps__grid">
        <button
          v-for="ev in eventPresets"
          :key="ev.id"
          type="button"
          class="gdc-cap"
          @click="pickEvent(ev)"
        >
          {{ ev.label }}
        </button>
      </div>
      <div v-else class="gdc-caps__grid">
        <button
          type="button"
          :class="['gdc-cap', !attribute && 'is-on']"
          @click="pickAttribute('')"
        >
          {{ '状态（state）' }}
        </button>
        <button
          v-for="a in attributeKeys"
          :key="a"
          type="button"
          :class="['gdc-cap', attribute === a && 'is-on']"
          @click="pickAttribute(a)"
        >
          {{ a }}
        </button>
        <p v-if="!attributeKeys.length" class="gdc-empty">{{ '暂无可用属性' }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAreaOptions } from '@/composables/entity/useAreaOptions'
import HosSelect from '@/components/common/base/HosSelect.vue'
import {
  buildGeekCatalogEntries,
  domainsForCatalogMode,
  filterGeekCatalogEntries,
  groupGeekCatalogByDevice,
  uniqueCatalogAreas,
  uniqueCatalogDomains,
} from '@/utils/geek-automation/device-catalog.util'
import {
  capabilitiesForEntity,
  popularCapabilities,
} from '@/utils/geek-automation/capabilities.util'
import { groupCapabilities } from '@/utils/geek-automation/capability-model.util'
import { collectIndexedEntityIds } from '@/utils/entity/derived.util'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** trigger | condition | action */
  mode: { type: String, default: 'action' },
  capabilityId: { type: String, default: '' },
  /** 当前选中的属性（空=状态） */
  attribute: { type: String, default: '' },
  domainFilter: { type: Array, default: null },
  /** 仅选实体（场景等）：隐藏能力/事件面板 */
  entityOnly: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'pick-capability', 'pick-attribute', 'pick-event'])

const entitiesStore = useEntitiesStore()
const { filterRoomOptions } = useAreaOptions()

const query = ref('')
const areaId = ref('')
const domain = ref('')
const listLimit = ref(48)
const activeGroupKey = ref('')
const facetTab = ref('event')

// 当前模式（trigger/condition/action），无效值统一回退到 action
const catalogMode = computed(() => {
  if (props.mode === 'trigger' || props.mode === 'condition' || props.mode === 'action') {
    return props.mode
  }
  return 'action'
})

// 可选 domain 池：优先使用 domainFilter，否则按 mode 从工具取默认清单
const domainPool = computed(() => {
  if (Array.isArray(props.domainFilter) && props.domainFilter.length) {
    return props.domainFilter.map(String)
  }
  return domainsForCatalogMode(catalogMode.value)
})

// 全部目录条目：从实体索引收集 id 后构建标准化条目（回退到全实体构建）
const allEntries = computed(() => {
  const ids =
    collectIndexedEntityIds(entitiesStore.domainEntityIndex, {
      groupDomainSet: new Set(domainPool.value),
    }) || []
  const rows = []
  for (const id of ids) {
    const ent = entitiesStore.getEntity?.(id) || entitiesStore.entities?.[id]
    if (ent) rows.push(ent)
    else rows.push({ entity_id: id, state: '', attributes: {} })
  }
  if (!rows.length && entitiesStore.entities) {
    return buildGeekCatalogEntries(entitiesStore.entities, { domains: domainPool.value })
  }
  return buildGeekCatalogEntries(rows, { domains: domainPool.value })
})

// 经过 搜索/房间/类型 筛选后的条目列表
const filtered = computed(() =>
  filterGeekCatalogEntries(allEntries.value, {
    areaId: areaId.value,
    domain: domain.value,
    query: query.value,
  }),
)

// 按物理设备分组后的列表（同一设备的多实体合并）
const groups = computed(() => groupGeekCatalogByDevice(filtered.value))

// 当前可见分组（分页截断）
const visibleGroups = computed(() => groups.value.slice(0, listLimit.value))

// 房间下拉选项：优先取自当前条目，否则取 areaOptions
const areaOptions = computed(() => {
  const fromEntries = uniqueCatalogAreas(allEntries.value)
  const rooms = fromEntries.length
    ? fromEntries
    : (filterRoomOptions.value || [])
        .filter((r) => r.id)
        .map((r) => ({ id: String(r.id), name: String(r.name) }))
  if (!rooms.length) return []
  return [
    { value: '', label: '全部房间' },
    ...rooms.map((a) => ({ value: String(a.id), label: String(a.name) })),
  ]
})

// 类型下拉选项：从当前条目去重得到 domain 列表
const domainOptions = computed(() => {
  const domains = uniqueCatalogDomains(allEntries.value)
  if (!domains.length) return []
  return [
    { value: '', label: '全部类型' },
    ...domains.map((d) => ({ value: String(d.id), label: String(d.label) })),
  ]
})

// 当前选中实体的展示文案（名称 + 房间）
const selectedLabel = computed(() => {
  const id = props.modelValue
  if (!id) return ''
  const hit = allEntries.value.find((e) => e.entityId === id)
  return hit ? `${hit.name}（${hit.areaName}）` : id
})

// 当前展开的设备分组（用于多实体切换）
const activeGroup = computed(() => groups.value.find((g) => g.key === activeGroupKey.value) || null)

// 是否需要展示「实体切换」面板（多实体设备才显示）
const showEntityVariants = computed(
  () => !!activeGroup.value && activeGroup.value.entities.length > 1,
)

// 当前实体的能力清单：优先 entity 级别，回退到 domain 通用能力
const caps = computed(() => {
  if (catalogMode.value !== 'action' || !props.modelValue) return []
  const ent =
    entitiesStore.getEntity?.(props.modelValue) || entitiesStore.entities?.[props.modelValue]
  const list = capabilitiesForEntity(props.modelValue, ent?.attributes || null)
  return list.length
    ? list
    : popularCapabilities().filter((c) => props.modelValue?.startsWith(`${c.domain}.`))
})

// 能力分组（按 group 字段归类展示）
const capGroups = computed(() => groupCapabilities(caps.value))

// 当前实体的可观察属性 keys（排除 friendly_name 等元数据字段，最多 40 项）
const attributeKeys = computed(() => {
  if (!props.modelValue) return []
  const ent =
    entitiesStore.getEntity?.(props.modelValue) || entitiesStore.entities?.[props.modelValue]
  const attrs = ent?.attributes || {}
  const skip = new Set([
    'friendly_name',
    'icon',
    'supported_features',
    'supported_color_modes',
    'attribution',
    'device_class',
    'unit_of_measurement',
    'state_class',
  ])
  return Object.keys(attrs)
    .filter((k) => !skip.has(k) && !k.startsWith('_'))
    .sort()
    .slice(0, 40)
})

// 事件预设：根据当前实体 domain 推导常见事件（如灯/开关/遮盖等）
const eventPresets = computed(() => {
  const domain = getEntityDomain(String(props.modelValue || ''))
  if (domain === 'binary_sensor' || domain === 'switch' || domain === 'light' || domain === 'input_boolean') {
    return [
      { id: 'to_on', label: '变为打开', stateTo: 'on' },
      { id: 'to_off', label: '变为关闭', stateTo: 'off' },
      { id: 'any', label: '任意变化', stateTo: 'any' },
    ]
  }
  if (domain === 'cover') {
    return [
      { id: 'open', label: '变为打开', stateTo: 'open' },
      { id: 'closed', label: '变为关闭', stateTo: 'closed' },
      { id: 'any', label: '任意变化', stateTo: 'any' },
    ]
  }
  return [
    { id: 'any', label: '任意变化', stateTo: 'any' },
    { id: 'to_on', label: '变为 on', stateTo: 'on' },
    { id: 'to_off', label: '变为 off', stateTo: 'off' },
  ]
})

// 选中实体变更时，同步定位到所在设备分组（便于展开 variants）
watch(
  () => props.modelValue,
  (id) => {
    if (!id) {
      activeGroupKey.value = ''
      return
    }
    const g = groups.value.find(
      (x) => x.primaryEntityId === id || x.entities.some((e) => e.entityId === id),
    )
    if (g) activeGroupKey.value = g.key
  },
  { immediate: true },
)

// 搜索/筛选切换时重置分页上限
watch([query, areaId, domain], () => {
  listLimit.value = 48
})

function isGroupSelected(g) {
  return g.entities.some((e) => e.entityId === props.modelValue)
}

// 点击设备分组：单实体直接选中；多实体仅展开 variants 不切换实体
function pickGroup(g) {
  activeGroupKey.value = g.key
  if (g.entities.length === 1) {
    pickEntity(g.primaryEntityId)
  } else if (!isGroupSelected(g)) {
    pickEntity(g.primaryEntityId)
  }
}

function pickEntity(entityId) {
  emit('update:modelValue', entityId)
}

// 清除选择：同时清空分组、实体与能力
function clearPick() {
  activeGroupKey.value = ''
  emit('update:modelValue', '')
  emit('pick-capability', null)
}

function pickCap(c) {
  emit('pick-capability', c)
}

function pickAttribute(attr) {
  emit('pick-attribute', attr || '')
  facetTab.value = 'attr'
}

function pickEvent(ev) {
  emit('pick-event', ev)
  facetTab.value = 'event'
}

// 取实体的当前 state 字符串，用于列表展示
function stateOf(entityId) {
  const ent = entitiesStore.getEntity?.(entityId) || entitiesStore.entities?.[entityId]
  return String(ent?.state ?? '')
}

// 按 domain 取一个对应 emoji 图标，便于列表视觉区分
function domainGlyph(domain) {
  const map = {
    light: '💡',
    switch: '⏻',
    cover: '▦',
    climate: '❄',
    fan: '❋',
    lock: '🔒',
    sensor: '◈',
    binary_sensor: '◇',
    media_player: '▶',
    scene: '★',
    script: '▷',
    person: '☺',
    vacuum: '◎',
  }
  return map[domain] || '•'
}
</script>

<style scoped>
.gdc {
  display: grid;
  gap: var(--geek-gap-md, 12px);
}
.gdc-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.gdc-search {
  flex: 1;
  min-width: 0;
  min-height: 38px;
  padding: 8px 12px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: rgba(2, 6, 23, 0.42);
  color: inherit;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.gdc-search:focus {
  outline: none;
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.14);
}
.gdc-clear {
  flex: 0 0 auto;
  min-height: 38px;
  padding: 8px 12px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(226, 232, 240, 0.78);
  cursor: pointer;
  font-size: var(--premium-fs-micro);
  font-weight: 600;
}
.gdc-clear:hover {
  border-color: rgba(148, 163, 184, 0.42);
  background: rgba(255, 255, 255, 0.06);
}
.gdc-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}
.gdc-picked {
  margin: 0;
  padding: 8px 11px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(56, 189, 248, 0.24);
  background: rgba(14, 165, 233, 0.1);
  font-size: var(--premium-fs-micro);
  color: rgba(186, 230, 253, 0.9);
}
.gdc-picked strong {
  color: #e0f2fe;
  font-weight: 700;
}
.gdc-list {
  display: grid;
  gap: 6px;
  max-height: 240px;
  overflow: auto;
  padding: 2px;
  margin: 0 -2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
}
.gdc-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  text-align: left;
  padding: 10px 11px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(2, 6, 23, 0.28);
  color: inherit;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}
.gdc-row:hover {
  border-color: rgba(148, 163, 184, 0.34);
  background: rgba(15, 23, 42, 0.55);
}
.gdc-row.is-on {
  border-color: rgba(56, 189, 248, 0.7);
  background: rgba(14, 165, 233, 0.16);
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.12);
}
.gdc-row__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--hos-radius-card);
  background: rgba(148, 163, 184, 0.12);
  font-style: normal;
}
.gdc-row.is-on .gdc-row__icon {
  background: rgba(56, 189, 248, 0.18);
}
.gdc-row__body {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.gdc-row__body strong {
  font-size: var(--premium-fs-caption);
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gdc-row__body em {
  font-style: normal;
  font-size: var(--premium-fs-micro);
  opacity: 0.58;
}
.gdc-row__multi {
  color: #7dd3fc;
  opacity: 0.95 !important;
}
.gdc-row__state {
  font-size: var(--premium-fs-micro);
  font-variant-numeric: tabular-nums;
  opacity: 0.5;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gdc-more,
.gdc-empty {
  margin: 0;
  font-size: var(--premium-fs-micro);
  opacity: 0.65;
  text-align: center;
}
.gdc-more {
  padding: 8px;
  border: 0;
  background: transparent;
  color: #7dd3fc;
  cursor: pointer;
  font-weight: 600;
}
.gdc-variants,
.gdc-caps,
.gdc-facet {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.5);
}
.gdc-variants__title,
.gdc-caps__title {
  margin: 0;
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.48);
}
.gdc-variant {
  display: grid;
  gap: 2px;
  text-align: left;
  padding: 8px 10px;
  border-radius: var(--hos-radius-card);
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.gdc-variant strong {
  font-size: var(--premium-fs-micro);
}
.gdc-variant span {
  font-size: var(--premium-fs-micro);
  opacity: 0.58;
  word-break: break-all;
}
.gdc-variant.is-on {
  border-color: rgba(56, 189, 248, 0.65);
  background: rgba(14, 165, 233, 0.14);
}
.gdc-caps__group {
  display: grid;
  gap: 6px;
}
.gdc-caps__group em {
  font-style: normal;
  font-size: var(--premium-fs-micro);
  opacity: 0.55;
}
.gdc-facet__tabs {
  display: flex;
  gap: 6px;
  padding: 3px;
  border-radius: var(--hos-radius-card);
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.14);
}
.gdc-facet__tab {
  flex: 1;
  min-height: 32px;
  padding: 6px 8px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: var(--premium-fs-micro);
  font-weight: 650;
  cursor: pointer;
}
.gdc-facet__tab.is-on {
  color: #e0f2fe;
  background: rgba(14, 165, 233, 0.22);
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.28);
}
.gdc-caps__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gdc-cap {
  min-height: 32px;
  padding: 7px 12px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-size: var(--premium-fs-micro);
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    color 0.16s ease;
}
.gdc-cap:hover {
  border-color: rgba(148, 163, 184, 0.42);
  background: rgba(255, 255, 255, 0.04);
}
.gdc-cap.is-on {
  border-color: rgba(251, 191, 36, 0.72);
  background: rgba(245, 158, 11, 0.18);
  color: #fde68a;
}
</style>
